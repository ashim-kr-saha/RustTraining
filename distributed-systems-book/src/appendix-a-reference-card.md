# Summary and Reference Card

This appendix consolidates the key reference material from all chapters into a single quick-reference guide. Use this during system design interviews, architectural reviews, and incident investigation.

---

## Latency Numbers Every Distributed Systems Engineer Should Know

*(Approximate values for 2024 hardware; order of magnitude is what matters)*

| Operation | Latency | Notes |
|-----------|---------|-------|
| CPU L1 cache hit | 0.5 ns | |
| CPU L2 cache hit | 7 ns | |
| CPU L3 cache hit | ~40 ns | |
| RAM access | ~100 ns | DRAM; ~6 ns for DDR5 raw |
| Compress 1 KB with Snappy | ~3 μs | |
| Read 1 MB sequentially from memory | ~50 μs | |
| SSD random 4KB read | ~100 μs | NVMe; ~500 μs SATA SSD |
| SSD sequential read (1 MB) | ~200 μs | NVMe; ~1 ms SATA SSD |
| HDD seek + 4KB read | ~5 ms | |
| HDD sequential read (1 MB) | ~1 ms | |
| Send 1KB over 1 Gbps network | ~10 μs | |
| **Intra-datacenter round trip** | **0.5–2 ms** | Same datacenter, cross-rack |
| **Same-region cross-AZ RTT** | **0.5–5 ms** | AWS us-east-1a ↔ us-east-1b |
| **US-East ↔ EU-West RTT** | **80–100 ms** | Cross-Atlantic |
| **US-East ↔ AP-Southeast RTT** | **140–170 ms** | Trans-Pacific |
| **US-East ↔ EU + US-East ↔ AP** | **~150 ms max** | Global write quorum round-trip |
| DNS resolution (cached) | 0 ms | Local resolver cache |
| DNS resolution (uncached) | 10–100 ms | Depends on TTL and location |
| TLS handshake | 5–50 ms | Without session resumption |
| NTP accuracy (LAN) | ±1 ms | Stratum 2 |
| NTP accuracy (Internet) | ±10–100 ms | Stratum 3+ |
| Google TrueTime uncertainty | ±1–7 ms | GPS + atomic clocks |
| etcd write (local) | 1–5 ms | Raft consensus within datacenter |
| etcd write (global) | 100–300 ms | 3-datacenter Raft |

---

## CAP / PACELC Trade-off Matrix

| System | CAP (Partition) | PACELC (Normal) | Notes |
|--------|----------------|----------------|-------|
| etcd | CP | EC | Raft consensus; minority partitions refuse writes |
| ZooKeeper | CP | EC | Zab consensus |
| PostgreSQL (Patroni) | CP | EC | Raft-backed leader election |
| CockroachDB | CP | EC | Raft per-range; SSI transactions |
| Google Spanner | CP | EC | TrueTime; external consistency |
| Cassandra (QUORUM) | CP | EC | Tunable; QUORUM = CP behavior |
| Cassandra (ONE) | AP | EL | Default; eventual consistency |
| Amazon DynamoDB | AP (eventual) / CP (strong) | EL / EC | Per-request |
| Redis Cluster | AP | EL | Async replication; data loss on failover |
| Riak | AP | EL | Vector clocks; tunable quorum |
| MongoDB (≥3.4, majority) | CP | EC | writeConcern majority |

---

## Isolation Levels Quick Reference

| Isolation Level | Dirty Read | Non-Repeatable Read | Phantom Read | Write Skew | Default In |
|-----------------|-----------|--------------------|-----------|-----------| ----------|
| Read Uncommitted | ✅ | ✅ | ✅ | ✅ | (not recommended) |
| Read Committed | ❌ | ✅ | ✅ | ✅ | PostgreSQL, Oracle, SQL Server |
| Repeatable Read | ❌ | ❌ | ✅ (SQL) | ✅ | MySQL InnoDB |
| Snapshot Isolation | ❌ | ❌ | ❌ | ✅ | PostgreSQL "Repeatable Read", Oracle SI |
| Serializable (SSI) | ❌ | ❌ | ❌ | ❌ | PostgreSQL SERIALIZABLE |

**Quick anomaly definitions:**
- **Dirty Read:** Reading another transaction's uncommitted data
- **Non-Repeatable Read:** Same row returns different values in one transaction
- **Phantom Read:** Same range query returns different rows in one transaction  
- **Write Skew:** Two transactions read overlapping data, write non-overlapping data, violate a multi-row invariant

---

## Consensus Algorithm Comparison

| Property | Raft | Multi-Paxos | Zab (ZooKeeper) |
|----------|------|-------------|----------------|
| Design goal | Understandability | Theoretical correctness | ZooKeeper's needs |
| Leader | Explicit, one per term | Implicit; any proposer | Explicit |
| Log holes | Not allowed | Allowed | Not allowed |
| Specification completeness | Complete (inc. membership changes) | Incomplete | Complete |
| Used by | etcd, TiKV, CockroachDB, RethinkDB | Google Chubby | ZooKeeper |
| Election trigger | Random timeout | Prepare phase | Timeout |

**Raft Election Restriction:** A candidate can only win if its log is at least as up-to-date as a majority's log (compare lastLogTerm, then lastLogIndex).

**Raft Commit Rule:** An entry is committed only after it is replicated to a majority AND the leader has committed at least one entry from its own term.

---

## Consistent Hashing Quick Reference

```
Ring size:          2^32 (32-bit MD5 hash space)
Virtual nodes:      150-200 per physical node
Replication factor: N = 3 (typical)
Key owner:          First N distinct physical nodes clockwise from key's hash position
Data migration on node add/remove: ~(1/N) total keys
Load imbalance:     ±7% with 200 VNs (standard deviation O(1/√VNs))
```

**Quorum formulas:**

| Tuning | W | R | N | Behavior |
|--------|---|---|---|----------|
| Strong read | 1 | N | 3 | All replicas must agree on read |
| Balanced (Dynamo default) | 2 | 2 | 3 | W+R > N; both tolerate 1 failure |
| Write-optimized | 3 | 1 | 3 | All must write; reads fast but may miss latest |
| Availability-first | 1 | 1 | 3 | AP; no consistency guarantee |

**Availability formula:**
- Node failure probability per year: p
- System survives if < N - W nodes fail: available iff failures < min(N-W+1, N-R+1)

---

## Storage Engine Decision Matrix

| Workload | Recommended Engine | Key Reason |
|----------|--------------------|-----------|
| OLTP, mixed reads/writes | B-Tree (PostgreSQL) | Low read amplification; predictable latency |
| High-throughput writes, append-heavy | LSM-Tree (RocksDB, Cassandra) | Sequential I/O; low write amplification |
| Time-series, immutable events | LSM with FIFO compaction | Minimal compaction; efficient TTL |
| Embedded, read-dominated | B-Tree (SQLite, LMDB) | Zero-copy reads (mmap); simple deployment |
| Large objects (>1MB) | Blob store (S3-compatible) | B-Tree and LSM both suffer on large values |
| Key-value with complex queries | B-Tree (PostgreSQL JSONB) | Indexes support range predicates |

**LSM compaction strategies:**

| Strategy | Write Amp | Read Amp | Space Amp | Best For |
|----------|-----------|----------|-----------|---------|
| FIFO | ~1x | O(files) | 1x | Append-only, TTL-based expiry |
| Tiered (Size-Based) | 1–5x | ~50x | 3–10x | Write-heavy, space OK |
| Leveled | 10–30x | ~1–2x | ~1.1x | Balanced reads; space efficient |
| Universal | 1–30x | 1–10x | 2–4x | Hybrid (RocksDB tunable) |

---

## Rate Limiting Algorithm Comparison

| Algorithm | Burst Handling | Output Rate | Memory | Best For |
|-----------|---------------|-------------|--------|---------|
| Fixed Window Counter | Allows 2× at boundaries | Variable | O(1) | Coarse limits only |
| Sliding Window Log | Exact limiting | Variable | O(requests in window) | Accuracy-critical |
| Token Bucket | Allows bursts up to capacity | Sustained avg | O(1) | User-facing APIs |
| Leaky Bucket | No bursts | Fixed constant | O(queue size) | Network traffic shaping |

**Exponential backoff with full jitter:**
```
delay = random(0, min(cap, base_delay × 2^attempt))
cap = 30,000 ms
base_delay = 100 ms
Max attempts: 7 (gives ~128× base = ~12.8s max)
```

---

## CRDT Quick Reference

| CRDT | Operations | Merge | Use Case |
|------|-----------|-------|---------|
| G-Counter | Increment | max per component | Grow-only counters (like counts) |
| PN-Counter | Increment, Decrement | P merge + N merge | Counters with decrements |
| G-Set | Add | Union | Grow-only membership |
| OR-Set | Add (with tag), Remove | Union of remaining add-tags | Add/Remove set without conflicts |
| LWW-Register | Write (with timestamp) | Highest timestamp wins | Last-write-wins value with caveat |
| RGA | Insert, Delete | Causal ordering of operations | Collaborative text editing |
| MV-Register | Write (with vector clock) | Keep all concurrent versions | Conflict-surfacing value |

---

## Distributed Systems Anomaly Cheat Sheet

| Anomaly | Cause | Detection | Fix |
|---------|-------|-----------|-----|
| Split-brain | Two nodes think they're leader | Fencing tokens | Consensus (Raft) + Epoch validation |
| Stale reads | Reading from lagging replica | Monitor replication lag | Read-your-writes; quorum reads |
| Lost updates | Concurrent writes without isolation | Monitoring conflict rate | SSI; SELECT FOR UPDATE |
| Write skew | Multi-key invariant violated | Application-level audit | Serializable isolation |
| Clock skew | NTP drift between nodes | Monitor NTP offset | Logical clocks; TrueTime; HLC |
| Thundering herd | Synchronized retries after failure | Retry spike monitoring | Exponential backoff + full jitter |
| Zombie writer | GC-paused process holds stale lock | Monitor lock expiry | Fencing tokens; consensus locking |
| Cascading failure | Overloaded backend retried by all clients | Error rate spikes | Circuit breakers; load shedding |
| Head-of-line blocking | One slow request blocks FIFO queue | P99 > P50 * 10 | Request multiplexing; cancellation |

---

## Design Paper Reading List

For each concept in this book, these are the authoritative sources:

| Topic | Paper / Source | Year |
|-------|---------------|------|
| Logical Clocks | Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System" | 1978 |
| CAP Theorem | Brewer (conjecture 2000); Gilbert & Lynch (formal proof) | 2002 |
| PACELC | Abadi, "Consistency Tradeoffs in Modern Distributed Database System Design" | 2012 |
| Raft | Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm" | 2014 |
| Paxos | Lamport, "Paxos Made Simple" | 2001 |
| Dynamo | DeCandia et al., "Dynamo: Amazon's Highly Available Key-value Store" (SOSP) | 2007 |
| Spanner | Corbett et al., "Spanner: Google's Globally Distributed Database" | 2012 |
| MVCC / SSI | Cahill et al., "Serializable Isolation for Snapshot Databases" | 2008 |
| LSM-Trees | O'Neil et al., "The Log-Structured Merge-Tree (LSM-Tree)" | 1996 |
| Consistent Hashing | Karger et al., "Consistent Hashing and Random Trees" | 1997 |
| CRDTs | Shapiro et al., "Conflict-Free Replicated Data Types" | 2011 |
| Vector Clocks | Fidge, "Timestamps in Message-Passing Systems" | 1988 |
| Sagas | Garcia-Molina & Salem, "Sagas" | 1987 |
| Two-Phase Commit | Gray, "Notes on Data Base Operating Systems" | 1978 |
| Little's Law | Little, "A Proof for the Queuing Formula: L=λW" | 1961 |
| FLP Impossibility | Fischer, Lynch, Paterson, "Impossibility of Distributed Consensus" | 1985 |

---

## The Paranoid Engineer's Checklist

Before shipping any distributed component, verify:

**Data Durability**
- [ ] WAL written and fsynced before acknowledging writes
- [ ] Replication lag monitored and alerted
- [ ] Backup/restore tested quarterly (not just configured)
- [ ] Data checksums verified on read (silent corruption detection)

**Availability**
- [ ] No single node is a SPOF in the write path
- [ ] Circuit breakers configured for downstream dependencies
- [ ] Load shedding activates before the cluster saturates
- [ ] Retries use exponential backoff with full jitter

**Consistency**
- [ ] Isolation level is appropriate for your anomaly tolerance
- [ ] Fencing tokens used for any cross-service coordination
- [ ] Clock skew monitored (alert if NTP offset > 5ms)
- [ ] Conflict detection tested with concurrent write scenarios

**Observability**
- [ ] Replication lag: `metric: replication_lag_seconds{replica}`
- [ ] NTP skew: `metric: ntp_offset_seconds{node}`
- [ ] Quorum failures: `metric: quorum_failure_total{operation}`
- [ ] Compaction stalls: `metric: lsm_write_stall_duration{node}`
- [ ] Request queue depth: `metric: request_queue_depth{service}`
- [ ] p99 latency tracked separately from p50

**Operations**
- [ ] Node addition/removal tested; verified data rebalances
- [ ] Leader election measured: how long does failover take?
- [ ] Chaos engineering: regular scheduled failure injection
- [ ] Runbook for: partition, leader failure, data corruption, capacity emergency
