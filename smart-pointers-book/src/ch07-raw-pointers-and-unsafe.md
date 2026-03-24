# Chapter 7: Raw Pointers and `unsafe` 🔴

> **What you'll learn:**
> - The difference between `*const T` and `*mut T` raw pointers and how they differ from references
> - The five operations that require `unsafe` and why each one is dangerous
> - Pointer arithmetic, `std::ptr` methods, and reading/writing without moving
> - The **contract** you must uphold when writing `unsafe` — and what undefined behavior looks like

---

## 7.1 The `unsafe` Keyword: What It Actually Means

`unsafe` in Rust does NOT mean "this code might crash." It means: **"I, the programmer, am making a correctness guarantee that the compiler cannot verify."**

The Rust compiler enforces its safety invariants through the borrow checker. When you write `unsafe`, you are telling the compiler: "Suspend your verification here. I take responsibility for ensuring the safety contract holds."

This is a powerful but precise tool. There are exactly **five capabilities** that require `unsafe`:

| Capability | Why It's Unsafe |
|-----------|----------------|
| Dereference a raw pointer | The pointer might be null, dangling, or misaligned |
| Call an `unsafe` function or method | The function has a contract the caller must uphold |
| Access or mutate a `static mut` variable | Shared mutable global state is inherently racy |
| Implement an `unsafe` trait | The trait has invariants the implementor must maintain |
| Access fields of `union` types | The compiler can't know which field is active |

Everything else in Rust — including creating raw pointers — is safe.

---

## 7.2 `*const T` and `*mut T`: The Raw Pointer Types

Raw pointers are Rust's equivalent of C's `T*` and `const T*`. They:
- Can be null
- Are not guaranteed to point to valid memory
- Do not enforce aliasing rules (multiple `*mut T` to the same memory is allowed)
- **Does not implement `Send` or `Sync`** (not thread-safe by default)
- Do not call `Drop` when they go out of scope
- Do not prevent use-after-free

```rust
fn main() {
    let mut x: i32 = 42;
    
    // Creating raw pointers is SAFE — the danger is in dereferencing
    let const_ptr: *const i32 = &x;       // Equivalent to C: const int* ptr = &x;
    let mut_ptr:   *mut i32   = &mut x;   // Equivalent to C: int* ptr = &x;
    
    // Checking for null (safe):
    assert!(!const_ptr.is_null());
    
    // Dereferencing requires unsafe:
    let val = unsafe { *const_ptr };      // Read through the pointer
    println!("val = {}", val);            // 42
    
    unsafe {
        *mut_ptr = 100;                    // Write through the pointer
    }
    println!("x = {}", x);               // 100
    
    // The compiler lets you have a *mut T and a reference simultaneously —
    // YOU must ensure they're not used concurrently (the borrow checker won't help):
    let _ref = &x;          // shared reference
    // Using mut_ptr here would be UB — but the compiler won't stop you
}
```

---

## 7.3 The Dangers: Undefined Behavior with Raw Pointers

Understanding exactly what constitutes undefined behavior (UB) with raw pointers is essential. The Rust Reference and the Miri tool track these:

```rust
fn undefined_behavior_examples() {
    // ❌ DANGER 1: Dereferencing a null pointer
    let null: *const i32 = std::ptr::null();
    // unsafe { *null }  // UB: null dereference → SIGSEGV

    // ❌ DANGER 2: Dereferencing a dangling pointer (use-after-free)
    let dangling = {
        let x = Box::new(42i32);
        &*x as *const i32  // x is dropped here, pointer is now dangling!
    };
    // unsafe { *dangling }  // UB: use-after-free

    // ❌ DANGER 3: Misaligned dereference
    let data: [u8; 5] = [1, 2, 3, 4, 5];
    let misaligned = data.as_ptr().wrapping_add(1) as *const u32;
    // unsafe { *misaligned }  // UB on ARM; on x86 it "works" but is still UB

    // ❌ DANGER 4: Creating two aliased &mut references via raw pointers
    let mut x: i32 = 10;
    let p1: *mut i32 = &mut x;
    let p2: *mut i32 = &mut x;  // Creating the second raw ptr is fine...
    // unsafe { *p1 = 1; *p2 = 2; }  // ...but using both is UB (aliased &mut)

    // ❌ DANGER 5: Reading uninitialized memory
    let uninit: std::mem::MaybeUninit<i32> = std::mem::MaybeUninit::uninit();
    // unsafe { uninit.assume_init() }  // UB: reading uninitialized memory
}
```

---

## 7.4 Pointer Arithmetic with `std::ptr`

Unlike C, Rust raw pointer arithmetic does not use `+` on pointers directly. Instead, Rust provides explicit methods that force you to acknowledge what you're doing:

```rust
fn pointer_arithmetic() {
    let data: [i32; 5] = [10, 20, 30, 40, 50];
    let base: *const i32 = data.as_ptr();
    
    // ✅ offset() — requires the result to be within bounds (or one-past-the-end)
    // SAFETY: data has 5 elements; offset(2) points to data[2]
    let p2: *const i32 = unsafe { base.offset(2) };
    println!("{}", unsafe { *p2 });  // 30
    
    // ✅ add() — unsigned version of offset (no negative indices)
    let p3: *const i32 = unsafe { base.add(3) };
    println!("{}", unsafe { *p3 });  // 40
    
    // ✅ wrapping_add() — no UB even if offset goes out of bounds
    // (but the result is only safe to use if you bring it back in-bounds)
    let p_oob = base.wrapping_add(100);  // no UB yet...
    // unsafe { *p_oob }  // ...but this WOULD be UB
    
    // ✅ offset_from() — compute the difference between two pointers
    let diff = unsafe { p3.offset_from(base) };
    println!("offset_from: {}", diff);  // 3 (3 elements apart)
}
```

### Reading and Writing Without Moving

Standard Rust moves values on assignment. Raw pointers let you read/write without triggering move semantics or `Drop`:

```rust
use std::ptr;

fn read_write_without_move() {
    let source = String::from("hello");
    let mut dest = String::new();
    
    let src_ptr: *const String = &source;
    let dst_ptr: *mut String   = &mut dest;
    
    // ✅ ptr::read() — bitwise copy without moving (leaves source "logically uninitialized")
    // SAFETY: src_ptr is valid, aligned, and properly initialized
    let copied: String = unsafe { ptr::read(src_ptr) };
    // WARNING: `source` still exists but has been "read out" — you must not drop or use it.
    // This is the kind of precondition YOU must maintain in unsafe code.
    std::mem::forget(source);  // Prevent double-drop
    
    // ✅ ptr::write() — write without dropping the current value at dst
    // SAFETY: dst_ptr is valid, aligned. dest's current value (empty String) is forgotten.
    let old_dest = std::mem::replace(&mut dest, String::new());
    std::mem::forget(old_dest);
    unsafe { ptr::write(dst_ptr, copied) };
    
    println!("{}", dest);  // "hello"
    // dest is properly dropped when it goes out of scope
    
    // ✅ ptr::copy_nonoverlapping() — memcpy equivalent
    let src = [1u8, 2, 3, 4, 5];
    let mut dst = [0u8; 5];
    unsafe {
        ptr::copy_nonoverlapping(src.as_ptr(), dst.as_mut_ptr(), 5);
    }
    println!("{:?}", dst);  // [1, 2, 3, 4, 5]
}
```

---

## 7.5 The `std::ptr` API Reference

| Function | C Equivalent | Notes |
|----------|-------------|-------|
| `ptr::read(src)` | `memcpy(dst, src, N)` + treat as T | Bitwise copy, no Drop on source |
| `ptr::write(dst, val)` | `*dst = val` (no dst Drop) | No Drop on old value at dst |
| `ptr::copy(src, dst, n)` | `memmove` | Handles overlapping regions |
| `ptr::copy_nonoverlapping(src, dst, n)` | `memcpy` | Faster; UB if regions overlap |
| `ptr::drop_in_place(ptr)` | Calls destructor | Runs Drop without freeing memory |
| `ptr::null::<T>()` | `(T*)NULL` | Null const pointer |
| `ptr::null_mut::<T>()` | `(T*)NULL` | Null mutable pointer |
| `ptr::addr_of!(place)` | `&val` (no move) | `&` reference without aliasing rules |
| `ptr::addr_of_mut!(place)` | `&mut val` (no UB) | `&mut` without exclusivity requirement |

---

## 7.6 Practical: Building a Safe Abstraction over Raw Pointers

The key principle of `unsafe` in Rust: **encapsulate `unsafe` inside a safe API**. The goal is to have a small, reviewable `unsafe` block, surrounded by a safe public API that upholds all invariants.

```rust
use std::alloc::{alloc, dealloc, Layout};
use std::ptr;
use std::marker::PhantomData;

/// A simplified, manually managed heap-allocated array.
/// This is NOT production code — it's a teaching example of
/// correctly encapsulating unsafe operations.
pub struct RawBuffer<T> {
    ptr: *mut T,
    len: usize,
    // PhantomData tells the compiler:
    // "This type logically owns a T, even though we store a raw pointer"
    // (Covered in depth in Ch08)
    _owns: PhantomData<T>,
}

impl<T> RawBuffer<T> {
    /// Allocate a zero-initialized buffer of `len` elements.
    pub fn new(len: usize) -> Self {
        assert!(len > 0, "Buffer must have at least one element");
        
        let layout = Layout::array::<T>(len).expect("Layout overflow");
        
        // SAFETY: layout is non-zero (checked above). We check for null return.
        let ptr = unsafe { alloc(layout) } as *mut T;
        
        if ptr.is_null() {
            std::alloc::handle_alloc_error(layout);
        }
        
        RawBuffer { ptr, len, _owns: PhantomData }
    }
    
    /// Write a value to position `i`.
    /// 
    /// # Panics
    /// Panics if `i >= self.len`.
    pub fn write(&mut self, i: usize, val: T) {
        assert!(i < self.len, "Index {} out of bounds (len={})", i, self.len);
        
        // SAFETY: 
        // - ptr is non-null (checked in new())
        // - i < len, so add(i) is within the allocation
        // - We have &mut self, so no concurrent access
        // - ptr::write does NOT drop the old value — for a fresh buffer, 
        //   there is no "old value" yet (memory is uninitialized), which is why
        //   we use write() instead of assignment (*ptr.add(i) = val would drop)
        unsafe { ptr::write(self.ptr.add(i), val) };
    }
    
    /// Read the value at position `i`.
    /// 
    /// # Panics
    /// Panics if `i >= self.len`.
    pub fn read(&self, i: usize) -> &T {
        assert!(i < self.len, "Index {} out of bounds (len={})", i, self.len);
        
        // SAFETY:
        // - ptr is non-null, i < len → add(i) is valid
        // - We have &self, so no mutable aliasing during this lifetime
        // - The value at [i] was written with write() before read() is called
        //   (the user must uphold this; a production version would track initialized slots)
        unsafe { &*self.ptr.add(i) }
    }
}

impl<T> Drop for RawBuffer<T> {
    fn drop(&mut self) {
        // SAFETY: Drop initialized elements first (here we assume all are initialized
        // as a simplification — a production version would track initialization)
        for i in 0..self.len {
            unsafe { ptr::drop_in_place(self.ptr.add(i)) };
        }
        
        let layout = Layout::array::<T>(self.len).unwrap();
        // SAFETY: ptr was returned by alloc() with this exact layout
        unsafe { dealloc(self.ptr as *mut u8, layout) };
    }
}

fn main() {
    let mut buf: RawBuffer<String> = RawBuffer::new(3);
    
    buf.write(0, String::from("hello"));
    buf.write(1, String::from("world"));
    buf.write(2, String::from("!"));
    
    println!("{} {} {}", buf.read(0), buf.read(1), buf.read(2));
    // hello world !
    
    // When buf drops: drop_in_place runs on all 3 Strings, then dealloc frees the buffer
}
```

---

## 7.7 Strict Provenance: The Future of Pointer Safety

Rust is moving toward "strict provenance" — a model where pointers carry **provenance** (information about which allocation they come from), not just the numeric address. This catches bugs where the same numeric address is obtained via different paths.

```rust
// Modern strict-provenance APIs (Rust 1.84+, or nightly)
use std::ptr;

fn strict_provenance_example() {
    let mut data = [1u8, 2, 3, 4];
    let base: *mut u8 = data.as_mut_ptr();
    
    // ✅ addr() — get the address as a usize (loses provenance)
    let addr: usize = base.addr();
    println!("Address: 0x{:x}", addr);
    
    // ✅ with_addr() — reconstruct a pointer with provenance from base
    // This is the SAFE way to do pointer-integer-pointer round trips
    let p2: *mut u8 = base.with_addr(addr + 2);
    unsafe { *p2 = 99 };
    println!("{:?}", data);  // [1, 2, 99, 4]
    
    // ❌ WRONG — casting via `as usize` and back loses provenance (UB under MIRI)
    let bad_addr = base as usize + 2;
    // let bad_ptr = bad_addr as *mut u8;  // Provenance lost!
}
```

---

<details>
<summary><strong>🏋️ Exercise: Implement a Safe `swap` Using Raw Pointers</strong> (click to expand)</summary>

The standard library's `std::mem::swap` is implemented using raw pointers internally. Your task:

1. Implement `my_swap<T>(a: &mut T, b: &mut T)` using raw pointers and `ptr::copy_nonoverlapping`.
2. Explain why `a` and `b` cannot overlap (they are both `&mut T`).
3. Implement `my_swap_raw<T>(a: *mut T, b: *mut T)` that accepts raw pointers. Add proper safety documentation.
4. Show how to verify your implementation handles `String` (which has a non-trivial destructor) correctly.

```rust
use std::ptr;

// TODO: Safe version using &mut T
pub fn my_swap<T>(a: &mut T, b: &mut T) {
    todo!()
}

// TODO: Unsafe version accepting raw pointers
/// # Safety
/// [Document the preconditions here]
pub unsafe fn my_swap_raw<T>(a: *mut T, b: *mut T) {
    todo!()
}
```

<details>
<summary>🔑 Solution</summary>

```rust
use std::ptr;
use std::mem::MaybeUninit;

/// Swaps two values in place using raw pointer operations.
/// 
/// This is safe because `&mut T` references are guaranteed by the borrow checker
/// to be:
/// 1. Non-null (null is not a valid reference)
/// 2. Properly aligned for T
/// 3. Non-overlapping (the borrow checker prevents two &mut T to the same location)
/// 4. Valid for reads and writes of T
pub fn my_swap<T>(a: &mut T, b: &mut T) {
    // The borrow checker ensures a and b are non-overlapping — safe to use
    // copy_nonoverlapping. We use a temporary to hold one value during the swap.
    
    // SAFETY:
    // - a and b are valid, aligned, non-null (guaranteed by &mut T)
    // - They point to initialized values of type T
    // - They don't overlap (borrow checker ensures this for &mut T)
    unsafe {
        // Step 1: Copy `a`'s bytes into a temporary on the stack
        // MaybeUninit avoids running any constructors
        let mut tmp: MaybeUninit<T> = MaybeUninit::uninit();
        ptr::copy_nonoverlapping(a as *const T, tmp.as_mut_ptr(), 1);
        
        // Step 2: Copy `b`'s bytes into `a`'s location
        ptr::copy_nonoverlapping(b as *const T, a as *mut T, 1);
        
        // Step 3: Copy the saved bytes (original `a`) into `b`'s location
        ptr::copy_nonoverlapping(tmp.as_ptr(), b as *mut T, 1);
        
        // tmp goes out of scope here. Its contents have been moved into `b`,
        // so we must NOT run Drop on tmp. MaybeUninit<T> does NOT run T's Drop,
        // which is exactly what we want.
    }
}

/// Swaps values at two raw pointer locations.
/// 
/// # Safety
/// The caller must ensure:
/// - Both `a` and `b` are non-null
/// - Both are properly aligned for `T`
/// - Both point to valid, properly initialized values of type `T`
/// - `a` and `b` do NOT overlap (undefined behavior if they do)
/// - No other code accesses the values at `a` or `b` during this call
pub unsafe fn my_swap_raw<T>(a: *mut T, b: *mut T) {
    // Contracting: caller ensures non-null, aligned, initialized, non-overlapping
    debug_assert!(!a.is_null(), "my_swap_raw: `a` must not be null");
    debug_assert!(!b.is_null(), "my_swap_raw: `b` must not be null");
    debug_assert_ne!(a, b, "Consider: swapping with self is a no-op");
    
    let mut tmp: MaybeUninit<T> = MaybeUninit::uninit();
    ptr::copy_nonoverlapping(a, tmp.as_mut_ptr(), 1);
    ptr::copy_nonoverlapping(b, a, 1);
    ptr::copy_nonoverlapping(tmp.as_ptr(), b, 1);
    // MaybeUninit<T> does NOT drop T — correct here since the bits are in `b` now
}

fn main() {
    // Test with primitives
    let mut x: i32 = 10;
    let mut y: i32 = 20;
    my_swap(&mut x, &mut y);
    assert_eq!(x, 20);
    assert_eq!(y, 10);
    println!("i32 swap: x={}, y={}", x, y); // x=20, y=10
    
    // Test with String — non-trivial destructor
    // If swap was incorrect (e.g., copied raw bytes + ran Drop on the original),
    // we'd see a double-free or use-after-free here.
    let mut s1 = String::from("hello");
    let mut s2 = String::from("world");
    
    my_swap(&mut s1, &mut s2);
    
    assert_eq!(s1, "world");
    assert_eq!(s2, "hello");
    println!("String swap: s1={}, s2={}", s1, s2); // s1=world, s2=hello
    
    // Both Strings are correctly dropped at end of scope — no double-free!
    
    // Test raw pointer version
    let mut a: f64 = 3.14;
    let mut b: f64 = 2.71;
    unsafe { my_swap_raw(&mut a, &mut b) };
    println!("f64 swap: a={}, b={}", a, b); // a=2.71, b=3.14
}
```

</details>
</details>

---

> **Key Takeaways**
> - `*const T` and `*mut T` are raw pointers that bypass the borrow checker. They can be null, dangling, or misaligned.
> - **Only five things require `unsafe`**: dereferencing raw pointers, calling unsafe functions, accessing `static mut`, implementing unsafe traits, accessing union fields.
> - Undefined behavior (UB) is silent — it won't necessarily crash, but it corrupts the program's correctness guarantees and enables arbitrary compiler misoptimizations.
> - The `std::ptr` module provides safe wrappers for common operations: `read`, `write`, `copy`, `drop_in_place`.
> - The golden rule of `unsafe`: encapsulate it in a small, well-documented `unsafe` block with a clear safety contract. Make the public API safe.

> **See also:**
> - **[Ch08: Drop Check and `PhantomData`]** — how to correctly implement custom smart pointers with raw pointers
> - **[Ch10: Capstone Project]** — putting raw pointers to work in a real typed arena allocator
> - **[Memory Management Guide, Ch08: Interior Mutability]** — `UnsafeCell<T>`, the foundation of safe interior mutability
