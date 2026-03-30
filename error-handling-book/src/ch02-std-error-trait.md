# 2. Unpacking `std::error::Error` 🟡

> **What you'll learn:**
> - The evolution of the `Error` trait and why `description()` is deprecated
> - The contract between `Display`, `Debug`, and `source()` — and how they serve different audiences
> - How to implement the full `Error` trait manually to build source chains
> - Walking an error chain from leaf to root for diagnostic output

---

## The `Error` Trait: Anatomy of a Contract

The `std::error::Error` trait is the backbone of Rust's error system. Every well-behaved error type implements it:

```rust
// Simplified from std (stable Rust as of 1.84+)
pub trait Error: Display + Debug {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        None // default: no underlying cause
    }
}
```

That's it. Three requirements:
1. **`Display`** — a human-readable message for end users and log files
2. **`Debug`** — a programmer-readable representation for debugging (usually `#[derive(Debug)]`)
3. **`source()`** — an optional pointer to the *underlying cause*

### The Deprecated Methods

You may encounter two deprecated methods in older code:

| Method | Status | Replacement |
|--------|--------|------------|
| `description()` | Deprecated since 1.42 | Use `Display` (`to_string()`) instead |
| `cause()` | Deprecated since 1.33 | Use `source()` instead |

Both were replaced because `Display` is more flexible than returning a `&str`, and `source()` returns `dyn Error + 'static` which enables downcasting.

## `Display` vs `Debug`: Two Audiences, Two Formats

A critical design decision: `Display` and `Debug` must produce *different* output serving *different* audiences.

```rust
use std::fmt;

#[derive(Debug)] // Debug: for developers, shows internal structure
struct ConfigError {
    path: String,
    line: usize,
    message: String,
}

// Display: for users and log files, clean and contextual
impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "config error in '{}' at line {}: {}", self.path, self.line, self.message)
    }
}
```

```
Display: config error in 'app.toml' at line 42: invalid port number
Debug:   ConfigError { path: "app.toml", line: 42, message: "invalid port number" }
```

| Trait | Audience | Convention |
|-------|----------|-----------|
| `Display` | End users, log aggregators | Lowercase, no trailing period, single line |
| `Debug` | Developers debugging an issue | Show all internal fields and structure |

**Rule of thumb:** If you're logging, use `{error}` (Display). If you're debugging, use `{error:?}` (Debug). If you want the full chain, use `{error:#?}` or walk `source()` manually.

## The Source Chain: Errors All the Way Down

The real power of the `Error` trait is `source()` — it creates a linked list of errors you can walk from the outermost context to the root cause:

```mermaid
graph LR
    A["ServiceError<br/><i>Display: 'failed to start HTTP server'</i>"] -->|source\(\)| B["ConfigError<br/><i>Display: 'invalid listen address'</i>"]
    B -->|source\(\)| C["AddrParseError<br/><i>Display: 'invalid IP address syntax'</i>"]
    C -->|source\(\)| D["None<br/><i>root cause</i>"]

    style A fill:#b8860b,color:#fff
    style B fill:#b8860b,color:#fff
    style C fill:#8b0000,color:#fff
    style D fill:#555,color:#fff
```

### Implementing a Source Chain Manually

```rust
use std::fmt;
use std::error::Error;
use std::net::AddrParseError;

#[derive(Debug)]
struct ConfigError {
    field: String,
    source: AddrParseError, // the underlying cause
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // ✅ Display describes THIS error's context — not the source's message
        write!(f, "invalid config field '{}'", self.field)
    }
}

impl Error for ConfigError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        // ✅ FIX: Preserving the source chain
        Some(&self.source)
    }
}

#[derive(Debug)]
struct ServiceError {
    operation: String,
    source: ConfigError, // wraps the next layer
}

impl fmt::Display for ServiceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "failed to {}", self.operation)
    }
}

impl Error for ServiceError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}
```

### Walking the Chain

```rust
/// Print the full error chain, one cause per line
fn print_error_chain(err: &dyn Error) {
    // Level 0: the outermost error
    eprintln!("Error: {err}");

    // Walk the source chain
    let mut current = err.source();
    let mut depth = 1;
    while let Some(cause) = current {
        eprintln!("  Caused by [{depth}]: {cause}");
        current = cause.source();
        depth += 1;
    }
}
```

Output:
```
Error: failed to start HTTP server
  Caused by [1]: invalid config field 'listen_addr'
  Caused by [2]: invalid IP address syntax
```

## The Anti-Pattern: Swallowing the Source

The most common error-handling mistake in Rust is losing the source chain:

```rust
// ⚠️ CONTEXT LOST: Source error is swallowed
#[derive(Debug)]
struct MyError {
    message: String,
}

impl fmt::Display for MyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl Error for MyError {
    // source() returns None (default) — the original cause is GONE
}

// This function destroys the io::Error's source chain:
fn load_file(path: &str) -> Result<String, MyError> {
    std::fs::read_to_string(path)
        .map_err(|e| MyError { message: format!("failed to read {path}: {e}") })
        // ⚠️ The io::Error is gone — only its Display text survives
}
```

```rust
// ✅ FIX: Preserving the source chain
#[derive(Debug)]
struct MyError {
    context: String,
    source: Box<dyn Error + Send + Sync>, // preserve the actual error
}

impl fmt::Display for MyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.context) // only YOUR context, not the source's
    }
}

impl Error for MyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(self.source.as_ref()) // ✅ the chain is intact
    }
}
```

**Rule:** Never `format!("{source_error}")` into a string field. Store the original error and return it from `source()`.

## Downcasting: Recovering the Concrete Type

Since `source()` returns `&dyn Error`, you may need to recover the concrete error type for programmatic handling:

```rust
fn handle_error(err: &dyn Error) {
    // Try to downcast to a specific type
    if let Some(io_err) = err.downcast_ref::<std::io::Error>() {
        match io_err.kind() {
            std::io::ErrorKind::NotFound => eprintln!("File not found — check the path"),
            std::io::ErrorKind::PermissionDenied => eprintln!("Permission denied — run as root?"),
            _ => eprintln!("I/O error: {io_err}"),
        }
    } else {
        eprintln!("Unknown error: {err}");
    }
}
```

Downcasting requires `Error + 'static` (no borrowed data). This is why `source()` returns `&(dyn Error + 'static)` — the `'static` bound enables the `Any`-based downcast machinery.

## Designing Error Types: Enum vs Struct

| Design | When to use | Pros | Cons |
|--------|------------|------|------|
| **Enum** | Libraries with known failure modes | Callers can `match` variants; exhaustive | Must be extended with semver care |
| **Struct** (opaque) | Implementation-detail errors | Hides internals; freedom to refactor | Callers can't programmatically branch |
| **`Box<dyn Error>`** | Applications (top-level) | Any error type fits | No programmatic matching without `downcast` |

```rust
// ✅ Library: enum — callers can match
#[derive(Debug)]
pub enum DatabaseError {
    ConnectionFailed { host: String, source: io::Error },
    QueryFailed { query: String, source: SqlError },
    PoolExhausted { max_connections: usize },
}

// ✅ Application: opaque wrapper — just report and exit
struct AppError(Box<dyn Error + Send + Sync>);
```

---

<details>
<summary><strong>🏋️ Exercise: Build a Three-Layer Error Chain</strong> (click to expand)</summary>

**Challenge:** Implement three error types that form a chain:
1. `ParseError` — wraps `std::num::ParseIntError`
2. `ValidationError` — wraps `ParseError`, adds a field name
3. `RequestError` — wraps `ValidationError`, adds an endpoint name

Each must implement `Display`, `Debug`, and `Error` (with `source()`). Write a `print_error_chain()` function that walks the chain and prints every layer.

<details>
<summary>🔑 Solution</summary>

```rust
use std::error::Error;
use std::fmt;
use std::num::ParseIntError;

// Layer 1: wraps the stdlib parse error
#[derive(Debug)]
struct ParseError {
    raw_value: String,
    source: ParseIntError,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "failed to parse '{}'", self.raw_value)
    }
}

impl Error for ParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source) // preserves ParseIntError in the chain
    }
}

// Layer 2: wraps ParseError, adds the field name
#[derive(Debug)]
struct ValidationError {
    field: String,
    source: ParseError,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "validation failed for field '{}'", self.field)
    }
}

impl Error for ValidationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source) // preserves ParseError in the chain
    }
}

// Layer 3: wraps ValidationError, adds the endpoint
#[derive(Debug)]
struct RequestError {
    endpoint: String,
    source: ValidationError,
}

impl fmt::Display for RequestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "request to '{}' failed", self.endpoint)
    }
}

impl Error for RequestError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source) // preserves ValidationError in the chain
    }
}

// Chain walker: iterates through source() links
fn print_error_chain(err: &dyn Error) {
    eprintln!("Error: {err}");
    let mut current = err.source();
    let mut depth = 1;
    while let Some(cause) = current {
        eprintln!("  Caused by [{depth}]: {cause}");
        current = cause.source();
        depth += 1;
    }
}

fn main() {
    // Construct a three-layer chain
    let parse_err = "not_a_number".parse::<u16>().unwrap_err();
    let chain = RequestError {
        endpoint: "/api/v1/users".into(),
        source: ValidationError {
            field: "age".into(),
            source: ParseError {
                raw_value: "not_a_number".into(),
                source: parse_err,
            },
        },
    };

    print_error_chain(&chain);
    // Output:
    // Error: request to '/api/v1/users' failed
    //   Caused by [1]: validation failed for field 'age'
    //   Caused by [2]: failed to parse 'not_a_number'
    //   Caused by [3]: invalid digit found in string
}
```

</details>
</details>

---

> **Key Takeaways**
> - The `Error` trait requires `Display` + `Debug` and optionally `source()` — three distinct responsibilities
> - `Display` is for users; `Debug` is for developers; `source()` is for the error chain
> - **Never format a source error into a string** — store the original and return it from `source()`
> - The `'static` bound on `source()` enables downcasting via `downcast_ref::<T>()`
> - Prefer enums for library errors (callers can match) and opaque wrappers for application errors

> **See also:**
> - [Chapter 1: The `Result` Enum and `Try` Trait](ch01-result-and-try-trait.md) — the `From` impls that `?` calls
> - [Chapter 3: The New `Provider` API](ch03-provider-api.md) — dynamic context attachment without modifying the error signature
> - [Chapter 4: Library Errors with `thiserror`](ch04-thiserror.md) — code-generating everything you wrote by hand in this chapter
