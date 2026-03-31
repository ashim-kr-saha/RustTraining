# Appendix A: Quick Reference Card

This appendix provides cheat sheets for the most critical concepts covered in this book. Pin this page during design reviews and system debugging.

---

## SQL Isolation Anomalies

| Anomaly | Description | Prevented at |
|---|---|---|
| **Dirty Read** | Reading uncommitted data from another transaction | Read Committed |
| **Non-Repeatable Read** | Re-reading a row returns different values (due to concurrent UPDATE) | Repeatable Read |
| **Phantom Read** | Re-executing a range query returns new rows (due to concurrent INSERT) | Serializable |
| **Lost Update** | Two transactions read-then-write the same row; one overwrite is lost | Repeatable Read (in practice) |
| **Write Skew** | Two transactions read overlapping data and make disjoint writes that together violate a constraint | Serializable |

### Isolation Level Matrix (SQL Standard)

| Level | Dirty Read | Non-Repeatable Read | Phantom | Lost Update | Write Skew |
|---|:-:|:-:|:-:|:-:|:-:|
| Read Uncommitted | ⚠️ Possible | ⚠️ Possible | ⚠️ Possible | ⚠️ Possible | ⚠️ Possible |
| Read Committed | ✅ Prevented | ⚠️ Possible | ⚠️ Possible | ⚠️ Possible | ⚠️ Possible |
| Repeatable Read | ✅ Prevented | ✅ Prevented | ⚠️ Possible | ✅ Prevented | ⚠️ Possible |
| Serializable | ✅ Prevented | ✅ Prevented | ✅ Prevented | ✅ Prevented | ✅ Prevented |

### Real Database Behavior

| Database | Default Level | RR Implementation | Serializable Implementation |
|---|---|---|---|
| **PostgreSQL** | Read Committed | Snapshot Isolation (prevents phantoms too) | SSI (Serializable Snapshot Isolation) |
| **MySQL/InnoDB** | Repeatable Read | MVCC snapshots + gap locks | 2PL (strict two-phase locking) |
| **SQL Server** | Read Committed | Lock-based (not snapshot by default) | 2PL; SNAPSHOT ISOLATION available separately |
| **Oracle** | Read Committed | — (skips to Serializable) | Snapshot Isolation (not truly serializable) |

---

## Join Algorithms

| Algorithm | Time Complexity | Space | Best When | I/O Pattern |
|---|---|---|---|---|
| **Nested Loop Join** | O(N × M) | O(1) | Small outer + indexed inner | Random |
| **Block Nested Loop** | O(N × M / B) | O(B) | Mid-size, no index available | Sequential + random |
| **Hash Join** | O(N + M) | O(min(N,M)) | Equality joins, large unsorted inputs | Sequential |
| **Sort-Merge Join** | O(N log N + M log M) | O(N + M) | Presorted or range joins | Sequential |

> **Where** N = rows in outer table, M = rows in inner table, B = buffer pool size in pages.

### When to Use Each Join

```text
Is it an equality join?
├── YES: Can the smaller table fit in memory?
│   ├── YES → Hash Join ✅
│   └── NO → Grace Hash Join (partitioned)
└── NO (range/inequality):
    ├── Are both inputs sorted? → Sort-Merge Join ✅
    └── Small outer + indexed inner? → Nested Loop (Index) ✅
```

---

## B+Tree Quick Reference

| Property | Value |
|---|---|
| **Fanout** | ⌊(page_size - header) / (key_size + pointer_size)⌋ |
| **Height** | ⌈log_f(N)⌉ where f = fanout, N = number of keys |
| **Point lookup I/O** | height + 1 (tree traversal + heap fetch) |
| **Range scan I/O** | height + leaf pages scanned + heap pages |
| **Insert (best case)** | height I/Os (no split) |
| **Insert (worst case)** | 2 × height + 1 (cascading splits to root) |

### B+Tree vs LSM-Tree Decision Guide

| Workload Characteristic | B+Tree | LSM-Tree |
|---|---|---|
| **Read-heavy (OLTP)** | ✅ Excellent (O(log N) point reads) | ⚠️ May read multiple levels |
| **Write-heavy (logging, IoT)** | ⚠️ Random I/O on every write | ✅ Sequential writes, high throughput |
| **Range scans** | ✅ Leaf linked list | ⚠️ Must merge across levels |
| **Space amplification** | ✅ ~1x | ⚠️ ~1.1-1.5x (multiple copies) |
| **Write amplification** | ⚠️ ~2-4x | ⚠️ ~10-30x (compaction) |
| **SSD-friendliness** | ⚠️ Random writes | ✅ Sequential writes |

---

## Database Page Formats

### Standard 8 KB Slotted Page Layout

```text
 0                    PAGE_SIZE (8192)
 ├──────────────────────────────────┤
 │       Page Header (24 bytes)     │
 │  page_id | num_slots | free_beg  │
 │  free_end | flags | lsn          │
 ├──────────────────────────────────┤
 │  Slot 0: [offset, length]        │  ← Slot array grows →
 │  Slot 1: [offset, length]        │
 │  Slot 2: [offset, length]        │
 │  ...                             │
 ├──────────────────────────────────┤
 │                                  │
 │         FREE SPACE               │
 │                                  │
 ├──────────────────────────────────┤
 │  ← Tuple data grows             │
 │  Tuple 2 (variable length)       │
 │  Tuple 1 (variable length)       │
 │  Tuple 0 (variable length)       │
 └──────────────────────────────────┘
```

### MVCC Tuple Header

```text
 PostgreSQL Heap Tuple Header (23 bytes minimum):
 ┌──────────────┬──────────────┬──────────┬──────────┬──────────┐
 │ t_xmin (4B)  │ t_xmax (4B)  │ t_cid    │ t_ctid   │ t_infomask│
 │ Creating txn │ Deleting txn │ Cmd ID   │ Version  │ Flags    │
 │              │ (0=live)     │          │ pointer  │          │
 └──────────────┴──────────────┴──────────┴──────────┴──────────┘

 InnoDB Record Header:
 ┌──────────────┬──────────────┬──────────────┬──────────────────┐
 │ DB_TRX_ID    │ DB_ROLL_PTR  │ Row data...  │                  │
 │ (6 bytes)    │ (7 bytes)    │              │                  │
 │ Last modify  │ → Undo log   │              │                  │
 └──────────────┴──────────────┴──────────────┴──────────────────┘
```

### Page Sizes Across Databases

| Database | Default Page Size | Configurable? |
|---|---|---|
| PostgreSQL | 8 KB | Compile-time only |
| MySQL/InnoDB | 16 KB | `innodb_page_size` (4K/8K/16K/32K/64K) |
| SQLite | 4 KB | `PRAGMA page_size` (512 to 65536) |
| SQL Server | 8 KB | No |
| Oracle | 8 KB | `DB_BLOCK_SIZE` at DB creation |

---

## WAL and Recovery

### ARIES Recovery Phases

```text
Phase 1: ANALYSIS   → Scan log from last checkpoint, build dirty page table + active txn table
Phase 2: REDO       → Replay ALL logged operations (committed and uncommitted) from oldest dirty page LSN
Phase 3: UNDO       → Reverse operations of all uncommitted transactions (walk log backward)
```

### Buffer Pool Policies

| Policy | Steal? | Force? | WAL Required? | Used By |
|---|---|---|---|---|
| **Steal / No-Force** | Yes (flush uncommitted) | No (commit without flush) | ✅ Yes — both REDO and UNDO | PostgreSQL, InnoDB, most systems |
| **No-Steal / Force** | No | Yes | ❌ Not strictly needed | Simple embedded DBs |
| **No-Steal / No-Force** | No | No | ✅ REDO only | Shadow paging systems |
| **Steal / Force** | Yes | Yes | ✅ UNDO only | Rare |

---

## Cost Model Quick Reference (PostgreSQL Defaults)

| Parameter | Default | Meaning |
|---|---|---|
| `seq_page_cost` | 1.0 | Cost of one sequential page read |
| `random_page_cost` | 4.0 | Cost of one random page read |
| `cpu_tuple_cost` | 0.01 | Cost of processing one row |
| `cpu_index_tuple_cost` | 0.005 | Cost of processing one index entry |
| `cpu_operator_cost` | 0.0025 | Cost of one operator evaluation |
| `effective_cache_size` | 4 GB | Planner's estimate of available cache |

### Selectivity Estimation Formulas

| Predicate | Selectivity |
|---|---|
| `col = value` | 1 / NDV(col) |
| `col > value` | (max - value) / (max - min) |
| `col BETWEEN a AND b` | (b - a) / (max - min) |
| `col IS NULL` | null_fraction(col) |
| `col IN (v1, v2, ..., vN)` | min(N / NDV(col), 1.0) |
| `pred1 AND pred2` | sel(pred1) × sel(pred2) (independence assumed) |
| `pred1 OR pred2` | sel(pred1) + sel(pred2) - sel(pred1) × sel(pred2) |

### Index Scan vs. Sequential Scan Crossover

```text
Index Scan wins when:
  random_page_cost × (matched_pages) + cpu_index_cost
  <
  seq_page_cost × (total_pages) + cpu_scan_cost

Rule of thumb: Index Scan is cheaper when selectivity < ~5-15% of the table.
At 15-20%+, Sequential Scan usually wins due to sequential I/O advantage.
```

---

## Concurrency Control Comparison

| Feature | 2PL (Strict) | MVCC (Snapshot Isolation) |
|---|---|---|
| Readers block writers | ✅ Yes | ❌ No |
| Writers block readers | ✅ Yes | ❌ No |
| Deadlock possible | ✅ Yes (lock cycles) | ❌ No (no locks) |
| Write-write conflict | Detected by lock manager | First-updater-wins abort |
| Phantom prevention | Predicate locks / gap locks | Snapshot-based (implementation varies) |
| Write skew | ✅ Prevented (lock ordering) | ⚠️ Not prevented (need SSI) |
| Garbage collection | Not needed | Required (VACUUM / purge) |
| Implementation complexity | Moderate | High |

---

## Execution Engine Comparison

| Feature | Volcano (Iterator) | Vectorized |
|---|---|---|
| Processing unit | 1 row at a time | Batch of 1000+ rows |
| Virtual call overhead | O(rows) | O(rows / batch_size) |
| CPU cache utilization | Poor (scattered data) | Excellent (columnar batches) |
| SIMD opportunity | None | Excellent (tight loops on arrays) |
| Branch prediction | Poor (heterogeneous rows) | Good (type-homogeneous columns) |
| Implementation complexity | Simple | Moderate |
| Used in | PostgreSQL, MySQL, SQLite | DuckDB, Velox, DataFusion, ClickHouse |

---

*This reference card covers the essential data structures, algorithms, and formulas from all chapters. For derivations and full explanations, see the corresponding chapter.*
