# Appendix A: Reference Card 🟢

> A quick-reference cheat sheet for the concepts, orderings, and data structures covered in this book. Print it. Pin it to your monitor. Tattoo it on your forearm.

---

## A.1 Atomic Ordering Cheat Sheet

### Decision Matrix

| Question | Ordering |
|---|---|
| Counter/statistics only, no data dependencies? | `Relaxed` |
| Producer writes data, then writes flag? | `Release` (the flag write) |
| Consumer reads flag, then reads data? | `Acquire` (the flag read) |
| Need both Acquire and Release on the same operation? | `AcqRel` |
| Multiple variables must be seen in the same global order by all threads? | `SeqCst` |
| **Not sure?** | Start with `SeqCst`, profile, downgrade later |

### Ordering Summary

| Ordering | Prevents | Cost on x86 | Cost on ARM | Typical Use |
|---|---|---|---|---|
| `Relaxed` | Nothing | Free | Free | Counters, statistics |
| `Acquire` | Load-reorders after this load | Free | `ldar` / `dmb ish` | Reading a flag before reading data |
| `Release` | Store-reorders before this store | Free | `stlr` / `dmb ish` | Writing data before writing a flag |
| `AcqRel` | Both of the above | Free (on x86) | Both fences | Read-modify-write (CAS) |
| `SeqCst` | All reorders + total order | `MFENCE` / `lock` prefix | Full barrier | Multi-variable invariants (rare) |

> **x86 is "almost free"**: x86 has a strong memory model (TSO) — `Acquire` and `Release` are no-ops. On ARM/RISC-V (weak memory model), every ordering except `Relaxed` emits a fence instruction.

### Happens-Before Rules

```
Thread A                     Thread B
─────────────────            ─────────────────
store(data, Relaxed)
store(flag, Release)  ──────→  load(flag, Acquire)
                               load(data, Relaxed)  // ✅ Sees Thread A's data
```

If `flag.load(Acquire)` returns the value stored by `flag.store(Release)`, then **all writes before the Release** are visible **after the Acquire**.

---

## A.2 CAS Patterns

### CAS Loop Template

```rust
use std::sync::atomic::{AtomicU64, Ordering};

fn cas_loop(atomic: &AtomicU64, f: impl Fn(u64) -> u64) -> u64 {
    let mut current = atomic.load(Ordering::Relaxed);
    loop {
        let new = f(current);
        match atomic.compare_exchange_weak(
            current,
            new,
            Ordering::AcqRel,
            Ordering::Relaxed,
        ) {
            Ok(_) => return new,
            Err(actual) => current = actual,
        }
    }
}
```

### compare_exchange vs compare_exchange_weak

| Method | Spurious failure? | Use when |
|---|---|---|
| `compare_exchange` | No | Single attempt, or non-looping use |
| `compare_exchange_weak` | Yes (on ARM/LL-SC) | Inside a CAS loop — allows tighter code generation |

---

## A.3 Data Structure Complexity

### Concurrent Data Structures

| Structure | Insert | Lookup | Delete | Best For |
|---|---|---|---|---|
| `Mutex<HashMap>` | O(1)* | O(1)* | O(1)* | Low contention, simple code |
| `DashMap` | O(1)* | O(1)* | O(1)* | Read-heavy concurrent maps |
| `crossbeam::SkipMap` | O(log n) | O(log n) | O(log n) | Sorted concurrent map, range queries |
| Lock-free Treiber Stack | O(1) | N/A | O(1) pop | LIFO work stealing |
| Michael-Scott Queue | O(1) | N/A | O(1) dequeue | FIFO task queues |
| SPSC Ring Buffer | O(1) | N/A | O(1) pop | Single-producer single-consumer |

_* Amortized. HashMap worst-case is O(n) on resize._

### Probabilistic Data Structures

| Structure | Space | Insert | Query | False Positives? | Use Case |
|---|---|---|---|---|---|
| Bloom Filter | O(n) bits | O(k) | O(k) | Yes (~1%) | Set membership |
| Count-Min Sketch | O(w×d) counters | O(d) | O(d) | Over-counts | Frequency estimation |
| HyperLogLog | O(m) registers | O(1) | O(m) | ~1.04/√m | Cardinality estimation |

Where: k = hash functions, w = width, d = depth, m = registers, n = expected elements.

### Memory Reclamation Strategies

| Strategy | Throughput | Memory overhead | Bounded reclamation? | Complexity |
|---|---|---|---|---|
| Reference counting (`Arc`) | Medium | High (cache-line bouncing) | Yes | Low |
| Hazard pointers | Medium | Low (per-thread list) | Yes (bounded) | High |
| Epoch-based (`crossbeam-epoch`) | **High** | Medium (deferred garbage) | No (unbounded under stall) | Medium |
| Quiescent-state (RCU) | **Highest** | Low | Depends on grace period | Medium |

---

## A.4 Latency Numbers Every Programmer Should Know

| Operation | Latency | Notes |
|---|---|---|
| L1 cache reference | ~1 ns | 4 cycles at 4 GHz |
| L2 cache reference | ~4 ns | ~12 cycles |
| L3 cache reference | ~12 ns | ~40 cycles |
| Branch misprediction | ~5 ns | Pipeline flush |
| Mutex lock/unlock (uncontended) | ~25 ns | `futex` fast path |
| `AtomicU64::fetch_add(Relaxed)` | ~1 ns | Single cache line, no fence |
| `AtomicU64::fetch_add(SeqCst)` | ~20 ns | `LOCK XADD` + implied fence on x86 |
| CAS (`compare_exchange`) | ~10–30 ns | Depends on contention |
| DRAM reference (L3 miss) | ~65 ns | ~200 cycles |
| SPSC ring buffer push/pop | ~5–15 ns | Acquire/Release only |
| `crossbeam::channel` send/recv | ~50–200 ns | Bounded channel |
| `Mutex<VecDeque>` push/pop | ~25–50 ns | Uncontended |
| System call (`read()`) | ~200–500 ns | User → kernel → user |
| Context switch | ~1–5 µs | Full TLB and cache disruption |
| TCP localhost round-trip | ~10–30 µs | Through kernel stack |
| DPDK kernel-bypass round-trip | ~1–5 µs | User-space network stack |
| SSD random 4KB read | ~100 µs | NVMe, queue depth 1 |
| SSD sequential 1MB read | ~200 µs | ~5 GB/s NVMe |
| HDD random 4KB read | ~5–10 ms | Seek time dominates |
| Network round-trip (same DC) | ~500 µs | Ethernet, through switches |
| Network round-trip (cross-region) | ~50–100 ms | Speed of light limitation |

### The Cache Line Rule

```
                    ┌───────────────────────────────┐
                    │ One cache line = 64 bytes      │
                    │                                │
                    │ ✅ If two threads access        │
                    │    different cache lines:       │
                    │    → Full parallel speed        │
                    │                                │
                    │ ❌ If two threads access        │
                    │    the SAME cache line:         │
                    │    → MESI protocol bounce       │
                    │    → ~40× slower than L1 hit    │
                    └───────────────────────────────┘
```

---

## A.5 Key Crates

| Crate | Purpose | Chapter |
|---|---|---|
| `crossbeam-epoch` | Epoch-based memory reclamation | [Ch 4](./ch04-epoch-based-reclamation.md) |
| `crossbeam-skiplist` | Lock-free skip list map/set | [Ch 5](./ch05-skip-lists-and-concurrent-maps.md) |
| `crossbeam-utils` | `CachePadded`, scoped threads | [Ch 1](./ch01-cpu-cache-and-false-sharing.md) |
| `parking_lot` | Faster Mutex/RwLock (comparison baseline) | [Ch 1](./ch01-cpu-cache-and-false-sharing.md) |

---

## A.6 Essential `perf` Commands

```bash
# Count cache misses during program execution
perf stat -e cache-references,cache-misses,L1-dcache-load-misses ./target/release/my_binary

# Record CPU cycles for flamegraph analysis
perf record -g --call-graph dwarf ./target/release/my_binary
perf report

# Detect false sharing (Linux perf c2c, requires kernel 4.13+)
perf c2c record ./target/release/my_binary
perf c2c report

# Count branch mispredictions
perf stat -e branches,branch-misses ./target/release/my_binary

# Count atomic/lock operations (x86 LOCK prefix)
perf stat -e bus-cycles ./target/release/my_binary
```

---

## A.7 Compiler Intrinsics Quick Reference

```rust
use std::sync::atomic::{compiler_fence, fence, Ordering};

// Compiler fence: prevents compiler reordering only (no CPU fence emitted)
compiler_fence(Ordering::Release);

// Hardware fence: prevents both compiler and CPU reordering
fence(Ordering::Release);

// Spin-loop hint: tells CPU we're busy-waiting (reduces power, yields
// execution resources on hyperthreaded cores)
std::hint::spin_loop();

// Black-box: prevents compiler from optimizing away a value
// (useful in benchmarks)
std::hint::black_box(value);
```

---

> **Final Thought:** Correctness first, then measure, then optimize. Never downgrade from `SeqCst` without a proof that the weaker ordering preserves your invariants. The fastest code is the code that's correct.
