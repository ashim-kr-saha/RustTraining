# Appendix A: Distributed Systems Reference Card

A quick-reference cheat sheet for the core concepts, trade-offs, and numbers covered in this book.

---

## Latency Numbers Every Programmer Should Know

*Originally compiled by Jeff Dean (Google). Orders of magnitude matter more than exact values.*

| Operation | Latency | Notes |
|---|---|---|
| L1 cache reference | ~1 ns | |
| L2 cache reference | ~4 ns | |
| Main memory reference | ~100 ns | |
| SSD random read (4KB) | ~16 μs | 100x memory |
| SSD sequential read (1MB) | ~50 μs | |
| HDD random read (4KB) | ~2–10 ms | 1000x SSD |
| HDD sequential read (1MB) | ~2 ms | |
| Round-trip same datacenter | ~0.5 ms | |
| Round-trip same region (AZ-to-AZ) | ~1–2 ms | |
| Round-trip cross-continent | ~50–150 ms | Speed of light limit |
| Mutex lock/unlock | ~25 ns | |
| TLS handshake | ~5–10 ms | |
| DNS resolution | ~5–50 ms | Cached: ~1 ms |

**Key insight:** Disk and network are 1000–1,000,000x slower than memory. Design accordingly: cache aggressively, batch I/O, and make network calls asynchronous.

---

## Consistency Models (Strongest → Weakest)

| Model | Guarantee | Example |
|---|---|---|
| **Linearizability** | Operations appear instantaneous; real-time ordering preserved | etcd, ZooKeeper, Spanner |
| **Sequential consistency** | Total order consistent with each process's program order; no real-time guarantee | ZooKeeper writes |
| **Causal consistency** | Causally related operations are seen in order; concurrent operations may differ | MongoDB causal sessions |
| **Read-your-writes** | A process sees its own writes immediately | DynamoDB consistent reads |
| **Monotonic reads** | Reads never go backward in time | Session-sticky replicas |
| **Eventual consistency** | All replicas converge eventually; no ordering during convergence | Cassandra, DNS, DynamoDB (default) |

---

## CAP / PACELC Classification Cheat Sheet

| System | Partition → | Normal → | Classification |
|---|---|---|---|
| PostgreSQL (single-leader) | PC (rejects follower writes) | EC (sync replication) | PC/EC |
| Cassandra (tunable) | PA (any node accepts writes) | EL (async, fast) | PA/EL |
| Google Spanner | PC (quorum, commit-wait) | EC (TrueTime serializable) | PC/EC |
| DynamoDB (default) | PA (sloppy quorum) | EL (eventually consistent reads) | PA/EL |
| CockroachDB | PC (Raft majority) | EC (serializable) | PC/EC |
| etcd / ZooKeeper | PC (majority only) | EC (linearizable reads) | PC/EC |
| Redis Cluster | PA (each shard independent) | EL (async replication) | PA/EL |

---

## Isolation Levels Quick Reference

| Level | Dirty Read | Non-repeatable Read | Phantom Read | Write Skew |
|---|---|---|---|---|
| Read Uncommitted | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Read Committed | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Snapshot Isolation | ✅ | ✅ | ✅ | ⚠️ |
| Serializable (SSI) | ✅ | ✅ | ✅ | ✅ |

⚠️ = anomaly possible | ✅ = anomaly prevented

**Critical reminder:** Most databases (PostgreSQL, MySQL, Oracle) default to Read Committed or Snapshot Isolation, NOT serializable. You must explicitly opt in.

---

## Consensus & Quorum Quick Reference

| Parameter | Formula | Example (N=5) |
|---|---|---|
| Majority quorum | ⌊N/2⌋ + 1 | 3 |
| Max tolerated failures | ⌊(N-1)/2⌋ | 2 |
| Quorum intersection | W + R > N | W=3, R=3 (overlap ≥ 1) |
| Raft leader election | Needs majority votes + log at least as fresh as majority | 3 votes with up-to-date log |

---

## Replication Topologies Comparison

| Topology | Write latency | Write conflicts? | Consistency | Availability during partition |
|---|---|---|---|---|
| **Single-leader** | Low (local DC) to High (cross-DC sync) | No (single writer) | Strong (sync) or Eventual (async) | Leader DC only (if sync); read-only elsewhere |
| **Multi-leader** | Low (write to local leader) | Yes (concurrent writes to different leaders) | Eventual | All DCs (each has a leader) |
| **Leaderless** | Low (write to nearest replicas) | Yes (concurrent writes to any replicas) | Tunable (W, R, N) | Depends on W, R vs available nodes |

---

## Storage Engine Comparison

| Dimension | B-Tree | LSM-Tree |
|---|---|---|
| Best for | Read-heavy, point lookups, range scans | Write-heavy, ingestion, key-value |
| Write pattern | Random I/O (page updates) | Sequential I/O (append + flush) |
| Write amplification | ~2–3x | ~10–30x |
| Space amplification | ~1x | ~1.1–2x |
| Read latency | Predictable O(log N) | Variable (memtable → L0 → L1 → ...) |
| Compaction cost | None (in-place updates) | Background compaction (CPU + I/O) |

---

## Rate Limiting & Backpressure Patterns

| Pattern | What it does | When to use |
|---|---|---|
| **Token Bucket** | Allows bursts up to capacity; steady-state rate capped | API rate limiting |
| **Leaky Bucket** | Smooth, constant output rate; no bursts | Network traffic shaping |
| **Circuit Breaker** | Stops calling a failing service; periodic probes to check recovery | Protecting against cascading failures |
| **Exponential Backoff + Jitter** | Increasing delay between retries, randomized to avoid thundering herd | All retry logic |
| **Bulkhead** | Isolates resource pools per workload | Preventing one workload from starving others |
| **Load Shedding** | Rejects low-priority requests when overloaded | Protecting SLOs during traffic spikes |

---

## Distributed Locking Decision Tree

```
Need a lock for correctness (data integrity)?
├── YES → Use consensus-backed lock (etcd / ZooKeeper)
│         └── ALWAYS use fencing tokens
│             └── Storage must reject stale tokens
└── NO (just for efficiency / dedup)
    └── Redis SET NX is sufficient
```

---

## Conflict Resolution Strategies

| Strategy | Automatic? | Data loss risk | Complexity | Best for |
|---|---|---|---|---|
| **Last-Write-Wins (LWW)** | Yes | ⚠️ Silent data loss on concurrent writes | Low | Ephemeral data (caches, last-seen timestamps) |
| **Vector clocks + client merge** | Semi (client merges) | None (conflicts surfaced) | Medium | Shopping carts, user preferences |
| **CRDTs** | Yes | None (mathematically convergent) | Medium | Counters, sets, collaborative editing |
| **Operational transformation** | Yes | None | High | Real-time collaborative editing (Google Docs) |

---

## The Eight Fallacies of Distributed Computing (Peter Deutsch, 1994)

1. The network is reliable.
2. Latency is zero.
3. Bandwidth is infinite.
4. The network is secure.
5. Topology doesn't change.
6. There is one administrator.
7. Transport cost is zero.
8. The network is homogeneous.

**Every one of these is wrong.** Design for the opposite.

---

## Key Papers and References

| Paper / Resource | Year | Core Contribution |
|---|---|---|
| Lamport, "Time, Clocks, and the Ordering of Events" | 1978 | Logical clocks, happened-before relation |
| Fischer, Lynch, Paterson (FLP) | 1985 | Impossibility of deterministic async consensus |
| Lamport, "The Part-Time Parliament" (Paxos) | 1998 | Consensus protocol |
| Brewer, CAP Conjecture / Gilbert & Lynch proof | 2000/2002 | CAP theorem |
| DeCandia et al., "Dynamo" | 2007 | Leaderless replication, consistent hashing, vector clocks |
| Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm" (Raft) | 2014 | Raft consensus |
| Corbett et al., "Spanner: Google's Globally-Distributed Database" | 2012 | TrueTime, external consistency |
| Abadi, PACELC | 2012 | Extending CAP to normal operation |
| Kleppmann, "How to do distributed locking" | 2016 | Critique of Redlock, fencing tokens |
| Kleppmann, *Designing Data-Intensive Applications* | 2017 | Comprehensive reference for distributed systems design |
