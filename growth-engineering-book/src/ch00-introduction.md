# Growth Engineering: Building Data-Driven Products at Scale

## Speaker Intro

- **Principal Growth Engineer** with 15+ years building experimentation platforms, telemetry pipelines, and monetization engines at three hypergrowth companies (peak scale: 400M MAU, 2B+ events/day).
- Former tech lead for the experimentation platform at a top-5 consumer marketplace; designed the A/B testing infrastructure that powered 3,000+ concurrent experiments across 40 product teams.
- Built the feature flagging and progressive rollout system that reduced P0 incidents from new features by 87% while increasing deployment frequency 4×.
- Architected the event telemetry pipeline processing 50TB/day of structured business events through Kafka, Flink, and BigQuery with < 0.001% event loss.
- Believes that **shipping without measurement is just guessing with extra steps**—and that the difference between a 10× engineer and a 100× engineer is the ability to *prove* that their code moved a business metric.

> **This book is the guide I wish existed when I transitioned from "backend engineer who adds analytics tags" to "growth engineer who designs systems where every feature is an experiment."** It covers the infrastructure, statistics, and architectural patterns that separate companies that *think* they're data-driven from companies that actually *are*.

---

## Who This Is For

This book is designed for:

- **Product engineers** who ship features but have no visibility into whether those features actually improve activation, retention, or revenue.
- **Backend and fullstack developers** who want to understand how experimentation platforms like LaunchDarkly, Statsig, or Eppo work under the hood—and how to build one.
- **Platform engineers** tasked with building internal feature flagging, telemetry, or A/B testing infrastructure for their organization.
- **Tech leads and staff engineers** who need to make the case for investing in experimentation infrastructure and want to understand the ROI math.
- **Data engineers** who build pipelines but want to understand the upstream event design decisions that determine whether their warehouse data is trustworthy.

If you've ever shipped a feature, waited two weeks, then asked "did it work?" and gotten a shrug from the data team—this book is for you.

---

## Prerequisites

| Concept | Where to learn it |
|---|---|
| Rust ownership, borrowing, lifetimes | [Rust Memory Management](../memory-management-book/src/SUMMARY.md) |
| Async Rust with Tokio | [Async Rust](../async-book/src/SUMMARY.md) |
| HTTP service development (axum) | [Rust Microservices](../microservices-book/src/SUMMARY.md) |
| Basic statistics (mean, variance, distributions) | Khan Academy Statistics or *Naked Statistics* by Wheelan |
| JSON / Protocol Buffers serialization | Familiarity with `serde`, `serde_json`, or `prost` |
| Message queues (Kafka concepts) | Confluent's Kafka 101 course (free) |

---

## How to Use This Book

| Emoji | Meaning in this book |
|-------|------|
| 🟢 | **Foundation** — Core concepts every growth engineer must internalize. Metrics literacy and event design. |
| 🟡 | **Applied Infrastructure** — Building the systems that power experimentation and controlled releases. |
| 🔴 | **Advanced Experimentation** — Statistical rigor, experimentation platforms, and capstone integration. |

Every chapter follows a consistent structure:

1. **"What you'll learn"** — a concise list of outcomes.
2. **Core content** — with comparison tables, mermaid diagrams, and annotated code.
3. **"The Blind Way vs. The Data-Driven Way"** — naive code shown first (`// 💥 ANALYTICS HAZARD`), then the fix (`// ✅ FIX`).
4. **Exercise** — a hands-on growth engineering challenge with a hidden solution.
5. **Key Takeaways** — the non-negotiable lessons.
6. **See also** — cross-references to related material.

---

## Pacing Guide

| Chapters | Topic | Time | Checkpoint |
|----------|-------|------|------------|
| 0 | Introduction & Setup | 0.5 hours | Environment ready |
| 1 | Event-Driven Analytics | 2–3 hours | Can design a typed event schema |
| 2 | The Data Pipeline | 2–3 hours | Understand end-to-end event flow |
| 3 | Feature Flags Architecture | 3–4 hours | Can build a flag evaluation engine |
| 4 | The Rollout Strategy | 2–3 hours | Can implement canary + kill switches |
| 5 | A/B Testing Infrastructure | 4–5 hours | Can build deterministic assignment |
| 6 | Statistical Significance | 3–4 hours | Can calculate sample size and detect peeking |
| 7 | Capstone: Dynamic Paywall | 6–8 hours | Full system integration |
| A | Reference Card | — | Desk reference |

**Total: ~24–30 hours for the complete curriculum.**

---

## Table of Contents

### Part I — Telemetry and The Source of Truth

The foundation. Before you can experiment, you need trustworthy data. These chapters establish the event-driven architecture and pipeline infrastructure that make every subsequent chapter possible.

- **Chapter 1: Event-Driven Analytics 🟢** — Moving beyond page views. Designing a strict, strongly-typed tracking schema. Operational vs. Business metrics.
- **Chapter 2: The Data Pipeline 🟡** — How events travel from client to warehouse. Ad-blocker resilience, exactly-once processing, and data quality validation.

### Part II — Controlling the Release

Decoupling *deployment* from *release* is the single most important operational pattern for growth teams. These chapters build the feature flag infrastructure that enables safe, targeted, measurable rollouts.

- **Chapter 3: Feature Flags Architecture 🟡** — Designing a low-latency evaluation engine. Boolean vs. multivariate flags. Context-based targeting.
- **Chapter 4: The Rollout Strategy 🟡** — Canary releases, dark launches, percentage rollouts. Automatic kill switches tied to operational metrics.

### Part III — The Science of Experimentation

Where business intuition meets statistical rigor. These chapters build the A/B testing platform and teach you the statistics you need to avoid the traps that invalidate most experiments.

- **Chapter 5: A/B Testing Infrastructure 🔴** — Consistent hashing for user assignment. Avoiding the flicker effect. Experiment lifecycle management.
- **Chapter 6: Statistical Significance and Pitfalls 🔴** — P-values, MDE, sample sizes, the peeking problem, and Simpson's Paradox.

### Part IV — Capstone

- **Chapter 7: Capstone: The Dynamic Paywall Engine 🔴** — Build a complete data-driven monetization system integrating feature flags, A/B testing, typed telemetry, and statistical analysis.

### Appendices

- **Appendix A: Growth Engineering Reference Card** — Cheat sheet for event naming, statistical formulas, and feature flag best practices.

---

```mermaid
graph LR
    A["🟢 Ch 1: Event Analytics"] --> B["🟡 Ch 2: Data Pipeline"]
    B --> C["🟡 Ch 3: Feature Flags"]
    C --> D["🟡 Ch 4: Rollout Strategy"]
    D --> E["🔴 Ch 5: A/B Testing"]
    E --> F["🔴 Ch 6: Statistics"]
    F --> G["🔴 Ch 7: Capstone"]

    style A fill:#4CAF50,color:#fff
    style B fill:#FF9800,color:#fff
    style C fill:#FF9800,color:#fff
    style D fill:#FF9800,color:#fff
    style E fill:#f44336,color:#fff
    style F fill:#f44336,color:#fff
    style G fill:#f44336,color:#fff
```

---

## Companion Guides

This book is part of the Rust Training series. Related material:

- [Rust Microservices: Axum, Tonic, Tower, and SQLx](../microservices-book/src/SUMMARY.md) — Build the HTTP services that serve experiments.
- [Async Rust: From Futures to Production](../async-book/src/SUMMARY.md) — The async runtime powering high-throughput event pipelines.
- [Enterprise Rust: OpenTelemetry, Security, and Supply Chain Hygiene](../enterprise-rust-book/src/SUMMARY.md) — Operational observability that complements business telemetry.
- [Rust API Design & Error Architecture](../api-design-book/src/SUMMARY.md) — Design the typed APIs that power your tracking SDK.
