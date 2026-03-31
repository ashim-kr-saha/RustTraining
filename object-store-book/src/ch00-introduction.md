# System Design: Building an Exabyte-Scale Object Store

## Speaker Intro

This handbook is written from the perspective of a **Principal Storage Architect** who has designed, operated, and scaled distributed object storage systems from the first petabyte to sustained exabyte-class deployments. The content draws from production experience building blob stores that serve billions of GET/PUT requests per day, survive multi-rack failures without data loss, and do so at a storage cost low enough to compete with tape archives.

## Who This Is For

- **Infrastructure engineers** who operate or build on top of S3-compatible storage and want to understand the architecture beneath the API.
- **Systems programmers** who want a concrete, end-to-end Rust project—not a toy key-value store, but a blob store that handles 50 GB uploads, silent disk corruption, and node failures.
- **Architects evaluating Rust** for the storage data plane and who need proof that Rust's zero-cost abstractions, `unsafe`-free I/O, and fearless concurrency translate to real throughput wins.
- **Anyone who has *used* Amazon S3, Azure Blob Storage, or MinIO** and wondered: How does a single `PUT /bucket/key` end up durably stored across a dozen disks with only 1.5× overhead?

## Prerequisites

| Concept | Where to Learn |
|---|---|
| Intermediate Rust (ownership, traits, `async`) | [Async Rust](../async-book/src/SUMMARY.md) |
| Basic networking (TCP, HTTP, sockets) | [Tokio Internals](../tokio-internals-book/src/SUMMARY.md) |
| What an object store does (S3, GCS, Azure Blob) | AWS S3 documentation |
| Familiarity with hashing, checksums, and XOR | [Algorithms & Concurrency](../algorithms-concurrency-book/src/SUMMARY.md) |
| Linux I/O model (`read`, `write`, `mmap`, `sendfile`) | [Hardware Sympathy](../hardware-sympathy-book/src/SUMMARY.md) |

## How to Use This Book

| Emoji | Meaning |
|---|---|
| 🟢 | **Architecture** — foundational design decisions and system decomposition |
| 🟡 | **Data Distribution** — hashing, routing, and multi-part protocol design |
| 🔴 | **Hardware / Fault Tolerance** — erasure coding, bitrot repair, and failure domains |

Each chapter solves **one specific challenge** that emerges as you scale from a single-node blob store to an exabyte-class distributed system. Read them in order—later chapters assume the control plane and data plane from earlier chapters exist.

## The Problem We Are Solving

> Design a **distributed object store** (like Amazon S3 or Azure Blob Storage) capable of storing **exabytes** of unstructured binary data with **strong durability** (11 nines), **low storage overhead** (1.5×), and a **simple HTTP API** supporting multi-gigabyte uploads, byte-range reads, and billions of objects per namespace.

The system we will build has these non-negotiable requirements:

| Requirement | Target |
|---|---|
| Durability | 99.999999999% (11 nines) |
| Storage overhead | ≤ 1.5× (vs. 3× for replication) |
| Max object size | 5 TB (via multi-part upload) |
| PUT throughput (single node) | ≥ 2 GB/s sustained to NVMe |
| GET tail latency (p99) | < 50 ms for first-byte on cached data |
| Failure tolerance | Survive loss of any 3 nodes in a 9-node erasure group |
| Namespace scale | Billions of objects per bucket |
| Background repair | Detect and repair silent bitrot within 14-day scrub cycle |

## Pacing Guide

| Chapter | Topic | Time | Checkpoint |
|---|---|---|---|
| Ch 0 | Introduction & Problem Statement | 30 min | Understand the design canvas |
| Ch 1 | The Control Plane vs. The Data Plane | 5–7 hours | Metadata store + blob node separation running |
| Ch 2 | Data Placement and Consistent Hashing | 5–7 hours | Ring with virtual nodes placing objects across a cluster |
| Ch 3 | Erasure Coding (Reed-Solomon) | 8–10 hours | 6+3 encode/decode pipeline benchmarked |
| Ch 4 | Bitrot Detection and Background Scrubbing | 5–6 hours | Scrubber verifying CRC32C and triggering repair |
| Ch 5 | Multi-Part Uploads and Range Requests | 5–7 hours | HTTP API handling 50 GB uploads and byte-range GETs |

**Total: ~29–37 hours** of focused study.

## Table of Contents

### Part I: Architecture
- **Chapter 1 — The Control Plane vs. The Data Plane 🟢** — Decoupling metadata from the actual bytes. Using a highly available Key-Value store (etcd / FoundationDB) for object namespaces, ACLs, and routing tables. Building pure-Rust storage nodes that handle nothing but binary blobs.

### Part II: Data Distribution
- **Chapter 2 — Data Placement and Consistent Hashing 🟡** — How do you know which server holds `image.jpg` without querying a central database? Implementing a consistent hashing ring with virtual nodes to evenly distribute terabytes of data and seamlessly handle cluster scaling.

### Part III: Durability & Fault Tolerance
- **Chapter 3 — Erasure Coding (Reed-Solomon) 🔴** — Why 3× replication is too expensive at petabyte scale. Implementing Reed-Solomon erasure coding in Rust: splitting a 10 MB file into 6 data shards and 3 parity shards, tolerating the loss of any 3 nodes with only 1.5× storage overhead.
- **Chapter 4 — Bitrot Detection and Background Scrubbing 🔴** — Disks silently corrupt data. Architecting a low-priority background scrubber that continuously reads local sectors, verifies CRC32C checksums, and repairs corrupted shards by re-encoding from surviving siblings.

### Part IV: Client-Facing Protocol
- **Chapter 5 — Multi-Part Uploads and Range Requests 🟡** — Handling 50 GB file uploads over HTTP. Designing the API for parallel chunked uploads, assembling them via the metadata server, and supporting `Range: bytes=0-1024` headers for streaming video clients.

## Architecture Overview

```mermaid
flowchart TB
    subgraph Clients
        C1[Application A<br/>PUT /bucket/key]
        C2[Application B<br/>GET /bucket/key]
        C3[Application C<br/>Multi-Part Upload]
    end

    subgraph Control Plane
        LB[Load Balancer / API Gateway]
        API1[API Server 1]
        API2[API Server 2]
        META[(Metadata Store<br/>FoundationDB / etcd<br/>Object → Shard Map)]
    end

    subgraph Data Plane — Erasure Group
        direction LR
        N1[Storage Node 1<br/>Data Shard 0]
        N2[Storage Node 2<br/>Data Shard 1]
        N3[Storage Node 3<br/>Data Shard 2]
        N4[Storage Node 4<br/>Data Shard 3]
        N5[Storage Node 5<br/>Data Shard 4]
        N6[Storage Node 6<br/>Data Shard 5]
        N7[Storage Node 7<br/>Parity Shard 0]
        N8[Storage Node 8<br/>Parity Shard 1]
        N9[Storage Node 9<br/>Parity Shard 2]
    end

    subgraph Background
        SCRUB[Scrubber Daemon<br/>CRC32C Verification]
        REPAIR[Repair Scheduler<br/>Reed-Solomon Reconstruct]
    end

    C1 --> LB
    C2 --> LB
    C3 --> LB
    LB --> API1
    LB --> API2
    API1 --> META
    API2 --> META
    API1 --> N1 & N2 & N3 & N4 & N5 & N6 & N7 & N8 & N9
    SCRUB --> N1 & N2 & N3
    SCRUB --> N4 & N5 & N6
    SCRUB --> N7 & N8 & N9
    REPAIR --> META
```

## Companion Guides

This handbook builds on concepts from several other books in the Rust Training curriculum:

| Topic | Book | Key Chapters |
|---|---|---|
| Async I/O and Tokio runtime | [Async Rust](../async-book/src/SUMMARY.md) | Futures, `io_uring`, task scheduling |
| Hardware-level I/O and memory | [Hardware Sympathy](../hardware-sympathy-book/src/SUMMARY.md) | DMA, page cache, NVMe internals |
| Distributed consensus | [System Design: Message Broker](../system-design-book/src/SUMMARY.md) | Raft, partition routing |
| Error handling patterns | [Error Handling](../error-handling-book/src/SUMMARY.md) | `thiserror`, retry strategies |
| Zero-copy techniques | [Zero-Copy Rust](../zero-copy-book/src/SUMMARY.md) | `sendfile`, `splice`, `io_uring` |
