# Rust at the Limit: Compiler Optimizations, SIMD, and Assembly

## Speaker Intro

- Principal Systems Architect and Performance Engineer with 25 years in latency-critical systems — high-frequency trading, game engines, embedded firmware, and database kernel development
- Contributor to LLVM's Rust-specific optimization passes and maintainer of performance-oriented Rust crates
- Led compiler-level optimization efforts that reduced P99 latencies by 40%+ across production services handling 10M+ RPS
- Background in x86 microarchitecture, ARM NEON pipelines, and GPU compute — with a focus on making the compiler *prove* it did the right thing

---

This is the hardest book in the series. It is not about writing Rust that compiles — it is about writing Rust that compiles into **exactly the machine code you intended**. Every chapter asks the same question: *"What did the CPU actually execute, and is that the best it could be?"*

If you have ever wondered why your "zero-cost abstraction" added 3ns of latency to a hot loop, why LLVM refused to vectorize your perfectly aligned data, or why your binary shrank by 15% after a single `Cargo.toml` flag change — this book gives you the mental model and the tooling to answer those questions yourself.

This is an ultra-advanced companion to the [Memory Management](../memory-management-book/src/SUMMARY.md) and [Ecosystem, Tooling & Profiling](../tooling-profiling-book/src/SUMMARY.md) guides, focusing entirely on **hardware sympathy and compiler manipulation**.

## Who This Is For

- **Staff/Principal engineers** optimizing hot paths where microseconds (or nanoseconds) matter — trading systems, game loops, database engines, codec implementations
- **Performance engineers** who profile with `perf`, `flamegraph`, or Instruments and need to understand *why* the compiler made specific code generation decisions
- **Embedded/systems developers** who need to control instruction selection, register allocation, and data alignment at the assembly level
- **Anyone who has hit a wall with `cargo build --release`** and suspects there are significant wins left on the table beyond `-O3`
- **Compiler-curious engineers** who want to read MIR, LLVM IR, and assembly output — not just as debugging aids, but as primary design feedback

## Prerequisites

This book assumes you are already proficient in Rust and have working knowledge of systems-level concepts:

| Concept | Where to Learn |
|---------|---------------|
| Ownership, borrowing, lifetimes | [Rust Memory Management](../memory-management-book/src/SUMMARY.md) |
| Stack vs heap, data layout, alignment | [Smart Pointers & Memory Architecture](../smart-pointers-book/src/SUMMARY.md) |
| Cargo workspaces, profiles, `rustflags` | [Ecosystem, Tooling & Profiling](../tooling-profiling-book/src/SUMMARY.md) |
| CPU caches (L1/L2/L3), cache lines | Any computer architecture textbook (Hennessy & Patterson recommended) |
| Basic x86-64 assembly (registers, `mov`, `add`, `call`) | [x86-64 Assembly Guide](https://www.cs.virginia.edu/~evans/cs216/guides/x86.html) or equivalent |
| What a branch predictor does | Patterson & Hennessy, or [Branch Prediction — Dan Luu](https://danluu.com/branch-prediction/) |

If terms like "L1d miss", "instruction-level parallelism", or "store-to-load forwarding" are unfamiliar, review a computer architecture primer before proceeding. This book will not re-derive those concepts — it uses them as vocabulary.

## How to Use This Book

**Read linearly the first time.** Parts I–IV build on each other. Each chapter has:

| Symbol | Meaning |
|--------|---------|
| 🟢 | Advanced — foundational for this series, but already requires Rust fluency |
| 🟡 | Expert — requires understanding of the compiler pipeline from Part I |
| 🔴 | Compiler-Level — deep LLVM internals, raw SIMD intrinsics, or binary layout manipulation |

Each chapter includes:
- A **"What you'll learn"** block at the top
- **Mermaid diagrams** visualizing compiler pipelines, optimization passes, and data flows
- **Side-by-side code comparisons**: what you write in Rust vs what the compiler emits as assembly
- **Anti-patterns** marked with `// ⚠️ POOR OPTIMIZATION:` showing code that *compiles* but optimizes badly
- **Fixes** marked with `// ✅ FIX:` showing the corrected version with explanation
- An **inline exercise** with a hidden solution
- **Key Takeaways** summarizing the core insights
- **Cross-references** to companion guides and external resources

## Pacing Guide

| Chapters | Topic | Suggested Time | Checkpoint |
|----------|-------|----------------|------------|
| 1 | The Compilation Pipeline | 4–6 hours | You can use `cargo asm` to inspect assembly output and verify zero-cost abstractions |
| 2 | MIR and Optimizer Internals | 5–7 hours | You can read MIR output, identify un-elided bounds checks, and explain monomorphization |
| 3 | CGUs and LTO | 3–5 hours | You can configure `Cargo.toml` profiles for maximum cross-crate optimization |
| 4 | PGO and BOLT | 5–7 hours | You can instrument a binary, collect profiles, and recompile with PGO |
| 5 | Target CPUs and Inlining | 4–6 hours | You can reason about inlining trade-offs and target-specific instruction selection |
| 6 | SIMD and `std::arch` | 6–8 hours | You can write SIMD-accelerated code using both `portable_simd` and raw intrinsics |
| 7 | Capstone: Matrix Multiplier | 8–10 hours | You've built a PGO-tuned, SIMD-accelerated matrix multiplier and verified every optimization in assembly |

**Total estimated time: 35–49 hours**

## Tooling You'll Need

Install these before starting:

```bash
# Core Rust toolchain
rustup update stable
rustup update nightly   # Required for portable_simd and some MIR flags

# Assembly inspection
cargo install cargo-show-asm

# Profiling (Linux — Chapter 4)
# sudo apt install linux-tools-common linux-tools-generic  # perf
# For macOS: Instruments.app (bundled with Xcode)

# Optional but recommended
# Install LLVM tools for llvm-profdata, llvm-bolt
rustup component add llvm-tools-preview
```

You should also bookmark [Compiler Explorer (Godbolt)](https://godbolt.org/) — we'll use it extensively throughout the book to inspect LLVM IR and assembly output without leaving the browser.

## Table of Contents

### Part I: Trust, But Verify (The Compiler Pipeline)

- [1. From Source to Assembly](ch01-from-source-to-assembly.md) 🟢 — The full compilation pipeline from source to machine code. Using `cargo asm` and Compiler Explorer to verify that zero-cost abstractions are actually zero-cost.
- [2. MIR and the Optimizer](ch02-mir-and-the-optimizer.md) 🟡 — Reading Mid-level IR. How `rustc` performs monomorphization and drop-tracking before handing off to LLVM. Identifying missed optimization opportunities.

### Part II: Forcing the Compiler's Hand

- [3. Codegen Units (CGUs) and LTO](ch03-codegen-units-and-lto.md) 🟡 — The trade-off between compile times and runtime performance. Why `codegen-units = 1` matters. Thin LTO vs Fat LTO for cross-crate inlining.
- [4. Profile-Guided Optimization (PGO) and BOLT](ch04-pgo-and-bolt.md) 🔴 — Stop guessing what the hot path is. Instrumentation, running representative workloads, and feeding the data back into LLVM. Post-link optimization with LLVM BOLT.

### Part III: Hardware Sympathy & SIMD

- [5. Target CPUs and Inlining](ch05-target-cpus-and-inlining.md) 🟡 — Using `target-cpu=native`. The `#[inline]` family of attributes. How instruction cache thrashing happens when you inline too much.
- [6. SIMD and `std::arch`](ch06-simd-and-std-arch.md) 🔴 — Single Instruction, Multiple Data. Bypassing auto-vectorization. Using `portable_simd` (nightly) vs stable architecture intrinsics. Data alignment for vector loads.

### Part IV: Capstone Project

- [7. Capstone: The Vectorized, PGO-Tuned Matrix Multiplier](ch07-capstone-matrix-multiplier.md) 🔴 — Build an ultra-fast matrix multiplication routine from naive scalar to fully optimized SIMD + PGO + LTO.

### Appendices

- [Summary and Reference Card](ch08-summary-and-reference-card.md) — Cheat sheet for `Cargo.toml` release profiles, `RUSTFLAGS`, common SIMD intrinsics, and diagnostic commands.

```mermaid
graph LR
    subgraph "Part I: The Pipeline"
        A[Ch 1: Source → ASM] --> B[Ch 2: MIR & Optimizer]
    end
    subgraph "Part II: Compiler Flags"
        C[Ch 3: CGUs & LTO] --> D[Ch 4: PGO & BOLT]
    end
    subgraph "Part III: Hardware"
        E[Ch 5: CPU Targets & Inlining] --> F[Ch 6: SIMD]
    end
    B --> C
    D --> E
    F --> G[Ch 7: Capstone]
    style G fill:#e74c3c,stroke:#c0392b,color:#fff
```

## Companion Guides

This book is designed to be read alongside:

| Guide | Relationship |
|-------|-------------|
| [Rust Memory Management](../memory-management-book/src/SUMMARY.md) | Understanding data layout is prerequisite to reasoning about cache performance and SIMD alignment |
| [Ecosystem, Tooling & Profiling](../tooling-profiling-book/src/SUMMARY.md) | Profiling identifies *where* to optimize; this book teaches *how* to optimize at the compiler level |
| [Unsafe Rust & FFI](../unsafe-ffi-book/src/SUMMARY.md) | SIMD intrinsics require `unsafe` blocks — that book covers the safety discipline, this one covers the performance discipline |
| [Smart Pointers & Memory Architecture](../smart-pointers-book/src/SUMMARY.md) | Memory layout, struct padding, and cache locality are direct inputs to the optimizations in this book |
