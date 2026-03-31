# Chapter 10: Appendix — Reference Card 📇

> A pocket reference for the key concepts covered in this book. Print it, bookmark it, tape it to your monitor.

---

## Linux Namespaces

| Namespace | Flag | Isolates | `ls` command |
|---|---|---|---|
| **PID** | `CLONE_NEWPID` | Process IDs — PID 1 inside container is unique to namespace | `ls -la /proc/[pid]/ns/pid` |
| **Mount** | `CLONE_NEWNS` | Filesystem mount points — container sees its own `/` | `ls -la /proc/[pid]/ns/mnt` |
| **Network** | `CLONE_NEWNET` | Network stack — interfaces, routes, iptables, sockets | `ls -la /proc/[pid]/ns/net` |
| **UTS** | `CLONE_NEWUTS` | Hostname and domain name | `ls -la /proc/[pid]/ns/uts` |
| **IPC** | `CLONE_NEWIPC` | SysV IPC, POSIX message queues, shared memory | `ls -la /proc/[pid]/ns/ipc` |
| **User** | `CLONE_NEWUSER` | UIDs/GIDs — root inside container ≠ root on host | `ls -la /proc/[pid]/ns/user` |
| **Cgroup** | `CLONE_NEWCGROUP` | Cgroup root directory — container sees `/sys/fs/cgroup` as its own | `ls -la /proc/[pid]/ns/cgroup` |
| **Time** | `CLONE_NEWTIME` | `CLOCK_MONOTONIC` and `CLOCK_BOOTTIME` offsets (Linux 5.6+) | `ls -la /proc/[pid]/ns/time` |

---

## Cgroups v2 Controllers

| Controller | Resource | Key Files | Example |
|---|---|---|---|
| **cpu** | CPU time | `cpu.max`, `cpu.weight` | `echo "100000 100000" > cpu.max` (100% of 1 core) |
| **memory** | Memory (RAM) | `memory.max`, `memory.current`, `memory.swap.max` | `echo "512M" > memory.max` |
| **io** | Block I/O | `io.max`, `io.weight` | `echo "8:0 rbps=1048576" > io.max` |
| **pids** | Process count | `pids.max`, `pids.current` | `echo 100 > pids.max` |
| **cpuset** | CPU/memory affinity | `cpuset.cpus`, `cpuset.mems` | `echo "0-3" > cpuset.cpus` |
| **hugetlb** | Huge pages | `hugetlb.2MB.max` | `echo "4" > hugetlb.2MB.max` |

---

## Kubernetes QoS Classes

| QoS Class | Scheduling Condition | Eviction Priority | OOM Score Adj |
|---|---|---|---|
| **Guaranteed** | Every container has `requests == limits` for both CPU and memory | Last to be evicted (lowest priority for eviction) | -997 |
| **Burstable** | At least one container has `requests` set, but `requests < limits` or not all containers have limits | Medium priority for eviction | 2 to 999 (proportional to request/node ratio) |
| **BestEffort** | No container has any `requests` or `limits` set | First to be evicted (highest priority for eviction) | 1000 |

### QoS Decision Tree

```
                    All containers have
                    requests == limits?
                   /                     \
                YES                      NO
                 |                        |
           Guaranteed              Any container has
                                   requests or limits?
                                  /                   \
                               YES                    NO
                                |                      |
                           Burstable              BestEffort
```

---

## eBPF Map Types

| Map Type | Description | Max Entries | Use Case |
|---|---|---|---|
| `BPF_MAP_TYPE_HASH` | Generic hash table | Configurable | Connection tracking, per-flow state |
| `BPF_MAP_TYPE_ARRAY` | Fixed-size array (integer key) | Configurable | Per-CPU counters, lookup tables |
| `BPF_MAP_TYPE_LRU_HASH` | Hash with LRU eviction | Configurable | Flow metrics (auto-evict stale flows) |
| `BPF_MAP_TYPE_RINGBUF` | Lock-free ring buffer to user space | Size in bytes | Export events to Hubble, perf tools |
| `BPF_MAP_TYPE_PERCPU_HASH` | Per-CPU hash table (no lock contention) | Configurable | High-throughput per-CPU counters |
| `BPF_MAP_TYPE_PERCPU_ARRAY` | Per-CPU array | Configurable | Statistics aggregation per CPU |
| `BPF_MAP_TYPE_LPM_TRIE` | Longest-prefix match trie | Configurable | CIDR-based routing / policy lookups |
| `BPF_MAP_TYPE_PROG_ARRAY` | Array of eBPF program fds (tail calls) | Configurable | Chain multiple eBPF programs |
| `BPF_MAP_TYPE_STACK_TRACE` | Capture kernel/user stack traces | Configurable | Profiling, flamegraphs |
| `BPF_MAP_TYPE_SOCKHASH` | Socket-level hash map | Configurable | Socket-level load balancing (sk_msg) |

---

## eBPF Hook Points

| Hook Type | Attach Point | Use Case | Cilium Usage |
|---|---|---|---|
| **TC (Traffic Control)** | `tc ingress` / `tc egress` on network interfaces | Packet filtering, modification, redirect | Primary data path for pod traffic |
| **XDP (eXpress Data Path)** | NIC driver (before `sk_buff` allocation) | Ultra-fast packet drop/redirect (DDoS, LB) | Cilium XDP acceleration (NodePort, DSR) |
| **Kprobe / Kretprobe** | Any kernel function entry/exit | Tracing, observability | Hubble (tracing syscalls) |
| **Tracepoint** | Static kernel trace points | Low-overhead tracing | TCP retransmit tracing |
| **Socket ops** | TCP socket events (connect, accept, close) | Connection tracking, socket-level LB | Cilium socket-based LB |
| **Cgroup** | Cgroup-level socket/bind/connect | Per-cgroup network policy | Cilium host firewall |
| **LSM (Linux Security Module)** | Security hooks (file open, mmap, exec) | Mandatory access control | Tetragon (runtime security) |

---

## Kubernetes Control Plane Ports

| Component | Port | Protocol | Purpose |
|---|---|---|---|
| kube-apiserver | 6443 | HTTPS | API server (all clients) |
| etcd | 2379 | HTTPS | Client API (apiserver → etcd) |
| etcd | 2380 | HTTPS | Peer communication (etcd ↔ etcd) |
| kubelet | 10250 | HTTPS | kubelet API (exec, logs, metrics) |
| kube-scheduler | 10259 | HTTPS | Health/metrics endpoint |
| kube-controller-manager | 10257 | HTTPS | Health/metrics endpoint |
| kube-proxy | 10256 | HTTP | Health endpoint |
| CoreDNS | 53 | UDP/TCP | Cluster DNS |
| Cilium Agent | 4240 | HTTP | Health endpoint |
| Cilium Agent | 4244 | TCP | Hubble peer API |
| Hubble Relay | 4245 | gRPC | Hubble Relay API |

---

## CNI Plugin Comparison

| Plugin | Data Path | Routing Mode | Encryption | Network Policy Engine | Best For |
|---|---|---|---|---|---|
| **Cilium** | eBPF | Native routing, VXLAN, or GENEVE | WireGuard | eBPF (L3-L7) | Production clusters, eBPF observability |
| **Calico** | iptables or eBPF | BGP (native) or VXLAN overlay | WireGuard | iptables or eBPF | On-prem, BGP peering, large clusters |
| **Flannel** | VXLAN overlay | VXLAN only | None | None (use separate policy engine) | Simple clusters, learning, lightweight |
| **AWS VPC CNI** | VPC native | VPC routing (ENIs) | VPC encryption | Security Groups for Pods | EKS clusters (VPC-native) |
| **Weave Net** | VXLAN / fast datapath | Mesh overlay | IPsec (NaCl) | Built-in | Small clusters, simplicity |

---

## Operator SDK / kube-rs Quick Reference

### Kubebuilder (Go) Scaffolding

```bash
kubebuilder init --domain company.io --repo github.com/company/my-operator
kubebuilder create api --group apps --version v1 --kind MyResource
make manifests    # Generate CRD YAML from Go types
make install      # Install CRDs into cluster
make run          # Run operator locally
```

### kube-rs (Rust) Minimal Controller

```rust
use kube::{Api, Client, runtime::controller::{Action, Controller}};
use std::sync::Arc;
use tokio::time::Duration;

async fn reconcile(obj: Arc<MyResource>, ctx: Arc<Context>) -> Result<Action, Error> {
    // Your reconciliation logic here
    Ok(Action::requeue(Duration::from_secs(300)))
}

fn error_policy(obj: Arc<MyResource>, err: &Error, _ctx: Arc<Context>) -> Action {
    Action::requeue(Duration::from_secs(60))
}

// In main():
Controller::new(api, watcher::Config::default())
    .run(reconcile, error_policy, ctx)
    .for_each(|res| async move { /* handle */ })
    .await;
```

---

## Essential `kubectl` Commands for Debugging

| Category | Command | Purpose |
|---|---|---|
| **Pod debugging** | `kubectl get pods -o wide` | Show pod IP, node, status |
| | `kubectl describe pod <name>` | Events, conditions, scheduling reasons |
| | `kubectl logs <pod> -c <container> --previous` | Logs from crashed container |
| | `kubectl debug -it <pod> --image=nicolaka/netshoot` | Ephemeral debug container |
| **Node debugging** | `kubectl describe node <name>` | Allocatable resources, conditions, taints |
| | `kubectl top nodes` | Real-time CPU/memory usage |
| | `kubectl get events --sort-by=.lastTimestamp` | Cluster events timeline |
| **Network debugging** | `kubectl exec -it <pod> -- nslookup kubernetes` | Test DNS resolution |
| | `kubectl exec -it <pod> -- curl -v <service>:8080` | Test service connectivity |
| | `kubectl get endpoints <service>` | Verify service → pod mapping |
| **CRD / Operator** | `kubectl get crd` | List all Custom Resource Definitions |
| | `kubectl describe crd <name>` | CRD schema, versions, status |
| | `kubectl get <resource> -o yaml` | Inspect custom resource spec + status |
| **Cilium** | `cilium status` | Cilium agent health |
| | `cilium connectivity test` | End-to-end network connectivity test |
| | `hubble observe --follow` | Live network flow stream |

---

## Kubernetes Scaling Reference Numbers

| Limit | Value | Source |
|---|---|---|
| Max nodes per cluster | 5,000 | K8s SIG-Scalability |
| Max pods per node | 110 (default) | kubelet `--max-pods` |
| Max pods per cluster | 150,000 | K8s SIG-Scalability |
| Max services per cluster | 10,000 | K8s SIG-Scalability |
| Max namespaces per cluster | 10,000 | K8s SIG-Scalability |
| etcd max recommended size | 8 GB | etcd docs |
| etcd recommended max request size | 1.5 MB | etcd default |
| API server SLO: mutating requests | p99 < 1 second | K8s SIG-Scalability |
| API server SLO: non-mutating requests | p99 < 30 seconds (for LIST of 5000 objects) | K8s SIG-Scalability |
| Scheduler throughput | ~100 pods/second | K8s SIG-Scheduling |

---

> **Tip:** Bookmark this appendix. It's the quickest way to look up the detail you need during incident response or system design interviews.
