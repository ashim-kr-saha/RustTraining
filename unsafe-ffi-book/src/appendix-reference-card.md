# Appendix: Summary and Reference Card

A quick-reference guide covering all major concepts, type mappings, and patterns from this book.

---

## C ↔ Rust Type Equivalents

| C Type | Rust Type | Notes |
|--------|-----------|-------|
| `void` | `()` | Only for return types |
| `bool` / `_Bool` | `bool` | Same representation |
| `char` | `c_char` | ⚠️ Signed on some platforms, unsigned on others |
| `signed char` | `i8` | |
| `unsigned char` | `u8` | |
| `short` | `c_short` / `i16` | |
| `unsigned short` | `c_ushort` / `u16` | |
| `int` | `c_int` | Usually 32-bit, but use `std::ffi::c_int` |
| `unsigned int` | `c_uint` | |
| `long` | `c_long` | ⚠️ 32-bit on Windows, 64-bit on LP64 Unix |
| `unsigned long` | `c_ulong` | |
| `long long` | `c_longlong` / `i64` | |
| `unsigned long long` | `c_ulonglong` / `u64` | |
| `size_t` | `usize` | Always pointer-width |
| `ssize_t` | `isize` | |
| `intptr_t` | `isize` | |
| `uintptr_t` | `usize` | |
| `int8_t` | `i8` | Fixed-width — maps directly |
| `uint8_t` | `u8` | |
| `int16_t` | `i16` | |
| `uint16_t` | `u16` | |
| `int32_t` | `i32` | |
| `uint32_t` | `u32` | |
| `int64_t` | `i64` | |
| `uint64_t` | `u64` | |
| `float` | `f32` | |
| `double` | `f64` | |
| `const char *` | `*const c_char` | See CString/CStr rules below |
| `char *` | `*mut c_char` | |
| `void *` | `*mut c_void` | Opaque pointer |
| `const void *` | `*const c_void` | |
| `T *` | `*mut T` | Raw mutable pointer (requires `#[repr(C)]` on `T`) |
| `const T *` | `*const T` | Raw immutable pointer |
| `T[N]` | `[T; N]` | Fixed-size array |
| `enum` | `#[repr(C)] enum` with explicit discriminants | |
| `struct` | `#[repr(C)] struct` | |
| `union` | `#[repr(C)] union` | |
| Function pointer `void (*)(int)` | `Option<extern "C" fn(c_int)>` | `Option` for nullable |

> **Rule of thumb:** Use `std::ffi::c_int`, `c_long`, etc. for platform-dependent C types. Use `i32`, `u64`, etc. for fixed-width C types (`int32_t`, `uint64_t`).

---

## String Conversion Rules

### Rust → C (sending strings)

```
&str → CString::new(s)? → .as_ptr() → *const c_char → pass to C
         │                    │
         │ Fails if interior  │ MUST keep CString alive!
         │ null (\0) present  │ Never call on a temporary.
         ▼                    ▼
      Handle Err         Bind to a variable first
```

### C → Rust (receiving strings)

```
*const c_char → null check → CStr::from_ptr(ptr) → .to_str()? or .to_string_lossy()
                   │              │                       │                │
                   │ If null:     │ unsafe: ptr must      │ Fails if not   │ Always succeeds
                   │ return None  │ be valid + null-term  │ valid UTF-8    │ (replaces bad bytes)
                   ▼              ▼                       ▼                ▼
              Return early    Copy ASAP if          Use .to_str()    Use .to_string_lossy()
                              C may free            for strict        for permissive
```

### Quick decision table

| Scenario | Method |
|----------|--------|
| Rust `&str` → C function parameter | `let c = CString::new(s)?; c.as_ptr()` |
| C returns static string → Rust | `CStr::from_ptr(ptr).to_str()` |
| C returns allocated string → Rust | `CStr::from_ptr(ptr).to_string_lossy().into_owned()` then free with C's free |
| Rust string to C (may have non-ASCII) | `CString::new(s)?` (checks for `\0`) |
| C returns non-UTF-8 (file paths) | `CStr::from_ptr(ptr).to_bytes()` → `OsString` |

---

## The Five `unsafe` Superpowers

| # | Superpower | Example |
|---|-----------|---------|
| 1 | Dereference raw pointers | `unsafe { *ptr }` |
| 2 | Call unsafe functions | `unsafe { dangerous_fn() }` |
| 3 | Access/modify mutable statics | `unsafe { GLOBAL += 1 }` |
| 4 | Implement unsafe traits | `unsafe impl Send for T {}` |
| 5 | Access union fields | `unsafe { my_union.field }` |

**NOT superpowers** (still enforced in `unsafe`): borrow checking, lifetime checking, type checking, move semantics.

---

## FFI Patterns Cheat Sheet

### Calling C from Rust

```rust
// 1. Declare the binding
extern "C" {
    fn c_function(arg: c_int) -> c_int;
}

// 2. Call it (always unsafe)
let result = unsafe { c_function(42) };
```

### Exposing Rust to C

```rust
// 1. Mark the function
#[no_mangle]
pub extern "C" fn rust_function(arg: c_int) -> c_int {
    arg + 1
}

// 2. Build as cdylib/staticlib
// Cargo.toml: crate-type = ["cdylib", "staticlib"]
```

### Opaque pointer pattern (Rust type → C handle)

```rust
// Create: Box::into_raw gives C an opaque pointer
#[no_mangle]
pub extern "C" fn thing_new() -> *mut Thing {
    Box::into_raw(Box::new(Thing::new()))
}

// Use: Borrow through the raw pointer (do NOT Box::from_raw)
#[no_mangle]
pub extern "C" fn thing_use(t: *const Thing) -> c_int {
    let t = unsafe { &*t };
    t.value()
}

// Destroy: Box::from_raw reclaims ownership → Drop runs
#[no_mangle]
pub extern "C" fn thing_free(t: *mut Thing) {
    if !t.is_null() {
        unsafe { drop(Box::from_raw(t)); }
    }
}
```

### Callback trampoline pattern

```rust
// C callback signature: void (*)(int value, void *user_data)
extern "C" fn trampoline<F: FnMut(i32)>(val: c_int, data: *mut c_void) {
    let closure = unsafe { &mut *(data as *mut F) };
    closure(val as i32);
}

// Usage: pass closure as void*
fn call_with_callback<F: FnMut(i32)>(mut f: F) {
    let data = &mut f as *mut F as *mut c_void;
    unsafe { c_function(Some(trampoline::<F>), data); }
}
```

---

## Safe Abstraction Checklist

When wrapping `unsafe` code in a safe API, verify each item:

- [ ] **Invariants documented** — every `unsafe` block has a `// SAFETY:` comment
- [ ] **Private fields** — internal state is not directly accessible
- [ ] **NonNull for pointers** — null is checked at construction, preventing later null derefs
- [ ] **Drop implemented** — resources (C handles, allocations) are freed exactly once
- [ ] **Send/Sync correct** — raw pointers make types `!Send`/`!Sync` by default; only opt in with proof
- [ ] **Panic safety** — `catch_unwind` at every FFI boundary; no unwinding across `extern "C"`
- [ ] **Allocator discipline** — Rust memory freed by Rust, C memory freed by C
- [ ] **String validation** — `CString::new` for outgoing, `CStr::from_ptr` + null check for incoming
- [ ] **Validated at boundary** — constructors and public methods check all preconditions
- [ ] **Miri in CI** — `MIRIFLAGS="-Zmiri-strict-provenance" cargo +nightly miri test`

---

## Strict Provenance Quick Reference

| API | Use when... |
|-----|-------------|
| `ptr.addr()` | You need the address as `usize` but don't need to reconstitute a pointer |
| `ptr.with_addr(a)` | You need a pointer with a new address but the same provenance |
| `ptr.map_addr(f)` | You need to transform the address (e.g., alignment) keeping provenance |
| `ptr.expose_provenance()` | You MUST store the pointer as an integer (tagged pointer, `AtomicUsize`) |
| `with_exposed_provenance(a)` | You need to recover a pointer from a previously exposed integer |
| `without_provenance(a)` | You need a sentinel/dummy pointer (like `NonNull::dangling()`) |

**Rule:** Prefer `ptr.addr()` + `ptr.with_addr()` over `as usize` / `as *const T`. Only use `expose_provenance` when integer storage is unavoidable.

---

## Undefined Behavior Quick Reference

| UB | How to avoid |
|----|-------------|
| Null pointer dereference | Check with `ptr.is_null()` or use `NonNull` |
| Dangling pointer dereference | Ensure pointed-to data outlives the pointer |
| Unaligned pointer dereference | Use `read_unaligned` / `write_unaligned` if needed |
| Data race | Use atomics, `Mutex`, or ensure single-threaded access |
| Two `&mut T` to same location | Derive raw pointers from a single `&mut` |
| Mutating behind `&T` | Use `UnsafeCell<T>` (or types built on it) |
| Invalid value (bool=2, etc.) | Validate before `transmute`; use `MaybeUninit` |
| Uninitialized memory read | Use `MaybeUninit` + `assume_init()` after initialization |
| Unwind across `extern "C"` | Use `catch_unwind` or `extern "C-unwind"` |
| Double-free | Use RAII (`Drop`); null pointer after free |
| Mixed allocator free | Free with the same allocator that allocated |

---

## Tool Reference

| Tool | What it does | Install |
|------|-------------|---------|
| **Miri** | Detects UB at runtime (interpreter) | `rustup +nightly component add miri` |
| **bindgen** | C headers → Rust FFI bindings | `cargo install bindgen-cli` |
| **cbindgen** | Rust → C/C++ headers | `cargo install cbindgen` |
| **cargo-expand** | Show macro expansions | `cargo install cargo-expand` |
| **AddressSanitizer** | Runtime memory error detection (native) | `RUSTFLAGS="-Zsanitizer=address" cargo +nightly test` |
| **Clippy** | Lint for missing `# Safety` docs, etc. | Built into rustup |

---

## Companion Guide Cross-References

| Topic | Guide |
|-------|-------|
| Ownership, borrowing, lifetimes | [Rust Memory Management](../memory-management-book/src/SUMMARY.md) |
| Traits, generics, `dyn Trait` | [Rust's Type System & Traits](../type-system-traits-book/src/SUMMARY.md) |
| `Pin`, `Waker`, async runtimes | [Async Rust](../async-book/src/SUMMARY.md) |
| Atomics, `Arc`, `Mutex` | [Fearless Concurrency](../concurrency-book/src/SUMMARY.md) |
| Proc macros for codegen | [Rust Metaprogramming](../metaprogramming-book/src/SUMMARY.md) |
| Typestate, phantom types | [Type-Driven Correctness](../type-driven-correctness-book/src/SUMMARY.md) |
| CI/CD, Miri in pipelines | [Rust Engineering Practices](../engineering-book/src/SUMMARY.md) |
| C/C++ developer bridge | [Rust for C/C++ Programmers](../c-cpp-book/src/SUMMARY.md) |
