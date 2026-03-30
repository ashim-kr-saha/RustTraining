# 1. Event Loops and `mio` 🟢

> **What you'll learn:**
> - How operating systems notify user-space programs of I/O readiness via `select`, `poll`, `epoll`, and `kqueue`
> - The critical difference between **edge-triggered** and **level-triggered** polling and why Tokio chose edge-triggered
> - How the `mio` crate provides a cross-platform abstraction over OS event notification mechanisms
> - How to build a minimal, functioning event loop from raw `mio` primitives

---

## Why Event Loops Exist

Every network server faces the same fundamental problem: you have N sockets, and you need to know *which ones* are ready to read or write **without blocking on any single one**. The naïve approach — one thread per connection — doesn't scale beyond a few thousand connections because each OS thread costs 2–8 MB of stack space and a context switch costs 1–10 μs.

The solution, invented in the 1980s and refined ever since, is the **event loop**: a single thread that asks the OS "which of these file descriptors are ready?" and then dispatches work accordingly.

```
// Pseudocode: The fundamental event loop
loop {
    let events = os_poll(registered_fds, timeout);
    for event in events {
        dispatch(event.fd, event.readiness);
    }
}
```

The question is *how* you ask the OS. The answer has evolved over four decades:

| API | Year | OS | Max FDs | Complexity per call | Notes |
|-----|------|----|---------|-------------------|-------|
| `select` | 1983 | POSIX | 1024 (FD_SETSIZE) | O(n) | Copies entire fd_set to/from kernel each call |
| `poll` | 1986 | POSIX | Unlimited | O(n) | No fd limit, but still scans entire array |
| `epoll` | 2002 | Linux | Unlimited | O(ready) | Kernel maintains interest set; only returns ready fds |
| `kqueue` | 2000 | BSD/macOS | Unlimited | O(ready) | Similar to epoll; supports files, signals, timers |
| `IOCP` | 2000 | Windows | Unlimited | O(ready) | Completion-based (not readiness-based) |

The key insight: `select` and `poll` are **O(n)** in the *total* number of monitored file descriptors. `epoll` and `kqueue` are **O(k)** in the number of *ready* file descriptors. When you're monitoring 100,000 connections and 50 are ready, that's the difference between scanning 100,000 entries and processing 50.

---

## The `epoll` System Call (Linux)

`epoll` is a set of three system calls that manage a kernel-side interest set:

```c
// 1. Create an epoll instance (returns a file descriptor)
int epoll_fd = epoll_create1(0);

// 2. Register interest in a file descriptor
struct epoll_event ev = {
    .events = EPOLLIN | EPOLLET,  // Read readiness, edge-triggered
    .data.fd = socket_fd,
};
epoll_ctl(epoll_fd, EPOLL_CTL_ADD, socket_fd, &ev);

// 3. Wait for events
struct epoll_event events[MAX_EVENTS];
int n = epoll_wait(epoll_fd, events, MAX_EVENTS, timeout_ms);
// n = number of ready file descriptors
```

The kernel maintains a **red-black tree** of monitored file descriptors and a **ready list**. When a socket receives data, the kernel's network stack adds it to the ready list. `epoll_wait` returns only the file descriptors on the ready list — no scanning required.

### Edge-Triggered vs. Level-Triggered

This is the single most important concept in this chapter. Get it wrong and your server will either spin the CPU at 100% or silently drop events.

| Mode | Behavior | When `epoll_wait` returns an event |
|------|----------|-----------------------------------|
| **Level-triggered** (default) | Fires **every time** you call `epoll_wait` while the fd is ready | As long as the socket has data in its buffer |
| **Edge-triggered** (`EPOLLET`) | Fires **once** when the fd *transitions* from not-ready to ready | Only on the transition edge; you must drain the buffer completely |

```mermaid
stateDiagram-v2
    direction LR
    state "Not Ready\n(buffer empty)" as NR
    state "Ready\n(data arrived)" as R
    state "Still Ready\n(partially read)" as SR

    [*] --> NR
    NR --> R : Data arrives in kernel buffer

    state "Level-Triggered" as LT {
        R --> R : epoll_wait → event returned ✅
        SR --> SR : epoll_wait → event returned ✅
    }

    state "Edge-Triggered" as ET {
        R --> SR : epoll_wait → event returned ✅\nthen partial read
        SR --> SR : epoll_wait → NO event ❌\n(no new transition)
        SR --> NR : drain buffer completely
        NR --> R : new data arrives → event ✅
    }
```

**Why Tokio uses edge-triggered mode:**

1. **Fewer spurious wakes**: In level-triggered mode, if a task reads *some* data from a socket but not all, the next `epoll_wait` call will immediately return that socket again — even if no new data arrived. This wastes CPU cycles.
2. **Mandatory drain pattern**: Edge-triggered mode forces you to read until `EAGAIN` (would-block). This is more efficient for network I/O because you process all available data in one batch.
3. **Reduced syscall overhead**: Fewer `epoll_wait` returns means fewer transitions between user space and kernel space.

The tradeoff: edge-triggered mode is **harder to use correctly**. If you forget to drain the buffer after an event, you'll never get another notification for that socket. Tokio's I/O driver handles this complexity for you.

---

## The `kqueue` System Call (macOS / BSD)

On macOS, the equivalent of `epoll` is `kqueue`. The API is different but the semantics are similar:

```c
// 1. Create a kqueue instance
int kq = kqueue();

// 2. Register interest via changelist
struct kevent change;
EV_SET(&change, socket_fd, EVFILT_READ, EV_ADD | EV_CLEAR, 0, 0, NULL);
// EV_CLEAR = edge-triggered (clear the event after delivery)

// 3. Wait for events
struct kevent events[MAX_EVENTS];
int n = kevent(kq, &change, 1, events, MAX_EVENTS, &timeout);
```

`kqueue` is actually more powerful than `epoll` — it can monitor files, directories, signals, processes, and timers natively. But for network I/O, they're functionally equivalent.

| Feature | `epoll` (Linux) | `kqueue` (macOS/BSD) |
|---------|-----------------|---------------------|
| Edge-triggered flag | `EPOLLET` | `EV_CLEAR` |
| One-shot mode | `EPOLLONESHOT` | `EV_ONESHOT` |
| Monitors files | ❌ (use `inotify`) | ✅ (`EVFILT_VNODE`) |
| Monitors timers | ❌ (use `timerfd`) | ✅ (`EVFILT_TIMER`) |
| Batch register+wait | ❌ (separate `ctl`/`wait` calls) | ✅ (single `kevent` call) |

---

## The `mio` Crate: Cross-Platform Event I/O

Tokio doesn't call `epoll` or `kqueue` directly. It uses **`mio`** (Metal I/O), a thin cross-platform abstraction that provides a unified API over every OS's event notification system:

| OS | `mio` backend |
|----|---------------|
| Linux | `epoll` (edge-triggered) |
| macOS / FreeBSD / OpenBSD | `kqueue` (EV_CLEAR) |
| Windows | IOCP (completion ports) |

The core `mio` types:

```rust
use mio::{Poll, Events, Interest, Token};
use mio::net::TcpListener;

// Poll: wraps the OS event queue (epoll_fd / kqueue fd)
let mut poll = Poll::new()?;

// Events: reusable buffer for receiving readiness notifications
let mut events = Events::with_capacity(1024);

// Token: user-defined ID to associate with each registered source
const SERVER: Token = Token(0);

// Register a TCP listener for readable events
let mut listener = TcpListener::bind("127.0.0.1:8080".parse()?)?;
poll.registry().register(&mut listener, SERVER, Interest::READABLE)?;
```

### Building a Minimal Event Loop with `mio`

Here is a complete, minimal event loop that accepts TCP connections and echoes data back:

```rust
use mio::{Poll, Events, Interest, Token};
use mio::net::{TcpListener, TcpStream};
use std::collections::HashMap;
use std::io::{self, Read, Write};

const SERVER: Token = Token(0);

fn main() -> io::Result<()> {
    let mut poll = Poll::new()?;
    let mut events = Events::with_capacity(128);

    let addr = "127.0.0.1:9000".parse().unwrap();
    let mut server = TcpListener::bind(addr)?;
    poll.registry().register(&mut server, SERVER, Interest::READABLE)?;

    let mut connections: HashMap<Token, TcpStream> = HashMap::new();
    let mut next_token = Token(1);

    loop {
        // Block until at least one event is ready
        // This is the core of every event loop: the blocking OS call
        poll.poll(&mut events, None)?;

        for event in events.iter() {
            match event.token() {
                SERVER => {
                    // Accept all pending connections (edge-triggered: drain!)
                    loop {
                        match server.accept() {
                            Ok((mut conn, _addr)) => {
                                let token = next_token;
                                next_token = Token(next_token.0 + 1);
                                poll.registry().register(
                                    &mut conn,
                                    token,
                                    Interest::READABLE,
                                )?;
                                connections.insert(token, conn);
                            }
                            Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                                // No more pending connections
                                break;
                            }
                            Err(e) => return Err(e),
                        }
                    }
                }
                token => {
                    // Handle data on an existing connection
                    if let Some(conn) = connections.get_mut(&token) {
                        let mut buf = [0u8; 4096];
                        // Edge-triggered: read until WouldBlock
                        loop {
                            match conn.read(&mut buf) {
                                Ok(0) => {
                                    // Connection closed
                                    connections.remove(&token);
                                    break;
                                }
                                Ok(n) => {
                                    // Echo back (simplified — real code handles partial writes)
                                    let _ = conn.write_all(&buf[..n]);
                                }
                                Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                                    // Buffer drained, wait for next event
                                    break;
                                }
                                Err(_e) => {
                                    connections.remove(&token);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

Key observations:

1. **`poll.poll()` is the blocking point** — the thread sleeps in `epoll_wait` until at least one event fires.
2. **Edge-triggered drain loops** — both the accept loop and the read loop continue until `WouldBlock`. Missing this is the #1 bug in hand-written event loops.
3. **Token-based dispatch** — `mio` uses integer tokens, not callbacks. Tokio maps these tokens to task wakers.

---

## From `mio` to Tokio: The Gap

The event loop above works, but it has fundamental limitations that Tokio solves:

| Problem | `mio` raw loop | Tokio |
|---------|---------------|-------|
| **Composability** | All logic in one giant `match` | Each connection is a separate `async` task |
| **Concurrency** | Single-threaded only | Multi-threaded work-stealing |
| **Timers** | Manual `timerfd` or sorted list | Hashed hierarchical timing wheel |
| **Backpressure** | Manual buffer management | `AsyncRead` / `AsyncWrite` traits |
| **Cancellation** | Manual cleanup on every path | `Drop` on `JoinHandle` or `select!` |

Chapter 2 bridges this gap by introducing the **Reactor** — Tokio's component that wraps `mio` and translates OS events into `Waker` notifications.

---

<details>
<summary><strong>🏋️ Exercise: Build an Edge-Triggered Connection Counter</strong> (click to expand)</summary>

**Challenge:** Using only `mio` (no Tokio), build a TCP server that:
1. Binds to `127.0.0.1:9000`
2. Accepts connections in edge-triggered mode
3. For each connection, reads all available data and counts the total bytes received
4. When the client disconnects, prints `"Connection {token}: {bytes} bytes received"`
5. Every 100 accepted connections, prints a summary

**Constraint:** You must handle partial reads correctly (edge-triggered means drain until `WouldBlock`). You must not leak connections (deregister on close).

<details>
<summary>🔑 Solution</summary>

```rust
use mio::{Poll, Events, Interest, Token};
use mio::net::{TcpListener, TcpStream};
use std::collections::HashMap;
use std::io::{self, Read};

const SERVER: Token = Token(0);

struct ConnState {
    stream: TcpStream,
    bytes_received: usize,
}

fn main() -> io::Result<()> {
    let mut poll = Poll::new()?;
    let mut events = Events::with_capacity(256);

    let addr = "127.0.0.1:9000".parse().unwrap();
    let mut server = TcpListener::bind(addr)?;

    // Register the listener for read events (edge-triggered is mio's default)
    poll.registry().register(
        &mut server,
        SERVER,
        Interest::READABLE,
    )?;

    let mut connections: HashMap<Token, ConnState> = HashMap::new();
    let mut next_id: usize = 1;
    let mut total_accepted: usize = 0;

    println!("Listening on {addr}");

    loop {
        // Block in epoll_wait / kevent until events arrive
        poll.poll(&mut events, None)?;

        for event in events.iter() {
            match event.token() {
                SERVER => {
                    // ✅ DRAIN LOOP: edge-triggered means we must accept
                    // all pending connections, not just one
                    loop {
                        match server.accept() {
                            Ok((mut stream, addr)) => {
                                let token = Token(next_id);
                                next_id += 1;
                                total_accepted += 1;

                                // Register the new connection for read events
                                poll.registry().register(
                                    &mut stream,
                                    token,
                                    Interest::READABLE,
                                )?;

                                connections.insert(token, ConnState {
                                    stream,
                                    bytes_received: 0,
                                });

                                println!("Accepted connection {}: {addr}", token.0);

                                // Print summary every 100 connections
                                if total_accepted % 100 == 0 {
                                    println!(
                                        "--- Summary: {} total accepted, {} active ---",
                                        total_accepted,
                                        connections.len()
                                    );
                                }
                            }
                            // No more pending connections in the accept queue
                            Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => break,
                            Err(e) => {
                                eprintln!("Accept error: {e}");
                                break;
                            }
                        }
                    }
                }

                token => {
                    // Handle data on an existing connection
                    let mut closed = false;

                    if let Some(state) = connections.get_mut(&token) {
                        let mut buf = [0u8; 8192];

                        // ✅ DRAIN LOOP: read until WouldBlock (edge-triggered)
                        loop {
                            match state.stream.read(&mut buf) {
                                Ok(0) => {
                                    // TCP FIN — connection closed cleanly
                                    closed = true;
                                    break;
                                }
                                Ok(n) => {
                                    // Accumulate byte count
                                    state.bytes_received += n;
                                }
                                Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                                    // Buffer fully drained — wait for next edge
                                    break;
                                }
                                Err(_) => {
                                    // I/O error — treat as close
                                    closed = true;
                                    break;
                                }
                            }
                        }
                    }

                    if closed {
                        // Clean up: deregister and remove
                        if let Some(mut state) = connections.remove(&token) {
                            // Deregister to free the kernel-side slot
                            let _ = poll.registry().deregister(&mut state.stream);
                            println!(
                                "Connection {}: {} bytes received",
                                token.0, state.bytes_received
                            );
                        }
                    }
                }
            }
        }
    }
}
```

**Key points in this solution:**

1. Both the accept and read paths have drain loops that continue until `WouldBlock`. Missing either loop means lost events in edge-triggered mode.
2. We deregister the stream on close. In `epoll`, the kernel automatically removes a closed fd, but explicit deregister is good practice and required for `kqueue` correctness.
3. The `ConnState` struct tracks per-connection byte counts without any heap allocation per read — just an incrementing counter.

</details>
</details>

---

> **Key Takeaways**
> - OS event notification APIs (`epoll`, `kqueue`, IOCP) allow a single thread to monitor thousands of file descriptors efficiently in O(ready) time.
> - **Edge-triggered** mode fires once per readiness transition; you **must** drain the buffer until `WouldBlock` or you'll miss events forever. Tokio uses edge-triggered mode for efficiency.
> - **`mio`** is Tokio's cross-platform abstraction over `epoll`/`kqueue`/IOCP. It provides `Poll`, `Events`, `Token`, and `Interest` — nothing more. All scheduling, task management, and timer logic lives above `mio`.
> - The gap between `mio` and a production async runtime is enormous: composability, multi-threading, timers, cooperative scheduling, and cancellation. Chapters 2–8 fill that gap.

> **See also:**
> - [Chapter 2: The Reactor and the Parker](ch02-reactor-and-parker.md) — how Tokio wraps `mio` into its I/O driver
> - [Chapter 8: Capstone](ch08-capstone-mini-runtime.md) — building a complete runtime on top of `mio`
> - [Async Rust](../async-book/src/SUMMARY.md) — the user-facing async model that these OS primitives power
