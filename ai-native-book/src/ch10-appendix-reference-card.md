# Appendix A: Summary & Reference Card

> A quick-reference cheat sheet for the AI-native product engineer. Print it, bookmark it, tape it to your monitor.

---

## 🗺️ The AI-Native Pipeline (Memorize This)

```mermaid
flowchart LR
    A["1. PRD<br/>(Ch 1)"] --> B["2. Schema<br/>(Ch 4)"]
    B --> C["3. Types<br/>(Ch 3–4)"]
    C --> D["4. Tests<br/>(Ch 5)"]
    D --> E["5. AI Impl<br/>(Ch 2,5)"]
    E --> F["6. CI/CD<br/>(Ch 7)"]
    F --> G["7. Deploy<br/>(Ch 6)"]
    G --> H["8. Observe<br/>(Ch 8)"]
    
    style A fill:#22c55e,color:#fff
    style B fill:#22c55e,color:#fff
    style C fill:#eab308,color:#000
    style D fill:#eab308,color:#000
    style E fill:#eab308,color:#000
    style F fill:#ef4444,color:#fff
    style G fill:#ef4444,color:#fff
    style H fill:#ef4444,color:#fff
```

**The rule:** Each step constrains the next. The AI never sees an unbounded problem.

---

## 📝 One-Page PRD Template

```markdown
# PRD: [Product Name] — v0.1 MVP

## Problem (2–3 sentences)
[Who] has [problem] because [root cause].

## Solution (1 sentence)
[Product] lets [who] do [what] so they [outcome].

## User Stories (max 5)
1. As a [role], I want to [action] so that [benefit].

## Non-Goals
- NOT building: [list features you're cutting]

## Success Metric
[1 number] reaches [target] within [timeframe].

## Technical Constraints
- Stack: [framework, database, hosting]
```

---

## 🤖 Effective AI Prompt Templates

### Schema Generation

```
Given these business rules, generate a PostgreSQL DDL schema with
NOT NULL constraints, foreign keys, CHECK constraints, appropriate
indexes, and created_at/updated_at timestamps:

[paste business rules]
```

### Implementation (Constraint Sandwich)

```
Given the interface in @file:[interface.ts] and the tests in
@file:[test.ts], implement the function in @file:[impl.ts].
All tests must pass.
```

### Refactoring

```
Extract [specific logic] from @file:[source.ts] into a new
[class/function] that implements @file:[interface.ts].
Do not change the public API of the source file.
```

### Debugging

```
I'm seeing: [paste full error + stack trace]
Relevant code: @file:[file.ts]
Schema: @file:[schema.prisma]
Last working commit: [hash]
What changed: @git:[hash]
Root cause and fix?
```

---

## 🧱 The "Ship It" Stack Cheat Sheet

### TypeScript (Recommended for most MVPs)

| Layer | Tool |
|-------|------|
| Framework | Next.js 14+ (App Router) |
| ORM | Prisma or Drizzle |
| Database | PostgreSQL (Supabase / Neon) |
| Auth | NextAuth.js v5 / Supabase Auth |
| Deploy | Vercel / Railway |
| CSS | Tailwind |
| Testing | Vitest + Testcontainers |

### Rust (High-performance APIs)

| Layer | Tool |
|-------|------|
| Framework | Axum 0.8 + Tower |
| Database | SQLx (compile-time checked) |
| Database Engine | PostgreSQL |
| Deploy | Fly.io / Railway |
| Testing | cargo test + testcontainers-rs |

---

## ✅ CI/CD Pipeline Template (GitHub Actions)

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: pnpm }
      - run: corepack enable && pnpm install --frozen-lockfile
      - run: pnpm prettier --check .        # Format
      - run: pnpm eslint . --max-warnings 0 # Lint
      - run: pnpm tsc --noEmit              # Types
      - run: pnpm prisma migrate deploy     # Migrations
        env: { DATABASE_URL: "postgresql://postgres:test@localhost:5432/test" }
      - run: pnpm vitest run                # Tests
      - run: pnpm build                     # Build

  deploy:
    needs: check
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
```

---

## 🔍 Hallucination Detection Checklist

Run after *every* AI code generation:

| # | Check | Command |
|:-:|-------|---------|
| 1 | Types pass | `tsc --noEmit` / `cargo check` |
| 2 | Tests pass | `vitest run` / `cargo test` |
| 3 | Deps are real | Verify on npm/crates.io |
| 4 | Deps are current | `npm outdated` / `cargo outdated` |
| 5 | No `any` types | `grep -r ": any" src/` |
| 6 | No deprecated APIs | Check library changelogs |
| 7 | SQL is parameterized | No string concatenation in queries |

---

## 📊 Merge Confidence Score

| Check | Points |
|-------|:---:|
| CI all green | +30 |
| Type checker passes | +15 |
| Test coverage for new code | +15 |
| Dependencies verified | +10 |
| Migration reviewed | +10 |
| Human code review | +10 |
| Preview deployment tested | +10 |
| **Ship threshold** | **≥ 70** |

---

## 🚀 Production Readiness Pre-Launch Checklist

### Infrastructure
- [ ] Database backed up (automated daily)
- [ ] Secrets in secret manager (not in code/env files)
- [ ] HTTPS enforced
- [ ] Health check endpoint responds
- [ ] Auto-scaling or auto-restart configured

### Observability
- [ ] Structured logging (JSON, not printf)
- [ ] OpenTelemetry traces for HTTP + DB + external APIs
- [ ] P1 alert: service down (< 2 min detection)
- [ ] P2 alert: error rate > 10%
- [ ] P2 alert: p99 latency > threshold

### Security
- [ ] No secrets in source control
- [ ] API authentication enforced
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] CORS configured (restrict to known origins)
- [ ] Dependencies audited (`npm audit` / `cargo audit`)

### Deployment
- [ ] CI/CD pipeline passing on main
- [ ] Preview deployments for PRs
- [ ] Database migrations versioned and reviewed
- [ ] Rollback plan documented (how to revert last deploy)

---

## 🗓️ The Ruthless Cut Decision Filter

For every feature:

1. Does it solve the core problem? → No → **CUT**
2. Can users get value without it? → Yes → **CUT (add to v1.1)**
3. Can you ship it in < 1 day? → No → **SIMPLIFY until you can**
4. Passes all 3? → **KEEP — it's MVP**

---

## 📚 Quick Reference: Key Concepts by Chapter

| Chapter | Core Concept | One-Line Summary |
|:---:|------|------|
| 1 | Scope Discipline | Cut features until your MVP fits in one sprint |
| 2 | Context Management | `@codebase` + `.cursorrules` = 10× AI accuracy |
| 3 | Boring Technology | Monolith + Postgres. Always. Until you have proof otherwise. |
| 4 | Schema-First | Database constraints → ORM types → compile-time guarantees |
| 5 | Red-Green-AI | You write tests, AI writes implementation |
| 6 | IaC | If it's not in version control, it doesn't exist |
| 7 | CI/CD | AI code needs *more* gates, not fewer |
| 8 | Observability | Traces > Metrics > Logs. Instrument the boundaries. |
| 9 | Capstone | PRD → Schema → Types → Tests → AI → Deploy → Observe |

---

> **Final thought:** The AI-native product engineer's competitive advantage is not coding speed. It's the discipline to define tight boundaries and let the machine do the rest. The engineer who ships isn't the one who writes the most code — it's the one who writes the best constraints.
