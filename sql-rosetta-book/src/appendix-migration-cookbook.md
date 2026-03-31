# Appendix B: Cross-Dialect Migration Cookbook

> Step-by-step recipes for migrating schemas and data between PostgreSQL, MySQL, and SQLite. Type mappings, syntax translations, common pitfalls, and tool recommendations.

This appendix is your field guide for the six possible migration directions. Each recipe covers schema translation, data type mapping, and the traps that will bite you if you don't know about them in advance.

## Data Type Mapping

### Numeric Types

| Concept | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Auto-increment PK | `SERIAL` / `BIGSERIAL` / `GENERATED ALWAYS AS IDENTITY` | `INT AUTO_INCREMENT` | `INTEGER PRIMARY KEY` (implicit rowid) |
| Small integer | `SMALLINT` | `SMALLINT` / `TINYINT` | `INTEGER` |
| Integer | `INTEGER` | `INT` | `INTEGER` |
| Big integer | `BIGINT` | `BIGINT` | `INTEGER` |
| Exact decimal | `NUMERIC(p,s)` / `DECIMAL(p,s)` | `DECIMAL(p,s)` | `REAL` or `TEXT` ⚠️ |
| Floating point | `REAL` / `DOUBLE PRECISION` | `FLOAT` / `DOUBLE` | `REAL` |
| Money | `NUMERIC(15,2)` (avoid `MONEY` type) | `DECIMAL(15,2)` | `INTEGER` (store cents) |

### String Types

| Concept | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Fixed-length | `CHAR(n)` | `CHAR(n)` | `TEXT` |
| Variable-length | `VARCHAR(n)` / `TEXT` | `VARCHAR(n)` / `TEXT` (64KB) / `MEDIUMTEXT` / `LONGTEXT` | `TEXT` |
| Unlimited text | `TEXT` (no limit) | `LONGTEXT` (4GB) | `TEXT` (no limit) |
| Binary | `BYTEA` | `BLOB` / `MEDIUMBLOB` / `LONGBLOB` | `BLOB` |

### Date/Time Types

| Concept | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Date only | `DATE` | `DATE` | `TEXT` (`'YYYY-MM-DD'`) |
| Time only | `TIME` | `TIME` | `TEXT` (`'HH:MM:SS'`) |
| Timestamp (no TZ) | `TIMESTAMP` | `DATETIME` | `TEXT` (`'YYYY-MM-DD HH:MM:SS'`) |
| Timestamp (with TZ) | `TIMESTAMPTZ` | `TIMESTAMP` (UTC-converted) | `TEXT` (store ISO 8601) |
| Current timestamp default | `DEFAULT NOW()` | `DEFAULT CURRENT_TIMESTAMP` | `DEFAULT (datetime('now'))` |

### Special Types

| Concept | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| UUID | `UUID` | `CHAR(36)` or `BINARY(16)` | `TEXT` or `BLOB(16)` |
| JSON | `JSON` / `JSONB` | `JSON` | `TEXT` (use `json()` functions) |
| Boolean | `BOOLEAN` (`TRUE`/`FALSE`) | `TINYINT(1)` (`1`/`0`) | `INTEGER` (`1`/`0`) |
| Enum | `CREATE TYPE ... AS ENUM` | `ENUM('a','b','c')` (inline) | `TEXT` + `CHECK` |
| Array | `INTEGER[]`, `TEXT[]`, etc. | ❌ (use JSON) | ❌ (use JSON) |
| IP address | `INET` / `CIDR` | `VARCHAR(45)` | `TEXT` |
| Interval | `INTERVAL` | ❌ (use application logic) | ❌ |

## Recipe 1: PostgreSQL → MySQL

### Schema Translation

```sql
-- PostgreSQL source:
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MySQL target:
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,       -- TEXT → VARCHAR for index compatibility
    email VARCHAR(255) NOT NULL,
    metadata JSON DEFAULT (JSON_OBJECT()),
    tags JSON DEFAULT (JSON_ARRAY()),  -- TEXT[] → JSON array
    is_active TINYINT(1) DEFAULT 1,    -- BOOLEAN → TINYINT(1)
    created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Common Pitfalls

| Trap | Issue | Fix |
|---|---|---|
| `TEXT` columns in indexes | MySQL can't index full `TEXT` — needs prefix length | Use `VARCHAR(n)` or prefix indexes |
| `BOOLEAN` | MySQL has no true boolean; `TRUE`=1, `FALSE`=0 | Use `TINYINT(1)` |
| `SERIAL` | Not a MySQL keyword (use `AUTO_INCREMENT`) | Replace with `INT AUTO_INCREMENT` |
| `TIMESTAMPTZ` | MySQL `TIMESTAMP` auto-converts to UTC; `DATETIME` does not | Choose `DATETIME(6)` + store UTC explicitly |
| `ARRAY` types | MySQL has no arrays | Convert to JSON arrays |
| `JSONB` operators | `->`, `->>`, `@>`, `?` differ | `->`, `->>` work; replace `@>` with `JSON_CONTAINS()` |
| `ON CONFLICT` | Syntax differs | Replace with `ON DUPLICATE KEY UPDATE` |
| Sequences | Postgres uses sequences; MySQL uses `AUTO_INCREMENT` | Drop sequence references |
| `RETURNING` clause | MySQL doesn't support `RETURNING` | Use `LAST_INSERT_ID()` |
| Transactional DDL | MySQL implicitly commits on DDL | Run migrations outside application transactions |

### JSONB Operator Translation

| Operation | PostgreSQL | MySQL |
|---|---|---|
| Get JSON field | `data->'key'` | `data->'$.key'` or `JSON_EXTRACT(data, '$.key')` |
| Get text value | `data->>'key'` | `JSON_UNQUOTE(JSON_EXTRACT(data, '$.key'))` |
| Contains | `data @> '{"k":"v"}'` | `JSON_CONTAINS(data, '"v"', '$.k')` |
| Key exists | `data ? 'key'` | `JSON_CONTAINS_PATH(data, 'one', '$.key')` |
| Array element | `data->0` | `JSON_EXTRACT(data, '$[0]')` |

## Recipe 2: PostgreSQL → SQLite

### Schema Translation

```sql
-- PostgreSQL source:
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT REFERENCES customers(id),
    total NUMERIC(15,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','shipped')),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status) WHERE status = 'pending';

-- SQLite target:
CREATE TABLE orders (
    id INTEGER PRIMARY KEY,    -- AUTOINCREMENT optional (implicit rowid)
    customer_id INTEGER REFERENCES customers(id),
    total REAL NOT NULL,       -- ⚠️ No exact NUMERIC; use INTEGER (cents) for money
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','shipped')),
    metadata TEXT,             -- JSONB → TEXT (use json() functions)
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
-- ⚠️ SQLite does NOT support partial indexes with WHERE (3.8.0+ actually does)
CREATE INDEX idx_orders_status ON orders(status) WHERE status = 'pending';
```

### Common Pitfalls

| Trap | Issue | Fix |
|---|---|---|
| `NUMERIC`/`DECIMAL` | SQLite stores as `REAL` (floating point) | Store money as `INTEGER` cents |
| `ALTER TABLE` | Very limited — can only `RENAME` or `ADD COLUMN` | Use rename-recreate pattern (see Ch02) |
| `BOOLEAN` | No boolean type; store as `INTEGER` (1/0) | Use `CHECK (col IN (0, 1))` |
| Foreign keys off by default | SQLite ignores FK constraints unless enabled | `PRAGMA foreign_keys = ON;` at connection start |
| `NOW()` | Not a function in SQLite | Use `datetime('now')` |
| `RETURNING` | Supported since SQLite 3.35 | Check your SQLite version |
| Concurrent writes | Single writer at a time | Use WAL mode + `busy_timeout` |
| `ENUM` types | No enum support | Use `TEXT` + `CHECK` constraint |
| `UUID` generation | No built-in UUID function | Generate in application code |
| Sequences | No sequences | Use `INTEGER PRIMARY KEY` autoincrement |

## Recipe 3: MySQL → PostgreSQL

### Schema Translation

```sql
-- MySQL source:
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description MEDIUMTEXT,
    price DECIMAL(10,2) NOT NULL,
    category ENUM('electronics','clothing','food') NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_active_price (is_active, price)
) ENGINE=InnoDB;

-- PostgreSQL target:
CREATE TABLE products (
    id SERIAL PRIMARY KEY,       -- or use GENERATED ALWAYS AS IDENTITY
    name VARCHAR(255) NOT NULL,
    description TEXT,             -- MEDIUMTEXT → TEXT (no size limit in Postgres)
    price NUMERIC(10,2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('electronics','clothing','food')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
    -- ⚠️ No ON UPDATE CURRENT_TIMESTAMP — use a trigger
);

CREATE INDEX idx_category ON products(category);
CREATE INDEX idx_active_price ON products(is_active, price);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_products_updated
BEFORE UPDATE ON products FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
```

### Common Pitfalls

| Trap | Issue | Fix |
|---|---|---|
| `AUTO_INCREMENT` | Not a Postgres keyword | Use `SERIAL`, `BIGSERIAL`, or `GENERATED ALWAYS AS IDENTITY` |
| `ENUM` (inline) | Postgres requires `CREATE TYPE ... AS ENUM` or `CHECK` | Use `CHECK` constraint or create a custom type |
| `ON UPDATE CURRENT_TIMESTAMP` | Not supported in Postgres | Use a `BEFORE UPDATE` trigger |
| `TINYINT(1)` for booleans | Postgres has real `BOOLEAN` | Convert `1`→`TRUE`, `0`→`FALSE` |
| `MEDIUMTEXT`/`LONGTEXT` | Not Postgres types | Use `TEXT` (unlimited) |
| Backtick quoting | MySQL uses `` ` ``, Postgres uses `"` | Replace backticks with double quotes (or remove) |
| `LIMIT x, y` offset syntax | MySQL: `LIMIT offset, count` | Postgres: `LIMIT count OFFSET offset` |
| `GROUP_CONCAT` | MySQL function | Use `STRING_AGG()` in Postgres |
| `IFNULL` | MySQL function | Use `COALESCE()` (works in both, prefer this) |
| `\|\|` operator | Concat in Postgres; OR in MySQL (with `PIPES_AS_CONCAT` off) | Use `CONCAT()` for portability or `\|\|` in Postgres |

## Recipe 4: MySQL → SQLite

### Key Differences

```sql
-- MySQL source:
CREATE TABLE sessions (
    id CHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    data JSON,
    expires_at DATETIME NOT NULL,
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

-- SQLite target:
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,        -- CHAR(36) → TEXT
    user_id INTEGER NOT NULL,
    data TEXT,                  -- JSON → TEXT
    expires_at TEXT NOT NULL    -- DATETIME → TEXT
);
CREATE INDEX idx_user ON sessions(user_id);
CREATE INDEX idx_expires ON sessions(expires_at);
```

## Recipe 5: SQLite → PostgreSQL

This is the most common "scaling up" migration — moving from an embedded prototype to a production server.

```sql
-- SQLite source:
CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    payload TEXT,    -- JSON stored as TEXT
    tags TEXT,       -- Comma-separated
    occurred_at TEXT DEFAULT (datetime('now'))
);

-- PostgreSQL target:
CREATE TABLE events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    payload JSONB,                        -- TEXT → JSONB for indexing
    tags TEXT[],                           -- CSV → array
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_payload ON events USING GIN (payload);
CREATE INDEX idx_events_tags ON events USING GIN (tags);
```

### Data Migration Script

```sql
-- Export from SQLite
.mode csv
.headers on
.output events.csv
SELECT id, name, payload, tags, occurred_at FROM events;
.output stdout

-- Import into Postgres (with transformation)
-- Use a staging table first
CREATE TEMP TABLE events_staging (
    id BIGINT, name TEXT, payload TEXT, tags TEXT, occurred_at TEXT
);

\copy events_staging FROM 'events.csv' CSV HEADER

-- Transform and load
INSERT INTO events (id, name, payload, tags, occurred_at)
SELECT
    id,
    name,
    payload::jsonb,
    string_to_array(tags, ','),
    occurred_at::timestamptz
FROM events_staging;
```

## Recipe 6: SQLite → MySQL

```sql
-- SQLite source:
CREATE TABLE configs (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- MySQL target:
CREATE TABLE configs (
    `key` VARCHAR(255) PRIMARY KEY,    -- TEXT → VARCHAR for PK
    value LONGTEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Migration Tools

| Tool | Direction | Notes |
|---|---|---|
| **pgloader** | MySQL → Postgres, SQLite → Postgres | Best automated tool; handles type mapping, indexes, constraints |
| **pg_dump / pg_restore** | Postgres → Postgres | Standard backup/restore |
| **mysqldump** | MySQL → MySQL (or manual translation) | SQL output needs manual editing for other targets |
| **sqlite3 .dump** | SQLite → text SQL | Needs manual translation for Postgres/MySQL |
| **DBeaver** | Any → Any | GUI tool with data transfer wizard |
| **AWS DMS** | Any → Any (via AWS) | Cloud-native; good for large migrations |
| **pgloader** example | | `pgloader mysql://user:pass@host/db postgresql://user:pass@host/db` |

### pgloader Example (MySQL → Postgres)

```
-- pgloader command file: migrate.load
LOAD DATABASE
    FROM mysql://root:pass@localhost/myapp
    INTO postgresql://user:pass@localhost/myapp

WITH include no drop,
     create tables,
     create indexes,
     reset sequences

SET MySQL PARAMETERS
    net_read_timeout = '120',
    net_write_timeout = '120'

CAST type tinyint to boolean using tinyint-to-boolean,
     type int with extra auto_increment to serial;
```

```bash
pgloader migrate.load
```

## Function Translation Quick Reference

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| String concat | `\|\|` or `CONCAT()` | `CONCAT()` | `\|\|` |
| Substring | `SUBSTRING(s, start, len)` | `SUBSTRING(s, start, len)` | `SUBSTR(s, start, len)` |
| Current timestamp | `NOW()` / `CURRENT_TIMESTAMP` | `NOW()` / `CURRENT_TIMESTAMP` | `datetime('now')` |
| Date difference | `date2 - date1` (returns interval) | `DATEDIFF(date2, date1)` | `julianday(d2) - julianday(d1)` |
| Add days | `date + INTERVAL '7 days'` | `DATE_ADD(date, INTERVAL 7 DAY)` | `datetime(date, '+7 days')` |
| If/else | `CASE WHEN ... THEN ... END` | `IF(cond, then, else)` or `CASE` | `IIF(cond, then, else)` (3.32+) or `CASE` |
| Null coalesce | `COALESCE(a, b)` | `COALESCE(a, b)` / `IFNULL(a, b)` | `COALESCE(a, b)` / `IFNULL(a, b)` |
| String aggregation | `STRING_AGG(col, ',')` | `GROUP_CONCAT(col SEPARATOR ',')` | `GROUP_CONCAT(col, ',')` |
| Generate series | `generate_series(1, 10)` | Recursive CTE | Recursive CTE |
| Random | `RANDOM()` | `RAND()` | `RANDOM()` |
| UUID | `gen_random_uuid()` | `UUID()` (8.0+) | Application-generated |

## Pre-Migration Checklist

- [ ] **Audit all data types** — map every column to the target engine's type system
- [ ] **Identify auto-increment / sequence columns** — translate appropriately
- [ ] **Check for vendor-specific functions** — `NOW()`, `IFNULL()`, `GROUP_CONCAT()`, etc.
- [ ] **Review all constraints** — foreign keys, CHECK constraints, UNIQUE indexes
- [ ] **Handle `NULL` semantics** — especially in indexes and `UNIQUE` constraints (Postgres allows multiple NULLs in UNIQUE; MySQL too since 8.0.16 with functional indexes)
- [ ] **Test date/time handling** — timezone conversions are the #1 data corruption source
- [ ] **Migrate stored procedures and triggers separately** — these need manual rewriting
- [ ] **Verify character encoding** — ensure UTF-8 throughout (`utf8mb4` in MySQL, `UTF8` in Postgres)
- [ ] **Test with production-scale data** — many issues only surface at volume
- [ ] **Run application tests against the new database** — ORM-generated SQL may need adjustments
