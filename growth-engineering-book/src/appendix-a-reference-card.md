# Appendix A: Growth Engineering Reference Card

> A quick-reference cheat sheet for the core patterns, formulas, and conventions covered in this book.

---

## Event Naming Conventions

| Rule | Convention | Example |
|------|-----------|---------|
| **Format** | `Object_Action` (PascalCase, underscore separator) | `Paywall_Viewed` |
| **Object** | The noun being acted on | `Checkout`, `Feature`, `Referral` |
| **Action** | Past-tense verb describing what happened | `Started`, `Completed`, `Toggled` |
| **Namespace** | Optional prefix for large orgs | `Billing_Subscription_Created` |
| **Avoid** | Generic names like `click`, `event`, `track` | — |

### Standard Lifecycle Events

| Event Name | When to Fire |
|-----------|-------------|
| `Page_Viewed` | User navigates to a new page/screen |
| `Feature_Activated` | User exercises a gated feature for the first time |
| `Experiment_Exposed` | User is bucketed into an experiment and sees the variant |
| `Paywall_Viewed` | Paywall UI is rendered and visible to the user |
| `Checkout_Started` | User initiates checkout (clicks CTA) |
| `Subscription_Completed` | Payment confirmed (server-side only) |
| `Referral_Invite_Sent` | User sends a referral invitation |

---

## Statistical Formulas

### Sample Size (Two-Proportion z-Test)

$$n = \frac{(Z_{\alpha/2} + Z_\beta)^2 \cdot (p_1(1-p_1) + p_2(1-p_2))}{(p_2 - p_1)^2}$$

| Symbol | Meaning | Typical Value |
|--------|---------|--------------|
| $Z_{\alpha/2}$ | z-score for significance level | 1.96 (α = 0.05) |
| $Z_\beta$ | z-score for power | 0.84 (β = 0.80) |
| $p_1$ | Baseline conversion rate | Your current rate |
| $p_2$ | Expected conversion rate (baseline + MDE) | Target rate |
| $n$ | Required sample size **per variant** | — |

### z-Statistic (Two-Proportion Test)

$$z = \frac{\hat{p}_2 - \hat{p}_1}{\sqrt{\hat{p}(1-\hat{p})\left(\frac{1}{n_1}+\frac{1}{n_2}\right)}}$$

where $\hat{p} = \frac{x_1 + x_2}{n_1 + n_2}$ is the pooled proportion.

### Minimum Detectable Effect (MDE)

$$\text{MDE}_{\text{absolute}} = p_2 - p_1$$

$$\text{MDE}_{\text{relative}} = \frac{p_2 - p_1}{p_1} \times 100\%$$

**Rule of thumb:** If your baseline is 3%, a 10% relative MDE means detecting a lift to 3.3%.

### Viral Coefficient (k-Factor)

$$k = i \times c$$

| Symbol | Meaning |
|--------|---------|
| $i$ | Average invites sent per user |
| $c$ | Conversion rate of invites (acceptance rate) |

$k < 1$: Growth decays (sustainable only with paid acquisition).
$k = 1$: Self-sustaining.
$k > 1$: Viral (exponential, rare in B2B).

---

## Feature Flag Patterns

### Flag Types

| Type | Values | Use Case |
|------|--------|----------|
| **Boolean** | `true` / `false` | Kill switches, simple toggles |
| **String** | Any string | UI variants, config keys |
| **Integer** | Any i64 | Rate limits, pagination sizes |
| **JSON** | Arbitrary JSON | Complex experiment configs |
| **Multivariate** | One of N strings | A/B/C/D testing |

### Flag Lifecycle

```
Draft → Active → Ramping → Fully Rolled Out → Archived
                    ↓
                  Killed (emergency rollback)
```

### Deterministic Assignment

```rust
// SHA-256 hash produces stable assignment:
fn is_in_rollout(user_id: &str, flag_key: &str, pct: f64) -> bool {
    use sha2::{Sha256, Digest};
    let input = format!("{flag_key}:{user_id}");
    let hash = Sha256::digest(input.as_bytes());
    let value = u16::from_be_bytes([hash[0], hash[1]]);
    (value as f64 / 65535.0) < pct
}
```

**Properties:** Deterministic (same user → same result), uniform distribution, no database lookup required.

### Rollout Checklist

| Step | Gate | Percentage |
|------|------|-----------|
| 1 | Internal dogfood | 1% (employees only) |
| 2 | Canary ring | 5% |
| 3 | Early adopters | 25% |
| 4 | General availability | 50% → 100% |
| 5 | Cleanup | Remove flag, delete dead code |

---

## Data Pipeline Architecture

```
Client SDK → Edge API → Kafka → Stream Processor → Data Warehouse
                ↓                      ↓
          Event Buffer           Dead Letter Queue
       (IndexedDB/disk)            (failed events)
```

### Pipeline Guarantees

| Guarantee | How It's Achieved |
|-----------|------------------|
| **At-least-once delivery** | Client retries + persistent buffer |
| **Deduplication** | `event_id` (UUID v4) checked at ingestion |
| **Schema validation** | Rust types enforce structure at compile time |
| **Ad-blocker resilience** | First-party domain + server-side enrichment |
| **Ordering** | Kafka partition by `user_id` |

### Event Envelope

```rust
pub struct EventEnvelope<P: Serialize> {
    pub event_id: Uuid,        // Globally unique, for dedup
    pub event_name: String,    // Object_Action format
    pub timestamp: DateTime<Utc>,
    pub user_id: String,
    pub anonymous_id: Option<String>,
    pub session_id: Option<String>,
    pub payload: P,            // Strongly-typed per event
}
```

---

## A/B Testing Checklist

### Before Launch

- [ ] Define **one** primary metric and the MDE you want to detect
- [ ] Calculate sample size and expected run time
- [ ] Define **guardrail metrics** with max degradation thresholds
- [ ] Verify randomization produces balanced groups (AA test or chi-squared)
- [ ] Set up exposure logging (distinct from feature-flag evaluation)
- [ ] Decide on sequential testing vs. fixed-horizon
- [ ] Document the hypothesis and predicted direction

### During the Experiment

- [ ] Monitor guardrail metrics daily (p99 latency, error rate, revenue)
- [ ] Do NOT peek at primary metric results (unless using sequential testing)
- [ ] Sample Ratio Mismatch (SRM) check: are groups balanced within ±1%?
- [ ] Check for novelty effect (is the lift decaying over time?)

### After the Experiment

- [ ] Run the pre-planned statistical test at the pre-planned sample size
- [ ] Check for heterogeneous treatment effects (segment by country, platform)
- [ ] Verify no Simpson's Paradox (check sub-segments)
- [ ] Calculate practical significance (is the lift worth the complexity?)
- [ ] Document results, learnings, and next experiment ideas
- [ ] Ship or kill — never leave experiments running indefinitely

---

## Common Pitfalls Quick Reference

| Pitfall | What Goes Wrong | Prevention |
|---------|-----------------|-----------|
| **Peeking** | Inflated false positive rate (up to 30% at α=0.05) | Fixed-horizon or sequential testing with alpha spending |
| **Simpson's Paradox** | Aggregate results contradict segment results | Always check 2+ key segments |
| **Novelty Effect** | Initial lift that decays after 2-3 weeks | Run experiments for full business cycles |
| **Selection Bias** | Non-random exposure (triggered experiments) | Intent-to-treat analysis; log exposure at assignment |
| **Multiple Comparisons** | Testing 5 metrics at α=0.05 → 23% false positive | Bonferroni correction or designate one primary metric |
| **Survivorship Bias** | Only analyzing users who completed the funnel | Include all assigned users in denominator |
| **SRM** | Unbalanced groups due to implementation bugs | Automated SRM check (chi-squared test) |

---

## Rust Crate Reference

| Crate | Purpose | Used In |
|-------|---------|---------|
| `serde` / `serde_json` | Event serialization | Ch 1, 2, 7 |
| `chrono` | Timestamps | Ch 1, 2 |
| `uuid` | Event IDs | Ch 1, 2 |
| `sha2` | Deterministic hashing | Ch 3, 5, 7 |
| `tokio` | Async runtime | Ch 2, 4, 7 |
| `axum` | HTTP API | Ch 2, 5, 7 |
| `rdkafka` | Kafka producer/consumer | Ch 2 |
| `tracing` | Structured logging | Ch 2, 4, 5 |
| `dashmap` / `parking_lot` | Concurrent data structures | Ch 3 |
| `async-trait` | Async trait methods | Ch 4, 7 |
