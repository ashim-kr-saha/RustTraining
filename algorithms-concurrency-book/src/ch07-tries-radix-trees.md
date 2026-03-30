# Chapter 7: Tries, Radix Trees, and Prefix Routing 🔴

> **What you'll learn:**
> - **Tries** (prefix trees): O(k) lookup where k is the key length, independent of the number of stored keys
> - **Radix Trees** (Patricia Tries): compressed tries that eliminate single-child chains, dramatically reducing memory and improving cache performance
> - **Longest Prefix Match (LPM)** for IP routing: how every router in the internet finds the next hop in nanoseconds
> - Cache-optimized memory layouts: flattening tree structures into arrays for maximum L1/L2 cache utilization

---

## 7.1 Tries: Prefix Trees

A **trie** (from "re**trie**val," pronounced "try") is a tree where each edge represents a character (or bit, or nibble) of the key. The path from root to a node spells out the key's prefix.

### Structure

For string keys over the alphabet {a-z}:

```
                    (root)
                   /   |   \
                  a    b    t
                 /     |     \
                p      a      o
               / \     |       \
              p   r    d        p
              |   |             |
              l   t             i
              |                 |
              e                 c
         "apple" "art"   "bad"  "topic"
```

Each node has up to 26 children (for lowercase ASCII). Lookup is O(k) where k is the key length — completely independent of how many keys are stored.

### Trie vs HashMap vs BTreeMap

| Property | `HashMap` | `BTreeMap` | **Trie** |
|---|---|---|---|
| Lookup | O(1) expected, O(n) worst | O(log n) | **O(k)** key length |
| Prefix query ("all keys starting with 'ap'") | O(n) scan | O(log n + results) | **O(k + results)** |
| Ordered iteration | No | Yes | Yes (lexicographic) |
| Worst-case lookup | O(n) — hash collisions | O(log n) | **O(k)** — no collisions possible |
| Memory | Hash table overhead | Tree pointer overhead | 26×8 = 208 bytes per node (naïve) |

The key advantage: **prefix queries** and **longest prefix match** are natural O(k) operations on tries. A HashMap cannot do prefix queries without scanning all entries.

---

## 7.2 Radix Trees (Patricia Tries): Compressed Tries

The naïve trie wastes enormous memory on single-child chains. For example, storing "application" creates 11 nodes, 9 of which have only one child. A **Radix Tree** (also called Patricia Trie or Compressed Trie) merges these chains:

```
Uncompressed Trie:              Radix Tree (compressed):

    (root)                          (root)
      |                            /     \
      a                        "app"    "top"
      |                        /   \       |
      p                     "le"  "lication"  "ic"
      |                      |
      p                   "apple"
     / \
    l    l
    |    |
    e    i
    |    c
    |    a
    |    t
    |    i
    |    o
    |    n
```

### Memory Comparison

| Structure | Nodes for "application", "apple", "topic" | Bytes (approx) |
|---|---|---|
| Naïve trie (26-wide) | 18 nodes × 208 bytes | ~3,744 bytes |
| Radix tree | 6 nodes × ~40 bytes | ~240 bytes |
| Improvement | **15× fewer nodes** | **15× less memory** |

The compression ratio improves dramatically with longer keys and shared prefixes — exactly the pattern seen in IP addresses, URLs, and file paths.

### Radix Tree Node Types

```rust
/// A radix tree node. Each node stores a compressed key fragment
/// (the shared prefix that was collapsed from single-child chains).
enum RadixNode<V> {
    /// Internal node: has children, may or may not have a value.
    Internal {
        /// The compressed key fragment for this edge.
        prefix: Vec<u8>,
        /// Child nodes, keyed by the first byte of their prefix.
        /// Using a small sorted array instead of HashMap for cache locality.
        children: Vec<(u8, Box<RadixNode<V>>)>,
        /// Value stored at this node (if this prefix is a complete key).
        value: Option<V>,
    },
    /// Leaf node: no children, always has a value.
    Leaf {
        prefix: Vec<u8>,
        value: V,
    },
}
```

---

## 7.3 IP Routing: Longest Prefix Match

Every packet on the internet must be routed by matching its destination IP against a routing table. The routing table contains entries like:

```
10.0.0.0/8      → Gateway A   (matches 10.*.*.*)
10.1.0.0/16     → Gateway B   (matches 10.1.*.*)
10.1.2.0/24     → Gateway C   (matches 10.1.2.*)
0.0.0.0/0       → Default GW  (matches everything)
```

For destination `10.1.2.42`, multiple entries match. The router must find the **longest prefix match** — `10.1.2.0/24` (24-bit prefix) wins over `10.0.0.0/8` (8-bit prefix).

### Binary Trie for IP Routing

IP addresses are 32-bit numbers. A binary trie uses one level per bit:

```mermaid
graph TD
    Root["Root"] -->|"0"| L0[""]
    Root -->|"1"| L1[""]

    L0 -->|"0"| L00[""]
    L0 -->|"1"| L01[""]
    L1 -->|"0"| L10["*Gateway D*<br/>10.0.0.0/2"]
    L1 -->|"1"| L11[""]

    L10 -->|"0"| L100[""]
    L10 -->|"1"| L101[""]

    L00 -->|"0"| L000[""]
    L00 -->|"1"| L001[""]

    style L10 fill:#2d5016,color:#fff

    Note["IP: 10.1.2.42 = 00001010.00000001.00000010.00101010<br/>Traverse bit-by-bit from MSB.<br/>Deepest node with a route wins."]

    style Note fill:#5a5a5a,color:#fff
```

A naïve binary trie has up to 32 levels for IPv4 (128 for IPv6). At ~100 ns per cache miss per level, this is too slow for high-speed routers processing packets at 100 Gbps (150 million packets/sec).

### Optimization: Multi-Bit Trie (Stride)

Instead of branching on one bit at a time, branch on `s` bits (the **stride**):

| Stride | Levels (IPv4) | Children per node | Memory/node | Lookup cache misses |
|---|---|---|---|---|
| 1 bit | 32 | 2 | 16 bytes | Up to 32 |
| **4 bits** | **8** | **16** | **128 bytes** | **Up to 8** |
| 8 bits | 4 | 256 | 2,048 bytes | **Up to 4** |

A 4-bit stride (nibble-based trie) reduces the maximum depth from 32 to 8, cutting cache misses by 4×. An 8-bit stride reduces it to 4 levels — only 4 cache misses in the worst case.

### Implementation: Nibble-Based Radix Tree for IPv4

```rust
const STRIDE: usize = 4;  // 4 bits per level → 16 children per node
const CHILDREN: usize = 1 << STRIDE;  // 16
const MAX_DEPTH: usize = 32 / STRIDE;  // 8 levels for IPv4

/// A node in the IP routing trie.
/// Children are stored as a flat array for cache locality.
struct RoutingNode<V: Clone> {
    /// Route associated with this prefix (if any).
    route: Option<V>,
    /// Children indexed by 4-bit nibble (0..15).
    /// Using Option<Box<>> to avoid allocating empty subtrees.
    children: [Option<Box<RoutingNode<V>>>; CHILDREN],
}

impl<V: Clone> RoutingNode<V> {
    fn new() -> Self {
        RoutingNode {
            route: None,
            children: Default::default(),
        }
    }
}

/// IPv4 Longest Prefix Match routing table.
pub struct RoutingTable<V: Clone> {
    root: RoutingNode<V>,
}

impl<V: Clone> RoutingTable<V> {
    pub fn new() -> Self {
        RoutingTable {
            root: RoutingNode::new(),
        }
    }

    /// Insert a route for the given prefix/length.
    /// Example: insert(0x0A010200, 24, gateway_c)  for 10.1.2.0/24
    pub fn insert(&mut self, prefix: u32, prefix_len: u8, route: V) {
        let mut node = &mut self.root;
        let nibbles = (prefix_len as usize + STRIDE - 1) / STRIDE;

        for i in 0..nibbles {
            let shift = 32 - (i + 1) * STRIDE;
            let nibble = ((prefix >> shift) & 0xF) as usize;

            node = node.children[nibble]
                .get_or_insert_with(|| Box::new(RoutingNode::new()));
        }

        node.route = Some(route);
    }

    /// Find the longest matching prefix for the given IP address.
    /// Returns the route associated with the longest match.
    pub fn longest_prefix_match(&self, ip: u32) -> Option<&V> {
        let mut node = &self.root;
        let mut best_match: Option<&V> = node.route.as_ref();

        for i in 0..MAX_DEPTH {
            let shift = 32 - (i + 1) * STRIDE;
            let nibble = ((ip >> shift) & 0xF) as usize;

            match &node.children[nibble] {
                Some(child) => {
                    node = child;
                    // Update best match if this node has a route
                    if let Some(ref route) = node.route {
                        best_match = Some(route);
                    }
                }
                None => break,  // No more specific prefix exists
            }
        }

        best_match
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_routing_table() {
        let mut table = RoutingTable::new();

        // 10.0.0.0/8 → "Gateway A"
        table.insert(0x0A000000, 8, "Gateway A");
        // 10.1.0.0/16 → "Gateway B"
        table.insert(0x0A010000, 16, "Gateway B");
        // 10.1.2.0/24 → "Gateway C"
        table.insert(0x0A010200, 24, "Gateway C");
        // 0.0.0.0/0 → "Default"
        table.insert(0x00000000, 0, "Default");

        // 10.1.2.42 should match 10.1.2.0/24
        assert_eq!(
            table.longest_prefix_match(0x0A01022A),
            Some(&"Gateway C")
        );

        // 10.1.3.1 should match 10.1.0.0/16
        assert_eq!(
            table.longest_prefix_match(0x0A010301),
            Some(&"Gateway B")
        );

        // 10.2.0.1 should match 10.0.0.0/8
        assert_eq!(
            table.longest_prefix_match(0x0A020001),
            Some(&"Gateway A")
        );

        // 192.168.1.1 should match default
        assert_eq!(
            table.longest_prefix_match(0xC0A80101),
            Some(&"Default")
        );
    }
}
```

---

## 7.4 Cache-Optimized Memory Layout

The pointer-chasing pattern in tries (following pointers through heap-allocated nodes) is terrible for CPU caches. Each pointer dereference is likely an L2 or L3 cache miss.

### Technique 1: Flat Array Representation

For a fixed-stride trie, replace pointer-based nodes with indices into a contiguous array:

```rust
/// A cache-friendly trie using array indices instead of pointers.
/// All nodes live in a single contiguous Vec — excellent spatial locality.
struct FlatTrieNode<V: Clone> {
    route: Option<V>,
    /// Indices into the nodes array. u32::MAX = null child.
    children: [u32; CHILDREN],
}

pub struct FlatRoutingTable<V: Clone> {
    nodes: Vec<FlatTrieNode<V>>,
}

impl<V: Clone> FlatRoutingTable<V> {
    pub fn new() -> Self {
        // Pre-allocate root node
        let root = FlatTrieNode {
            route: None,
            children: [u32::MAX; CHILDREN],
        };
        FlatRoutingTable {
            nodes: vec![root],
        }
    }

    fn alloc_node(&mut self) -> u32 {
        let idx = self.nodes.len() as u32;
        self.nodes.push(FlatTrieNode {
            route: None,
            children: [u32::MAX; CHILDREN],
        });
        idx
    }

    pub fn insert(&mut self, prefix: u32, prefix_len: u8, route: V) {
        let mut node_idx: u32 = 0;
        let nibbles = (prefix_len as usize + STRIDE - 1) / STRIDE;

        for i in 0..nibbles {
            let shift = 32 - (i + 1) * STRIDE;
            let nibble = ((prefix >> shift) & 0xF) as usize;

            if self.nodes[node_idx as usize].children[nibble] == u32::MAX {
                let new_idx = self.alloc_node();
                self.nodes[node_idx as usize].children[nibble] = new_idx;
            }

            node_idx = self.nodes[node_idx as usize].children[nibble];
        }

        self.nodes[node_idx as usize].route = Some(route);
    }

    pub fn longest_prefix_match(&self, ip: u32) -> Option<&V> {
        let mut node_idx: u32 = 0;
        let mut best: Option<&V> = self.nodes[0].route.as_ref();

        for i in 0..MAX_DEPTH {
            let shift = 32 - (i + 1) * STRIDE;
            let nibble = ((ip >> shift) & 0xF) as usize;

            let child_idx = self.nodes[node_idx as usize].children[nibble];
            if child_idx == u32::MAX {
                break;
            }

            node_idx = child_idx;
            if let Some(ref route) = self.nodes[node_idx as usize].route {
                best = Some(route);
            }
        }

        best
    }
}
```

### Technique 2: Path Compression + Popcount-Based Sparse Children

For tries with sparse children (most nodes have few children), store only the existing children and use `popcount` (count of set bits) to index into a compact array:

```rust
/// Sparse node: instead of 16 child slots (128 bytes),
/// store a 16-bit bitmap + only the populated children.
struct SparseNode<V> {
    route: Option<V>,
    /// Bitmap: bit i is set if child i exists.
    bitmap: u16,
    /// Compact array of only the existing children.
    /// Index into this via popcount(bitmap & mask_below_nibble).
    children: Vec<u32>,  // Indices into flat array
}

impl<V> SparseNode<V> {
    fn child_index(&self, nibble: usize) -> Option<u32> {
        if self.bitmap & (1 << nibble) == 0 {
            return None; // Child doesn't exist
        }
        // Count bits below this nibble to find the index in children[]
        let mask = (1u16 << nibble) - 1;
        let idx = (self.bitmap & mask).count_ones() as usize;
        Some(self.children[idx])
    }
}
```

### Performance Impact

| Layout | Node size | Cache lines/node | Lookup (8 levels) |
|---|---|---|---|
| Pointer-based (Box) | ~144 bytes + heap alloc | 2–3 | ~8 cache misses × 12 ns = ~96 ns |
| **Flat array (contiguous)** | ~128 bytes | **2** | **~4 cache misses × 4 ns = ~16 ns** (spatial locality) |
| Sparse (popcount) | ~16 bytes avg | **< 1** | **~4 cache misses × 4 ns = ~16 ns** |

The flat array version benefits from the CPU **hardware prefetcher**, which detects sequential access patterns and pre-loads upcoming cache lines. Pointer-chasing defeats the prefetcher because the addresses are not sequential.

---

<details>
<summary><strong>🏋️ Exercise: Build a URL Router</strong> (click to expand)</summary>

### Challenge

Implement a high-performance HTTP URL router using a radix tree. The router must:

1. `insert(path: &str, handler: H)` — register a handler for a URL path
2. `lookup(path: &str) -> Option<(&H, Params)>` — find the matching handler, extracting path parameters
3. Support static segments (`/users/list`) and placeholder segments (`/users/:id`)
4. Prefer more specific routes: `/users/admin` should match before `/users/:id`

Example:
```
router.insert("/users", list_users);
router.insert("/users/:id", get_user);
router.insert("/users/:id/posts", get_user_posts);
router.insert("/users/admin", admin_panel);

router.lookup("/users/admin")       → (admin_panel, {})
router.lookup("/users/42")          → (get_user, {id: "42"})
router.lookup("/users/42/posts")    → (get_user_posts, {id: "42"})
```

<details>
<summary>🔑 Solution</summary>

```rust
use std::collections::HashMap;

#[derive(Debug)]
pub struct Params(pub HashMap<String, String>);

enum NodeType {
    Static,                    // Exact match segment
    Param { name: String },    // :name placeholder
}

struct RouterNode<H> {
    node_type: NodeType,
    segment: String,           // The path segment (e.g., "users" or ":id")
    handler: Option<H>,        // Handler if this is a terminal route
    static_children: Vec<RouterNode<H>>,  // Static children (checked first)
    param_child: Option<Box<RouterNode<H>>>,  // Parameter child (fallback)
}

pub struct Router<H> {
    root: RouterNode<H>,
}

impl<H> Router<H> {
    pub fn new() -> Self {
        Router {
            root: RouterNode {
                node_type: NodeType::Static,
                segment: String::new(),
                handler: None,
                static_children: Vec::new(),
                param_child: None,
            },
        }
    }

    pub fn insert(&mut self, path: &str, handler: H) {
        let segments: Vec<&str> = path.trim_start_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();

        let mut node = &mut self.root;

        for &seg in &segments {
            if seg.starts_with(':') {
                // Parameter segment
                let name = seg[1..].to_string();
                if node.param_child.is_none() {
                    node.param_child = Some(Box::new(RouterNode {
                        node_type: NodeType::Param { name: name.clone() },
                        segment: seg.to_string(),
                        handler: None,
                        static_children: Vec::new(),
                        param_child: None,
                    }));
                }
                node = node.param_child.as_mut().unwrap();
            } else {
                // Static segment — check if child already exists
                let pos = node.static_children.iter().position(|c| c.segment == seg);
                if let Some(idx) = pos {
                    node = &mut node.static_children[idx];
                } else {
                    node.static_children.push(RouterNode {
                        node_type: NodeType::Static,
                        segment: seg.to_string(),
                        handler: None,
                        static_children: Vec::new(),
                        param_child: None,
                    });
                    let idx = node.static_children.len() - 1;
                    node = &mut node.static_children[idx];
                }
            }
        }

        node.handler = Some(handler);
    }

    pub fn lookup(&self, path: &str) -> Option<(&H, Params)> {
        let segments: Vec<&str> = path.trim_start_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();

        let mut params = HashMap::new();
        Self::find_recursive(&self.root, &segments, 0, &mut params)
            .map(|h| (h, Params(params)))
    }

    fn find_recursive<'a>(
        node: &'a RouterNode<H>,
        segments: &[&str],
        depth: usize,
        params: &mut HashMap<String, String>,
    ) -> Option<&'a H> {
        if depth == segments.len() {
            return node.handler.as_ref();
        }

        let seg = segments[depth];

        // Priority 1: Check static children (more specific match)
        for child in &node.static_children {
            if child.segment == seg {
                if let Some(h) = Self::find_recursive(child, segments, depth + 1, params) {
                    return Some(h);
                }
            }
        }

        // Priority 2: Check param child (wildcard match)
        if let Some(ref param_child) = node.param_child {
            if let NodeType::Param { ref name } = param_child.node_type {
                params.insert(name.clone(), seg.to_string());
                if let Some(h) = Self::find_recursive(param_child, segments, depth + 1, params) {
                    return Some(h);
                }
                params.remove(name); // Backtrack
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_router() {
        let mut router = Router::new();
        router.insert("/users", "list_users");
        router.insert("/users/:id", "get_user");
        router.insert("/users/:id/posts", "get_user_posts");
        router.insert("/users/admin", "admin_panel");

        // Static route preferred over parameter
        let (handler, params) = router.lookup("/users/admin").unwrap();
        assert_eq!(*handler, "admin_panel");
        assert!(params.0.is_empty());

        // Parameter extraction
        let (handler, params) = router.lookup("/users/42").unwrap();
        assert_eq!(*handler, "get_user");
        assert_eq!(params.0["id"], "42");

        // Nested parameter
        let (handler, params) = router.lookup("/users/42/posts").unwrap();
        assert_eq!(*handler, "get_user_posts");
        assert_eq!(params.0["id"], "42");
    }
}
```

**Performance note:** This segment-based router has O(D × S) lookup where D is the URL depth and S is the number of children per node. For a cache-optimized version, use the radix tree techniques from Section 7.4 — store all nodes in a flat array and compress common prefixes. Production routers like `matchit` (used by Axum) achieve lookups in ~200 ns for typical URL patterns.

</details>
</details>

---

> **Key Takeaways:**
> - **Tries** provide O(k) lookup independent of the number of stored keys. They excel at prefix queries, longest prefix match, and autocompletion.
> - **Radix Trees** compress single-child chains, reducing memory by 10–50× compared to naïve tries. Every production trie is actually a radix tree.
> - **IP routing** uses multi-bit stride tries (4 or 8 bits per level) to limit tree depth and cache misses. A nibble trie needs at most 8 memory accesses for any IPv4 lookup.
> - **Cache optimization** is critical for trie performance: use flat arrays instead of heap-allocated nodes, sparse children with popcount indexing, and path compression to minimize cache misses.

---

> **See also:**
> - [Chapter 1: The CPU Cache and False Sharing](./ch01-cpu-cache-and-false-sharing.md) — why cache-friendly layout matters for trie traversal
> - [Chapter 5: Skip Lists and Concurrent Maps](./ch05-skip-lists-and-concurrent-maps.md) — another ordered data structure, better for range queries
> - [Chapter 6: Probabilistic Structures](./ch06-probabilistic-structures.md) — when approximate answers are sufficient and tries are overkill
