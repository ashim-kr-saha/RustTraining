# Chapter 8: Drop Check and `PhantomData` 🔴

> **What you'll learn:**
> - How Rust's **drop check** algorithm proves that destructors don't cause use-after-free bugs
> - Why raw pointer-based containers can silently break drop check and how `PhantomData` fixes it
> - How to implement a complete custom smart pointer (`MyBox<T>`) from first principles
> - The three main uses of `PhantomData`: ownership declaration, lifetime tying, and variance control

---

## 8.1 The Drop Check Problem

When you write a custom type that holds raw pointers, you've stepped outside the borrow checker's visibility. The compiler no longer knows:

1. Does your type **own** the pointed-to value? (Should `T`'s destructor be called when yours runs?)
2. Does your type **borrow** the pointed-to value? (Does a lifetime need to outlive your type?)
3. Is your type safe to send across threads?

Without this information, the compiler cannot ensure your `Drop` implementation is safe. This is where `PhantomData` comes in.

### A Motivating Example

```rust
use std::marker::PhantomData;

// A "pointer-only" struct — owns a heap allocation but the compiler doesn't know!
struct BadPtr<T> {
    ptr: *mut T,
    // No PhantomData — compiler has no idea we own a T
}

// This compiles but produces INCORRECT variance and drop behavior
```

Without `PhantomData<T>`, the compiler treats `BadPtr<T>` as if it doesn't interact with `T` at all:
- It won't require `T: 'static` or bound lifetimes correctly
- It won't ensure `T`'s destructor runs when `BadPtr` is dropped
- It may allow `BadPtr<T>` where `T` is covariant when it should be invariant

---

## 8.2 What `PhantomData<T>` Is

`PhantomData<T>` is a **zero-sized type** that tells the compiler: "Treat this type as if it **contains** a `T`, for the purposes of drop check, variance, and auto-traits."

```rust
use std::marker::PhantomData;
use std::mem;

struct MyPtr<T> {
    ptr: *mut T,
    _owns: PhantomData<T>,  // "I own a T"
}

fn main() {
    // PhantomData is a zero-sized type — no runtime cost
    assert_eq!(mem::size_of::<PhantomData<String>>(), 0);
    assert_eq!(mem::size_of::<PhantomData<[u8; 1024]>>(), 0);
    
    // MyPtr<T> is just a pointer — 8 bytes
    assert_eq!(mem::size_of::<MyPtr<String>>(), 8);
}
```

`PhantomData` has no runtime representation — it is erased completely by the compiler. It exists only to carry information to compile-time analyses.

---

## 8.3 The Three Uses of `PhantomData`

### Use 1: Declaring Ownership (Drop Check)

When you own heap memory pointed to by a raw pointer, use `PhantomData<T>`:

```rust
use std::marker::PhantomData;

/// We OWN a T (we allocate it and must free it)
struct OwningPtr<T> {
    ptr: *mut T,
    _owns: PhantomData<T>,   // "I own a T — run T's Drop when I'm dropped"
}
```

With `PhantomData<T>`, the compiler includes this type in **drop check** analysis:
- If `T` has a destructor that accesses some `'a`-lived data, the compiler ensures that `'a` outlives the `OwningPtr<T>`.

### Use 2: Borrowing — Tying a Lifetime

When you hold a raw pointer to borrowed (not owned) data, use `PhantomData<&'a T>`:

```rust
/// We BORROW a T with lifetime 'a (we don't own it, must not free it)
struct BorrowingPtr<'a, T> {
    ptr: *const T,
    _borrows: PhantomData<&'a T>,  // "I borrow a &'a T"
}
```

This tells the compiler: "This type must not outlive `'a`."

Without this, you could construct a `BorrowingPtr` that outlives the data it points to, causing use-after-free — silent and unchecked.

### Use 3: Variance Control

**Variance** controls how generic types relate when their type parameters are in a subtype relationship. For raw pointers:

| PhantomData variant | Variance | Meaning |
|--------------------|----------|---------|
| `PhantomData<T>` | Covariant in T | `Container<&'long T>` can be used as `Container<&'short T>` |
| `PhantomData<*mut T>` | **Invariant** in T | No subtype relationship allowed |
| `PhantomData<fn(T)>` | Contravariant in T | Very rare |

```rust
// PhantomData<T> is covariant — appropriate for owned structs
struct Covariant<T> {
    _t: PhantomData<T>,
}

// PhantomData<*mut T> is invariant — appropriate for mutable containers
// (similar to how &mut T is invariant in T)
struct Invariant<T> {
    _t: PhantomData<*mut T>,
}
```

---

## 8.4 Building a Complete `MyBox<T>` Smart Pointer

Let's implement a minimal `Box<T>` equivalent from scratch, getting all the details right:

```rust
use std::alloc::{alloc, dealloc, Layout};
use std::marker::PhantomData;
use std::ops::{Deref, DerefMut};
use std::ptr::{self, NonNull};

/// A minimal heap-allocated smart pointer, equivalent to Box<T>.
/// 
/// Invariants maintained at all times:
/// 1. `ptr` is always non-null and properly aligned for T
/// 2. `ptr` points to a valid, initialized T on the heap
/// 3. This is the sole owner of the heap allocation
pub struct MyBox<T> {
    // NonNull<T> is *mut T that is guaranteed non-null.
    // It's covariant in T (like Box<T>).
    ptr: NonNull<T>,
    
    // PhantomData<T> tells the compiler:
    // - We logically own a T (drop check: T's destructor will run)
    // - This type is covariant in T (like Box<T>)
    // - MyBox<T>: Send iff T: Send (auto-trait propagation)
    // - MyBox<T>: Sync iff T: Sync (auto-trait propagation)
    _owns: PhantomData<T>,
}

impl<T> MyBox<T> {
    /// Allocates a new heap value and wraps it in MyBox.
    pub fn new(value: T) -> Self {
        let layout = Layout::new::<T>();
        
        // SAFETY: layout.size() > 0 iff T is not a ZST.
        // For ZSTs, we use NonNull::dangling() (a non-null but invalid pointer,
        // which is fine because we never dereference for ZSTs).
        let ptr = if layout.size() == 0 {
            NonNull::dangling()
        } else {
            let raw = unsafe { alloc(layout) };
            // alloc returns null on OOM
            let non_null = NonNull::new(raw).unwrap_or_else(|| {
                std::alloc::handle_alloc_error(layout)
            });
            // SAFETY: non_null is valid for write; value is a valid T
            // We move value into the heap allocation using ptr::write
            // (not assignment, which would try to drop the "old" uninitialized memory)
            unsafe { ptr::write(non_null.as_ptr() as *mut T, value) };
            non_null.cast::<T>()
        };
        
        MyBox { ptr, _owns: PhantomData }
    }
    
    /// Unwrap the Box, returning the inner value and freeing the heap allocation.
    pub fn into_inner(self) -> T {
        // SAFETY: ptr is valid and initialized (class invariant)
        let value = unsafe { ptr::read(self.ptr.as_ptr()) };
        
        // Prevent Drop from running (it would double-free)
        std::mem::forget(self);
        
        // Free the allocation (without MyBox::drop running)
        let layout = Layout::new::<T>();
        if layout.size() > 0 {
            // SAFETY: This pointer was allocated with alloc(Layout::new::<T>())
            // We're the sole owner, and we've read the value out already
            // Note: we need to get the raw pointer before forget consumed self
            // This is why production code uses ManuallyDrop instead of mem::forget
        }
        
        value
    }
}

impl<T> Deref for MyBox<T> {
    type Target = T;
    
    fn deref(&self) -> &T {
        // SAFETY: ptr is valid, initialized, and &self ensures no mutable access
        // exists simultaneously (Rust's aliasing rules via &self / &T)
        unsafe { self.ptr.as_ref() }
    }
}

impl<T> DerefMut for MyBox<T> {
    fn deref_mut(&mut self) -> &mut T {
        // SAFETY: ptr is valid, initialized, and &mut self ensures exclusive access
        unsafe { self.ptr.as_mut() }
    }
}

impl<T> Drop for MyBox<T> {
    fn drop(&mut self) {
        let layout = Layout::new::<T>();
        
        if layout.size() > 0 {
            // Step 1: Run T's destructor (if any) in place
            // SAFETY: ptr is valid and initialized — our class invariant
            unsafe { ptr::drop_in_place(self.ptr.as_ptr()) };
            
            // Step 2: Free the heap memory
            // SAFETY: ptr was allocated with alloc(Layout::new::<T>())
            // and is not yet freed (sole ownership invariant)
            unsafe { dealloc(self.ptr.as_ptr() as *mut u8, layout) };
        }
        
        // For ZSTs: ptr = NonNull::dangling(), no allocation to free
    }
}

// SAFETY: MyBox<T> sends ownership across threads iff T can be sent.
// This is the same as Box<T>.
unsafe impl<T: Send> Send for MyBox<T> {}
unsafe impl<T: Sync> Sync for MyBox<T> {}

fn main() {
    let mut boxed = MyBox::new(String::from("hello, world"));
    
    // Deref coercion — MyBox<String> → &String → &str
    println!("Length: {}", boxed.len());   // 12
    println!("Chars: {}", &*boxed);        // hello, world
    
    *boxed = String::from("goodbye");
    println!("After mutation: {}", *boxed); // goodbye
    
    // When boxed drops:
    // 1. MyBox::drop runs
    // 2. ptr::drop_in_place runs String's destructor (frees "goodbye" buffer)
    // 3. dealloc frees the heap memory for the String struct itself
}
```

---

## 8.5 The Variance Deep Dive

Understanding variance is critical for writing safe unsafe abstractions. Let's see the difference in practice:

```rust
use std::marker::PhantomData;

// SCENARIO: Variance matters when lifetimes are involved

// ✅ Covariant container (PhantomData<T>) — like Box<T>
// You can use a Container<&'long T> where Container<&'short T> is expected
// ('long outlives 'short, so this is safe — more specific → less specific)
struct CovariantBox<T> {
    ptr: *const T,
    _t: PhantomData<T>,  // covariant in T
}

// ❌ This would be UNSOUND for mutable containers!
// If Mutable<&'long mut T> could be used as Mutable<&'short mut T>,
// you could store a &'short-lived mut through a &'long reference — use after free!
// That's why &mut T is INVARIANT in T.

// ✅ Invariant container (PhantomData<*mut T> or Cell<T> effectively) — like &mut T
struct InvariantMutable<T> {
    ptr: *mut T,
    _t: PhantomData<*mut T>,  // invariant in T! *mut T is invariant.
}
```

The practical rule: if you have a mutable container that lets users write a `T` through it, it should be **invariant** in `T`. If it's read-only, it can be **covariant**.

---

## 8.6 `PhantomData` for Thread Safety (`Send` and `Sync`)

The `Send` and `Sync` auto-traits are automatically derived based on what your type contains. `PhantomData<T>` participates in this:

```rust
use std::marker::PhantomData;
use std::cell::Cell;

// PhantomData<Cell<()>> is !Send and !Sync (Cell is neither)
struct NotSendOrSync {
    ptr: *mut u8,
    _marker: PhantomData<Cell<()>>,  // Forces !Send + !Sync
}

// Without PhantomData:
struct RawPtrOnly {
    ptr: *mut u8,
    // *mut u8 directly is also !Send + !Sync — raw pointers are not thread safe
}

// PhantomData<T: Send> is Send
struct MaybeSendable<T> {
    ptr: *mut T,
    _owns: PhantomData<T>,  // Send iff T: Send
}
// MaybeSendable<String>: Send ✓
// MaybeSendable<Rc<u32>>: NOT Send (Rc is !Send)
```

---

<details>
<summary><strong>🏋️ Exercise: Implement a HeapRef&lt;'a, T&gt; — A Non-Owning Heap Pointer</strong> (click to expand)</summary>

Implement a `HeapRef<'a, T>` type that:
1. Holds a raw pointer to a value that it **borrows** (does not own).
2. Uses `PhantomData<&'a T>` to correctly tie the lifetime.
3. Implements `Deref<Target = T>`.
4. Does NOT implement `Drop` (since it doesn't own the value).
5. Show that the borrow checker prevents you from creating a `HeapRef` that outlives the value it points to.

```rust
use std::marker::PhantomData;
use std::ops::Deref;

pub struct HeapRef<'a, T> {
    ptr: *const T,
    _borrows: PhantomData</* TODO */>,
}

impl<'a, T> HeapRef<'a, T> {
    /// Creates a HeapRef from a reference.
    pub fn from_ref(r: &'a T) -> Self {
        todo!()
    }
}

// TODO: impl Deref
```

<details>
<summary>🔑 Solution</summary>

```rust
use std::marker::PhantomData;
use std::ops::Deref;

/// A non-owning reference to a heap value, with explicit lifetime tracking.
/// 
/// `HeapRef<'a, T>` is morally equivalent to `&'a T` — it borrows a T
/// for the lifetime 'a and does not participate in ownership or dropping.
/// 
/// The key teaching point: we use `PhantomData<&'a T>` to communicate to
/// the compiler that this type logically holds a `&'a T`. This ensures:
/// 1. The compiler requires this value to be dropped before the 'a lifetime ends
/// 2. The type is covariant in T (like &'a T)
/// 3. Send/Sync are derived based on T's thread safety (like &T: Sync iff T: Sync)
pub struct HeapRef<'a, T: 'a> {
    ptr: *const T,
    // PhantomData<&'a T> tells the compiler:
    // - This type logically contains a &'a T
    // - It borrows T for lifetime 'a (HeapRef must not outlive 'a)
    // - It is covariant in T and covariant in 'a
    _borrows: PhantomData<&'a T>,
}

impl<'a, T: 'a> HeapRef<'a, T> {
    /// Creates a HeapRef from a reference.
    /// 
    /// SAFETY (for the impl): `r` is a valid Rust reference — guaranteed non-null,
    /// aligned, and valid for the lifetime 'a. The raw pointer we store is valid
    /// as long as no mutable reference to the same location exists during 'a.
    pub fn from_ref(r: &'a T) -> Self {
        HeapRef {
            ptr: r as *const T,
            _borrows: PhantomData,
        }
    }
    
    /// Returns the raw pointer value (for debugging/inspection only).
    pub fn as_ptr(&self) -> *const T {
        self.ptr
    }
}

impl<'a, T: 'a> Deref for HeapRef<'a, T> {
    type Target = T;
    
    fn deref(&self) -> &T {
        // SAFETY:
        // - ptr was obtained from a valid &'a T reference (in from_ref)
        // - PhantomData<&'a T> ensures this HeapRef doesn't outlive 'a
        // - The returned reference has lifetime tied to &self, which is ≤ 'a
        // - No mutable alias exists (HeapRef::from_ref takes a shared &'a T)
        unsafe { &*self.ptr }
    }
}

// No Drop implementation needed — we don't own the value.
// When HeapRef is dropped, the pointed-to value is NOT freed.

// HeapRef<'a, T> is Send iff &'a T is Send
// (i.e., iff T: Sync — same rule as &T)
// This is automatically derived because PhantomData<&'a T> has these bounds.

fn demonstrate_lifetime_checking() {
    let heap_ref: HeapRef<String>;
    
    {
        let val = String::from("I'm on the stack");
        heap_ref = HeapRef::from_ref(&val);
        
        // While val is alive, we can use heap_ref:
        println!("Via HeapRef: {}", *heap_ref);  // "I'm on the stack"
        
        // heap_ref is dropped here (at end of inner block along with val)
        // If we tried to move heap_ref OUT of this block, the compiler would
        // refuse — because PhantomData<&'a String> ties heap_ref to val's lifetime.
    }
    
    // ❌ This would be a compile error:
    // println!("{}", *heap_ref);  // heap_ref doesn't live here (it was dropped above)
    // 
    // And if we tried:
    // let heap_ref_outer: HeapRef<String>;
    // { let val = String::from("temp"); heap_ref_outer = HeapRef::from_ref(&val); }
    // println!("{}", *heap_ref_outer);  // ❌ COMPILE ERROR: `val` doesn't live long enough
    // The compiler catches this because PhantomData<&'a T> carries the lifetime 'a.
}

fn main() {
    // Case 1: HeapRef to a stack value
    let owned = String::from("hello from stack");
    let r = HeapRef::from_ref(&owned);
    println!("HeapRef value: {}", *r);  // hello from stack
    println!("Length via Deref: {}", r.len());  // 16
    
    // Case 2: HeapRef to a heap value (Box)
    let boxed = Box::new(42u32);
    let r2 = HeapRef::from_ref(&*boxed);
    println!("HeapRef to Box: {}", *r2);  // 42
    
    // Case 3: Multiple HeapRefs to the same value (sharing allowed via *const T)
    let data = vec![1, 2, 3, 4, 5];
    let r3 = HeapRef::from_ref(&data);
    let r4 = HeapRef::from_ref(&data);
    println!("Both see: {:?}", *r3);  // [1, 2, 3, 4, 5]
    assert_eq!(r3.as_ptr(), r4.as_ptr());  // Same underlying pointer
    
    demonstrate_lifetime_checking();
}
```

</details>
</details>

---

> **Key Takeaways**
> - `PhantomData<T>` is a **zero-sized type** that communicates type relationship information to the compiler. It costs nothing at runtime.
> - Use `PhantomData<T>` to declare **ownership** of a `T` — ensures `T`'s destructor is accounted for in drop check.
> - Use `PhantomData<&'a T>` to declare **borrowing** of a `T` for lifetime `'a` — ties your type's validity to the borrowed data's lifetime.
> - Use `PhantomData<*mut T>` to make a type **invariant** in `T` — necessary for mutable containers.
> - `NonNull<T>` is a non-null raw pointer wrapper that participates correctly in covariance — prefer it over `*mut T` in owned pointer types.
> - Together, `NonNull<T>` + `PhantomData<T>` is the correct foundation for any owned smart pointer.

> **See also:**
> - **[Ch07: Raw Pointers and `unsafe`]** — the raw pointer operations that `PhantomData` makes safe to use
> - **[Ch10: Capstone Project]** — `PhantomData` in action in the typed arena allocator
> - **[Type System Guide, Ch04: Lifetimes]** — variance and lifetime subtyping in depth
