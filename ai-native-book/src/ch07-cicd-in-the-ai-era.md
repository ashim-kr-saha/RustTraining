# 7. CI/CD in the AI Era 🔴

> **What you'll learn:**
> - How to set up a GitHub Actions pipeline that automates linting, type-checking, testing, migration validation, and deployment
> - Why AI-generated code requires *stricter* CI/CD than hand-written code — and what gates to enforce
> - Preview deployments: how to give every PR its own live URL with an isolated database
> - The "merge confidence" score: a mental model for knowing when a PR is safe to ship

---

## Why AI Code Needs Stricter CI/CD

Hand-written code has an implicit quality gate: the developer's brain. They've thought about edge cases, checked types mentally, and have context about the codebase.

AI-generated code has none of these. The LLM doesn't know your invariants. It doesn't know that `userId` must be a UUID, not a string. It doesn't know your production database has 10 million rows and that query needs an index.

**The CI/CD pipeline is the quality gate that the AI lacks.** Every check in CI is a constraint you're applying to the AI's output. The more checks, the harder it is for hallucinated code to reach production.

```mermaid
flowchart LR
    A[git push] --> B[Lint & Format]
    B --> C[Type Check]
    C --> D[Unit Tests]
    D --> E[Integration Tests]
    E --> F[Migration Dry-Run]
    F --> G[Build]
    G --> H[Preview Deploy]
    H --> I[Manual Review]
    I --> J[Merge to main]
    J --> K[Production Deploy]
    
    B -.->|Fail| X[❌ Block Merge]
    C -.->|Fail| X
    D -.->|Fail| X
    E -.->|Fail| X
    F -.->|Fail| X
    G -.->|Fail| X
    
    style X fill:#ef4444,color:#fff
    style K fill:#22c55e,color:#fff
```

## The Complete CI Pipeline (GitHub Actions)

### For TypeScript (Next.js / Node.js)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "20"
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test_db"

jobs:
  # ─── Gate 1: Code Quality ───────────────────────────────
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"
      - run: corepack enable && pnpm install --frozen-lockfile
      
      # Gate 1a: Formatting (AI often generates inconsistent style)
      - name: Check formatting
        run: pnpm prettier --check .
      
      # Gate 1b: Linting (catches unused vars, missing error handling)
      - name: Lint
        run: pnpm eslint . --max-warnings 0
      
      # Gate 1c: Type check (catches AI's imaginary APIs)
      - name: Type check
        run: pnpm tsc --noEmit

  # ─── Gate 2: Tests ──────────────────────────────────────
  test:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"
      - run: corepack enable && pnpm install --frozen-lockfile
      
      # Gate 2a: Run migrations against test DB
      - name: Run migrations
        run: pnpm prisma migrate deploy
      
      # Gate 2b: Unit tests
      - name: Unit tests
        run: pnpm vitest run --reporter=verbose
      
      # Gate 2c: Integration tests (with real database)
      - name: Integration tests
        run: pnpm vitest run --config vitest.integration.config.ts

  # ─── Gate 3: Migration Safety ───────────────────────────
  migration-check:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: migration_check
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Need history for migration diff
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"
      - run: corepack enable && pnpm install --frozen-lockfile
      
      # Apply all existing migrations
      - name: Apply base migrations
        run: pnpm prisma migrate deploy
        env:
          DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/migration_check"
      
      # Check for new migrations in this PR
      - name: Check migration safety
        run: |
          # Detect if any migration files were added/changed
          CHANGED=$(git diff --name-only origin/main...HEAD -- prisma/migrations/)
          if [ -n "$CHANGED" ]; then
            echo "🔍 New migrations detected:"
            echo "$CHANGED"
            echo "✅ Migrations applied successfully to test database"
          else
            echo "ℹ️ No migration changes in this PR"
          fi

  # ─── Gate 4: Build ──────────────────────────────────────
  build:
    runs-on: ubuntu-latest
    needs: [test, migration-check]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"
      - run: corepack enable && pnpm install --frozen-lockfile
      - name: Build
        run: pnpm build

  # ─── Gate 5: Deploy ─────────────────────────────────────
  deploy-preview:
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy preview
        # Using Vercel CLI as example — swap for Fly.io, Railway, etc.
        run: |
          npx vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
          npx vercel build --token=${{ secrets.VERCEL_TOKEN }}
          PREVIEW_URL=$(npx vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }})
          echo "PREVIEW_URL=$PREVIEW_URL" >> $GITHUB_ENV
      - name: Comment PR with preview URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `🚀 Preview deployed: ${process.env.PREVIEW_URL}`
            });

  deploy-production:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          npx vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
          npx vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
          npx vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### For Rust (Axum / SQLx)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test_db"

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2

      # Gate 1: Format
      - name: Check formatting
        run: cargo fmt --all -- --check

      # Gate 2: Clippy (the linter that catches real bugs)
      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings

      # Gate 3: Run migrations
      - name: Install sqlx-cli
        run: cargo install sqlx-cli --no-default-features --features postgres
      - name: Run migrations
        run: sqlx migrate run

      # Gate 4: Compile-time SQL checks
      - name: Check SQLx queries
        run: cargo sqlx prepare --check

      # Gate 5: Tests
      - name: Run tests
        run: cargo test --all

      # Gate 6: Build release
      - name: Build release binary
        run: cargo build --release

  deploy:
    runs-on: ubuntu-latest
    needs: check
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: Deploy to Fly.io
        run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

## The Merge Confidence Score

Before merging any PR (especially AI-generated code), mentally compute a confidence score:

| Check | Points | Notes |
|-------|:---:|-------|
| CI passes (all green) | +30 | Non-negotiable baseline |
| Type checker passes | +15 | Catches phantom APIs and type mismatches |
| New code has test coverage | +15 | At least happy path + one error case |
| No new dependencies or deps are verified | +10 | AI loves inventing packages |
| Migration reviewed (if applicable) | +10 | No accidental data loss |
| Code review by human | +10 | Catches logic errors tests miss |
| Preview deployment tested manually | +10 | Click through the actual feature |
| **Total** | **100** | |

**Ship threshold: ≥ 70.** Below 70, the PR needs more work. Above 85, ship it and move on.

## Preview Deployments: Every PR Gets a URL

Preview deployments are the most underrated CI/CD feature. Every PR gets:
- Its own URL (e.g., `https://pr-42.dealpulse.dev`)
- Its own database (or a branch of the database)
- Automatic cleanup when the PR is closed

This means:
- **Reviewers can test the actual feature**, not just read code
- **Stakeholders can give feedback** before merge
- **QA happens in parallel** with development

### The Legacy Way

```
// 💥 HALLUCINATION DEBT: "Just test it locally"
// - "Works on my machine" syndrome
// - Reviewer reads 500 lines of code without running any of it
// - Bugs discovered after merge, in production
// - Hotfix PR needed, deployed under pressure at midnight
```

### The AI-Native Way

```
// ✅ FIX: Every PR auto-deploys to a preview environment
// - Reviewer clicks the URL and tests the actual feature
// - Database migrations run against an isolated database
// - Automated tests run against the preview deployment
// - Stakeholder approves before merge
// - Merge to main → production deploy (zero drama)
```

## Automating the Boring Stuff

### Auto-format on Commit (Husky + lint-staged)

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

```bash
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

### Auto-generate Types After Schema Changes

```yaml
# In CI, ensure generated types are committed
- name: Check Prisma client is up to date
  run: |
    pnpm prisma generate
    git diff --exit-code src/generated/
    if [ $? -ne 0 ]; then
      echo "❌ Prisma client is out of date. Run 'pnpm prisma generate' and commit."
      exit 1
    fi
```

### Dependency Audit

```yaml
# Check for known vulnerabilities in dependencies
- name: Audit dependencies
  run: pnpm audit --audit-level moderate
  
# For Rust:
- name: Audit Rust dependencies
  run: |
    cargo install cargo-audit
    cargo audit
```

<details>
<summary><strong>🏋️ Exercise: Build Your CI/CD Pipeline</strong> (click to expand)</summary>

### The Challenge

Set up a complete CI/CD pipeline for your project:

1. **Create `.github/workflows/ci.yml`** with these gates:
   - Format check
   - Lint (zero warnings)
   - Type check
   - Unit tests with a real database (use `services: postgres`)
   - Build
   - Deploy to preview (on PR) and production (on merge to main)

2. **Add a migration safety check** that validates new migrations can be applied cleanly.

3. **Set up preview deployments** so each PR gets its own URL.

4. **Make an intentional mistake** (e.g., add a function that doesn't type-check) and verify CI catches it.

<details>
<summary>🔑 Solution</summary>

**Complete working pipeline for Next.js + Prisma + Vercel:**

Use the TypeScript YAML from earlier in this chapter as your base. Key additions:

**1. Add pre-commit hooks locally:**

```bash
pnpm add -D husky lint-staged
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

**2. Migration safety — add this job to your CI:**

```yaml
migration-safety:
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: migration_test
      ports: ["5432:5432"]
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: "pnpm"
    - run: corepack enable && pnpm install --frozen-lockfile
    - name: Apply existing migrations
      run: pnpm prisma migrate deploy
      env:
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/migration_test"
    - name: Validate schema is in sync
      run: pnpm prisma migrate diff --exit-code
      env:
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/migration_test"
```

**3. Preview deployment — Vercel auto-deploys PRs if you:**
- Connect your GitHub repo on vercel.com
- Enable "Preview Deployments" in project settings
- Vercel posts the URL as a comment on the PR automatically

**4. Intentional failure test:**

```typescript
// src/test-break.ts — Intentionally bad code
export function broken(): string {
  return 42; // Type error: number is not assignable to string
}
```

```bash
git checkout -b test/break-ci
git add -A && git commit -m "test: verify CI catches type errors"
git push origin test/break-ci
# Open PR → CI should fail at the "Type check" step
# CI output: error TS2322: Type 'number' is not assignable to type 'string'.
```

Delete the test branch after verifying CI works.

</details>
</details>

> **Key Takeaways**
> - AI-generated code requires stricter CI/CD, not looser. More automated checks = more AI mistakes caught before production.
> - The CI pipeline is: Format → Lint → Types → Tests → Migration Check → Build → Deploy.
> - Preview deployments eliminate "works on my machine." Every PR is a live, testable environment.
> - The Merge Confidence Score gives you a framework for deciding when a PR is safe to ship.
> - Automate everything you check manually. If you check it by hand, you'll eventually forget.

> **See also:** [Chapter 5: Test-Driven AI Generation](ch05-test-driven-ai-generation.md) for the tests that CI runs, and [Chapter 8: Observability](ch08-observability-and-day-two.md) for monitoring what happens after deployment.
