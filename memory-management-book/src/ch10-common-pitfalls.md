# Chapter 10: Common Borrow Checker Pitfalls 🔴

> **What you'll learn:**
> - The 9 most common borrow-checker errors you will encounter in real production codebases
> - The exact compiler error code and message for each pitfall
> - Production-grade patterns to resolve each one — not workarounds, but idiomatic solutions
> - How Non-Lexical Lifetimes (NLL) and Polonius affect which patterns work

---

## Pitfall Overview

| # | Error | Core Cause | Fix Category |
|---|---|---|---|
| 1 | Cannot borrow as mutable more than once | Two `&mut T` borrows overlap | Scope restriction / split borrows |
| 2 | Cannot borrow — already borrowed as immutable | `&T` and `&mut T` overlap | NLL / restructure |
| 3 | Borrowed value does not live long enough | Reference outlives its source | Return owned / restructure lifetime |
| 4 | Cannot move out of borrowed content | Moving from behind `&T` | Clone / index instead of move |
| 5 | Cannot move out of `*x` (raw deref) | Moving from behind `Box` or `&mut` | `std::mem::replace` / `.take()` |
| 6 | Use of partially moved value | Field moved, struct used | Restructure; don't partially move |
| 7 | `self` moved inside method body | Moving `self` prevents method completion | Consume self explicitly / use `&mut self` |
| 8 | Closure captures by move, outlives reference | Closure holds ref to dropped value | Move semantics in closure / `Arc` |
| 9 | Iterating while mutating the same collection | Conflicting borrows on container | Collect into intermediate / use indices |

---

## Pitfall 1: Cannot Borrow as Mutable More Than Once

```
error[E0499]: cannot borrow `v` as mutable more than once at a time
```

```rust
// ❌ FAILS:
let mut v = vec![1, 2, 3];
let a = &mut v;
let b = &mut v; // second mutable borrow — overlaps with a
println!("{:?} {:?}", a, b);

// ✅ FIX 1: Restrict to non-overlapping scopes
let mut v = vec![1, 2, 3];
{
    let a = &mut v;
    a.push(4);
} // a drops here
let b = &mut v; // ✅ no overlap
b.push(5);

// ✅ FIX 2: Rely on NLL (if last uses don't overlap)
let mut v = vec![1, 2, 3];
let a = &mut v;
a.push(4);
// a's last use is above — NLL ends the borrow here
let b = &mut v; // ✅ under NLL (Rust 2018+)
b.push(5);

// ✅ FIX 3: Split borrows — borrow different fields separately
struct Point { x: f64, y: f64 }
let mut p = Point { x: 1.0, y: 2.0 };
let x_ref = &mut p.x;
let y_ref = &mut p.y; // ✅ different fields — compiler permits it
*x_ref += 1.0;
*y_ref += 2.0;
```

---

## Pitfall 2: Cannot Borrow — Already Borrowed as Immutable

```
error[E0502]: cannot borrow `s` as mutable because it is also borrowed as immutable
```

```rust
// ❌ FAILS:
let mut s = String::from("hello");
let r = &s;         // immutable borrow
s.push_str(" world"); // mutation — conflicts with r
println!("{}", r);  // r's last use (after mutation)

// ✅ FIX: Ensure immutable borrow's last use precedes mutation (NLL)
let mut s = String::from("hello");
let r = &s;
println!("{}", r); // r's last use HERE — borrow ends (NLL)
s.push_str(" world"); // ✅ no active borrows

// ✅ FIX 2: Avoid holding borrows across mutation points
let mut v = vec![1, 2, 3];
let first_value = v[0]; // COPY the value (i32 is Copy), not a reference
v.clear();              // ✅ no active borrow
println!("{}", first_value);
```

---

## Pitfall 3: Borrowed Value Does Not Live Long Enough

```
error[E0597]: `x` does not live long enough
```

This happens when a reference *outlives* the data it points to:

```rust
// ❌ FAILS:
fn get_greeting() -> &str { // ← missing lifetime on return
    let s = String::from("hello");
    &s  // s goes out of scope at end of function — returned ref would dangle
}

// ✅ FIX 1: Return owned data
fn get_greeting() -> String {
    String::from("hello")
}

// ✅ FIX 2: Return a reference to static data
fn get_greeting() -> &'static str {
    "hello" // string literal — lives for the entire program
}

// ✅ FIX 3: Take a reference parameter and return a reference with the same lifetime
fn get_prefix<'a>(s: &'a str) -> &'a str {
    &s[..5] // lives as long as s — valid because we proved it
}
```

```rust
// Another common variant: storing a reference that outlives its source
// ❌ FAILS:
let r;
{
    let x = 5;
    r = &x; // x is dropped at end of this block
}
println!("{}", r); // error: r would point to freed stack memory

// ✅ FIX: Ensure the source lives at least as long as the reference
let x = 5; // move x to the outer scope
let r = &x;
println!("{}", r); // ✅
```

---

## Pitfall 4: Cannot Move Out of Borrowed Content

```
error[E0507]: cannot move out of `*some_ref` which is behind a shared reference
```

```rust
// ❌ FAILS:
fn consume(s: String) { println!("{}", s); }

let v = vec![String::from("a"), String::from("b")];
consume(v[0]); // can't move String out of Vec via index (v[0] is a &String)

// ✅ FIX 1: Clone the value
consume(v[0].clone());

// ✅ FIX 2: Use reference in the function
fn consume_ref(s: &str) { println!("{}", s); }
consume_ref(&v[0]);

// ✅ FIX 3: Consume the entire Vec with into_iter()
for s in v.into_iter() { // v is consumed; each s is owned
    consume(s); // ✅ s is owned
}

// ✅ FIX 4: Swap with a placeholder using std::mem::replace
let mut v = vec![String::from("a"), String::from("b")];
let first = std::mem::replace(&mut v[0], String::new()); // swap v[0] with empty String
consume(first); // ✅ first is owned
```

---

## Pitfall 5: Cannot Move Out of Behind a Dereference

```
error[E0382]: cannot move out of `*box_val` which is of type `T`
             move occurs because `*box_val` has type `T`, which does not implement the `Copy` trait
```

```rust
// ❌ FAILS:
let b = Box::new(String::from("hello"));
let s = *b; // ← moves the String out of the Box
            // This actually WORKS for Box (special-cased by the compiler!)
            // But it's a common conceptual stumbling block

// For function arguments:
fn take(val: String) { println!("{}", val); }
let b = Box::new(String::from("hello"));

// These both work (Box is special):
take(*b);       // ✅ Box deref can move for owned values

// But for &mut T:
let mut s = String::from("hello");
let r = &mut s;

// ❌ FAILS: can't move out of a mutable reference
// let owned = *r; // error[E0507]

// ✅ FIX: Use std::mem::take (replaces with Default::default())
let owned = std::mem::take(r); // equivalent to std::mem::replace(r, String::new())
println!("{}", owned); // "hello"
println!("{}", s);     // "" (the default — moved out)

// ✅ FIX 2: Use Option::take() — common for Option<T> fields
struct Node {
    next: Option<Box<Node>>,
    value: i32,
}
let mut node = Node { value: 1, next: Some(Box::new(Node { value: 2, next: None })) };
let next = node.next.take(); // ✅ replaces with None, returns the Option
```

---

## Pitfall 6: Use of Partially Moved Value

```
error[E0382]: use of partially moved value: `point`
```

```rust
struct Point { name: String, x: f64, y: f64 }

let point = Point { name: String::from("P1"), x: 1.0, y: 2.0 };

let name = point.name; // move point.name out of point

// ❌ FAILS: point is partially moved
println!("{:?}", point); // error: name field was moved

// ✅ FIX 1: Destructure explicitly
let Point { name, x, y } = point; // all fields moved at once
println!("{} {} {}", name, x, y);

// ✅ FIX 2: Use references if you don't need ownership
let name_ref = &point.name;
println!("{} {}", name_ref, point.x); // ✅ no moves

// ✅ FIX 3: Clone the field
let name = point.name.clone(); // explicit copy
println!("{}", name);
println!("{}", point.name); // ✅ original still valid

// ✅ FIX 4: Redesign to use Arc if shared ownership is needed
use std::sync::Arc;
struct PointShared { name: Arc<String>, x: f64, y: f64 }
```

---

## Pitfall 7: Self Moved Inside a Method

```
error[E0382]: use of moved value: `self`
```

```rust
struct Builder { parts: Vec<String> }

impl Builder {
    // ❌ FAILS: self is moved before the method returns
    fn broken(self) -> Self {
        let _ = self; // moves self
        self          // error: use of moved value
    }

    // ✅ FIX: Builder pattern — return self explicitly from each method
    fn add_part(mut self, part: String) -> Self {
        self.parts.push(part);
        self // self moved back to caller at end
    }

    fn build(self) -> Vec<String> {
        self.parts // self consumed, fields destructured
    }
}

let result = Builder { parts: vec![] }
    .add_part("A".to_string())
    .add_part("B".to_string())
    .build();
println!("{:?}", result); // ["A", "B"]
```

---

## Pitfall 8: Closure Captures Reference That Outlives Data

```
error[E0597]: `data` does not live long enough
              borrowed value does not live long enough
```

```rust
// ❌ FAILS:
let closure;
{
    let data = vec![1, 2, 3];
    closure = || println!("{:?}", data); // closure captures &data
} // data dropped here
closure(); // closure would use dangling reference

// ✅ FIX 1: Move the data into the closure
let data = vec![1, 2, 3];
let closure = move || println!("{:?}", data); // data MOVED into closure
closure(); // ✅ closure owns the data
// (data is no longer usable in this scope after move)

// ✅ FIX 2: Ensure data outlives the closure
let data = vec![1, 2, 3];
{
    let closure = || println!("{:?}", data); // borrows data
    closure(); // ✅ both closure and data alive
} // closure drops (borrow released), data still alive
println!("{:?}", data); // ✅

// ✅ FIX 3: Use Arc to share ownership with the closure
use std::sync::Arc;
let data = Arc::new(vec![1, 2, 3]);
let data_clone = Arc::clone(&data);
let closure = move || println!("{:?}", data_clone);
closure(); // ✅ closure owns an Arc handle
println!("{:?}", data); // ✅ original Arc handle still valid
```

---

## Pitfall 9: Iterating While Mutating the Same Collection

```
error[E0502]: cannot borrow `map` as mutable because it is also borrowed as immutable
```

```rust
use std::collections::HashMap;

// ❌ FAILS: borrow map for iteration, then try to mutate it
let mut map: HashMap<String, u32> = HashMap::new();
map.insert("a".to_string(), 1);
map.insert("b".to_string(), 2);

for (key, val) in &map {          // immutable borrow of map
    if *val == 1 {
        map.remove(key);           // ❌ mutable borrow while immutable borrow active
    }
}

// ✅ FIX 1: Collect keys to remove, then remove them
let keys_to_remove: Vec<String> = map
    .iter()
    .filter(|(_, v)| **v == 1)
    .map(|(k, _)| k.clone())
    .collect();

for key in keys_to_remove {
    map.remove(&key); // ✅ iteration borrow is done
}

// ✅ FIX 2: Use retain() — purpose-built for this pattern
map.retain(|_, v| *v != 1); // ✅ retain only entries where predicate holds

// ✅ FIX 3: Build a new collection (functional style)
let new_map: HashMap<String, u32> = map
    .into_iter()
    .filter(|(_, v)| *v != 1)
    .collect();
```

---

<details>
<summary><strong>🏋️ Exercise: Diagnose and Fix Real-World Code</strong> (click to expand)</summary>

**Challenge:**

The following is a simplified excerpt from a real-world HTTP middleware system. It contains 3 borrow-checker errors. Find them, name the pitfall category, and fix them.

```rust
use std::collections::HashMap;

struct Request {
    headers: HashMap<String, String>,
    body: String,
}

struct Middleware {
    request: Request,
    log: Vec<String>,
}

impl Middleware {
    fn process(&mut self) {
        // Bug 1: Log the content-type header, then modify headers
        let content_type = self.request.headers.get("content-type");
        self.request.headers.insert("x-processed".to_string(), "true".to_string());
        if let Some(ct) = content_type {
            self.log.push(format!("Content-Type: {}", ct));
        }

        // Bug 2: Move body out for processing, then try to use it
        let body = self.request.body;
        let processed = body.to_uppercase();
        self.request.body = processed;

        // Bug 3: Collect mutable references and also borrow immutably
        let mut to_remove = vec![];
        for (key, _val) in &self.request.headers {
            if key.starts_with("x-internal-") {
                to_remove.push(key); // pushing &String from headers
            }
        }
        for key in to_remove {
            self.request.headers.remove(key); // mut borrow while to_remove holds immut refs
        }
    }
}
```

<details>
<summary>🔑 Solution</summary>

**Bug 1 (Pitfall 2):** Immutable borrow via `get()` conflicts with subsequent `insert()` mutation.
```rust
// ❌ content_type borrows headers, then insert() modifies headers
let content_type = self.request.headers.get("content-type");
self.request.headers.insert(...);
println!("{:?}", content_type); // borrow still live here

// ✅ FIX: Clone the value (end the borrow) before mutating
let content_type: Option<String> = self.request.headers
    .get("content-type")
    .cloned(); // clone the String, release the borrow
self.request.headers.insert("x-processed".to_string(), "true".to_string()); // ✅
if let Some(ct) = content_type {
    self.log.push(format!("Content-Type: {}", ct));
}
```

**Bug 2 (Pitfall 4/5):** Attempting to move `body` (a `String`) out of `self.request.body` through `&mut self`.
```rust
// ❌ let body = self.request.body; — moves out of borrowed content

// ✅ FIX: Use std::mem::take() to extract with replacement
let body = std::mem::take(&mut self.request.body); // replaces with String::new()
let processed = body.to_uppercase();
self.request.body = processed; // put it back
```

**Bug 3 (Pitfall 9):** Iterating `headers` with `&self.request.headers` to collect `&String` references, then trying to call `remove()` which needs `&mut self.request.headers` while those references are alive.
```rust
// ❌ to_remove holds &String references into headers; remove() needs &mut headers

// ✅ FIX: Collect owned Strings, not references
let to_remove: Vec<String> = self.request.headers
    .keys()
    .filter(|key| key.starts_with("x-internal-"))
    .cloned() // clone to end the borrow
    .collect();
for key in to_remove {
    self.request.headers.remove(&key); // ✅ no active immut borrow
}

// ✅ FIX 2 (cleaner): Use retain()
self.request.headers.retain(|key, _| !key.starts_with("x-internal-"));
```

</details>
</details>

---

> **Key Takeaways**
> - The borrow checker's errors always point to *real* potential memory bugs — understanding the root cause makes the fix obvious
> - NLL (Non-Lexical Lifetimes) in Rust 2018+ resolves many false-positive "lifetime too long" errors automatically
> - The `std::mem::take()` and `std::mem::replace()` functions are the canonical ways to move out of mutable references
> - For collection mutation during iteration, prefer `retain()`, collect-then-mutate, or consume-and-rebuild patterns
> - Split borrows (borrowing different fields independently) work when the compiler can verify disjointness

> **See also:**
> - [Chapter 4: Borrowing and Aliasing](ch04-borrowing-and-aliasing.md) — the theory behind these errors
> - [Chapter 11: The `'static` Bound vs. `'static` Lifetime](ch11-static-lifetime.md) — the most-confused lifetime edge case
