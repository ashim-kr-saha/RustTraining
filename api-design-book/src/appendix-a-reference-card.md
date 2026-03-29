# Appendix A: API Design Reference Card

> A single-page cheat sheet covering the key rules, patterns, and instructions from this book. Print it, bookmark it, or tape it to your monitor.

---

## Rust API Naming Conventions (C-x Rules)

| Rule | Convention | Example |
|------|-----------|---------|
| **C-CASE** | Types: `UpperCamelCase`; functions: `snake_case`; constants: `SCREAMING_SNAKE_CASE` | `HttpClient`, `from_bytes`, `MAX_RETRIES` |
| **C-CONV** | `as_` = free borrow; `to_` = allocating; `into_` = consuming; `from_` = constructor | `as_bytes()`, `to_string()`, `into_inner()` |
| **C-GETTER** | No `get_` prefix on getters | `fn timeout(&self)` not `fn get_timeout(&self)` |
| **C-ITER** | `iter()`, `iter_mut()`, `into_iter()` triad | Follow the `IntoIterator` convention |
| **C-COMMON-TRAITS** | Derive `Debug`, `Clone`, `PartialEq`, `Eq`, `Hash`, `Default` when appropriate | Only derive what your fields support |
| **C-CALLER-DECIDES** | Return `impl Iterator`, not `Vec` | Let callers `.collect()`, `.take()`, `.count()` |
| **C-GENERIC** | Accept `impl AsRef<Path>`, `impl Into<String>` at boundaries | Reduce friction for callers |
| **C-EXAMPLE** | Every public function has a doc example with `?` | Use `# Ok::<(), Error>(())` for hidden boilerplate |

---

## SemVer Breaking Changes Checklist

| Change | Breaking? | Mitigation |
|--------|-----------|------------|
| Add a public field to a struct | ✅ **Yes** | Use `#[non_exhaustive]` + constructor/builder |
| Add a variant to a public enum | ✅ **Yes** | Use `#[non_exhaustive]` on the enum |
| Add a required method to a public trait | ✅ **Yes** | Seal the trait, or add a default impl |
| Remove a public trait impl | ✅ **Yes** | Don't remove it (deprecate instead) |
| Change function signature | ✅ **Yes** | Use `impl Into<T>` / `impl AsRef<T>` from the start |
| Expose a type from a dependency | ✅ **Couples versions** | Keep dependencies behind `pub(crate)` |
| Add a new public function | ❌ No | — |
| Add a default method to a public trait | ⚠️ Maybe | Can shadow existing user methods |
| Add a field to a `#[non_exhaustive]` struct | ❌ No | ✅ Safe — users use constructors |
| Add a variant to a `#[non_exhaustive]` enum | ❌ No | ✅ Safe — users have wildcard arms |

### CI Tools

| Tool | What it does |
|------|-------------|
| `cargo semver-checks` | Detects API-breaking changes automatically |
| `cargo public-api` | Dumps your entire public API for diffing |
| `#![deny(missing_docs)]` | Fails compilation for undocumented public items |
| `#![warn(unreachable_pub)]` | Warns about `pub` items not reachable from crate root |

---

## Error Architecture Quick Reference

### Library Errors (`thiserror`)

```rust,ignore
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum MyError {
    #[error("operation timed out after {timeout_ms}ms")]
    Timeout { timeout_ms: u64 },

    #[error("I/O error")]
    Io(#[from] std::io::Error),

    #[error("internal error: {message}")]
    Internal {
        message: String,
        #[source]
        source: Box<dyn std::error::Error + Send + Sync>,
    },
}
```

### Application Errors (`anyhow`)

```rust,ignore
use anyhow::{Context, Result};

fn main() -> Result<()> {
    let config = load_config("config.toml")
        .context("failed to load configuration")?;
    Ok(())
}
```

### Decision Table

| Question | Library | Application |
|----------|---------|-------------|
| Who reads the error? | Other code (matching) | Humans (logs/UI) |
| Return type? | `Result<T, MyError>` | `anyhow::Result<T>` |
| How to add context? | Structured fields | `.context("msg")` |
| Convention crate? | `thiserror` | `anyhow` or `eyre` |
| Backtrace? | Opt-in field | Always (via anyhow) |

---

## Sealed Trait Pattern

```rust,ignore
mod private {
    pub trait Sealed {}
}

pub trait MyTrait: private::Sealed {
    fn method(&self);
}

// Only your crate can implement Sealed → only your crate can implement MyTrait.
struct MyType;
impl private::Sealed for MyType {}
impl MyTrait for MyType {
    fn method(&self) { /* ... */ }
}
```

**Seal when:** You control all implementations.
**Leave open when:** The trait IS the extension point.

---

## `build.rs` Cargo Instructions

| Instruction | Purpose | Example |
|-------------|---------|---------|
| `cargo:rerun-if-changed=<path>` | Rebuild only when this file changes | `cargo:rerun-if-changed=proto/schema.proto` |
| `cargo:rerun-if-env-changed=<var>` | Rebuild when env var changes | `cargo:rerun-if-env-changed=DATABASE_URL` |
| `cargo:rustc-env=K=V` | Set compile-time env var | `cargo:rustc-env=GIT_SHA=abc123` |
| `cargo:rustc-cfg=<flag>` | Enable `#[cfg(flag)]` | `cargo:rustc-cfg=has_sse42` |
| `cargo:rustc-link-lib=[kind=]<name>` | Link native library | `cargo:rustc-link-lib=static=mylib` |
| `cargo:rustc-link-search=[kind=]<path>` | Add linker search path | `cargo:rustc-link-search=native=/usr/lib` |
| `cargo:warning=<msg>` | Emit compiler warning | `cargo:warning=Missing optional config` |

### Build Script Best Practices

1. **Always** specify `rerun-if-changed` or `rerun-if-env-changed`.
2. **Never** do network I/O in `build.rs`.
3. **Minimize** `[build-dependencies]`.
4. **Write** generated files to `OUT_DIR`, include with `include!()`.
5. **Keep** output deterministic (no timestamps).

---

## Common Crate Patterns

### `Result` Type Alias

```rust,ignore
pub type Result<T> = std::result::Result<T, MyError>;
```

### Crate Root Re-exports

```rust,ignore
// src/lib.rs
mod internal_module;
pub use internal_module::PublicType;
```

### Prelude Module

```rust,ignore
pub mod prelude {
    pub use crate::{Client, Config, Error, Result};
}
```

### Type-Safe Builder (Typestate)

```rust,ignore
pub struct Builder<State> { state: State, /* shared fields */ }
pub struct NeedsA;
pub struct NeedsB { a: String }
pub struct Ready { a: String, b: String }

impl Builder<NeedsA> {
    pub fn a(self, val: impl Into<String>) -> Builder<NeedsB> { /* ... */ }
}
impl Builder<NeedsB> {
    pub fn b(self, val: impl Into<String>) -> Builder<Ready> { /* ... */ }
}
impl Builder<Ready> {
    pub fn build(self) -> Result<Config> { /* ... */ }
}
```

---

## `#[non_exhaustive]` Cheat Sheet

| Applied to | Effect inside your crate | Effect outside your crate |
|-----------|------------------------|--------------------------|
| `struct` | No effect | Cannot use struct literal syntax |
| `enum` | No effect | Must have `_ =>` wildcard in `match` |
| Enum variant | No effect | Cannot destructure all fields |

---

> **See also:**
> - [Official Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
> - [Cargo Build Scripts](https://doc.rust-lang.org/cargo/reference/build-scripts.html)
> - [SemVer specification](https://semver.org/)
> - [`thiserror` docs](https://docs.rs/thiserror)
> - [`anyhow` docs](https://docs.rs/anyhow)
> - [`cc` crate docs](https://docs.rs/cc)
> - [`prost` docs](https://docs.rs/prost)
