# 4. Schema-First Development 🟡

> **What you'll learn:**
> - Why your database schema is your most important API contract — more important than your REST endpoints
> - How to use AI to translate plain-English business rules into DDL, migrations, and typed ORM schemas
> - The migration workflow that prevents "works on my machine" database drift
> - How strict schemas make AI-generated code dramatically more reliable

---

## Your Schema Is Your API

Most developers design their API endpoints first, then figure out the database schema to support them. This is backwards. Your database schema is the **single source of truth** for your entire application. Everything else — API routes, types, validation logic, UI forms — is a projection of the schema.

When you get the schema right, everything downstream becomes clearer. When you get it wrong, every layer of your application inherits the confusion.

```mermaid
flowchart TD
    subgraph "Schema-First (Correct)"
        A1[Business Rules<br/>in Plain English] --> A2[Database Schema<br/>DDL / Prisma / SQLx]
        A2 --> A3[Generated Types<br/>TypeScript / Rust structs]
        A3 --> A4[API Contract<br/>routes match schema types]
        A4 --> A5[UI Forms<br/>fields match types]
    end

    subgraph "API-First (Fragile)"
        B1[Brainstorm Endpoints] --> B2[Guess Request/Response<br/>shapes]
        B2 --> B3[Retrofit Database<br/>to match API]
        B3 --> B4[Types Don't Match<br/>manual mapping layer]
        B4 --> B5[UI Diverges<br/>client types drift from server]
    end

    style A2 fill:#22c55e,color:#fff
    style B3 fill:#ef4444,color:#fff
```

### The First Principle

> **The database is the contract. The API is the interface. The UI is the presentation.** Get them in this order, and AI-generated code has a foundation to stand on. Reverse them, and you're debugging type mismatches for the rest of the sprint.

## From Business Rules to DDL with AI

The most effective prompt pattern for schema generation starts with **plain-English business rules** and produces **constraint-rich DDL.**

### The Legacy Way: AI Generates a Schema From Vibes

```sql
-- 💥 HALLUCINATION DEBT: Prompt was "Create tables for a CRM"
-- The AI produced this:

CREATE TABLE users (
    id INT PRIMARY KEY,          -- No auto-increment? No UUID?
    name VARCHAR(255),           -- Nullable by default: allows ghost users
    email VARCHAR(255)           -- No UNIQUE constraint: duplicate emails
);

CREATE TABLE deals (
    id INT PRIMARY KEY,
    user_id INT,                 -- No FOREIGN KEY constraint
    value FLOAT,                 -- Float for money? Financial rounding errors.
    stage VARCHAR(255)           -- No enum/check: allows "stagee", "clsoed", etc.
);

-- Problems:
-- 1. No NOT NULL constraints — half the columns will be empty
-- 2. No FOREIGN KEY — orphaned rows guaranteed
-- 3. FLOAT for money — your accountant will cry
-- 4. VARCHAR for enums — typos become data corruption
-- 5. No indexes — queries will crawl at 10K rows
-- 6. No timestamps — "when was this created?" is unanswerable
```

### The AI-Native Way: Constrained Schema Generation

```sql
-- ✅ FIX: Structured prompt produces constraint-rich schema

-- Prompt used:
-- "Given these business rules, generate a PostgreSQL schema
--  with NOT NULL constraints, foreign keys, check constraints,
--  appropriate indexes, and created_at/updated_at timestamps.
--
--  Business Rules:
--  1. A company has a name (required) and optional website
--  2. A contact belongs to exactly one company, has name + email (both required)
--  3. Each contact's email must be unique across the system
--  4. A touchpoint is a logged interaction (call, email, meeting) with a contact
--  5. Touchpoints have a type, a date, and optional notes
--  6. Companies have a pipeline stage: lead, qualified, proposal, closed_won, closed_lost
--  7. We need to quickly find companies sorted by 'days since last touchpoint'"

CREATE TABLE companies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    website     TEXT,
    stage       TEXT NOT NULL DEFAULT 'lead'
                CHECK (stage IN ('lead', 'qualified', 'proposal', 'closed_won', 'closed_lost')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE touchpoints (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('call', 'email', 'meeting')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_contacts_company   ON contacts(company_id);
CREATE INDEX idx_touchpoints_contact ON touchpoints(contact_id);
CREATE INDEX idx_touchpoints_date   ON touchpoints(occurred_at DESC);

-- View: companies sorted by staleness (days since last touchpoint)
CREATE VIEW company_staleness AS
SELECT
    c.id,
    c.name,
    c.stage,
    MAX(t.occurred_at) AS last_touchpoint,
    EXTRACT(DAY FROM now() - MAX(t.occurred_at)) AS days_stale
FROM companies c
LEFT JOIN contacts co ON co.company_id = c.id
LEFT JOIN touchpoints t ON t.contact_id = co.id
GROUP BY c.id, c.name, c.stage
ORDER BY days_stale DESC NULLS FIRST;
```

The difference is **constraints**. Every `NOT NULL`, every `CHECK`, every `REFERENCES` is a rule that prevents bad data from entering your system. And critically, these constraints flow through your ORM into your type system.

## ORM Schemas: The Type-Safe Bridge

### Prisma (TypeScript/Node.js)

When you define your schema in Prisma, the types are auto-generated:

```prisma
// prisma/schema.prisma
// Generated from business rules via AI, then reviewed by human

model Company {
  id        String      @id @default(uuid())
  name      String
  website   String?
  stage     Stage       @default(lead)
  contacts  Contact[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  @@map("companies")
}

enum Stage {
  lead
  qualified
  proposal
  closed_won
  closed_lost
}

model Contact {
  id          String       @id @default(uuid())
  company     Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  companyId   String
  name        String
  email       String       @unique
  touchpoints Touchpoint[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([companyId])
  @@map("contacts")
}

model Touchpoint {
  id         String          @id @default(uuid())
  contact    Contact         @relation(fields: [contactId], references: [id], onDelete: Cascade)
  contactId  String
  kind       TouchpointKind
  occurredAt DateTime        @default(now())
  notes      String?
  createdAt  DateTime        @default(now())

  @@index([contactId])
  @@index([occurredAt(sort: Desc)])
  @@map("touchpoints")
}

enum TouchpointKind {
  call
  email
  meeting
}
```

After `npx prisma generate`, you get TypeScript types that exactly match your database. The AI can now generate repository code that the type checker will validate:

```typescript
// The AI generates this — and TypeScript catches every mistake
import { PrismaClient, Stage } from "@prisma/client";

async function getStaleCompanies(prisma: PrismaClient) {
  return prisma.company.findMany({
    where: {
      stage: { not: Stage.closed_won },  // Type-safe enum!
    },
    include: {
      contacts: {
        include: {
          touchpoints: {
            orderBy: { occurredAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });
}
```

### SQLx (Rust)

In Rust, SQLx provides compile-time checked SQL queries:

```rust
// The SQL is checked at compile time against the actual database schema.
// If the column doesn't exist or the type is wrong, it's a BUILD error, not a runtime error.

#[derive(Debug, sqlx::FromRow)]
struct CompanyStaleness {
    id: Uuid,
    name: String,
    stage: String,
    last_touchpoint: Option<chrono::DateTime<chrono::Utc>>,
    days_stale: Option<f64>,
}

async fn get_stale_companies(pool: &PgPool) -> Result<Vec<CompanyStaleness>, sqlx::Error> {
    sqlx::query_as!(
        CompanyStaleness,
        r#"
        SELECT
            c.id,
            c.name,
            c.stage,
            MAX(t.occurred_at) AS last_touchpoint,
            EXTRACT(DAY FROM now() - MAX(t.occurred_at)) AS days_stale
        FROM companies c
        LEFT JOIN contacts co ON co.company_id = c.id
        LEFT JOIN touchpoints t ON t.contact_id = co.id
        WHERE c.stage != 'closed_won'
        GROUP BY c.id, c.name, c.stage
        ORDER BY days_stale DESC NULLS FIRST
        "#
    )
    .fetch_all(pool)
    .await
}
```

## The Migration Workflow

Schema-first development requires disciplined migration management. Here's the workflow:

| Step | Command (Prisma) | Command (SQLx) | Purpose |
|------|-----------------|-----------------|---------|
| 1. Modify schema | Edit `schema.prisma` | Write `.sql` migration file | Define the change |
| 2. Generate migration | `npx prisma migrate dev --name add_contacts` | `sqlx migrate add add_contacts` | Create versioned migration |
| 3. Review SQL | Check `prisma/migrations/*/migration.sql` | Check `migrations/*.sql` | Verify no destructive changes |
| 4. Apply locally | Automatic with `migrate dev` | `sqlx migrate run` | Test on dev database |
| 5. Regenerate types | `npx prisma generate` | `cargo sqlx prepare` | Update typed client |
| 6. Run tests | `npm test` | `cargo test` | Verify business logic still works |
| 7. Commit | `git add -A && git commit` | Same | Version the migration |
| 8. CI validates | Migration dry-run in CI pipeline | Same | Prevent broken deploys |

### The Migration Safety Rules

1. **Never edit a migration that's been applied to production.** Create a new migration instead.
2. **Never drop a column in the same deploy that stops using it.** Two-phase: first deploy removes code, second deploy removes column.
3. **Always make migrations backward-compatible.** Add columns as nullable first; backfill; then add NOT NULL.
4. **Test migrations against a production-sized dataset.** A migration that takes 5ms on dev might lock a table for 5 minutes on production.

## AI + Schema = Superpowers

Here's why schema-first development is the AI multiplier:

| Without Schema-First | With Schema-First |
|---------------------|-------------------|
| AI guesses data shapes | AI reads exactly defined types |
| Generated code uses `any` / `interface {}` | Generated code uses concrete, checked types |
| API responses are inconsistent | API responses match schema exactly |
| Tests assert on string shapes | Tests assert on typed objects |
| Refactoring breaks unknown callers | Refactoring breaks at compile time |

<details>
<summary><strong>🏋️ Exercise: Schema-First CRUD with AI</strong> (click to expand)</summary>

### The Challenge

Using the DealPulse schema above (or your own project schema):

1. **Generate the schema** by feeding your Chapter 1 PRD to an AI with the constrained prompt pattern shown in this chapter.
2. **Create the first migration** and apply it to a local PostgreSQL instance (use Docker: `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16`).
3. **Generate typed CRUD functions** using AI, referencing the schema as context. Produce:
   - `createCompany(name, website?, stage?)`
   - `listCompanies(orderBy: "staleness" | "name" | "created")`
   - `addTouchpoint(contactId, kind, notes?)`
4. **Verify** that your type checker passes and the functions work against the real database.

<details>
<summary>🔑 Solution</summary>

**Step 1: Generate schema prompt:**

```
Given these business rules for a CRM MVP, generate a Prisma schema.
All models need uuid IDs, created_at/updated_at timestamps.
Use enums for constrained values. Add appropriate indexes.

Business rules:
- Companies have a name (required), optional website, and a 
  pipeline stage (lead/qualified/proposal/closed_won/closed_lost)
- Contacts belong to exactly one company, have name + unique email
- Touchpoints log interactions (call/email/meeting) with a contact
- We need to query companies by "days since last touchpoint"
```

**Step 2: Apply migration:**

```bash
# Start local Postgres
docker run -d --name dealpulse-db \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=dealpulse \
  -p 5432:5432 postgres:16

# For Prisma:
export DATABASE_URL="postgresql://postgres:dev@localhost:5432/dealpulse"
npx prisma migrate dev --name init

# For SQLx:
export DATABASE_URL="postgresql://postgres:dev@localhost:5432/dealpulse"
sqlx migrate run
```

**Step 3: AI prompt for typed CRUD:**

```
Given @file:prisma/schema.prisma, implement these repository functions
in @file:src/repositories/company-repo.ts:

1. createCompany(data: { name: string; website?: string; stage?: Stage })
   → Returns the created Company with its id
   
2. listCompanies(orderBy: "staleness" | "name" | "created")
   → Returns companies with their latest touchpoint date
   → "staleness" = companies with oldest last touchpoint first
   
3. addTouchpoint(data: { contactId: string; kind: TouchpointKind; notes?: string })
   → Returns the created Touchpoint
   → Throws if contactId doesn't exist

Use the Prisma client from @file:src/lib/db.ts.
Handle errors with explicit types, not thrown exceptions.
Return Result-style objects: { data: T } | { error: string }.
```

**Step 4: Verification:**

```bash
# Type check
npx tsc --noEmit
# Should: exit 0, no errors

# Quick smoke test
npx tsx -e "
  const { prisma } = require('./src/lib/db');
  async function test() {
    const co = await prisma.company.create({ 
      data: { name: 'Acme Corp' } 
    });
    console.log('Created:', co.id, co.name, co.stage);
    // Should print: Created: <uuid> Acme Corp lead
    await prisma.\$disconnect();
  }
  test();
"
```

**Key verification points:**
- `stage` defaults to `'lead'` without explicit input ✅
- `company.id` is a UUID, not an integer ✅
- No `any` types in the generated repository ✅
- Prisma client reflects the exact schema ✅

</details>
</details>

> **Key Takeaways**
> - Design your schema first. Everything else — API, types, UI — is a projection of the schema.
> - Business rules belong in the database as constraints (`NOT NULL`, `CHECK`, `REFERENCES`), not just in application code.
> - Constrained prompts produce constrained (correct) AI output. Feed business rules, get DDL.
> - Schema-first + typed ORM = compile-time guarantees. The AI can't generate code that violates your data model.
> - Migrations are versioned, reviewed, and tested. Never edit an applied migration; create a new one.

> **See also:** [Chapter 3: The Modern "Ship It" Stack](ch03-the-modern-ship-it-stack.md) for choosing the ORM and database, and [Chapter 5: Test-Driven AI Generation](ch05-test-driven-ai-generation.md) for testing the code that your schema now types.
