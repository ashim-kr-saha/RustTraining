# Hardcore Distributed Systems: Designing for Failure at Hyper-Scale

## Speaker Intro

- Principal Infrastructure Architect with 18 years building hyper-scale distributed systems at Amazon, Google, and Cloudflare
- Designed the replication layer for a globally distributed key-value store serving 10 million requests per second; post-mortemed the outages that taught me everything in this book
- Speaker at QCon, Strange Loop, and USENIX FAST; co-author of three internal engineering onboarding guides that became the foundation for this material
- Current focus: strongly consistent coordination services, tail-latency reduction at p99.9, and teaching engineers to think in failure modes before they think in happy paths

---

Every distributed systems engineer eventually has the same 3 AM epiphany: **the network is not reliable, clocks are not synchronized, and disks are not honest.** The question is whether you have that epiphany before or after your first production incident.

This guide exists so you have it before.

We will dismantle comfortable assumptions — that NTP gives you a reliable "now," that a single lock prevents concurrent writes, that `COMMIT` means the data is safe — and replace them with rigorous mental models used by engineers who design systems that serve planet-scale traffic and survive the full spectrum of failures: datacenter fires, BGP route leaks, Byzantine hardware faults, and software bugs that corrupt terabytes of replicated state before anyone notices.

This is not an introduction to databases or networking. This is the guide you study when you already know how databases and networks *work*, and you're trying to understand why they *fail*.

## Who This Is For

- **Senior engineers preparing for L7/Staff/Principal system design interviews** — You need to speak fluently about consistency models, consensus algorithms, and failure modes without hand-waving
- **Engineers scaling stateful services past a single node** — Your monolith is hitting a wall and you need to understand the real trade-offs of sharding, replication, and distributed coordination before you make architectural decisions you can't reverse
- **SREs and platform engineers on call** — You need to understand why your database cluster is behaving unexpectedly under network partition, and what your options are
- **Tech leads and architects** — You're making decisions about storage engines, consistency guarantees, and HA topologies that will outlast your tenure on the team
- **Anyone who has read the CAP theorem Wikipedia article and still doesn't know what to do with it** — We fix that in Chapter 2

## Prerequisites

| Concept | Where to Learn |
|---------|---------------|
| Basic TCP/IP networking, DNS, and HTTP | Beej's Guide to Network Programming |
| SQL and basic database operations | Any intro SQL course |
| Operating system fundamentals (processes, threads, file I/O) | OSTEP (Operating Systems: Three Easy Pieces) |
| One systems language to read pseudocode (Go, Rust, C++) | Any language fundamentals course |
| Big-O notation and basic algorithm complexity | CLRS Ch. 1-3 |

No prior experience with distributed systems, consensus algorithms, or database internals is required. We build everything from first principles.

## How to Use This Book

**Read linearly the first time.** Each part builds on the previous. The difficulty indicators signal cognitive load:

| Symbol | Level | Meaning |
|--------|-------|---------|
| 🟢 | Staff Foundational | Core mental models; every senior engineer must own these |
| 🟡 | Principal Applied | Algorithms and data structures; where you spend most of your time at L6+ |
| 🔴 | Architect Internals | Deep internals and production war stories; where you go when the standard patterns fail |

Each chapter includes:
- A **"What you'll learn"** block listing concrete skills
- **Mermaid diagrams** for topology visualization (Raft state machines, consistent hashing rings, 2PC flows)
- **"Naive Monolith Way" vs "Distributed Fault-Tolerant Way"** comparisons
- **`// 💥 SPLIT-BRAIN HAZARD:`** annotations on dangerous patterns, immediately followed by **`// ✅ FIX:`** corrections
- A **system design exercise** with a hidden solution
- **Key Takeaways** and **See Also** cross-references

## Pacing Guide

| Chapters | Topic | Suggested Time | Checkpoint |
|----------|-------|----------------|------------|
| 1–2 | Clocks, CAP, and PACELC | 4–5 hours | You can explain why GPS is more trustworthy than NTP and what PACELC says about latency/consistency trade-offs under normal operation |
| 3–4 | Consensus and Coordination | 6–8 hours | You can trace a complete Raft leader election, explain why Redlock is unsafe, and design a fencing token scheme |
| 5 | Storage Engines | 4–5 hours | You can explain write amplification in B-Trees vs LSM-Trees and when to choose each |
| 6–7 | Replication, Partitioning, and Transactions | 8–10 hours | You can design a multi-region replication topology, choose a conflict resolution strategy, and explain MVCC vs 2PL |
| 8 | HA Patterns | 3–4 hours | You can implement a token bucket rate limiter and explain exponential backoff with jitter |
| 9 | Capstone: Global KV Store | 6–8 hours | You can whiteboard a complete Dynamo-style system from API to compaction |

**Total estimated time: 31–40 hours**

## Working Through Exercises

Every content chapter contains a system design exercise modeled after Staff+ engineering interview questions. The capstone (Ch. 9) is a full mock interview.

1. **Attempt the exercise before expanding the solution** — write your architecture out on paper or a whiteboard first
2. **Argue with the solution** — every design has trade-offs; where would you make different choices?
3. **Look up the real systems** — Dynamo, Raft, Cassandra, etcd, CockroachDB, and Spanner are all open or well-documented; read their design papers
4. **Reproduce the failure modes** — spin up a local cluster with `etcd` or `rqlite` and induce partitions with `tc netem`

## Table of Contents

### Part I: The Fallacies and Foundations

- [1. Time, Clocks, and Ordering](ch01-time-clocks-and-ordering.md) 🟢 — Physical clock drift, Lamport timestamps, Vector Clocks, and Google TrueTime's atomic clock/GPS discipline
- [2. CAP Theorem and PACELC](ch02-cap-theorem-and-pacelc.md) 🟢 — Beyond the trilemma: PACELC's latency/consistency trade-off under normal operation; CP vs AP system examples

### Part II: Consensus and Coordination

- [3. Raft and Paxos Internals](ch03-raft-and-paxos-internals.md) 🟡 — Leader election, log replication, safety proofs, split votes, and how etcd uses Raft in production
- [4. Distributed Locking and Fencing](ch04-distributed-locking-and-fencing.md) 🔴 — Why Redlock is insufficient for strict correctness; fencing tokens; ZooKeeper and etcd as coordination primitives

### Part III: Database Internals and Storage

- [5. Storage Engines: B-Trees vs LSM-Trees](ch05-storage-engines.md) 🟡 — WAL, page cache, write amplification, SSTables, compaction, bloom filters, and when to pick RocksDB over PostgreSQL
- [6. Replication and Partitioning](ch06-replication-and-partitioning.md) 🔴 — Single-leader, multi-leader, leaderless topologies; consistent hashing; LWW vs CRDTs for conflict resolution
- [7. Transactions and Isolation Levels](ch07-transactions-and-isolation-levels.md) 🔴 — Dirty reads, phantom reads, MVCC, Serializable Snapshot Isolation, Sagas vs 2PC for distributed transactions

### Part IV: High-Availability Patterns & Capstone

- [8. Rate Limiting, Load Balancing, and Backpressure](ch08-rate-limiting-load-balancing-backpressure.md) 🟡 — Token bucket, leaky bucket, load shedding, exponential backoff with jitter, littles' law
- [9. Capstone: Design a Global Key-Value Store](ch09-capstone-global-key-value-store.md) 🔴 — Full system design: API, capacity, consistent hashing, quorum replication, hinted handoff, anti-entropy, and vector clocks

### Appendices

- [Summary and Reference Card](appendix-a-reference-card.md) — Isolation level cheat sheet, CAP/PACELC trade-off matrix, latency numbers, and algorithm reference

```mermaid
graph LR
    A["Part I<br/>Foundations<br/>🟢"] --> B["Part II<br/>Consensus<br/>🟡-🔴"]
    B --> C["Part III<br/>Storage<br/>🟡-🔴"]
    C --> D["Part IV<br/>HA Patterns<br/>🟡-🔴"]
    D --> E["Capstone<br/>Global KV Store<br/>🔴"]

    style A fill:#2d6a2d,color:#fff
    style B fill:#b8860b,color:#fff
    style C fill:#8b4513,color:#fff
    style D fill:#8b0000,color:#fff
    style E fill:#4a0080,color:#fff
```

## Companion Guides

This guide focuses on distributed systems theory and practice. For Rust-specific implementation patterns referenced throughout, see:

- [**Async Rust**](../async-book/src/SUMMARY.md) — Tokio, async I/O, and building network services in Rust
- [**Rust Patterns**](../rust-patterns-book/src/SUMMARY.md) — Lock-free data structures and concurrent programming primitives
- [**Enterprise Rust**](../enterprise-rust-book/src/SUMMARY.md) — OpenTelemetry, observability, and production readiness
- [**Tokio Internals**](../tokio-internals-book/src/SUMMARY.md) — Work-stealing schedulers and the async runtime that powers most Rust network services
