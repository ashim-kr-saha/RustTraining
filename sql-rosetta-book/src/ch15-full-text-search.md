# Full-Text Search Across Dialects 🔴

> **Learning objectives:** Implement full-text search in PostgreSQL (`tsvector`/`tsquery`/GIN), MySQL (`FULLTEXT` indexes), and SQLite (FTS5). Understand ranking, relevance scoring, phrase matching, and when to use built-in FTS vs an external search engine.

Every application eventually needs "search." Before reaching for Elasticsearch, understand what your database already provides — it may be more than enough.

## Full-Text Search Architecture Comparison

```mermaid
graph TD
    subgraph "PostgreSQL"
        PA[Document Text] --> PB[to_tsvector]
        PB --> PC[tsvector<br/>Sorted lexemes + positions]
        PC --> PD[GIN Index]
        PE[Search Query] --> PF[to_tsquery]
        PF --> PG[tsquery<br/>Boolean operators]
        PD --> PH[@@  Match Operator]
        PG --> PH
        PH --> PI[ts_rank / ts_rank_cd]
    end
    subgraph "MySQL"
        MA[Document Text] --> MB[FULLTEXT Index<br/>InnoDB or MyISAM]
        MC[Search Query] --> MD[MATCH ... AGAINST]
        MB --> ME{Search Mode}
        MD --> ME
        ME --> MF[NATURAL LANGUAGE]
        ME --> MG[BOOLEAN]
        ME --> MH[WITH QUERY EXPANSION]
    end
    subgraph "SQLite"
        SA[Document Text] --> SB[FTS5 Virtual Table]
        SC[Search Query] --> SD[MATCH operator]
        SB --> SD
        SD --> SE[bm25 ranking]
    end
```

| Feature | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| FTS mechanism | `tsvector` / `tsquery` | `FULLTEXT` index | FTS5 virtual table |
| Index type | GIN (preferred) or GiST | Inverted index (InnoDB/MyISAM) | Shadow tables |
| Ranking function | `ts_rank`, `ts_rank_cd` | Relevance score from `MATCH` | `bm25()` |
| Language support | 20+ built-in dictionaries | CJK via ngram/MeCab parsers | Unicode tokenizer |
| Phrase search | ✅ `<->` (adjacent) operator | ✅ `"double quotes"` in boolean mode | ✅ `"double quotes"` |
| Prefix search | ✅ `:*` suffix | ✅ `*` in boolean mode | ✅ `*` suffix |
| Custom tokenizer | ✅ (via extensions) | ✅ (parser plugins) | ✅ (C API) |

## PostgreSQL: tsvector and tsquery

### Basic Setup

```sql
-- Create a table with a dedicated tsvector column
CREATE TABLE articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('english', title), 'A') ||
            setweight(to_tsvector('english', body), 'B')
        ) STORED
);

-- Create a GIN index on the tsvector column
CREATE INDEX idx_articles_search ON articles USING GIN (search_vector);
```

### Querying

```sql
-- Basic text search
SELECT title, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('english', 'rust & async') AS query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

### tsquery Operators

| Operator | Meaning | Example |
|---|---|---|
| `&` | AND | `'rust & async'` |
| `\|` | OR | `'rust \| go'` |
| `!` | NOT | `'rust & !unsafe'` |
| `<->` | Followed by (adjacent) | `'error <-> handling'` |
| `<N>` | Within N words | `'query <3> optimization'` |
| `:*` | Prefix match | `'optim:*'` matches "optimize", "optimization" |

### Weighted Search

Postgres lets you assign weights (A, B, C, D) to different fields — title matches rank higher than body matches:

```sql
-- Weights: A = 1.0, B = 0.4, C = 0.2, D = 0.1 (defaults)
SELECT
    title,
    ts_rank(search_vector, query) AS default_rank,
    ts_rank(search_vector, query, '{0.1, 0.2, 0.8, 1.0}') AS custom_rank
FROM articles, to_tsquery('english', 'database') AS query
WHERE search_vector @@ query
ORDER BY custom_rank DESC;
```

### Highlighting Search Results

```sql
SELECT
    ts_headline('english', body,
        to_tsquery('english', 'full & text'),
        'StartSel=<b>, StopSel=</b>, MaxFragments=3, FragmentDelimiter= ... '
    ) AS highlighted_snippet
FROM articles
WHERE search_vector @@ to_tsquery('english', 'full & text');
```

Result:
```
... implementing <b>full</b>-<b>text</b> search ... the <b>full</b> power of <b>text</b> analysis ...
```

### Keeping tsvector Up to Date

**Option 1: Generated column** (Postgres 12+, shown above) — automatic, no trigger needed.

**Option 2: Trigger** (for complex logic or pre-12):
```sql
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_search_vector
BEFORE INSERT OR UPDATE ON articles
FOR EACH ROW EXECUTE FUNCTION update_search_vector();
```

### Dictionary and Language Configuration

```sql
-- List available text search configurations
SELECT cfgname FROM pg_ts_config;

-- Use a specific language
SELECT to_tsvector('french', 'Les algorithmes de recherche sont fascinants');
-- Result: 'algorithm':2 'fascinant':6 'recherch':4

-- Custom dictionary: unaccent extension removes diacritics
CREATE EXTENSION IF NOT EXISTS unaccent;
SELECT to_tsvector('french', unaccent('café résumé'));
```

## MySQL: FULLTEXT Indexes

### Basic Setup

```sql
CREATE TABLE articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    FULLTEXT INDEX idx_ft_articles (title, body)
) ENGINE=InnoDB;
```

### Search Modes

#### Natural Language Mode (default)

```sql
-- Relevance-ranked search
SELECT title, MATCH(title, body) AGAINST('database optimization') AS relevance
FROM articles
WHERE MATCH(title, body) AGAINST('database optimization')
ORDER BY relevance DESC;
```

⚠️ Natural language mode automatically excludes words present in more than 50% of rows (InnoDB). If your table is small, many common words may be ignored.

#### Boolean Mode

```sql
-- Boolean operators for precise control
SELECT title
FROM articles
WHERE MATCH(title, body) AGAINST(
    '+database +optimization -legacy' IN BOOLEAN MODE
);
```

| Operator | Meaning | Example |
|---|---|---|
| `+` | Must be present | `+required` |
| `-` | Must not be present | `-excluded` |
| `>` | Increase relevance | `>important` |
| `<` | Decrease relevance | `<trivial` |
| `*` | Wildcard suffix | `optim*` |
| `""` | Exact phrase | `"full text search"` |
| `()` | Grouping | `+(database \| sql)` |
| `~` | Negate contribution to relevance | `~noise` |

#### Query Expansion Mode

```sql
-- Two-pass search: find relevant documents, then search using terms from those documents
SELECT title
FROM articles
WHERE MATCH(title, body) AGAINST('database' WITH QUERY EXPANSION);
```

This is useful for finding related content but can return noisy results.

### MySQL FTS Configuration

```sql
-- Minimum word length for indexing (InnoDB default: 3)
SHOW VARIABLES LIKE 'innodb_ft_min_token_size';

-- Stopwords
SHOW VARIABLES LIKE 'innodb_ft_enable_stopword';

-- Custom stopword table
CREATE TABLE my_stopwords (value VARCHAR(30)) ENGINE=InnoDB;
INSERT INTO my_stopwords VALUES ('the'), ('and'), ('but');
SET GLOBAL innodb_ft_server_stopword_table = 'mydb/my_stopwords';
-- Requires index rebuild: ALTER TABLE articles DROP INDEX idx_ft_articles, ADD FULLTEXT INDEX idx_ft_articles (title, body);
```

### ngram Parser (CJK Support)

```sql
-- For Chinese, Japanese, Korean text
CREATE TABLE articles_cjk (
    id INT AUTO_INCREMENT PRIMARY KEY,
    content TEXT,
    FULLTEXT INDEX (content) WITH PARSER ngram
) ENGINE=InnoDB;

-- Configure ngram token size (default: 2)
-- my.cnf: ngram_token_size=2
```

## SQLite: FTS5

### Basic Setup

```sql
-- FTS5 virtual table
CREATE VIRTUAL TABLE articles_fts USING fts5(
    title,
    body,
    content='articles',       -- External content table
    content_rowid='id'        -- Maps to the real table's rowid
);

-- Populate from existing data
INSERT INTO articles_fts(rowid, title, body)
SELECT id, title, body FROM articles;
```

### Querying FTS5

```sql
-- Basic search
SELECT title, body
FROM articles_fts
WHERE articles_fts MATCH 'database optimization';

-- With ranking (BM25)
SELECT title, rank
FROM articles_fts
WHERE articles_fts MATCH 'database optimization'
ORDER BY rank;  -- rank is negative; closer to 0 = better match
```

### FTS5 Query Syntax

| Pattern | Meaning | Example |
|---|---|---|
| `term1 term2` | Implicit AND | `database optimization` |
| `term1 OR term2` | OR | `postgres OR mysql` |
| `NOT term` | NOT | `NOT legacy` |
| `"exact phrase"` | Phrase match | `"full text search"` |
| `term*` | Prefix match | `optim*` |
| `NEAR(t1 t2, N)` | Within N tokens | `NEAR(query plan, 5)` |
| `column:term` | Column filter | `title:database` |

### Column Weights with bm25()

```sql
-- Weight title 10x more than body
SELECT title, bm25(articles_fts, 10.0, 1.0) AS score
FROM articles_fts
WHERE articles_fts MATCH 'database'
ORDER BY score;
```

### Highlighting and Snippets

```sql
-- Highlight matching terms
SELECT highlight(articles_fts, 0, '<b>', '</b>') AS highlighted_title
FROM articles_fts
WHERE articles_fts MATCH 'database';

-- Extract relevant snippets
SELECT snippet(articles_fts, 1, '<b>', '</b>', '...', 32) AS body_snippet
FROM articles_fts
WHERE articles_fts MATCH 'optimization';
```

### Keeping FTS5 Synchronized

For external content FTS5 tables, you must keep them in sync manually:

```sql
-- Triggers to sync FTS5 with the content table
CREATE TRIGGER trg_articles_ai AFTER INSERT ON articles
BEGIN
    INSERT INTO articles_fts(rowid, title, body)
    VALUES (NEW.id, NEW.title, NEW.body);
END;

CREATE TRIGGER trg_articles_ad AFTER DELETE ON articles
BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, body)
    VALUES ('delete', OLD.id, OLD.title, OLD.body);
END;

CREATE TRIGGER trg_articles_au AFTER UPDATE ON articles
BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, body)
    VALUES ('delete', OLD.id, OLD.title, OLD.body);
    INSERT INTO articles_fts(rowid, title, body)
    VALUES (NEW.id, NEW.title, NEW.body);
END;
```

### FTS5 Maintenance

```sql
-- Rebuild the entire FTS index
INSERT INTO articles_fts(articles_fts) VALUES ('rebuild');

-- Optimize (merge index segments)
INSERT INTO articles_fts(articles_fts) VALUES ('optimize');

-- Check integrity
INSERT INTO articles_fts(articles_fts) VALUES ('integrity-check');
```

## Cross-Dialect Search Comparison

### Identical Search — Three Ways

**Goal:** Find articles about "query optimization" with title matches ranked higher.

**PostgreSQL:**
```sql
SELECT
    title,
    ts_rank(
        setweight(to_tsvector('english', title), 'A') ||
        setweight(to_tsvector('english', body), 'B'),
        to_tsquery('english', 'query & optimization')
    ) AS rank
FROM articles
WHERE to_tsvector('english', title) || to_tsvector('english', body)
      @@ to_tsquery('english', 'query & optimization')
ORDER BY rank DESC
LIMIT 10;
```

**MySQL:**
```sql
SELECT
    title,
    MATCH(title) AGAINST('query optimization') * 2 +
    MATCH(body) AGAINST('query optimization') AS rank
FROM articles
WHERE MATCH(title, body) AGAINST('query optimization')
ORDER BY rank DESC
LIMIT 10;
```

**SQLite:**
```sql
SELECT title, bm25(articles_fts, 10.0, 1.0) AS rank
FROM articles_fts
WHERE articles_fts MATCH 'query optimization'
ORDER BY rank
LIMIT 10;
```

### Phrase Search

```sql
-- PostgreSQL: adjacent operator
WHERE search_vector @@ to_tsquery('english', 'full <-> text <-> search');

-- MySQL: double quotes in boolean mode
WHERE MATCH(title, body) AGAINST('"full text search"' IN BOOLEAN MODE);

-- SQLite: double quotes
WHERE articles_fts MATCH '"full text search"';
```

### Prefix Search

```sql
-- PostgreSQL: :* suffix
WHERE search_vector @@ to_tsquery('english', 'optim:*');

-- MySQL: * in boolean mode
WHERE MATCH(title, body) AGAINST('optim*' IN BOOLEAN MODE);

-- SQLite: * suffix
WHERE articles_fts MATCH 'optim*';
```

## Performance Considerations

| Aspect | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Index type | GIN (fast lookup, slower write) | Inverted index | B-tree shadow tables |
| Index update | Immediate (or pending list → auto-merge) | Immediate | Immediate |
| Concurrent writes | ✅ No contention | ⚠️ FULLTEXT DML takes table-level lock on InnoDB | ⚠️ Single writer |
| Index size | ~2x text size | ~1.5x text size | ~1–2x text size |
| Query speed | Fast with GIN | Fast | Fast (but limited by single-threaded execution) |

### Indexing Strategy

**PostgreSQL:**
```sql
-- 💥 PERFORMANCE HAZARD: Computing tsvector at query time for every row
SELECT * FROM articles
WHERE to_tsvector('english', title || ' ' || body)
      @@ to_tsquery('english', 'database');

-- ✅ FIX: Pre-compute tsvector in a column and index it
-- (Use the generated column + GIN index approach shown earlier)
```

**MySQL:**
```sql
-- ⚠️ FULLTEXT indexes cannot be used with other index types in the same WHERE
-- This does a full-text search but cannot use idx_status simultaneously:
SELECT * FROM articles
WHERE MATCH(title, body) AGAINST('database') AND status = 'published';

-- ✅ FIX: Filter in application or use a covering FULLTEXT + column index approach
```

## When to Use Built-In FTS vs External Search

| Use Built-In FTS When... | Use External (Elasticsearch, etc.) When... |
|---|---|
| < 10M documents | > 10M documents with sub-100ms SLA |
| Simple keyword/phrase search | Faceted search, aggregations, fuzzy matching |
| You want fewer moving parts | You need horizontal scaling |
| Search is a secondary feature | Search is the core product feature |
| Data is already in the database | Data sources span multiple systems |
| You need transactional consistency | Eventual consistency is acceptable |

## Exercises

### The Knowledge Base Search

Build a searchable knowledge-base system:

1. Create an `articles` table with `id`, `title`, `body`, `category`, `published_at`
2. Implement full-text search in all three dialects with:
   - Title weighted higher than body
   - Only searching published articles (published_at IS NOT NULL)
   - Returning highlighted snippets
3. Add prefix search support for autocomplete

<details>
<summary>Solution</summary>

**PostgreSQL:**
```sql
CREATE TABLE articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT,
    published_at TIMESTAMPTZ,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', title), 'A') ||
        setweight(to_tsvector('english', body), 'B')
    ) STORED
);
CREATE INDEX idx_articles_fts ON articles USING GIN (search_vector);

-- Search with snippets
SELECT
    title,
    ts_headline('english', body, query,
        'StartSel=<mark>, StopSel=</mark>, MaxFragments=2') AS snippet,
    ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('english', 'database & index') AS query
WHERE search_vector @@ query AND published_at IS NOT NULL
ORDER BY rank DESC;

-- Autocomplete with prefix
SELECT title
FROM articles
WHERE search_vector @@ to_tsquery('english', 'optim:*')
  AND published_at IS NOT NULL
ORDER BY ts_rank(search_vector, to_tsquery('english', 'optim:*')) DESC
LIMIT 5;
```

**MySQL:**
```sql
CREATE TABLE articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(50),
    published_at DATETIME,
    FULLTEXT INDEX idx_ft_title (title),
    FULLTEXT INDEX idx_ft_all (title, body)
) ENGINE=InnoDB;

-- Search (no built-in snippet function — must implement in application)
SELECT
    title,
    MATCH(title) AGAINST('database index') * 2 +
    MATCH(title, body) AGAINST('database index') AS relevance
FROM articles
WHERE MATCH(title, body) AGAINST('database index')
  AND published_at IS NOT NULL
ORDER BY relevance DESC;

-- Boolean mode prefix search
SELECT title
FROM articles
WHERE MATCH(title, body) AGAINST('optim*' IN BOOLEAN MODE)
  AND published_at IS NOT NULL
LIMIT 5;
```

**SQLite:**
```sql
CREATE TABLE articles (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT,
    published_at TEXT
);

CREATE VIRTUAL TABLE articles_fts USING fts5(
    title, body,
    content='articles', content_rowid='id'
);

-- Populate
INSERT INTO articles_fts(rowid, title, body) SELECT id, title, body FROM articles;

-- Search with snippets (filter published in outer query)
SELECT a.title,
    snippet(articles_fts, 1, '<mark>', '</mark>', '...', 32) AS body_snippet,
    bm25(articles_fts, 10.0, 1.0) AS rank
FROM articles_fts
JOIN articles a ON a.id = articles_fts.rowid
WHERE articles_fts MATCH 'database index'
  AND a.published_at IS NOT NULL
ORDER BY rank
LIMIT 10;

-- Prefix autocomplete
SELECT a.title
FROM articles_fts
JOIN articles a ON a.id = articles_fts.rowid
WHERE articles_fts MATCH 'optim*'
  AND a.published_at IS NOT NULL
ORDER BY bm25(articles_fts, 10.0, 1.0)
LIMIT 5;
```

</details>

## Key Takeaways

- **PostgreSQL's FTS** is the most powerful built-in option: weighted search, proximity operators (`<->`), 20+ language dictionaries, and `ts_headline` for highlighting
- **MySQL's FULLTEXT** is simpler to set up but less flexible — no per-column weighting without multiple indexes, no built-in highlighting, and the 50% threshold in natural language mode can be surprising
- **SQLite's FTS5** is excellent for embedded/mobile apps: `bm25()` ranking, `snippet()` and `highlight()` functions, and efficient prefix search — but requires manual synchronization with content tables via triggers
- **Always pre-compute and index** the search representation (tsvector column + GIN in Postgres, FULLTEXT index in MySQL, FTS5 virtual table in SQLite) — never tokenize at query time
- **Phrase search** is supported in all three but with different syntax: `<->` (Postgres), `"..."` (MySQL boolean mode), `"..."` (SQLite FTS5)
- **Consider external search** (Elasticsearch, Meilisearch, Typesense) when you need facets, typo tolerance, or sub-100ms latency on 10M+ documents
- **FTS writes can be expensive** — in MySQL, FULLTEXT DML can acquire table-level locks; in Postgres, GIN has a pending list that auto-merges; in SQLite, use `optimize` periodically
