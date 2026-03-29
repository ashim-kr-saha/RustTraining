# Summary and Reference Card

A quick-reference companion to the full guide. Use this for rapid lookup during code review, design discussions, or when the compiler is yelling at you.

---

## Static vs. Dynamic Dispatch Cheat Sheet

| Question | Static (`impl Trait` / `<T>`) | Dynamic (`dyn Trait`) |
|----------|------------------------------|-----------------------|
| Types known at compile time? | ✅ Yes | ❌ No — resolved at runtime |
| Performance | Zero-cost; inlinable | Vtable indirection (~1 pointer chase) |
| Binary size | Larger (one copy per type) | Smaller (one shared copy) |
| Heterogeneous collections? | ❌ All same type | ✅ Different types behind `dyn` |
| Object safety required? | No | Yes |
| Compile-time errors? | Clear trait-bound errors | + object safety errors |

**Decision rule:** Default to static dispatch. Switch to dynamic when you need heterogeneous collections, plugin architectures, or binary size reduction.

---

## Closure Trait Selection

| What the closure does | Implements | Accept with |
|----------------------|------------|-------------|
| Reads captured values | `Fn` + `FnMut` + `FnOnce` | `Fn(Args) -> R` |
| Mutates captured values | `FnMut` + `FnOnce` | `FnMut(Args) -> R` |
| Moves/consumes captured values | `FnOnce` only | `FnOnce(Args) -> R` |

**Hierarchy:** `Fn` ⊂ `FnMut` ⊂ `FnOnce`

**Rule of thumb:** Accept `FnOnce` for callbacks (called once). Accept `Fn` for reusable operations (called many times). Accept `FnMut` when mutation is required.

---

## Marker Traits Quick Reference

| Trait | Meaning | Auto? | Opt-out |
|-------|---------|-------|---------|
| `Send` | Safe to move to another thread | Yes | Contain `!Send` field (e.g., `Rc`) |
| `Sync` | Safe to share `&T` between threads | Yes | Contain `!Sync` field (e.g., `Cell`) |
| `Sized` | Size known at compile time | Implicit bound | `?Sized` |
| `Unpin` | Safe to move after pinning | Yes | `PhantomPinned` |
| `Copy` | Bitwise copy on assignment | `#[derive]` | Don't derive it |

**Key identities:**
- `T: Sync` ⟺ `&T: Send`
- `Rc` is neither `Send` nor `Sync` → use `Arc`
- `Cell`/`RefCell` are `Send` but not `Sync` → use `Mutex`/`RwLock`

---

## Common Standard Library Traits

### Formatting

| Trait | Format specifier | Notes |
|-------|-----------------|-------|
| `Debug` | `{:?}`, `{:#?}` | Derivable; for developers |
| `Display` | `{}` | Manual only; for users |

### Comparison

| Trait | Operations | Notes |
|-------|-----------|-------|
| `PartialEq` | `==`, `!=` | Derivable; required for `assert_eq!` |
| `Eq` | (marker) | Reflexive equality; required for `HashMap` keys |
| `PartialOrd` | `<`, `>`, `<=`, `>=` | Derivable; returns `Option<Ordering>` |
| `Ord` | `cmp()` | Total ordering; required for `BTreeMap` keys |

### Conversion

| Trait | Signature | Notes |
|-------|-----------|-------|
| `From<T>` | `fn from(T) -> Self` | Infallible conversion; gives you `Into` for free |
| `Into<T>` | `fn into(self) -> T` | Don't implement directly — implement `From` |
| `TryFrom<T>` | `fn try_from(T) -> Result<Self, Error>` | Fallible conversion |
| `TryInto<T>` | `fn try_into(self) -> Result<T, Error>` | Don't implement directly |
| `AsRef<T>` | `fn as_ref(&self) -> &T` | Cheap reference conversion |
| `AsMut<T>` | `fn as_mut(&mut self) -> &mut T` | Cheap mutable reference conversion |

### Operators

| Trait | Operator | Default `Rhs` |
|-------|----------|---------------|
| `Add<Rhs>` | `+` | `Self` |
| `Sub<Rhs>` | `-` | `Self` |
| `Mul<Rhs>` | `*` | `Self` |
| `Div<Rhs>` | `/` | `Self` |
| `Deref` | `*` (dereference) | N/A |
| `Index<Idx>` | `[]` | N/A |

### Iteration

| Trait | Key method | Notes |
|-------|-----------|-------|
| `Iterator` | `fn next(&mut self) -> Option<Item>` | Associated type `Item` |
| `IntoIterator` | `fn into_iter(self) -> Iterator` | Enables `for x in collection` |
| `FromIterator` | `fn from_iter(iter) -> Self` | Enables `.collect()` |

---

## The Orphan Rule

> You can `impl Trait for Type` only if your crate defines either `Trait` or `Type`.

| Your Trait | Foreign Trait |
|-----------|--------------|
| Your Type: ✅ | Your Type: ✅ |
| Foreign Type: ✅ | Foreign Type: ❌ (use newtype) |

---

## Associated Types vs. Generic Parameters

| Scenario | Use |
|----------|-----|
| One implementation per type (Iterator has one Item type) | Associated type |
| Multiple implementations per type (String: From\<&str\>, From\<Vec\<u8\>\>) | Generic parameter |
| You want callers to not specify the type | Associated type |
| You want callers to choose the type | Generic parameter |

---

## Object Safety Rules

A trait is object-safe (`dyn Trait`) if:
- ✅ All methods have `&self`, `&mut self`, or `self: Box<Self>` / `self: Pin<&mut Self>` receiver
- ✅ No methods return `Self`
- ✅ No methods have generic type parameters
- ✅ No `where Self: Sized` bound on methods meant for dynamic dispatch

---

## The `?` Operator Desugaring

```text
expression?
    ↓
match expression {
    Ok(val) => val,
    Err(e) => return Err(From::from(e)),
}
```

---

## Error Handling Decision Tree

```text
Are you writing a library or an application?
├── Library → use thiserror
│   └── Define structured error enums
│       └── Callers can match on variants
└── Application → use anyhow
    └── Use .context() for error chains
        └── Just display errors, don't match
```

---

## Extension Trait Pattern Template

```rust,ignore
// 1. Define the extension trait with a supertrait bound
trait FooExt: Foo {
    fn convenience_method(&self) { /* ... */ }
}

// 2. Blanket implement for all Foo types
impl<T: Foo + ?Sized> FooExt for T {}

// 3. Users import the extension trait to get the methods
// use your_crate::FooExt;
```

---

## Key Type Sizes (64-bit)

| Type | Size | Notes |
|------|------|-------|
| `&T` | 8 bytes | Thin pointer |
| `&dyn Trait` | 16 bytes | Fat pointer (data + vtable) |
| `&[T]` | 16 bytes | Fat pointer (data + length) |
| `&str` | 16 bytes | Fat pointer (data + length) |
| `Box<T>` | 8 bytes | Thin pointer (heap-allocated) |
| `Box<dyn Trait>` | 16 bytes | Fat pointer (heap data + vtable) |
| `Option<&T>` | 8 bytes | NPO — same size as `&T` |
| `Option<Box<T>>` | 8 bytes | NPO — same size as `Box<T>` |
| `Option<u64>` | 16 bytes | No NPO — 8 (tag+pad) + 8 (value) |

---

## Companion Guide Cross-References

| Topic | Where to Read |
|-------|--------------|
| `Send`/`Sync` in async context | Async Rust, Ch 12: Common Pitfalls |
| `Pin`/`Unpin` deep dive | Async Rust, Ch 4: Pin and Unpin |
| `StreamExt` methods | Async Rust, Ch 11: Streams |
| Async closures and futures from closures | Async Rust, Ch 10: Async Traits |
| `Box`, `Rc`, `Arc` memory layout | Memory Management, Ownership and Borrowing |
| Enum memory layout and NPO | Memory Management, Data Representation |
| Type-state pattern (phantom types) | Type-Driven Correctness, Type-State |
| Capability tokens | Type-Driven Correctness, Capability Tokens |

---

*This reference card is a companion to the full guide. For explanations, examples, and exercises, see the individual chapters.*
