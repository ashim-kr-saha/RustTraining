# Summary and Reference Card

This appendix serves as a quick-reference cheat sheet for the patterns, APIs, and configurations covered in this book.

---

## Tauri IPC Data Type Mapping

### Rust → JavaScript (Return Types)

| Rust Type | JSON | JavaScript Type |
|-----------|------|-----------------|
| `String`, `&str` | `"text"` | `string` |
| `i32`, `u32`, `i64`, `u64` | `42` | `number` |
| `f32`, `f64` | `3.14` | `number` |
| `bool` | `true`/`false` | `boolean` |
| `Vec<T>` | `[...]` | `Array<T>` |
| `HashMap<String, T>` | `{...}` | `Record<string, T>` |
| `Option<T>` | `value` or `null` | `T \| null` |
| `()` | `null` | `null` |
| `Result<T, E>` | Ok→value, Err→reject | `Promise<T>` (resolves/rejects) |
| Custom `struct` (with `#[derive(Serialize)]`) | `{field: value}` | `object` |

### Injected Parameters (Not Visible to JS)

| Rust Type | Injected By | Purpose |
|-----------|------------|---------|
| `State<'_, T>` | Tauri state manager | Access managed state |
| `AppHandle` | Tauri runtime | Emit events, manage windows |
| `tauri::Window` | Tauri runtime | Access the calling window |
| `tauri::Webview` | Tauri runtime | Access the calling webview |
| `Channel<T>` | Tauri IPC | High-performance streaming pipe |

---

## Command Patterns Cheat Sheet

### Sync Command (fast, CPU-bound)

```rust
#[tauri::command]
fn compute(a: i32, b: i32) -> i32 {
    a + b
}
```

### Async Command (I/O, network, file)

```rust
#[tauri::command]
async fn fetch_data(url: String) -> Result<String, String> {
    // Non-blocking I/O
    tokio::fs::read_to_string(&url).await.map_err(|e| e.to_string())
}
```

### Command with Managed State

```rust
#[tauri::command]
fn get_count(state: State<'_, Arc<Mutex<AppState>>>) -> i64 {
    state.lock().unwrap().counter
}
```

### Command with AppHandle (emit events, manage windows)

```rust
#[tauri::command]
async fn notify(app: AppHandle, msg: String) -> Result<(), String> {
    app.emit("notification", msg).map_err(|e| e.to_string())
}
```

### Command with Error Handling

```rust
#[derive(Debug, serde::Serialize)]
enum AppError { NotFound(String), Internal(String) }

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::NotFound(m) => write!(f, "Not found: {m}"),
            AppError::Internal(m) => write!(f, "Internal: {m}"),
        }
    }
}

#[tauri::command]
fn risky() -> Result<String, AppError> {
    Err(AppError::NotFound("item.txt".to_string()))
}
```

---

## Event Patterns Cheat Sheet

### Rust → JS (Global)

```rust
app.emit("event-name", payload)?;
```

### Rust → JS (Targeted Window)

```rust
let win = app.get_webview_window("main").unwrap();
win.emit("event-name", payload)?;
```

### JS → Rust

```typescript
// JS side:
import { emit } from '@tauri-apps/api/event';
await emit('user-action', { data: 'value' });

// Rust side:
app.listen("user-action", |event| {
    println!("{:?}", event.payload());
});
```

### JS Listening

```typescript
import { listen } from '@tauri-apps/api/event';
const unlisten = await listen<PayloadType>('event-name', (event) => {
    console.log(event.payload);
});
// Call unlisten() to stop listening
```

---

## Security Configuration Reference

### Recommended CSP

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: https://asset.localhost; connect-src ipc: http://ipc.localhost"
    }
  }
}
```

### Capability File Template

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "window-name-caps",
  "description": "Permissions for [window name]",
  "windows": ["window-label"],
  "permissions": [
    "core:default",
    {
      "identifier": "fs:scope",
      "allow": [{ "path": "$APPDATA/**" }],
      "deny": [{ "path": "$HOME/.ssh/**" }]
    }
  ]
}
```

### Permission Quick Reference

| Permission | Access Granted |
|-----------|---------------|
| `core:default` | Basic IPC, events, app lifecycle |
| `fs:allow-read` | Read files (subject to scope) |
| `fs:allow-write` | Write files (subject to scope) |
| `fs:deny-read-home` | Deny reading from $HOME |
| `dialog:allow-open` | Open file dialogs |
| `dialog:allow-save` | Save file dialogs |
| `shell:allow-open` | Open URLs in default browser |
| `notification:default` | Desktop notifications |
| `clipboard:allow-read` | Read clipboard |
| `clipboard:allow-write` | Write clipboard |
| `global-shortcut:allow-register` | Register global shortcuts |
| `window:allow-create` | Create new windows |

### Scope Variables

| Variable | Description |
|----------|------------|
| `$APPDATA` | App-specific data directory |
| `$APPCONFIG` | App-specific config directory |
| `$DESKTOP` | User desktop folder |
| `$DOCUMENT` | User documents folder |
| `$DOWNLOAD` | User downloads folder |
| `$HOME` | User home directory |
| `$TEMP` | Temporary directory |

---

## Window Configuration Reference

### `tauri.conf.json` Window Options

```json
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "My App",
        "width": 1024,
        "height": 768,
        "minWidth": 400,
        "minHeight": 300,
        "resizable": true,
        "fullscreen": false,
        "decorations": true,
        "transparent": false,
        "alwaysOnTop": false,
        "skipTaskbar": false,
        "center": true,
        "visible": true
      }
    ]
  }
}
```

### Creating Windows from Rust

```rust
use tauri::{WebviewUrl, WebviewWindowBuilder};

WebviewWindowBuilder::new(&app, "label", WebviewUrl::App("/route".into()))
    .title("Title")
    .inner_size(800.0, 600.0)
    .decorations(false)      // Frameless
    .transparent(true)        // Transparent background
    .always_on_top(true)      // Float above other windows
    .center()
    .build()?;
```

---

## Build & Deployment Commands

```bash
# Development (hot-reload for both Rust and frontend)
cargo tauri dev

# Production build (generates platform installers)
cargo tauri build

# Production build for specific target
cargo tauri build --target aarch64-apple-darwin    # macOS ARM
cargo tauri build --target x86_64-apple-darwin     # macOS Intel
cargo tauri build --target x86_64-pc-windows-msvc  # Windows
cargo tauri build --target x86_64-unknown-linux-gnu # Linux

# Debug build (faster compile, larger binary)
cargo tauri build --debug

# Generate app icons from a single 1024x1024 source
cargo tauri icon path/to/icon.png
```

### Release Profile Optimization

```toml
# Cargo.toml
[profile.release]
strip = true          # Remove debug symbols (~30-50% size reduction)
lto = true            # Link-Time Optimization (~10-20% reduction)
codegen-units = 1     # Single codegen unit (~5-10% reduction)
opt-level = "s"       # Optimize for size ("z" for aggressive)
panic = "abort"       # Remove unwinding machinery (~5-10% reduction)
```

### Cross-Platform CI/CD (GitHub Actions)

```yaml
name: Build
on: [push, pull_request]

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - os: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install frontend dependencies
        run: pnpm install

      - name: Install Linux dependencies
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev \
            build-essential curl wget file \
            libxdo-dev libssl-dev \
            libayatana-appindicator3-dev librsvg2-dev

      - name: Build
        run: cargo tauri build --target ${{ matrix.target }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: bundle-${{ matrix.target }}
          path: src-tauri/target/${{ matrix.target }}/release/bundle/
```

---

## Architecture Decision Quick Reference

| Question | Answer |
|----------|--------|
| When to use `invoke()` | One-shot request-response (read file, query DB, compute value) |
| When to use `emit()` events | Push data from Rust to JS (progress, metrics, notifications) |
| When to use `Channel<T>` | High-frequency typed streaming with backpressure |
| `std::sync::Mutex` vs `tokio::sync::Mutex` | Use `tokio::sync::Mutex` if you hold the lock across an `.await` |
| `Arc<Mutex<T>>` vs `RwLock<T>` | Use `RwLock` for many-reader, rare-writer state |
| Sync vs async commands | Use async for **any** I/O. Sync only for fast CPU-bound work (<1ms) |
| `app.emit()` vs `window.emit()` | `app.emit()` → all windows. `window.emit()` → one window. |
| `decorations: false` vs `title_bar_style` | `decorations: false` → fully custom. `title_bar_style` → macOS hybrid. |
| Event emission rate | Max 60/sec (16ms) for smooth UI. Batch if data arrives faster. |
| State sharing across windows | Update `Arc<Mutex<T>>` → emit event → all windows re-render |

---

## Further Reading

| Topic | Resource |
|-------|----------|
| Tauri v2 Documentation | [tauri.app/v2/guide](https://tauri.app/start/) |
| Tauri Plugin Directory | [tauri.app/plugin](https://tauri.app/plugin/) |
| Async Rust patterns | [Async Rust](../async-book/src/SUMMARY.md) |
| Concurrency & shared state | [Concurrency in Rust](../concurrency-book/src/SUMMARY.md) |
| Memory management | [Rust Memory Management](../memory-management-book/src/SUMMARY.md) |
| Wasm in the webview | [WebAssembly & The Edge](../wasm-edge-book/src/SUMMARY.md) |
| Security & supply chain | [Enterprise Rust](../enterprise-rust-book/src/SUMMARY.md) |
| CI/CD & engineering | [Rust Engineering Practices](../engineering-book/src/SUMMARY.md) |
