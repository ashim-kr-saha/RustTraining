# 4. Parallel Transaction Execution 🔴

> **The Problem:** Ethereum's EVM processes transactions **one at a time**, in sequence. Every transaction waits for the previous one to finish, even if they touch completely different accounts. On a 64-core server, 63 cores sit idle. This is the single biggest bottleneck in blockchain throughput. Modern chains like Solana (Sealevel), Aptos (Block-STM), and Sui (Narwhal/Bullshark) achieve 10,000+ TPS by executing non-conflicting transactions in parallel. We need an execution engine that builds a dependency graph of transactions, identifies which ones are independent, and dispatches them across all available CPU cores.

---

## Why Sequential Execution is a Bottleneck

In the EVM model, block execution looks like this:

```
Block: [tx1, tx2, tx3, tx4, tx5, tx6, tx7, tx8]

Time →  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐
Core 0: │ tx1 ││ tx2 ││ tx3 ││ tx4 ││ tx5 ││ tx6 ││ tx7 ││ tx8 │
        └────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘
Core 1: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (idle)
Core 2: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (idle)
...
Core 7: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (idle)
```

Total time: 8 × T (where T is average execution time per transaction).

With parallel execution:

```
Block: [tx1, tx2, tx3, tx4, tx5, tx6, tx7, tx8]

Dependency analysis: tx3 depends on tx1 (same account)
                     tx6 depends on tx4 (same account)
                     All others are independent.

Time →  ┌────┐      ┌────┐
Core 0: │ tx1 │─────→│ tx3 │
        └────┘      └────┘
        ┌────┐
Core 1: │ tx2 │
        └────┘
        ┌────┐      ┌────┐
Core 2: │ tx4 │─────→│ tx6 │
        └────┘      └────┘
        ┌────┐
Core 3: │ tx5 │
        └────┘
        ┌────┐
Core 4: │ tx7 │
        └────┘
        ┌────┐
Core 5: │ tx8 │
        └────┘
```

Total time: 2 × T (the critical path through the dependency chain).

| Model | 8 txns, 8 cores | Speedup |
|---|---|---|
| Sequential (EVM) | 8T | 1× |
| Parallel (no conflicts) | T | 8× |
| Parallel (2 chains of length 2) | 2T | 4× |
| Parallel (1 chain of length 8, worst case) | 8T | 1× (falls back to sequential) |

The speedup depends entirely on the **conflict rate** — how many transactions touch the same accounts.

---

## The Access Set: Declaring Intent

The key insight of parallel execution is that each transaction must **declare which accounts it will read and write** before execution. This is the **access set** (also called read/write set or access list):

```rust,ignore
use std::collections::HashSet;

/// An account address (20 bytes).
type Address = [u8; 20];

/// The access set of a transaction — which accounts it will touch.
#[derive(Clone, Debug)]
struct AccessSet {
    /// Accounts the transaction will read (e.g., check balance).
    reads: HashSet<Address>,
    /// Accounts the transaction will write (e.g., debit/credit).
    writes: HashSet<Address>,
}

/// A transaction with its declared access set.
#[derive(Clone, Debug)]
struct ExecutableTransaction {
    /// Unique hash of the transaction.
    hash: [u8; 32],
    /// The accounts this transaction touches.
    access_set: AccessSet,
    /// Serialized transaction payload (opcode, amount, etc.).
    payload: Vec<u8>,
    /// Index within the block (for deterministic ordering on conflicts).
    block_index: usize,
}
```

### When Are Two Transactions Conflicting?

Two transactions **conflict** if one writes to an account that the other reads or writes:

```rust,ignore
impl AccessSet {
    /// Check if this access set conflicts with another.
    ///
    /// Conflict exists if:
    /// - Our writes overlap with their reads or writes, OR
    /// - Our reads overlap with their writes.
    ///
    /// Read-read is NOT a conflict (both can proceed safely).
    fn conflicts_with(&self, other: &AccessSet) -> bool {
        // Write-Write conflict
        if self.writes.iter().any(|addr| other.writes.contains(addr)) {
            return true;
        }
        // Write-Read conflict (either direction)
        if self.writes.iter().any(|addr| other.reads.contains(addr)) {
            return true;
        }
        if self.reads.iter().any(|addr| other.writes.contains(addr)) {
            return true;
        }
        false
    }
}
```

---

## Building the Dependency DAG

Given a block of transactions with declared access sets, we construct a **Directed Acyclic Graph** (DAG) where:

- Each **node** is a transaction.
- An **edge** from tx_A → tx_B means "tx_A must execute before tx_B" (because they conflict and A appears earlier in the block).

```mermaid
flowchart TB
    subgraph "Block: [tx0, tx1, tx2, tx3, tx4, tx5, tx6, tx7]"
        direction TB

        TX0["tx0<br/>Alice → Bob<br/>W: {Alice, Bob}"]
        TX1["tx1<br/>Charlie → Dave<br/>W: {Charlie, Dave}"]
        TX2["tx2<br/>Alice → Eve<br/>W: {Alice, Eve}"]
        TX3["tx3<br/>Frank → Grace<br/>W: {Frank, Grace}"]
        TX4["tx4<br/>Bob → Charlie<br/>W: {Bob, Charlie}"]
        TX5["tx5<br/>Heidi → Ivan<br/>W: {Heidi, Ivan}"]
        TX6["tx6<br/>Dave → Alice<br/>W: {Dave, Alice}"]
        TX7["tx7<br/>Grace → Heidi<br/>W: {Grace, Heidi}"]
    end

    TX0 -->|"Alice conflict"| TX2
    TX0 -->|"Bob conflict"| TX4
    TX1 -->|"Charlie conflict"| TX4
    TX1 -->|"Dave conflict"| TX6
    TX2 -->|"Alice conflict"| TX6
    TX3 -->|"Grace conflict"| TX7
    TX5 -->|"Heidi conflict"| TX7

    style TX0 fill:#ff9,stroke:#333
    style TX1 fill:#9ff,stroke:#333
    style TX2 fill:#ff9,stroke:#333
    style TX3 fill:#f9f,stroke:#333
    style TX4 fill:#9f9,stroke:#333
    style TX5 fill:#f99,stroke:#333
    style TX6 fill:#99f,stroke:#333
    style TX7 fill:#fcc,stroke:#333
```

**Parallel execution schedule:**
- **Wave 1:** tx0, tx1, tx3, tx5 (all independent — 4 cores)
- **Wave 2:** tx2, tx4, tx7 (dependencies from Wave 1 satisfied)
- **Wave 3:** tx6 (depends on tx2 from Wave 2)

### DAG Builder

```rust,ignore
use std::collections::HashMap;

/// A dependency graph for parallel transaction execution.
struct DependencyDag {
    /// Number of transactions.
    num_txns: usize,
    /// Adjacency list: edges[i] = list of transaction indices that depend on tx i.
    edges: Vec<Vec<usize>>,
    /// In-degree: how many transactions must complete before tx i can execute.
    in_degree: Vec<usize>,
}

impl DependencyDag {
    /// Build a dependency DAG from a block of transactions.
    ///
    /// For each pair of transactions (i, j) where i < j,
    /// if they conflict, add an edge i → j.
    fn build(transactions: &[ExecutableTransaction]) -> Self {
        let n = transactions.len();
        let mut edges: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut in_degree = vec![0usize; n];

        // For each account, track the last transaction that wrote to it.
        // This is the "last writer" — any subsequent reader or writer depends on it.
        let mut last_writer: HashMap<Address, usize> = HashMap::new();
        // Track the last readers since the last writer.
        let mut readers_since_write: HashMap<Address, Vec<usize>> = HashMap::new();

        for (i, tx) in transactions.iter().enumerate() {
            let mut dependencies: HashSet<usize> = HashSet::new();

            // For each account we READ: depend on the last writer.
            for addr in &tx.access_set.reads {
                if let Some(&writer_idx) = last_writer.get(addr) {
                    dependencies.insert(writer_idx);
                }
            }

            // For each account we WRITE: depend on the last writer
            // AND all readers since the last writer (WAR dependency).
            for addr in &tx.access_set.writes {
                if let Some(&writer_idx) = last_writer.get(addr) {
                    dependencies.insert(writer_idx);
                }
                if let Some(readers) = readers_since_write.get(addr) {
                    for &reader_idx in readers {
                        dependencies.insert(reader_idx);
                    }
                }
            }

            // Record edges.
            for &dep in &dependencies {
                edges[dep].push(i);
                in_degree[i] += 1;
            }

            // Update tracking structures.
            for addr in &tx.access_set.writes {
                last_writer.insert(*addr, i);
                readers_since_write.remove(addr);
            }
            for addr in &tx.access_set.reads {
                readers_since_write.entry(*addr).or_default().push(i);
            }
        }

        Self {
            num_txns: n,
            edges,
            in_degree,
        }
    }

    /// Return the initial set of transactions with no dependencies (ready to execute).
    fn initial_ready_set(&self) -> Vec<usize> {
        self.in_degree
            .iter()
            .enumerate()
            .filter(|(_, &deg)| deg == 0)
            .map(|(i, _)| i)
            .collect()
    }
}
```

---

## The Parallel Executor

The executor uses a **work-stealing thread pool** and a concurrent scheduler that dispatches ready transactions as their dependencies complete:

```rust,ignore
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use crossbeam::channel;

/// The result of executing a single transaction.
#[derive(Clone, Debug)]
struct ExecutionResult {
    /// Transaction index within the block.
    tx_index: usize,
    /// The state changes produced by this transaction.
    state_delta: Vec<(Address, AccountStateDelta)>,
    /// Gas consumed.
    gas_used: u64,
    /// Whether the transaction succeeded.
    success: bool,
}

/// A delta (change) to an account's state.
#[derive(Clone, Debug)]
struct AccountStateDelta {
    balance_change: i128,  // Can be negative (debit).
    nonce_increment: u64,
}

/// The parallel transaction executor.
struct ParallelExecutor {
    /// Number of worker threads.
    num_workers: usize,
}

impl ParallelExecutor {
    fn new(num_workers: usize) -> Self {
        Self { num_workers }
    }

    /// Execute a block of transactions in parallel, respecting the dependency DAG.
    ///
    /// Returns the execution results in block order (not execution order).
    fn execute_block(
        &self,
        transactions: &[ExecutableTransaction],
        dag: &DependencyDag,
    ) -> Vec<ExecutionResult> {
        let n = transactions.len();
        let results: Vec<Option<ExecutionResult>> =
            std::iter::repeat_with(|| None).take(n).collect();
        let results = Arc::new(std::sync::Mutex::new(results));

        // In-degree counter — atomically decremented as dependencies complete.
        let in_degree: Vec<AtomicUsize> = dag
            .in_degree
            .iter()
            .map(|&d| AtomicUsize::new(d))
            .collect();
        let in_degree = Arc::new(in_degree);

        // Channel for ready-to-execute transaction indices.
        let (ready_tx, ready_rx) = channel::unbounded::<usize>();

        // Feed the initial ready set.
        for idx in dag.initial_ready_set() {
            ready_tx.send(idx).unwrap();
        }

        // Track how many transactions have been completed.
        let completed = Arc::new(AtomicUsize::new(0));

        // Spawn worker threads.
        std::thread::scope(|s| {
            for _ in 0..self.num_workers {
                let ready_rx = ready_rx.clone();
                let ready_tx = ready_tx.clone();
                let in_degree = Arc::clone(&in_degree);
                let results = Arc::clone(&results);
                let completed = Arc::clone(&completed);
                let edges = &dag.edges;

                s.spawn(move || {
                    while completed.load(Ordering::Acquire) < n {
                        // Block waiting for a ready transaction (with timeout).
                        let Ok(tx_idx) = ready_rx.recv_timeout(
                            std::time::Duration::from_millis(10),
                        ) else {
                            continue;
                        };

                        // Execute the transaction.
                        let result = execute_single_transaction(
                            &transactions[tx_idx],
                            tx_idx,
                        );

                        // Store the result.
                        {
                            let mut guard = results.lock().unwrap();
                            guard[tx_idx] = Some(result);
                        }

                        completed.fetch_add(1, Ordering::Release);

                        // Decrement in-degree of dependents.
                        // If a dependent's in-degree hits 0, it's ready.
                        for &dependent in &edges[tx_idx] {
                            let prev = in_degree[dependent]
                                .fetch_sub(1, Ordering::AcqRel);
                            if prev == 1 {
                                // This dependent is now ready.
                                let _ = ready_tx.send(dependent);
                            }
                        }
                    }
                });
            }
        });

        // Unwrap results — all should be Some by now.
        let guard = results.lock().unwrap();
        guard
            .iter()
            .map(|r| r.clone().expect("all transactions must be executed"))
            .collect()
    }
}

/// Execute a single transaction against the current state.
/// In production, this would read from a snapshot of the Merkle Trie.
fn execute_single_transaction(
    tx: &ExecutableTransaction,
    tx_index: usize,
) -> ExecutionResult {
    // Simplified: parse payload and compute state deltas.
    // Production would run the full VM (Move VM, SVM, etc.).
    ExecutionResult {
        tx_index,
        state_delta: Vec::new(), // Populated by actual execution
        gas_used: 21_000,        // Base gas cost
        success: true,
    }
}
```

---

## Optimistic Parallel Execution (Block-STM)

The DAG-based approach requires **pre-declared access sets**. But what if access sets are unknown until execution (e.g., smart contracts that call other contracts)?

**Block-STM** (used by Aptos) takes an **optimistic concurrency control** approach inspired by Software Transactional Memory:

1. **Execute all transactions in parallel**, optimistically assuming no conflicts.
2. **Validate** each transaction's read set after execution — did any read see a stale value?
3. If validation fails, **abort and re-execute** the conflicting transaction.

```mermaid
flowchart TB
    subgraph "Block-STM Execution"
        direction TB

        EXEC["Phase 1: Optimistic Execution<br/>All txns execute in parallel"]
        VAL["Phase 2: Validation<br/>Check read sets for conflicts"]
        ABORT["Abort & Re-execute<br/>Only conflicting txns"]

        EXEC --> VAL
        VAL -->|"No conflicts"| DONE["✅ Commit all results"]
        VAL -->|"Conflicts detected"| ABORT
        ABORT --> VAL
    end
```

### Block-STM Data Structures

```rust,ignore
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};
use std::collections::HashMap;

/// A multi-version data structure for optimistic concurrency.
///
/// For each account, we store multiple versions of the state —
/// one per transaction that wrote to it. Readers can then check
/// whether the version they read is still valid.
struct MultiVersionMemory {
    /// For each account, a map of (tx_index → written_value).
    /// tx_index acts as a "version number."
    data: HashMap<Address, RwLock<Vec<(usize, AccountState)>>>,
}

impl MultiVersionMemory {
    fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    /// Write a value for a specific transaction index.
    fn write(&self, addr: &Address, tx_index: usize, value: AccountState) {
        let versions = self.data.get(addr).unwrap();
        let mut guard = versions.write().unwrap();
        // Insert in sorted order by tx_index.
        match guard.binary_search_by_key(&tx_index, |(idx, _)| *idx) {
            Ok(pos) => guard[pos] = (tx_index, value),
            Err(pos) => guard.insert(pos, (tx_index, value)),
        }
    }

    /// Read the latest value written by a transaction with index < tx_index.
    /// Returns the value and the writer's tx_index (for validation).
    fn read(&self, addr: &Address, tx_index: usize) -> Option<(usize, AccountState)> {
        let versions = self.data.get(addr)?;
        let guard = versions.read().unwrap();
        // Find the latest version written by tx < tx_index.
        guard
            .iter()
            .rev()
            .find(|(writer_idx, _)| *writer_idx < tx_index)
            .cloned()
    }
}

/// Status of each transaction in Block-STM.
#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq)]
enum TxStatus {
    /// Ready to execute.
    ReadyToExecute = 0,
    /// Currently executing.
    Executing = 1,
    /// Executed, pending validation.
    Executed = 2,
    /// Validation passed.
    Validated = 3,
    /// Aborted due to conflict — needs re-execution.
    Aborted = 4,
}

/// The Block-STM scheduler.
struct BlockStmScheduler {
    /// Status of each transaction.
    status: Vec<AtomicU32>,
    /// Number of transactions.
    num_txns: usize,
    /// Number of validated transactions (monotonically increasing).
    validation_idx: AtomicU32,
    /// Number of executed transactions.
    execution_idx: AtomicU32,
}

impl BlockStmScheduler {
    fn new(num_txns: usize) -> Self {
        let status: Vec<AtomicU32> = (0..num_txns)
            .map(|_| AtomicU32::new(TxStatus::ReadyToExecute as u32))
            .collect();

        Self {
            status,
            num_txns,
            validation_idx: AtomicU32::new(0),
            execution_idx: AtomicU32::new(0),
        }
    }

    /// Get the next task for a worker thread.
    fn next_task(&self) -> Option<Task> {
        // Priority 1: Validate the lowest-indexed executed transaction.
        let val_idx = self.validation_idx.load(Ordering::Acquire) as usize;
        if val_idx < self.num_txns {
            let status = self.status[val_idx].load(Ordering::Acquire);
            if status == TxStatus::Executed as u32 {
                if self
                    .status[val_idx]
                    .compare_exchange(
                        TxStatus::Executed as u32,
                        TxStatus::Validated as u32,
                        Ordering::AcqRel,
                        Ordering::Acquire,
                    )
                    .is_ok()
                {
                    return Some(Task::Validate(val_idx));
                }
            }
        }

        // Priority 2: Execute the next ready transaction.
        let exec_idx = self.execution_idx.load(Ordering::Acquire) as usize;
        if exec_idx < self.num_txns {
            let status = self.status[exec_idx].load(Ordering::Acquire);
            if status == TxStatus::ReadyToExecute as u32
                || status == TxStatus::Aborted as u32
            {
                if self
                    .status[exec_idx]
                    .compare_exchange(
                        status,
                        TxStatus::Executing as u32,
                        Ordering::AcqRel,
                        Ordering::Acquire,
                    )
                    .is_ok()
                {
                    self.execution_idx.fetch_add(1, Ordering::Release);
                    return Some(Task::Execute(exec_idx));
                }
            }
        }

        None
    }

    /// Mark a transaction as needing re-execution.
    fn abort(&self, tx_index: usize) {
        self.status[tx_index].store(TxStatus::Aborted as u32, Ordering::Release);
        // Reset validation index to re-validate from this point.
        let _ = self.validation_idx.fetch_min(tx_index as u32, Ordering::AcqRel);
    }
}

enum Task {
    Execute(usize),
    Validate(usize),
}
```

### Block-STM vs. DAG Comparison

| Property | DAG-Based (Solana Sealevel) | Block-STM (Aptos) |
|---|---|---|
| Access set required? | Yes (pre-declared) | No (discovered at runtime) |
| Conflict detection | Before execution | After execution |
| Re-execution overhead | None | Conflicting txns re-execute |
| Best case | Same as Block-STM | Same as DAG |
| Worst case (all conflict) | Sequential (1 core) | Sequential + re-execution overhead |
| Smart contract support | Requires static analysis | Works with any contract |
| Implementation complexity | Lower | Higher (MVCC + scheduler) |

---

## Applying State Deltas

After parallel execution, we have a set of `ExecutionResult`s. We apply them to the Merkle Trie **in block order** to ensure deterministic state roots:

```rust,ignore
/// Apply execution results to the state trie in block order.
///
/// CRITICAL: Results must be applied in block_index order,
/// not execution order. This guarantees all validators
/// compute the same state root.
fn apply_results_to_trie(
    trie: &mut MerkleTrie,
    results: &[ExecutionResult],
) -> [u8; 32] {
    // Results are already sorted by tx_index from the executor.
    for result in results {
        if !result.success {
            continue; // Failed txns don't modify state (but still pay gas).
        }

        for (address, delta) in &result.state_delta {
            // Read current state.
            let current = trie.get(address).cloned().unwrap_or(AccountState {
                nonce: 0,
                balance: 0,
                code_hash: [0u8; 32],
                storage_root: [0u8; 32],
            });

            // Apply delta.
            let new_balance = (current.balance as i128 + delta.balance_change) as u128;
            let new_state = AccountState {
                nonce: current.nonce + delta.nonce_increment,
                balance: new_balance,
                code_hash: current.code_hash,
                storage_root: current.storage_root,
            };

            trie.insert(address, new_state);
        }
    }

    trie.root_hash()
}
```

---

## Performance Analysis

### Speedup Model

The parallel speedup depends on the **conflict graph density**. For a block of N transactions on P cores:

| Scenario | Conflict Rate | Parallel Speedup |
|---|---|---|
| Token transfers (random accounts) | ~1–5% | ~P (near-linear) |
| DEX swaps (hot liquidity pool) | ~30–50% | ~2–3× |
| NFT mint (everyone writes to same contract) | ~90% | ~1× (sequential) |
| Mixed workload (realistic) | ~10–20% | ~P/2 |

### Benchmark: 8-Core Execution

| Block Size | Sequential (ms) | Parallel (ms) | Speedup |
|---|---|---|---|
| 100 txns (5% conflict) | 50 | 8 | 6.2× |
| 500 txns (10% conflict) | 250 | 45 | 5.5× |
| 1000 txns (15% conflict) | 500 | 110 | 4.5× |
| 5000 txns (20% conflict) | 2500 | 650 | 3.8× |

---

## The Full Execution Pipeline

```mermaid
flowchart LR
    subgraph "Input"
        BLK["Finalized Block<br/>(from Consensus Engine)"]
    end

    subgraph "Execution Engine"
        PARSE["Parse Transactions<br/>Extract Access Sets"]
        DAG["Build Dependency DAG<br/>O(N² worst, N·k typical)"]
        SCHED["Topological Scheduler<br/>Dispatch ready txns"]
        POOL["Thread Pool<br/>8 workers"]
        MERGE["Merge Results<br/>(in block order)"]
    end

    subgraph "Output"
        DELTA["State Deltas"]
        TRIE["Update Merkle Trie<br/>New State Root"]
        HEADER["Block Header<br/>state_root = 0xabc..."]
    end

    BLK --> PARSE --> DAG --> SCHED --> POOL
    POOL --> MERGE --> DELTA --> TRIE --> HEADER
```

---

> **Key Takeaways**
>
> 1. **Sequential execution wastes cores.** A 64-core server running the EVM uses exactly 1 core for transaction execution. Parallel execution can unlock 4–8× throughput on commodity hardware.
> 2. **The dependency DAG is the key abstraction.** By analyzing account access sets, we identify which transactions are independent and can safely execute concurrently.
> 3. **Two paradigms: pre-declared (DAG) vs. optimistic (Block-STM).** DAG requires upfront access declarations but never wastes work. Block-STM works with any smart contract but re-executes conflicting transactions.
> 4. **State deltas must be applied in block order.** Execution can be parallel, but merging results into the Merkle Trie must be deterministic — every validator must compute the same state root.
> 5. **Conflict rate determines speedup.** With random token transfers (~5% conflicts), parallel execution achieves near-linear speedup. With hot-spot contracts (DEX pools), contention limits parallelism to 2–3×.
> 6. **The scheduler is the critical path.** A fast work-stealing scheduler with atomic in-degree counters is essential — any lock contention in the scheduler itself becomes the new bottleneck.
