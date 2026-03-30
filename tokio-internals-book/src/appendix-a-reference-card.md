# Appendix A: Tokio Internals Reference Card

> A quick-reference cheat sheet for Tokio runtime configuration, worker thread metrics, atomic memory orderings in the scheduler, and key diagrams.

---

## Tokio Runtime Configuration Knobs

| Parameter | Default | API | Effect |
|-----------|---------|-----|--------|
| `worker_threads` | `num_cpus` | `Builder::worker_threads(n)` | Number of worker threads in the multi-thread scheduler. Each thread has its own local run queue. |
| `max_blocking_threads` | 512 | `Builder::max_blocking_threads(n)` | Maximum threads in the `spawn_blocking` pool. Threads are created on demand and reaped after 10s idle. |
| `global_queue_interval` | 31 | `Builder::global_queue_interval(n)` | How many tasks a worker polls from its local queue before checking the global inject queue. Lower = fairer. Higher = less contention. |
| `event_interval` | 61 | `Builder::event_interval(n)` | How many tasks a worker polls before checking for I/O events. Lower = more responsive I/O. Higher = better throughput for CPU-bound tasks. |
| `thread_keep_alive` | 10s | `Builder::thread_keep_alive(dur)` | How long a `spawn_blocking` thread stays alive after its last task. |
| `thread_name` | `"tokio-runtime-worker"` | `Builder::thread_name(s)` | Name prefix for worker threads (visible in `ps`, `htop`, `top`). |
| `thread_stack_size` | OS default (~8MB) | `Builder::thread_stack_size(n)` | Stack size for worker threads. Reduce for high-thread-count runtimes. |
| `enable_io` | `true` | `Builder::enable_io()` | Enable the I/O driver (reactor). Disable if you only need timers and compute. |
| `enable_time` | `true` | `Builder::enable_time()` | Enable the timer subsystem. Disable if you don't use `tokio::time`. |
| `start_paused` | `false` | `Builder::start_paused(true)` | Start timer in paused state (for deterministic testing with `time::advance`). |

### Recommended Configurations

| Workload | `worker_threads` | `global_queue_interval` | `event_interval` | Notes |
|----------|-----------------|------------------------|-------------------|-------|
| **I/O-heavy** (proxy, gateway) | `num_cpus` | 31 (default) | 31 (lower) | Prioritize I/O responsiveness |
| **CPU-heavy** (ML inference) | `num_cpus` | 61 (higher) | 128 (higher) | Reduce reactor/queue check overhead |
| **Mixed** (web API + DB) | `num_cpus` | 31 | 61 (default) | Balanced defaults |
| **Low-latency** (trading) | 1 (pinned) | 1 | 1 | Check everything every iteration; use `current_thread` |

---

## Current-Thread vs Multi-Thread Runtime

| Aspect | `current_thread` | `multi_thread` |
|--------|-----------------|---------------|
| Worker threads | 1 | N (default: num_cpus) |
| Local queues | 1 (the only queue) | N + 1 global inject |
| Work stealing | N/A | Yes (steal half from random sibling) |
| LIFO slot | No | Yes (one per worker) |
| `Send` bound on tasks | Not required | Required (`T: Send + 'static`) |
| Reactor location | On the single thread | On each worker thread |
| Best for | Tests, single-core embedded, CLI tools | Production servers |
| `tokio::spawn` | Pushes to the single queue | Pushes to local queue or global inject |

---

## Task State Machine

```text
    ┌─────────┐
    │         │  tokio::spawn()
    │  (new)  │────────────────────┐
    │         │                    ▼
    └─────────┘              ┌──────────┐
                             │SCHEDULED │◄────────────────┐
                             │ (in run  │                 │
                             │  queue)  │                 │
                             └────┬─────┘                 │
                                  │                       │
                        executor picks                    │
                          from queue                      │
                                  │                  wake() called
                                  ▼                  during poll
                             ┌──────────┐                 │
                             │ RUNNING  │─── poll() ──────┘
                             │ (being   │   returns
                             │  polled) │   Pending
                             └────┬─────┘   + SCHEDULED
                                  │           bit set
                    ┌─────────────┼─────────────┐
                    │             │              │
              poll() →       poll() →      poll() →
              Pending        Ready(v)      Ready(v)
              (no wake)     (JoinHandle    (no JoinHandle)
                    │        waiting)            │
                    ▼             │              ▼
              ┌──────────┐       ▼        ┌──────────┐
              │   IDLE   │  ┌──────────┐  │ COMPLETE │
              │(waiting  │  │ COMPLETE │  │(output   │
              │ for wake)│  │(output   │  │ dropped) │
              └──────────┘  │ stored)  │  └──────────┘
                            └──────────┘
```

---

## Work-Stealing Queue Topology

```text
    ┌──────────────────────────────────────────────┐
    │           Global Inject Queue                │
    │        (Mutex<VecDeque<TaskRef>>)             │
    │  ← spawn from outside runtime                │
    │  ← overflow from full local queues           │
    │  → checked every global_queue_interval polls │
    └──────────┬──────────┬──────────┬─────────────┘
               │          │          │
    ┌──────────▼──┐ ┌─────▼──────┐ ┌▼────────────┐
    │  Worker 0   │ │  Worker 1  │ │  Worker 2    │
    │             │ │            │ │              │
    │ ┌─────────┐ │ │ ┌────────┐ │ │ ┌──────────┐ │
    │ │LIFO Slot│ │ │ │LIFO    │ │ │ │LIFO Slot │ │
    │ │(1 task) │ │ │ │Slot    │ │ │ │(1 task)  │ │
    │ └─────────┘ │ │ └────────┘ │ │ └──────────┘ │
    │ ┌─────────┐ │ │ ┌────────┐ │ │ ┌──────────┐ │
    │ │Local Q  │ │ │ │Local Q │ │ │ │Local Q   │ │
    │ │(256 ring│◄├─┤►│(256    │◄├─┤►│(256 ring │ │
    │ │ buffer) │ │ │ │ ring)  │ │ │ │ buffer)  │ │
    │ └─────────┘ │ │ └────────┘ │ │ └──────────┘ │
    └─────────────┘ └────────────┘ └──────────────┘
         ◄──── steal half ────►
```

---

## Atomic Memory Orderings Quick Reference

| Context | Operation | Ordering | Reason |
|---------|-----------|----------|--------|
| **Task spawn** | Write task data | `Release` | Ensure task data is visible to the worker that polls it |
| **Task spawn** | Push to queue | `Release` | Pairs with worker's `Acquire` when it pops |
| **Worker pop** | Read from local queue | `Acquire` | See the task data written during spawn |
| **Waker clone** | Increment refcount | `Relaxed` | Already hold a reference; no new data to synchronize |
| **Waker wake** | `fetch_or(SCHEDULED)` | `AcqRel` | Release: publish "I/O is ready" data. Acquire: see current task state |
| **Waker drop** | Decrement refcount | `AcqRel` | Last dropper must see all writes from all other threads |
| **Work steal** | Read victim's `tail` | `Acquire` | See the tasks that were pushed before `tail` was advanced |
| **Work steal** | CAS on `head` | `AcqRel` | Mutually exclusive with other stealers |
| **Owner pop last item** | CAS on `head` | `SeqCst` | Total order needed to resolve race with concurrent stealer for last item |
| **Owner pop last item** | Store `tail` | `SeqCst` | Pairs with stealer's `SeqCst` load of `tail` |
| **Park** | Store `PARKED` | `Release` | Siblings see parked state before they push + try to unpark |
| **Unpark** | Swap state to `NOTIFIED` | `AcqRel` | See if thread was actually parked; publish the notification |

---

## Timer Wheel Structure Reference

```text
Level 0:  1ms slots    ×64  →           0ms  –    64ms
Level 1:  64ms slots   ×64  →          64ms  –   4.1s
Level 2:  4,096ms slots ×64  →        4.1s  –   4.4min
Level 3:  262,144ms    ×64  →        4.4min –   4.7hr
Level 4:  16,777,216ms ×64  →        4.7hr  –  12.5 days
Level 5: 1,073,741,824ms ×64  →    12.5 days –   2.2 years

Total: 6 levels × 64 slots = 384 slots
Each slot: intrusive doubly-linked list of TimerEntry

Operations:
  Insert:  O(1) — compute level + slot from deadline, push to list
  Cancel:  O(1) — unlink from doubly-linked list
  Expire:  O(1) amortized — drain current slot
  Cascade: O(k) where k = timers in the cascaded slot (amortized O(1))
```

---

## Tokio-Console Metrics Reference

Key metrics visible in `tokio-console`:

| Metric | What it tells you |
|--------|------------------|
| **Task polls** | Total number of times `poll()` was called on this task |
| **Task busy time** | Wall-clock time spent inside `poll()` |
| **Task idle time** | Wall-clock time between `poll()` returns Pending and next `poll()` |
| **Budget exhaustions** | Number of times the cooperative budget forced a yield |
| **Scheduled count** | Number of times `Waker::wake()` was called |
| **Mean poll duration** | Average time per `poll()` call — high values indicate blocking |
| **Task self-wake** | Task called `wake()` on itself — indicates a yield or busy-loop |

### Red Flags in Metrics

| Symptom | Likely cause | Chapter |
|---------|-------------|---------|
| Single task with >80% busy time | Blocking work on the executor thread | Ch 2, Ch 5 |
| Many tasks with 0 polls | Spawned but never woken (missing waker registration) | Ch 4 |
| High budget exhaustions on one task | Hot loop consuming all operations | Ch 5 |
| Workers with very uneven busy time | Work-stealing not activating (check `worker_threads`) | Ch 6 |
| Large gap between scheduled and polled | Queuing delay — too many tasks for too few workers | Ch 6 |
| Timer inaccuracy >100ms | Reactor starvation from blocking work | Ch 2, Ch 7 |

---

## Essential Commands

```bash
# Install tokio-console
cargo install tokio-console

# Run your app with console subscriber enabled
RUSTFLAGS="--cfg tokio_unstable" cargo run

# In another terminal
tokio-console

# Profile with flamegraph
cargo install flamegraph
cargo flamegraph --bin my-server

# Check async task sizes (nightly)
RUSTFLAGS="-Zprint-type-sizes" cargo +nightly build 2>&1 | grep "async"
```

---

## Further Reading

| Resource | What you'll learn |
|----------|------------------|
| [Tokio source: `tokio/src/runtime/`](https://github.com/tokio-rs/tokio/tree/master/tokio/src/runtime) | The actual scheduler, parker, and worker implementations |
| [Tokio source: `tokio/src/runtime/scheduler/multi_thread/`](https://github.com/tokio-rs/tokio/tree/master/tokio/src/runtime/scheduler/multi_thread) | Work-stealing queue, inject queue, worker loop |
| [mio source](https://github.com/tokio-rs/mio) | Cross-platform I/O event notification |
| [Alice Ryhl's "Actors with Tokio"](https://ryhl.io/blog/actors-with-tokio/) | Production patterns for structuring Tokio applications |
| [Tokio blog: "Making the Tokio scheduler 10x faster"](https://tokio.rs/blog/2019-10-scheduler) | Design rationale for the work-stealing scheduler |
| [Blumofe & Leiserson, 1999](https://dl.acm.org/doi/10.1145/324133.324234) | Original work-stealing algorithm paper |
| [Varghese & Lauck, 1987](https://dl.acm.org/doi/10.1145/37499.37504) | Hashed Hierarchical Timing Wheels paper |
