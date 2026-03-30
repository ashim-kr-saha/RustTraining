# Rust Error Handling Mastery: From `Result` to Panic Hooks

## Speaker Intro

- Principal Systems Architect and Reliability Engineer with decades of experience building high-reliability distributed systems in C++ and Rust
- Core contributor to production telemetry pipelines and safety-critical firmware where a single unhandled error means pager duty at 3 AM
- Industry veteran spanning Microsoft SCHIE, cloud infrastructure, and embedded systems — started trusting Rust's error model in 2018 and never looked back

---

Every Rust program has two error channels: the *value channel* (`Result<T, E>`) and the *panic channel* (stack unwinding or abort). Most tutorials cover the first and wave their hands at the second. This book covers **both in depth** — from desugaring the `?` operator to building a custom panic hook that serializes crash telemetry to JSON before graceful shutdown.

This is not "intro to `match`." This is the guide you wish existed the third time you stared at a `Box<dyn Error + Send + Sync + 'static>` and wondered what you were doing with your life.

## Who This Is For

- **Developers tired of `unwrap()`** — You've internalized that `.unwrap()` is a moral failing in production code, but you're not sure what to replace it with
- **Service authors on pager duty** — You need ironclad guarantees that errors propagate with context, panics get captured to telemetry, and nothing silently disappears
- **Library authors** — You want strongly-typed, semver-stable error enums that downstream consumers can `match` on — not `String` soup
- **FFI boundary writers** — You need to translate Rust errors into C-compatible errno codes without invoking undefined behavior through unwinding across `extern "C"`
- **Anyone who has written `map_err(|e| format!("{e}"))` and hated themselves** — We'll fix that

## Prerequisites

You should be comfortable with these concepts before starting:

| Concept | Where to Learn |
|---------|---------------|
| Ownership, borrowing, lifetimes | [Rust Memory Management](../memory-management-book/src/SUMMARY.md) |
| Traits, generics, `impl Trait` | [Type System & Traits](../type-system-traits-book/src/SUMMARY.md) |
| Basic `Result<T, E>` and `Option<T>` | [The Rust Programming Language, Ch. 9](https://doc.rust-lang.org/book/ch09-00-error-handling.html) |
| `std::fmt::Display` and `Debug` | [Rust by Example](https://doc.rust-lang.org/rust-by-example/hello/print.html) |
| Closures and `Fn` traits | [The Rust Programming Language, Ch. 13](https://doc.rust-lang.org/book/ch13-00-functional-features.html) |

No prior experience with `thiserror`, `anyhow`, or panic hooks is required — we build all of it from first principles.

## How to Use This Book

**Read linearly the first time.** Parts I–IV build on each other. Each chapter has:

| Symbol | Meaning |
|--------|---------|
| 🟢 | Beginner — foundational concept, safe to skim if experienced |
| 🟡 | Intermediate — requires the preceding chapters |
| 🔴 | Advanced — deep internals, production patterns, or nightly features |

Each chapter includes:
- A **"What you'll learn"** block at the top
- **Mermaid diagrams** illustrating control flow and type hierarchies
- Comparative **"Clunky Way" vs "Idiomatic Way"** code blocks
- An **inline exercise** with a hidden solution
- **Key Takeaways** summarizing the core ideas
- **Cross-references** to related chapters and companion books

## Pacing Guide

| Chapters | Topic | Suggested Time | Checkpoint |
|----------|-------|----------------|------------|
| 1 | Core `Result` and `Try` | 2–3 hours | You can explain `?` desugaring to the `Try` trait |
| 2–3 | `std::error::Error` and Provider | 3–4 hours | You can implement a custom error type with `source()` chains and request backtraces |
| 4–5 | `thiserror` / `anyhow` / `eyre` | 3–4 hours | You can choose the right crate for libraries vs. applications and explain why |
| 6–7 | Panics, Unwinding, Hooks | 3–4 hours | You can explain `panic=unwind` vs `abort`, catch panics at FFI boundaries, and install a custom hook |
| 8 | Backtraces and Tracing | 2–3 hours | You can capture backtraces cheaply and attach structured errors to `tracing` spans |
| 9 | Capstone: Bulletproof Daemon | 4–6 hours | You've built a production daemon with typed errors, `color-eyre` output, panic hooks, and FFI translation |

**Total estimated time: 17–24 hours**

## Working Through Exercises

Every content chapter has an inline exercise. The capstone (Ch. 9) integrates everything into a single project. For maximum learning:

1. **Try the exercise before expanding the solution** — struggling is where learning happens
2. **Type the code, don't copy-paste** — muscle memory matters for Rust's syntax
3. **Run every example** — `cargo new error-handling-exercises` and test as you go
4. **Read the error messages** — Rust's compiler errors are the best teacher

## Table of Contents

### Part I: The Core Mechanics

- [1. The `Result` Enum and `Try` Trait](ch01-result-and-try-trait.md) 🟢 — Beyond `match`: how `?` desugars into `Try` and `FromResidual`
- [2. Unpacking `std::error::Error`](ch02-std-error-trait.md) 🟡 — The trait hierarchy, `Display` vs `Debug`, and the `source()` chain
- [3. The New `Provider` API](ch03-provider-api.md) 🔴 — Generic member access via `std::error::Request` for backtraces and arbitrary context

### Part II: The Ecosystem Divide

- [4. Library Errors with `thiserror`](ch04-thiserror.md) 🟡 — Strongly typed enums with `#[from]`, `#[error(transparent)]`, and semver discipline
- [5. Application Errors with `anyhow` and `eyre`](ch05-anyhow-and-eyre.md) 🟡 — Type-erased error handling, `.context()`, and rich terminal diagnostics

### Part III: Panics and Severe Faults

- [6. The Anatomy of a Panic](ch06-anatomy-of-a-panic.md) 🔴 — `unwind` vs `abort`, stack unwinding mechanics, `Drop` interactions, and the FFI boundary
- [7. Catching Unwinds and Custom Hooks](ch07-catching-unwinds-and-hooks.md) 🔴 — `catch_unwind`, custom panic hooks, and telemetry integration

### Part IV: Production Diagnostics & Capstone

- [8. Backtraces and Tracing Integration](ch08-backtraces-and-tracing.md) 🔴 — Capturing `Backtrace` cheaply, attaching errors to `tracing` spans
- [9. Capstone: The Bulletproof Daemon](ch09-capstone-bulletproof-daemon.md) 🔴 — A full production daemon integrating everything

### Appendices

- [Summary and Reference Card](appendix-a-reference-card.md) — Cheat sheets for `Result` combinators, `thiserror` attributes, panic hook configuration

```mermaid
graph LR
    A["Part I<br/>Core Mechanics"] --> B["Part II<br/>Ecosystem"]
    B --> C["Part III<br/>Panics"]
    C --> D["Part IV<br/>Production"]
    D --> E["Capstone<br/>Bulletproof Daemon"]

    style A fill:#2d6a2d,color:#fff
    style B fill:#b8860b,color:#fff
    style C fill:#8b0000,color:#fff
    style D fill:#8b0000,color:#fff
    style E fill:#4a0080,color:#fff
```

## Companion Guides

This book is an ultra-advanced companion to several other books in this training series:

- [**Rust API Design & Error Architecture**](../api-design-book/src/SUMMARY.md) — API guidelines, SemVer stability, `thiserror` vs `anyhow` trade-offs
- [**Unsafe Rust & FFI**](../unsafe-ffi-book/src/SUMMARY.md) — The FFI boundary rules that make Chapter 6's panic-across-FFI discussion critical
- [**Rust Engineering Practices**](../engineering-book/src/SUMMARY.md) — CI/CD, Miri, and the tooling that catches error-handling bugs before production
- [**Enterprise Rust**](../enterprise-rust-book/src/SUMMARY.md) — OpenTelemetry integration that Chapter 8's tracing discussion feeds into
- [**The Rust Architect's Toolbox**](../toolbox-book/src/SUMMARY.md) — `miette` diagnostic framework covered alongside `eyre` in Chapter 5
