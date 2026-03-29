# Appendix A: Reference Card

> A quick-reference cheat sheet for the most commonly used APIs, attributes, feature flags, and type mappings encountered throughout this guide.

---

## wasm-bindgen Attributes

| Attribute | Usage | Purpose |
|---|---|---|
| `#[wasm_bindgen]` | `#[wasm_bindgen] pub fn greet(name: &str) -> String` | Export a Rust function to JavaScript |
| `#[wasm_bindgen(start)]` | `#[wasm_bindgen(start)] pub fn main()` | Run this function when the Wasm module is instantiated |
| `#[wasm_bindgen(constructor)]` | `#[wasm_bindgen(constructor)] pub fn new() -> Self` | Make this function the JS `new ClassName()` constructor |
| `#[wasm_bindgen(getter)]` | `#[wasm_bindgen(getter)] pub fn name(&self) -> String` | Expose as a JS property getter (`obj.name`) |
| `#[wasm_bindgen(setter)]` | `#[wasm_bindgen(setter)] pub fn set_name(&mut self, n: String)` | Expose as a JS property setter (`obj.name = "..."`) |
| `#[wasm_bindgen(js_name = "x")]` | `#[wasm_bindgen(js_name = "doThing")]` | Use a different name on the JS side |
| `#[wasm_bindgen(js_namespace = X)]` | `#[wasm_bindgen(js_namespace = console)]` | Import from a JS namespace (e.g., `console.log`) |
| `#[wasm_bindgen(module = "x")]` | `#[wasm_bindgen(module = "/js/utils.js")]` | Import from a specific JS module |
| `#[wasm_bindgen(typescript_custom_section)]` | annotate a `const` with TS type definitions | Emit custom TypeScript declarations |
| `#[wasm_bindgen(skip_typescript)]` | `#[wasm_bindgen(skip_typescript)]` | Omit this item from generated `.d.ts` |
| `#[wasm_bindgen(catch)]` | `pub fn foo() -> Result<JsValue, JsValue>` | Import a JS function that may throw |
| `#[wasm_bindgen(structural)]` | On `extern "C"` import | Use duck-typed property access (no prototype chain) |
| `#[wasm_bindgen(extends = Node)]` | `pub type Element;` | Declare that a JS type extends another |
| `#[wasm_bindgen(variadic)]` | On imported function | Accept variable number of arguments |

---

## web-sys Feature Flags (Most Common)

Enable features in `Cargo.toml`:

```toml
[dependencies.web-sys]
version = "0.3"
features = [
    # DOM
    "Document", "Element", "HtmlElement", "HtmlInputElement",
    "HtmlCanvasElement", "CanvasRenderingContext2d", "Node", "Window",

    # Events
    "Event", "MouseEvent", "KeyboardEvent", "InputEvent",
    "DragEvent", "DataTransfer",

    # Fetch / Network
    "Request", "RequestInit", "Response", "Headers",
    "AbortController", "AbortSignal",

    # Files
    "File", "FileList", "FileReader", "Blob", "Url",

    # Workers
    "Worker", "WorkerOptions", "DedicatedWorkerGlobalScope",
    "MessageEvent", "SharedArrayBuffer",

    # Canvas / Images
    "ImageData", "HtmlImageElement",

    # Storage
    "Storage",

    # Performance
    "Performance", "PerformanceTiming",

    # URL
    "Url", "UrlSearchParams",

    # Forms
    "FormData", "HtmlFormElement",

    # Console
    "console",
]
```

### Feature Flag Discovery

```bash
# Search for a web API in the web-sys docs
# Each type is gated behind a feature flag with the same name.
# Example: to use `web_sys::HtmlCanvasElement`, enable feature "HtmlCanvasElement"

# Check the web-sys API docs:
# https://rustwasm.github.io/wasm-bindgen/api/web_sys/
```

---

## Rust ↔ JavaScript Type Equivalencies

### Primitive Types (zero-copy across the boundary)

| Rust | JavaScript | Notes |
|---|---|---|
| `bool` | `boolean` | |
| `i8`, `i16`, `i32` | `number` | |
| `u8`, `u16`, `u32` | `number` | |
| `i64`, `u64` | `bigint` | Requires `BigInt` support |
| `f32`, `f64` | `number` | |

### Heap Types (require serialization or pointer passing)

| Rust | JavaScript | Boundary Cost |
|---|---|---|
| `String` | `string` | UTF-8 → UTF-16 conversion |
| `&str` | `string` | UTF-8 → UTF-16 conversion |
| `Vec<u8>` | `Uint8Array` | Copy across boundary |
| `Vec<i32>` | `Int32Array` | Copy across boundary |
| `Vec<f64>` | `Float64Array` | Copy across boundary |
| `JsValue` | any JS value | Indirect handle (no copy) |
| `Option<T>` | `T \| undefined` | |
| `Result<T, JsValue>` | `T` (throws on Err) | Use `#[wasm_bindgen(catch)]` on imports |

### Complex Types (use serde-wasm-bindgen)

| Rust | JavaScript | Serialization |
|---|---|---|
| `#[derive(Serialize)]` struct | plain JS object `{}` | `serde_wasm_bindgen::to_value(&val)` |
| `#[derive(Deserialize)]` struct | plain JS object `{}` | `serde_wasm_bindgen::from_value(js_val)` |
| `HashMap<String, V>` | `Object` / `Map` | Via serde |
| `Vec<T>` (non-numeric) | `Array` | Via serde |
| `enum` (with serde tag) | `{ type: "...", ... }` | Via serde |

---

## WASI APIs Quick Reference

### wasm32-wasip1 (Preview 1)

| API | Rust Usage | WASI Capability |
|---|---|---|
| File read | `std::fs::read("file.txt")` | `--dir .` or `--mapdir /data::/host/data` |
| File write | `std::fs::write("out.txt", data)` | `--dir .` (writable) |
| Env vars | `std::env::var("KEY")` | `--env KEY=VALUE` |
| Args | `std::env::args()` | `-- arg1 arg2` |
| Stdout | `println!()` | Always available |
| Stderr | `eprintln!()` | Always available |
| Clock | `std::time::Instant::now()` | `--allow-clock` (some runtimes) |
| Random | `getrandom` crate | Available by default |

### wasm32-wasip2 (Preview 2 / Component Model)

| Interface | WIT Package | Purpose |
|---|---|---|
| `wasi:http/handler` | `wasi:http` | HTTP request handling |
| `wasi:keyvalue/store` | `wasi:keyvalue` | Key-value storage |
| `wasi:filesystem/types` | `wasi:filesystem` | File system access |
| `wasi:sockets/tcp` | `wasi:sockets` | TCP networking |
| `wasi:cli/run` | `wasi:cli` | CLI entry point |
| `wasi:random/random` | `wasi:random` | Random number generation |
| `wasi:clocks/monotonic-clock` | `wasi:clocks` | Time measurements |

---

## Cargo Targets Cheat Sheet

| Target Triple | Use Case | Build Command |
|---|---|---|
| `wasm32-unknown-unknown` | Browser Wasm (wasm-bindgen, Leptos, Yew) | `wasm-pack build --target web` |
| `wasm32-wasip1` | WASI CLI and edge functions (Spin, Wasmtime) | `cargo build --target wasm32-wasip1` |
| `wasm32-wasip2` | WASI Component Model (newest) | `cargo build --target wasm32-wasip2` |

```bash
# Install all targets
rustup target add wasm32-unknown-unknown
rustup target add wasm32-wasip1
rustup target add wasm32-wasip2
```

---

## Binary Size Optimization

| Technique | `Cargo.toml` / Command | Impact |
|---|---|---|
| Release mode | `cargo build --release` | Baseline |
| LTO (thin) | `[profile.release] lto = "thin"` | ~10–20% smaller |
| LTO (fat) | `[profile.release] lto = true` | ~15–30% smaller (slower build) |
| Single codegen unit | `[profile.release] codegen-units = 1` | ~5–10% smaller |
| Strip symbols | `[profile.release] strip = true` | ~30–50% smaller |
| Optimize for size | `[profile.release] opt-level = "z"` | ~10–20% smaller (may be slower) |
| wasm-opt | `wasm-opt -Oz -o out.wasm in.wasm` | ~5–15% smaller |
| Abort on panic | `[profile.release] panic = "abort"` | ~5–10% smaller |

### Recommended `Cargo.toml` for production Wasm:

```toml
[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Full link-time optimization
codegen-units = 1   # Single codegen unit for maximum optimization
panic = "abort"     # No unwinding code
strip = true        # Remove debug symbols
```

---

## Build Tool Comparison

| Tool | Framework | Command | Output |
|---|---|---|---|
| **wasm-pack** | Generic / wasm-bindgen | `wasm-pack build --target web` | `.wasm` + JS glue + `.d.ts` |
| **Trunk** | Yew, Leptos (CSR) | `trunk serve` | Dev server + hot reload |
| **cargo-leptos** | Leptos (SSR) | `cargo leptos serve` | Server + WASM bundle |
| **spin** | Fermyon Spin | `spin build && spin up` | WASI HTTP component |
| **wrangler** | Cloudflare Workers | `wrangler dev` | V8 isolate worker |
| **wasm-opt** | Post-build optimizer | `wasm-opt -Oz input.wasm -o output.wasm` | Optimized `.wasm` |

---

## Key Crate Versions (as of 2024)

| Crate | Version | Purpose |
|---|---|---|
| `wasm-bindgen` | 0.2.x | JS ↔ Rust binding generator |
| `web-sys` | 0.3.x | Web API bindings |
| `js-sys` | 0.3.x | JavaScript built-in bindings |
| `serde-wasm-bindgen` | 0.6.x | Serde ↔ JsValue serialization |
| `gloo` | 0.11.x | Convenience wrappers for web APIs |
| `leptos` | 0.6.x | Full-stack reactive framework |
| `yew` | 0.21.x | Component-based UI framework |
| `wasm-bindgen-rayon` | 1.2.x | Rayon thread pool on Web Workers |
| `spin-sdk` | 3.x | Fermyon Spin HTTP/KV SDK |
| `worker` | 0.3.x | Cloudflare Workers Rust SDK |
| `image` | 0.25.x | Image processing (used in capstone) |

---

## Common Error Messages and Fixes

| Error | Cause | Fix |
|---|---|---|
| `wasm-bindgen: imported JS function that was not marked as catch threw an error` | JS function threw, but import lacks `#[wasm_bindgen(catch)]` | Add `catch` attribute, return `Result<T, JsValue>` |
| `cannot import memory: shared memory must be enabled` | Using `SharedArrayBuffer` without flags | Add `RUSTFLAGS='-C target-feature=+atomics,+bulk-memory,+mutable-globals'` |
| `SharedArrayBuffer requires cross-origin isolation` | Missing COOP/COEP headers | Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` |
| `unreachable` (panic in Wasm) | Rust panic with `panic = "abort"` | Add `console_error_panic_hook` for readable stack traces |
| `LinkError: memory import must have a shared flag` | Mismatched atomics between Wasm modules | Ensure all modules built with same `target-feature` flags |
| `RuntimeError: out of bounds memory access` | Buffer overrun or dangling pointer (often in unsafe FFI) | Check boundary lengths; see Chapter 1 on linear memory |
| `cargo build` fails for `wasm32-wasip1` | Target not installed | `rustup target add wasm32-wasip1` |
| `spin up` fails: "key_value_stores not permitted"` | Missing KV config in spin.toml | Add `key_value_stores = ["default"]` to component config |
