# Capstone Project: The C-Crypto Wrapper 🔴

> **What you'll learn:**
> - How to apply **every concept** from this book to build a real-world safe Rust wrapper around a C library
> - Complete lifecycle management: initialization, operation, callbacks, cleanup
> - Passing Rust closures to C as callbacks via the trampoline pattern
> - Building a final API that is impossible to misuse from safe Rust

This capstone integrates all techniques from the book into a single, cohesive project. We'll build a 100% safe, idiomatic Rust wrapper around a mock C cryptographic/compression library. The mock C library is intentionally designed to exercise every FFI pattern we've learned.

## The Mock C Library: `ccrypto`

Here's the C header for our mock library. In a real project, this would be provided by a third-party SDK.

```c
/* ccrypto.h — Mock C cryptographic library */
#ifndef CCRYPTO_H
#define CCRYPTO_H

#include <stddef.h>
#include <stdint.h>

/* Opaque context pointer */
typedef struct ccrypto_ctx ccrypto_ctx;

/* Status codes */
typedef enum {
    CCRYPTO_OK          = 0,
    CCRYPTO_ERR_NULL    = -1,
    CCRYPTO_ERR_INIT    = -2,
    CCRYPTO_ERR_INPUT   = -3,
    CCRYPTO_ERR_ALLOC   = -4,
    CCRYPTO_ERR_STATE   = -5,
} ccrypto_status;

/* Progress callback: called during long operations.
 * `progress` is 0–100, `user_data` is the caller's context. */
typedef void (*ccrypto_progress_fn)(int progress, void *user_data);

/* Initialize a new crypto context with the given algorithm name.
 * Returns NULL on failure. Caller must free with ccrypto_destroy(). */
ccrypto_ctx *ccrypto_init(const char *algorithm);

/* Get the algorithm name. Returns a pointer to an internal string (do NOT free). */
const char *ccrypto_algorithm(const ccrypto_ctx *ctx);

/* Process (hash/compress) a block of data.
 * `out` must point to a buffer of at least `out_cap` bytes.
 * `*out_len` is set to the actual number of bytes written.
 * Optionally calls `progress_fn` during processing. */
ccrypto_status ccrypto_process(
    ccrypto_ctx *ctx,
    const uint8_t *input, size_t input_len,
    uint8_t *out, size_t out_cap, size_t *out_len,
    ccrypto_progress_fn progress_fn, void *user_data
);

/* Get the last error message. Returns NULL if no error.
 * The returned string is valid until the next ccrypto_* call on this ctx. */
const char *ccrypto_last_error(const ccrypto_ctx *ctx);

/* Destroy the context and free all associated memory. */
void ccrypto_destroy(ccrypto_ctx *ctx);

#endif
```

```mermaid
sequenceDiagram
    participant User as Rust User Code
    participant Wrapper as CryptoContext (safe wrapper)
    participant FFI as extern "C" bindings
    participant CLib as ccrypto (C library)
    
    User->>Wrapper: CryptoContext::new("sha256")?
    Wrapper->>Wrapper: CString::new("sha256")
    Wrapper->>FFI: ccrypto_init(c_str.as_ptr())
    FFI->>CLib: Allocate + initialize context
    CLib->>FFI: Return *ctx (or null)
    FFI->>Wrapper: NonNull check → Ok(CryptoContext)
    Wrapper->>User: Ok(ctx)
    
    User->>Wrapper: ctx.process(data, |progress| print!("{progress}%"))
    Wrapper->>Wrapper: Set up trampoline + closure as void*
    Wrapper->>FFI: ccrypto_process(ctx, in, out, trampoline, user_data)
    FFI->>CLib: Process data
    CLib->>FFI: Call progress callback(50, user_data)
    FFI->>Wrapper: trampoline(50, void*) → closure(50)
    Wrapper->>User: Closure runs: print "50%"
    CLib->>FFI: Return status + output
    FFI->>Wrapper: Check status → Ok(output_slice)
    Wrapper->>User: Ok(Vec<u8>)
    
    User->>User: ctx goes out of scope
    User->>Wrapper: drop(ctx)
    Wrapper->>FFI: ccrypto_destroy(ctx.as_ptr())
    FFI->>CLib: Free all memory
```

## Step 1: Raw Bindings Layer (`sys` module)

First, we declare the raw C bindings. In a real project, `bindgen` would generate these.

```rust
//! Raw, unsafe bindings to the ccrypto C library.
//! This module is private — only our safe wrapper uses it.

#![allow(non_camel_case_types)]

use std::ffi::{c_char, c_int, c_void};

/// Opaque context pointer (C: `struct ccrypto_ctx`)
#[repr(C)]
pub struct ccrypto_ctx {
    _opaque: [u8; 0], // Zero-sized — prevents construction from Rust
}

/// Status codes from the C library
pub const CCRYPTO_OK: c_int = 0;
pub const CCRYPTO_ERR_NULL: c_int = -1;
pub const CCRYPTO_ERR_INIT: c_int = -2;
pub const CCRYPTO_ERR_INPUT: c_int = -3;
pub const CCRYPTO_ERR_ALLOC: c_int = -4;
pub const CCRYPTO_ERR_STATE: c_int = -5;

/// Progress callback type
pub type ccrypto_progress_fn = Option<extern "C" fn(c_int, *mut c_void)>;

extern "C" {
    pub fn ccrypto_init(algorithm: *const c_char) -> *mut ccrypto_ctx;
    pub fn ccrypto_algorithm(ctx: *const ccrypto_ctx) -> *const c_char;
    pub fn ccrypto_process(
        ctx: *mut ccrypto_ctx,
        input: *const u8,
        input_len: usize,
        out: *mut u8,
        out_cap: usize,
        out_len: *mut usize,
        progress_fn: ccrypto_progress_fn,
        user_data: *mut c_void,
    ) -> c_int;
    pub fn ccrypto_last_error(ctx: *const ccrypto_ctx) -> *const c_char;
    pub fn ccrypto_destroy(ctx: *mut ccrypto_ctx);
}
```

**Key design decisions:**
- The `ccrypto_ctx` struct uses `[u8; 0]` — a zero-sized opaque type. This prevents Rust code from constructing one directly.
- `ccrypto_progress_fn` is `Option<extern "C" fn(...)>` — the `Option` lets us pass `None` when no callback is needed (represented as null in C).
- Everything is `pub` within the module but the module itself will be `pub(crate)`.

## Step 2: Error Types

```rust
/// Errors from the ccrypto library.
#[derive(Debug)]
pub enum CryptoError {
    /// The C library failed to initialize (returned null).
    InitFailed { algorithm: String },
    /// A string parameter contained an interior null byte.
    NulByte { position: usize },
    /// The C library returned an error during processing.
    ProcessFailed { code: i32, message: Option<String> },
    /// The output buffer was too small.
    OutputBufferTooSmall { needed: usize, provided: usize },
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InitFailed { algorithm } => {
                write!(f, "ccrypto_init failed for algorithm '{algorithm}'")
            }
            Self::NulByte { position } => {
                write!(f, "string contains interior null byte at position {position}")
            }
            Self::ProcessFailed { code, message } => {
                write!(f, "ccrypto_process failed (code {code})")?;
                if let Some(msg) = message {
                    write!(f, ": {msg}")?;
                }
                Ok(())
            }
            Self::OutputBufferTooSmall { needed, provided } => {
                write!(f, "output buffer too small: need {needed}, got {provided}")
            }
        }
    }
}

impl std::error::Error for CryptoError {}
```

## Step 3: The Safe Wrapper

```rust
use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::ptr::NonNull;

/// A safe wrapper around the ccrypto C library context.
///
/// # Example
///
/// ```no_run
/// let mut ctx = CryptoContext::new("sha256")?;
///
/// let output = ctx.process(b"Hello, world!", |progress| {
///     println!("Processing: {progress}%");
/// })?;
///
/// println!("Result: {} bytes", output.len());
/// // ctx is automatically destroyed when it goes out of scope
/// ```
///
/// # Safety invariants (internal)
///
/// - `ctx` was obtained from `ccrypto_init` and has not been destroyed
/// - `ccrypto_destroy` is called exactly once via `Drop`
/// - All string conversions go through `CString`/`CStr` with proper null handling
/// - Progress callbacks use the trampoline pattern with proper lifetime management
pub struct CryptoContext {
    ctx: NonNull<sys::ccrypto_ctx>,
}

// NOT Send or Sync — the C library does not document thread safety.
// If we later verify the C library is thread-safe:
//   unsafe impl Send for CryptoContext {}

impl CryptoContext {
    /// Creates a new crypto context for the given algorithm.
    ///
    /// # Errors
    ///
    /// Returns `CryptoError::NulByte` if `algorithm` contains a null byte.
    /// Returns `CryptoError::InitFailed` if the C library fails to initialize.
    pub fn new(algorithm: &str) -> Result<Self, CryptoError> {
        let c_algorithm = CString::new(algorithm)
            .map_err(|e| CryptoError::NulByte { position: e.nul_position() })?;
        
        // SAFETY: c_algorithm is a valid null-terminated string.
        // ccrypto_init has no other preconditions.
        let raw = unsafe { sys::ccrypto_init(c_algorithm.as_ptr()) };
        
        let ctx = NonNull::new(raw).ok_or_else(|| CryptoError::InitFailed {
            algorithm: algorithm.to_owned(),
        })?;
        
        Ok(CryptoContext { ctx })
    }
    
    /// Returns the algorithm name.
    pub fn algorithm(&self) -> String {
        // SAFETY: ctx is valid (NonNull, not yet destroyed).
        // ccrypto_algorithm returns a pointer to an internal string.
        unsafe {
            let ptr = sys::ccrypto_algorithm(self.ctx.as_ptr());
            if ptr.is_null() {
                return String::from("(unknown)");
            }
            CStr::from_ptr(ptr).to_string_lossy().into_owned()
        }
    }
    
    /// Processes input data and returns the result.
    ///
    /// The `on_progress` callback is called with a percentage (0–100)
    /// during long operations.
    ///
    /// # Errors
    ///
    /// Returns `CryptoError::ProcessFailed` if the C library reports an error.
    pub fn process<F>(
        &mut self,
        input: &[u8],
        on_progress: F,
    ) -> Result<Vec<u8>, CryptoError>
    where
        F: FnMut(i32),
    {
        // Allocate output buffer (2x input + 64 is a safe overestimate for
        // most hash/compress operations)
        let out_cap = input.len().saturating_mul(2).saturating_add(64);
        let mut out_buf = vec![0u8; out_cap];
        let mut out_len: usize = 0;
        
        // Set up the trampoline for the progress callback
        let mut callback = on_progress;
        let user_data = &mut callback as *mut F as *mut c_void;
        
        // SAFETY:
        // - ctx is valid (NonNull, not yet destroyed)
        // - input points to input.len() valid bytes
        // - out_buf points to out_cap valid bytes
        // - out_len is valid for writing
        // - trampoline_fn and user_data form a valid callback pair
        // - callback (F) lives on the stack and outlives this call
        //   (ccrypto_process calls it synchronously)
        let status = unsafe {
            sys::ccrypto_process(
                self.ctx.as_ptr(),
                input.as_ptr(),
                input.len(),
                out_buf.as_mut_ptr(),
                out_cap,
                &mut out_len,
                Some(progress_trampoline::<F>),
                user_data,
            )
        };
        
        if status == sys::CCRYPTO_OK {
            out_buf.truncate(out_len);
            Ok(out_buf)
        } else {
            let message = self.last_error();
            Err(CryptoError::ProcessFailed {
                code: status,
                message,
            })
        }
    }
    
    /// Process without a progress callback.
    pub fn process_simple(&mut self, input: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let out_cap = input.len().saturating_mul(2).saturating_add(64);
        let mut out_buf = vec![0u8; out_cap];
        let mut out_len: usize = 0;
        
        // SAFETY: Same as above, but no callback (None = null function pointer).
        let status = unsafe {
            sys::ccrypto_process(
                self.ctx.as_ptr(),
                input.as_ptr(),
                input.len(),
                out_buf.as_mut_ptr(),
                out_cap,
                &mut out_len,
                None,              // No callback
                std::ptr::null_mut(), // No user data
            )
        };
        
        if status == sys::CCRYPTO_OK {
            out_buf.truncate(out_len);
            Ok(out_buf)
        } else {
            let message = self.last_error();
            Err(CryptoError::ProcessFailed {
                code: status,
                message,
            })
        }
    }
    
    /// Retrieves the last error message from the C library.
    fn last_error(&self) -> Option<String> {
        // SAFETY: ctx is valid.
        unsafe {
            let ptr = sys::ccrypto_last_error(self.ctx.as_ptr());
            if ptr.is_null() {
                return None;
            }
            // Copy immediately — the pointer is only valid until the next call
            Some(CStr::from_ptr(ptr).to_string_lossy().into_owned())
        }
    }
}

/// The trampoline function that bridges C's function pointer callback
/// to Rust's generic closure.
///
/// # Safety
///
/// `user_data` must be a valid pointer to a value of type `F`.
/// The pointee must be alive (not dropped) when this function is called.
extern "C" fn progress_trampoline<F: FnMut(i32)>(
    progress: c_int,
    user_data: *mut c_void,
) {
    // Catch any panic to prevent unwinding across the C boundary
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        // SAFETY: user_data was set to &mut F in CryptoContext::process.
        // F lives on the caller's stack and outlives this call.
        let callback = unsafe { &mut *(user_data as *mut F) };
        callback(progress as i32);
    }));
}

impl Drop for CryptoContext {
    fn drop(&mut self) {
        // SAFETY: ctx was created by ccrypto_init in CryptoContext::new.
        // Drop runs exactly once.
        unsafe { sys::ccrypto_destroy(self.ctx.as_ptr()); }
    }
}
```

## Step 4: Usage — The Payoff

Look at what the user sees. **Zero `unsafe`, zero raw pointers, zero manual memory management:**

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create a context — initialization failure is a Result
    let mut hasher = CryptoContext::new("sha256")?;
    
    println!("Algorithm: {}", hasher.algorithm());
    
    // Process with a progress callback (a closure!)
    let input = b"The quick brown fox jumps over the lazy dog";
    let hash = hasher.process(input, |progress| {
        eprint!("\rHashing: {progress}%");
    })?;
    
    eprintln!(); // newline after progress
    println!("Hash: {} bytes", hash.len());
    
    // Process without a callback
    let hash2 = hasher.process_simple(b"Another message")?;
    println!("Hash2: {} bytes", hash2.len());
    
    // hasher is automatically cleaned up here — ccrypto_destroy is called
    Ok(())
}
```

## Anatomy of Safety: Why This Wrapper Cannot Cause UB

Let's audit every potential UB vector:

| UB Category | How the wrapper prevents it |
|------------|----------------------------|
| **Null pointer deref** | `NonNull` in constructor; all pointer checks before `CStr::from_ptr` |
| **Use-after-free** | `Drop` frees; Rust ownership prevents use after drop |
| **Double-free** | `Drop` runs exactly once (Rust's type system guarantees this) |
| **Memory leak** | `Drop` ensures cleanup; `Vec` for output buffer |
| **Dangling callback** | Closure lives on stack; `process` is synchronous |
| **Unwind across FFI** | `catch_unwind` in trampoline |
| **Mixed allocators** | Output allocated by Rust (`Vec`), input borrowed, C memory managed by C |
| **Interior null in strings** | `CString::new()` returns `Err` |
| **Invalid UTF-8** | `to_string_lossy()` for C→Rust strings |
| **Thread safety** | `!Send`, `!Sync` by default |

## Testing with Miri

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_new_and_drop() {
        // Tests that creation and destruction don't leak or double-free.
        // (With a real C library, this would require a mock or Miri.)
        let ctx = CryptoContext::new("sha256");
        assert!(ctx.is_ok());
        // Drop runs automatically
    }
    
    #[test]
    fn test_nul_byte_rejected() {
        let result = CryptoContext::new("sha\0256");
        assert!(matches!(result, Err(CryptoError::NulByte { position: 3 })));
    }
    
    #[test]
    fn test_process_with_callback() {
        let mut ctx = CryptoContext::new("sha256").unwrap();
        let mut progress_values = Vec::new();
        
        let result = ctx.process(b"test data", |p| {
            progress_values.push(p);
        });
        
        // With a real library, check the output.
        // Here we're primarily testing that the callback machinery works.
        assert!(result.is_ok());
    }
}
```

```bash
# Run tests under Miri with strict provenance
MIRIFLAGS="-Zmiri-strict-provenance" cargo +nightly miri test
```

<details>
<summary><strong>🏋️ Exercise: Extend the Wrapper</strong> (click to expand)</summary>

Extend the `CryptoContext` wrapper with these additional capabilities:

1. **Streaming API:** Add a `process_chunk` method that can be called multiple times to process data incrementally (imagine `ccrypto_process_chunk` exists in the C library).

2. **Builder pattern:** Create a `CryptoContextBuilder` that lets users configure options before initialization:
   ```rust
   let ctx = CryptoContext::builder("sha256")
       .buffer_size(4096)
       .enable_verification(true)
       .build()?;
   ```

3. **Error context:** Capture the C library's error message at the time of the error (not lazily), so the `CryptoError` always contains the relevant message even after subsequent operations.

<details>
<summary>🔑 Solution</summary>

```rust
// 1. Streaming API

// Additional C binding (mock)
mod sys {
    // ... (existing bindings) ...
    extern "C" {
        pub fn ccrypto_process_chunk(
            ctx: *mut ccrypto_ctx,
            input: *const u8,
            input_len: usize,
        ) -> c_int;
        
        pub fn ccrypto_finalize(
            ctx: *mut ccrypto_ctx,
            out: *mut u8,
            out_cap: usize,
            out_len: *mut usize,
        ) -> c_int;
    }
}

impl CryptoContext {
    /// Feed a chunk of data for incremental processing.
    pub fn update(&mut self, chunk: &[u8]) -> Result<(), CryptoError> {
        // SAFETY: ctx is valid, chunk is a valid byte slice.
        let status = unsafe {
            sys::ccrypto_process_chunk(
                self.ctx.as_ptr(),
                chunk.as_ptr(),
                chunk.len(),
            )
        };
        
        if status == sys::CCRYPTO_OK {
            Ok(())
        } else {
            // Capture the error message NOW, not lazily
            let message = self.last_error();
            Err(CryptoError::ProcessFailed { code: status, message })
        }
    }
    
    /// Finalize incremental processing and return the result.
    pub fn finalize(&mut self) -> Result<Vec<u8>, CryptoError> {
        let out_cap = 256; // Typical hash output size
        let mut out_buf = vec![0u8; out_cap];
        let mut out_len: usize = 0;
        
        // SAFETY: ctx is valid, out_buf is valid.
        let status = unsafe {
            sys::ccrypto_finalize(
                self.ctx.as_ptr(),
                out_buf.as_mut_ptr(),
                out_cap,
                &mut out_len,
            )
        };
        
        if status == sys::CCRYPTO_OK {
            out_buf.truncate(out_len);
            Ok(out_buf)
        } else {
            let message = self.last_error();
            Err(CryptoError::ProcessFailed { code: status, message })
        }
    }
}

// 2. Builder pattern

pub struct CryptoContextBuilder {
    algorithm: String,
    buffer_size: usize,
    enable_verification: bool,
}

impl CryptoContext {
    /// Create a builder for configuring a CryptoContext.
    pub fn builder(algorithm: &str) -> CryptoContextBuilder {
        CryptoContextBuilder {
            algorithm: algorithm.to_owned(),
            buffer_size: 8192,
            enable_verification: false,
        }
    }
}

impl CryptoContextBuilder {
    pub fn buffer_size(mut self, size: usize) -> Self {
        self.buffer_size = size;
        self
    }
    
    pub fn enable_verification(mut self, enable: bool) -> Self {
        self.enable_verification = enable;
        self
    }
    
    pub fn build(self) -> Result<CryptoContext, CryptoError> {
        // Build the context with configuration
        let ctx = CryptoContext::new(&self.algorithm)?;
        
        // In a real library, you'd pass buffer_size and verification
        // settings to additional C configuration functions here.
        // e.g., unsafe { sys::ccrypto_set_opt(ctx.ctx.as_ptr(), ...) }
        
        Ok(ctx)
    }
}

// 3. Error context — already handled above!
// The key insight: call self.last_error() IMMEDIATELY when the error
// occurs, and store the message in the CryptoError variant.
// This is already done in our update() and finalize() implementations:
//
//   let message = self.last_error();  // Capture NOW
//   Err(CryptoError::ProcessFailed { code: status, message })
//
// The message is owned (String), so it survives even after the
// CryptoContext is dropped or used for another operation.

// Usage example:
fn streaming_example() -> Result<(), Box<dyn std::error::Error>> {
    let mut ctx = CryptoContext::builder("sha256")
        .buffer_size(4096)
        .enable_verification(true)
        .build()?;
    
    // Stream data in chunks
    ctx.update(b"Hello, ")?;
    ctx.update(b"world!")?;
    
    let hash = ctx.finalize()?;
    println!("Streaming hash: {} bytes", hash.len());
    
    Ok(())
}
```

</details>
</details>

> **Key Takeaways:**
> - A production FFI wrapper has four layers: **raw bindings** (`sys`) → **error types** → **safe wrapper** → **user-facing API**
> - The user-facing API should contain **zero `unsafe`** — all unsafety is confined to the wrapper's internals
> - Use the **trampoline pattern** for callbacks: `extern "C" fn` + `void*` → Rust closure, with `catch_unwind` for panic safety
> - **Audit every UB category** against your wrapper: null, use-after-free, double-free, leaks, aliasing, unwind, allocator mixing, string encoding
> - `NonNull<T>` + `Drop` + private fields = the holy trinity of safe FFI abstraction
> - Test with `cargo +nightly miri test` — Miri is the final line of defense before production

> **See also:**
> - [Chapter 8: Safe Abstractions](ch08-safe-abstractions-over-unsafe-code.md) — the theory behind this capstone's design
> - [Chapter 7: Opaque Pointers](ch07-opaque-pointers-and-manual-memory-management.md) — `Box::into_raw` / `Box::from_raw` and the callback pattern
> - [Chapter 5: Strings](ch05-strings-nulls-and-memory-boundaries.md) — `CString`/`CStr` conversion rules used throughout
> - [Appendix: Reference Card](appendix-reference-card.md) — quick-reference for all patterns used here
> - [Rust Engineering Practices](../engineering-book/src/SUMMARY.md) — CI/CD, Miri in CI, release engineering
