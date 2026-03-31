# Appendix: Reference Cards

> **Quick-reference tables for latency numbers, protocol details, and kernel tuning parameters used throughout this book.**

---

## A.1 Latency Numbers Every Quant Should Know

These numbers are approximate and vary by hardware generation, but the **relative magnitudes** are stable across eras.

### CPU & Memory Hierarchy

| Operation | Latency | Notes |
|---|---|---|
| CPU register access | ~0.3 ns | Single clock cycle @ 3.5 GHz |
| L1 cache hit | ~1 ns | 32 KB per core, data + instruction |
| L2 cache hit | ~4 ns | 256 KB–1 MB per core |
| L3 cache hit (same socket) | ~12–20 ns | Shared across all cores on a socket |
| L3 cache hit (cross-socket NUMA) | ~40–100 ns | Remote NUMA node access via QPI/UPI |
| Main memory (DRAM) | ~60–100 ns | DDR4-3200, depends on access pattern |
| `RDTSC` instruction | ~20–25 ns | Read timestamp counter |
| Branch misprediction | ~12–20 ns | Pipeline flush penalty |
| TLB miss (2 MB hugepage) | ~7 ns | 4 KB page TLB miss is ~25 ns |
| TLB miss (4 KB page) | ~20–30 ns | Page table walk |
| `MFENCE` / memory barrier | ~33 ns | Serializing instruction |

### System Calls & Kernel

| Operation | Latency | Notes |
|---|---|---|
| `SYSCALL` / `SYSRETQ` (fast path, no KPTI) | ~100 ns | Raw user→kernel→user transition |
| `SYSCALL` with KPTI (Meltdown mitigation) | ~200–400 ns | TLB flush on every transition |
| `getpid()` via vDSO | ~15 ns | No kernel entry |
| `clock_gettime(MONOTONIC)` via vDSO | ~20 ns | VDSO path, no syscall |
| `recvfrom()` (UDP, data ready) | ~2–5 µs | Full kernel network stack traversal |
| `epoll_wait()` (1 event ready) | ~1.5 µs | Kernel wakeup + context to userspace |
| `io_uring` completion | ~500 ns–1 µs | Depends on ring size and kernel version |
| Context switch (between threads) | ~1–3 µs | Includes TLB flush on some CPUs |
| Context switch (between processes) | ~3–10 µs | Full TLB + address space switch |

### Network & I/O

| Operation | Latency | Notes |
|---|---|---|
| ef_vi poll + RX (kernel bypass) | ~80 ns | Solarflare, data already in hugepage buffers |
| ef_vi TX doorbell + DMA | ~80 ns | NIC sends from pre-mapped buffer |
| DPDK RX poll | ~100–200 ns | Depends on NIC and PMD driver |
| Loopback (`127.0.0.1` UDP round-trip) | ~10 µs | Traverses full kernel stack both ways |
| NIC-to-NIC (same machine, kernel) | ~20–50 µs | Kernel UDP path |
| NIC-to-NIC (same switch, kernel) | ~30–80 µs | Includes switch forwarding |
| Switch forwarding (cut-through) | ~100–200 ns | Per hop, depends on switch ASIC |
| TCP `connect()` + handshake (localhost) | ~30 µs | SYN→SYN-ACK→ACK |
| NVMe SSD write (4 KB) | ~10–20 µs | Intel Optane: ~7 µs |
| HDD random read | ~5,000–10,000 µs | Seek + rotation, for reference only |

### Financial Infrastructure

| Operation | Latency | Notes |
|---|---|---|
| CME Globex matching engine | ~1–5 µs | Exchange internal processing |
| CME co-located wire-to-wire (competitive) | ~1–2 µs | Top-tier firm, kernel bypass |
| CME Aurora fiber + switches (one-way) | ~460 ns | 33m fiber + 3 switch hops |
| NYSE Arca matching engine | ~50–150 µs | Slower than CME |
| Crypto exchange (Binance API) | ~1–10 ms | REST/WebSocket, WAN latency |
| JSON parse (small FIX-like msg) | ~500 ns–2 µs | Serde, depends on message size |
| SBE decode (struct overlay) | ~5–15 ns | Zero-copy, no allocation |
| FIX tag-value parse | ~200–500 ns | Sequential scan for delimiters |

---

## A.2 FIX Protocol Tag Reference (Common Tags)

The **Financial Information eXchange (FIX)** protocol is the industry standard for electronic trading communication. These are the most commonly used FIX tags (FIX 4.2/4.4/5.0).

### Session-Level Tags

| Tag | Name | Values / Notes |
|---|---|---|
| **8** | BeginString | `FIX.4.2`, `FIX.4.4`, `FIXT.1.1` |
| **9** | BodyLength | Length of message body in bytes |
| **35** | MsgType | `A`=Logon, `0`=Heartbeat, `5`=Logout, `D`=NewOrderSingle, `8`=ExecutionReport |
| **49** | SenderCompID | Sender identifier |
| **56** | TargetCompID | Target identifier |
| **34** | MsgSeqNum | Message sequence number (gap detection) |
| **52** | SendingTime | `YYYYMMDD-HH:MM:SS.sss` (UTC) |
| **10** | CheckSum | 3-digit checksum (mod 256 of all bytes) |

### Order-Related Tags

| Tag | Name | Values / Notes |
|---|---|---|
| **11** | ClOrdID | Client-assigned order ID (unique per session) |
| **37** | OrderID | Exchange-assigned order ID |
| **38** | OrderQty | Quantity in contracts/shares |
| **40** | OrdType | `1`=Market, `2`=Limit, `3`=Stop, `4`=StopLimit |
| **44** | Price | Limit price |
| **54** | Side | `1`=Buy, `2`=Sell, `5`=SellShort |
| **55** | Symbol | Instrument symbol (e.g., `ESH5`) |
| **59** | TimeInForce | `0`=Day, `1`=GTC, `3`=IOC, `4`=FOK |
| **60** | TransactTime | Time of order event |

### Execution Report Tags

| Tag | Name | Values / Notes |
|---|---|---|
| **17** | ExecID | Exchange-assigned execution ID |
| **20** | ExecTransType | `0`=New, `1`=Cancel, `2`=Correct |
| **39** | OrdStatus | `0`=New, `1`=PartialFill, `2`=Filled, `4`=Canceled, `8`=Rejected |
| **150** | ExecType | `0`=New, `1`=PartialFill, `2`=Fill, `4`=Canceled, `8`=Rejected, `F`=Trade |
| **14** | CumQty | Total quantity filled so far |
| **151** | LeavesQty | Remaining quantity |
| **31** | LastPx | Price of last fill |
| **32** | LastQty | Quantity of last fill |
| **6** | AvgPx | Average fill price |

### Market Data Tags

| Tag | Name | Values / Notes |
|---|---|---|
| **262** | MDReqID | Market data request ID |
| **263** | SubscriptionRequestType | `0`=Snapshot, `1`=Snapshot+Updates, `2`=Unsubscribe |
| **269** | MDEntryType | `0`=Bid, `1`=Offer, `2`=Trade, `4`=OpeningPrice, `5`=ClosingPrice |
| **270** | MDEntryPx | Price |
| **271** | MDEntrySize | Quantity |
| **273** | MDEntryTime | Time of market data event |

### Example FIX New Order Single

```
8=FIX.4.4|9=176|35=D|49=SENDER|56=TARGET|34=42|52=20250101-14:30:00.123|
11=ORD-001|55=ESH5|54=1|38=10|40=2|44=5025.50|59=0|60=20250101-14:30:00.123|
10=087|
```

*(Pipe `|` shown for readability; actual delimiter is SOH `\x01`)*

---

## A.3 Kernel Tuning Boot Parameters

These Linux kernel boot parameters are critical for deterministic, low-latency performance.

### Core Isolation & Scheduling

| Parameter | Example Value | Effect |
|---|---|---|
| `isolcpus` | `2,3,4,5` | Remove cores from the general scheduler. Only tasks explicitly affined to these cores will run there. |
| `nohz_full` | `2,3,4,5` | Disable the periodic timer tick on these cores (adaptive-ticks / tickless mode). Eliminates ~4µs jitter every 1ms. |
| `rcu_nocbs` | `2,3,4,5` | Offload RCU callbacks from these cores to housekeeping cores. Prevents random ~1–10µs stalls from RCU grace periods. |
| `nosoftlockup` | (no value) | Disable soft lockup detector. Prevents the watchdog from complaining about busy-polling threads that hold a core at 100% for seconds. |

### CPU Power Management

| Parameter | Example Value | Effect |
|---|---|---|
| `intel_pstate=disable` | (no value) | Disable Intel P-state driver. Prevents frequency scaling. Fix frequency via `cpupower frequency-set -g performance`. |
| `processor.max_cstate=0` | `0` | Disable all C-states (idle sleep states). Core stays at C0 (active) always. Prevents ~10–100µs wakeup latency from C1/C6 states. |
| `intel_idle.max_cstate=0` | `0` | Same as above but targets the `intel_idle` driver specifically. Both parameters should be set. |

### Memory Management

| Parameter | Example Value | Effect |
|---|---|---|
| `hugepagesz=1G` | `1G` | Reserve 1 GB hugepages (fewest TLB entries needed). |
| `hugepages=4` | `4` | Number of 1 GB hugepages to reserve at boot. Must be reserved at boot; cannot be reliably allocated later. |
| `default_hugepagesz=1G` | `1G` | Default hugepage size for mmap with `MAP_HUGETLB`. |
| `transparent_hugepage=never` | `never` | Disable THP. THP causes non-deterministic latency spikes (~50–200µs) when the kernel compacts/splits pages in the background. |

### Clock & Timing

| Parameter | Example Value | Effect |
|---|---|---|
| `tsc=reliable` | (no value) | Tell the kernel the TSC is reliable and invariant. Prevents fallback to slower clock sources (HPET, ACPI PM timer). |
| `clocksource=tsc` | `tsc` | Force TSC as the kernel clocksource. |

### Security & Audit Overhead

| Parameter | Example Value | Effect |
|---|---|---|
| `audit=0` | `0` | Disable kernel audit subsystem. Saves ~100–500ns per syscall in audit overhead. |
| `selinux=0` | `0` | Disable SELinux. Saves per-syscall security checks. |
| `mce=ignore_ce` | (no value) | Ignore corrected machine check exceptions. Prevents sporadic ~1ms stalls from corrected ECC errors being logged. |

### Network

| Parameter | Example Value | Effect |
|---|---|---|
| `iommu=pt` | `pt` | IOMMU passthrough mode. Required for DPDK/ef_vi DMA. `pt` = passthrough (no translation overhead). |
| `intel_iommu=on` | (no value) | Enable Intel VT-d IOMMU for device isolation (used with `iommu=pt`). |

### Complete Example GRUB Line

```bash
GRUB_CMDLINE_LINUX="isolcpus=2,3,4,5 nohz_full=2,3,4,5 rcu_nocbs=2,3,4,5 \
  nosoftlockup tsc=reliable clocksource=tsc \
  hugepagesz=1G hugepages=4 default_hugepagesz=1G transparent_hugepage=never \
  intel_pstate=disable processor.max_cstate=0 intel_idle.max_cstate=0 \
  mce=ignore_ce audit=0 selinux=0 \
  iommu=pt intel_iommu=on"
```

---

## A.4 BIOS Settings for Low-Latency Systems

These settings must be configured in the server BIOS/UEFI before operating system installation.

| Setting | Recommended Value | Why |
|---|---|---|
| **Hyper-Threading** | Disabled | Eliminates L1/L2 contention between sibling threads. One physical core = one thread, deterministic. |
| **C-States** | All disabled (C0 only) | Prevents sleep-state wakeup latency. Belt-and-suspenders with kernel boot params. |
| **P-States / SpeedStep** | Disabled or locked to max | Fixed frequency prevents voltage/frequency transition latency. |
| **Turbo Boost** | Disabled (controversial) | Turbo can cause frequency fluctuation when thermal limits are hit, creating jitter. Some firms leave turbo ON with aggressive cooling. |
| **NUMA Interleaving** | Disabled | You want NUMA-local allocation, not interleaved. Interleaving spreads data across sockets = inconsistent latency. |
| **Intel VT-d (IOMMU)** | Enabled | Required for kernel bypass NICs (ef_vi, DPDK) to do DMA safely. |
| **Hardware Prefetcher** | Keep enabled (usually) | Streaming prefetch helps sequential packet processing. Disable only if profiling shows it hurts your specific workload. |
| **Memory Frequency** | Max supported (e.g., 3200 MHz) | Lower DRAM latency and higher bandwidth. |
| **Memory Interleave** | Channel interleave = max | Spreads memory across channels for bandwidth, but within the same NUMA node. |
| **PCIe Max Link Speed** | Gen 4 or max | Ensures NIC DMA operates at maximum bandwidth. |

---

## A.5 Essential Commands Cheat Sheet

### CPU & NUMA Topology

```bash
# Show NUMA topology
numactl --hardware

# Show CPU topology (cores, sockets, caches)
lscpu

# Show which cores are isolated
cat /sys/devices/system/cpu/isolated

# Show C-state residency
cat /sys/devices/system/cpu/cpu*/cpuidle/state*/time

# Disable turbo boost at runtime
echo 1 > /sys/devices/system/cpu/intel_pstate/no_turbo
```

### Memory & Hugepages

```bash
# Check hugepage allocation
cat /proc/meminfo | grep -i huge

# Allocate 2MB hugepages at runtime
echo 1024 > /proc/sys/vm/nr_hugepages

# Mount hugetlbfs
mount -t hugetlbfs none /dev/hugepages

# Check NUMA-local hugepage allocation
cat /sys/devices/system/node/node0/hugepages/hugepages-1048576kB/nr_hugepages
```

### Network & NIC Tuning

```bash
# Check NIC ring buffer sizes
ethtool -g eth0

# Maximize ring buffers
ethtool -G eth0 rx 4096 tx 4096

# Disable interrupt coalescing (lower latency, more CPU)
ethtool -C eth0 rx-usecs 0 tx-usecs 0

# Set IRQ affinity for NIC to core 1
echo 2 > /proc/irq/<irq_num>/smp_affinity  # bitmask: core 1

# Check current IRQ affinity
cat /proc/irq/<irq_num>/smp_affinity

# Disable TCP Nagle's algorithm (per-socket, in code)
# setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &1, sizeof(int));
```

### Process Pinning & Priority

```bash
# Pin process to cores 2,3
taskset -c 2,3 ./my_process

# Set SCHED_FIFO priority 99
chrt -f 99 ./my_process

# Pin + FIFO priority in one line
chrt -f 99 taskset -c 2 ./trading_strategy

# Check scheduling policy of running process
chrt -p <pid>
```

### Profiling & Measurement

```bash
# Count syscalls
strace -c ./my_process

# Trace specific syscalls with timestamps
strace -e trace=recvfrom,sendto -T ./my_process

# perf: sample CPU events
perf stat -e cycles,instructions,cache-misses ./my_process

# perf: record + flamegraph
perf record -g -F 99 ./my_process
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg

# BPF: trace kernel function latency
bpftrace -e 'kprobe:tcp_sendmsg { @start[tid] = nsecs; }
             kretprobe:tcp_sendmsg /@start[tid]/ {
               @ns = hist(nsecs - @start[tid]);
               delete(@start[tid]);
             }'
```
