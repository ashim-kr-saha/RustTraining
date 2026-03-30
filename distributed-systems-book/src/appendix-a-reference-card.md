# Summary and Reference Card

This appendix is your quick-access cheat sheet for the most critical distributed systems concepts from this book. Pin it to your wall during interviews and design reviews.

---

## 1. Isolation Levels and Anomalies

| Isolation Level | Dirty Read | Non-Repeatable Read | Phantom Read | Write Skew | Used By Default In |
|----------------|:----------:|:-------------------:|:------------:|:----------:|-------------------|
| Read Uncommitted | ❌ Possible | ❌ Possible | ❌ Possible | ❌ Possible | Rarely used |
| **Read Committed** | ✅ Prevented | ❌ Possible | ❌ Possible | ❌ Possible | **PostgreSQL, Oracle, SQL Server** |
| Repeatable Read | ✅ Prevented | ✅ Prevented | ❌* Possible | ❌ Possible | MySQL/InnoDB* |
| **Snapshot Isolation** | ✅ Prevented | ✅ Prevented | ✅ Prevented | ❌ Possible | **PostgreSQL "Repeatable Read", Oracle** |
| **Serializable** | ✅ Prevented | ✅ Prevented | ✅ Prevented | ✅ Prevented | **CockroachDB (default), PostgreSQL (optional)** |

> *MySQL InnoDB Repeatable Read prevents phantom reads via gap locks; PostgreSQL's "Repeatable Read" is actually Snapshot Isolation.

### When to Use Each Level

| Use Case | Minimum Isolation |
|----------|------------------|
| Analytics/reporting (read-only) | Snapshot Isolation (consistent snapshot) |
| CRUD operations (read + update single row) | Read Committed |
| Multi-row invariants (balance ≥ 0, at least 1 on-call doctor) | Serializable |
| Multi-service distributed transaction | Saga (Eventual) or Serializable + 2PC |

---

## 2. CAP / PACELC Quick Reference

### CAP Classification

| System | C / A During Partition | Notes |
|--------|----------------------|-------|
| **etcd / ZooKeeper** | CP | Minority partitions reject writes |
| **Google Spanner** | CP | TrueTime commit-wait; minority unavailable |
| **CockroachDB** | CP | Raft consensus per range |
| **Cassandra** (default) | AP | Tunable per-query via consistency level |
| **DynamoDB** (default) | AP | Strongly consistent reads cost 2× |
| **Riak** | AP | CRDTs and vector clocks |

### PACELC Matrix

```
                    During Partition (P)
                 ┌─── Choose A ──────── Choose C ───┐
Normal       EL │ PA/EL               PC/EL          │
Ops (E)         │ Cassandra           PNUTS (Yahoo)  │
                │ DynamoDB default                   │
             EC │ PA/EC               PC/EC          │
                │ DynamoDB consistent │ etcd          │
                │ (optional strong R) │ Spanner       │
                └───────────────────────────────────-┘
```

### Consistency Hierarchy

```
Strict Serializability (Spanner, FaunaDB)
  └─ Linearizability (etcd, CockroachDB reads)
       └─ Sequential Consistency (ZooKeeper sessions)
            └─ Causal Consistency (MongoDB causal sessions)
                 └─ Eventual Consistency (Cassandra ONE, DynamoDB default)
```

---

## 3. Consensus Algorithm Comparison

| Property | Raft | Multi-Paxos | Zab (ZooKeeper) |
|----------|:----:|:-----------:|:---------------:|
| **Understandable spec** | ✅ Excellent | ❌ Notoriously hard | ✅ Good |
| **Leader-based** | Yes | Optional | Yes |
| **Strong log ordering** | Yes | Flexible (gaps OK) | Yes |
| **Leader election** | Randomized timeouts | Competing proposers | ZK re-election |
| **Livelock risk** | Low | Medium (proposer conflict) | Low |
| **Reconfiguration** | Joint consensus / single-server | Complex (many RFCs) | Dynamic |
| **Used by** | etcd, CockroachDB, TiKV, Consul | Google Chubby, Spanner | ZooKeeper, Kafka (KRaft) |

### Quorum Formula

```
N replicas → majority quorum = ⌊N/2⌋ + 1
  N=3: quorum=2, tolerates 1 failure
  N=5: quorum=3, tolerates 2 failures
  N=7: quorum=4, tolerates 3 failures
```

---

## 4. Replication Topology Decision Tree

```
Do you need strong (linearizable) consistency?
  YES → Use single-leader with synchronous replication (leader-follower)
        or consensus (Raft). Unavailable during leader failure.
  NO  → Do you need multi-region active-active writes?
        YES → Multi-leader or leaderless (Dynamo-style)
              Requires conflict resolution. (LWW / CRDTs / vector clocks)
        NO  → Single-leader with async replication.
              Reads from followers will lag (eventual consistency for reads).
```

| Technique | Conflict | Availability | Consistency | Examples |
|-----------|---------|-------------|-------------|---------|
| Single-leader (sync) | None | Low (sync blocks) | Strong | PostgreSQL sync standby |
| Single-leader (async) | None (leader decides) | High | Eventual for reads | MySQL async replication |
| Multi-leader | Possible | High | Eventual | CouchDB, MySQL MMM |
| Leaderless (quorum) | Possible | High (tunable) | Tunable | Cassandra, Riak, Dynamo |

---

## 5. Storage Engine Comparison

| Factor | B-Tree | LSM-Tree (Leveled) | LSM-Tree (Tiered) |
|--------|:------:|:-----------------:|:-----------------:|
| **Read Amplification** | Low (log N pages) | Medium (bloom filters help) | Higher (more files) |
| **Write Amplification** | Medium (3–10×) | Higher (5–30×, compaction) | Low (2–10×) |
| **Space Amplification** | Low (~1.3×) | Low (~1.1×) | High (~2–10×) |
| **Range Query Performance** | Excellent | Good (with SSTable range filters) | OK |
| **Write Throughput** | Medium | High | Very High |
| **Use Cases** | OLTP reads, mixed RW | Write-heavy + storage-efficient | Write-heavy, large hot data |
| **Examples** | PostgreSQL, MySQL, SQLite | RocksDB, LevelDB, CockroachDB | Cassandra, HBase (default) |

---

## 6. Distributed Lock Safety

```
                      └─→ Advisory locking (idempotent ops)? → Redlock is fine
                      └─→ Strict mutual exclusion?
                          └─→ etcd/ZooKeeper lease
                          └─→ + Fencing Token for zombie safety
                          └─→ Always: idempotency keys in the protected resource
```

| Solution | Split-Brain Safe | GC-Pause Safe | Operational Cost |
|---------|:---------------:|:-------------:|:---------------:|
| Redis SET NX | ❌ SPOF | ❌ No | Very Low |
| Redlock | ❌ Unsafe on failure | ❌ No | Medium (5 Redis nodes) |
| etcd/ZooKeeper lease | ✅ Yes | ❌ Zombie possible | Medium |
| etcd + Fencing Token | ✅ Yes | ✅ Yes | Medium |

---

## 7. Rate Limiting Algorithm Cheat Sheet

| Algorithm | Burst Allowed | Output Smooth | Distributed? | Best For |
|-----------|:------------:|:-------------:|:------------:|---------|
| Fixed Window Counter | ❌ 2× at boundary | ❌ No | Easy (single counter) | Daily quotas |
| **Token Bucket** | ✅ Up to capacity | ❌ No | Medium (sync tokens) | **API gateways** |
| Leaky Bucket | Queue up to cap | ✅ Yes | Medium | Smoothing downstream calls |
| Sliding Window Counter | Partial (smoothed) | ✅ Better | Medium | Strict per-client limiting |

### Exponential Backoff Formula

```
sleep_duration = random(0, min(cap, base × 2^attempt))

Recommended defaults:
  base  = 100 ms
  cap   = 30 s
  max_attempts = 7
  Total max wait: ~30s + jitter ≈ 3.5 minutes worst case across 7 attempts
```

---

## 8. Latency Numbers Every Programmer Should Know

*(Jeff Dean's canonical numbers, updated for 2020s hardware)*

| Operation | Approximate Latency |
|-----------|-------------------|
| L1 cache reference | 1 ns |
| L2 cache reference | 4 ns |
| L3 cache reference | 40 ns |
| Main memory (DRAM) reference | 100 ns |
| Compress 1 KB with Snappy | 3 µs |
| Read 1 MB sequentially from memory | 12 µs |
| NVMe SSD random read (4 KB) | 100 µs |
| NVMe SSD sequential read (1 MB) | 250 µs |
| SATA SSD random read (4 KB) | 300 µs |
| HDD seek + 1 sector read | 10 ms |
| Read 1 MB sequentially from HDD | 30 ms |
| Intra-datacenter round trip (same AZ) | 0.5 ms |
| Intra-region round trip (cross-AZ) | 1–5 ms |
| Cross-region round trip (NA→EU) | 70–100 ms |
| Cross-region round trip (NA→APAC) | 140–200 ms |
| TCP handshake (loopback) | 0.1 ms |
| TLS handshake (intra-DC) | 2–5 ms |
| Redis GET (intra-DC) | 0.5–2 ms |
| PostgreSQL simple query (intra-DC) | 1–5 ms |
| DNS lookup | 10–100 ms |
| Send 1 MB over 1 Gbps ethernet | 10 ms |

### Derived Latency Targets

| Operation | Latency Budget | Implication |
|-----------|---------------|------------|
| In-memory computation | < 1 µs | No I/O allowed |
| Local SSD read/write | < 1 ms | Safe for critical path |
| Single-datacenter consensus | 1–5 ms | Intra-region Raft is affordable |
| Single-datacenter database write | 2–10 ms | WAL fsync + B-Tree/LSM |
| Cross-AZ consensus | 5–20 ms | Borderline for p99 < 20 ms |
| Cross-region consensus | 70–200 ms | Unacceptable for most write paths |

---

## 9. Saga vs 2PC at a Glance

| Dimension | Two-Phase Commit (2PC) | Saga |
|-----------|:---------------------:|:----:|
| **Atomicity** | Strong (all-or-nothing) | Eventual (step-by-step with compensation) |
| **Isolation** | Full (all participants lock) | None (intermediate states visible) |
| **Coordinator failure** | Blocks until recovery | Saga state is recoverable; individual steps retry |
| **Performance** | 2 RTTs minimum | Independent per step |
| **Complexity** | Low (DB handles it) | High (compensating transactions for each step) |
| **Best for** | Short bank transfers, within-system operations | Long-running business workflows, cross-service operations |

---

## 10. System Design Interview Checklist

When approaching any distributed system design question:

1. **Clarify requirements:** read/write ratio, latency SLA (p50 / p99), consistency requirement, data size, geography
2. **Capacity estimate:** QPS → servers needed → bandwidth → storage
3. **Pick a consistency model:** Eventual / Causal / Sequential / Linearizable / Serializable
4. **Design the data model:** partitioning key, replication factor, storage engine
5. **Define the read path:** who serves reads? What caching? What happens on cache miss?
6. **Define the write path:** where does the write land first? How is it replicated? When is it ACKed?
7. **Handle failures:** node failure → hinted handoff / quorum degraded; region failure → cross-region routing; coordinator failure → circuit breaker + retry
8. **Handle hot spots:** consistent hashing + virtual nodes; rate limiting; caching
9. **Monitoring and operations:** what metrics? How do you detect split-brain? How do you run anti-entropy?

---

> *"The first step is to establish that something is impossible. The second step is to figure out which of the assumptions in the impossibility proof to violate."*
> — Distributed systems folklore on escaping impossibility results (FLP, CAP, etc.)
