# Appendix A: SQL Reference Card

> A quick-reference cheat sheet for the most common operations across PostgreSQL, MySQL, and SQLite. Keep this bookmarked.

---

## Date and Time Functions

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Current timestamp | `NOW()` / `CURRENT_TIMESTAMP` | `NOW()` / `CURRENT_TIMESTAMP` | `datetime('now')` |
| Current date | `CURRENT_DATE` | `CURDATE()` / `CURRENT_DATE` | `date('now')` |
| Current time | `CURRENT_TIME` | `CURTIME()` / `CURRENT_TIME` | `time('now')` |
| Unix epoch (seconds) | `EXTRACT(EPOCH FROM NOW())` | `UNIX_TIMESTAMP()` | `strftime('%s', 'now')` |
| From Unix epoch | `TO_TIMESTAMP(epoch)` | `FROM_UNIXTIME(epoch)` | `datetime(epoch, 'unixepoch')` |
| Add days | `ts + INTERVAL '7 days'` | `DATE_ADD(ts, INTERVAL 7 DAY)` | `datetime(ts, '+7 days')` |
| Subtract days | `ts - INTERVAL '7 days'` | `DATE_SUB(ts, INTERVAL 7 DAY)` | `datetime(ts, '-7 days')` |
| Add months | `ts + INTERVAL '3 months'` | `DATE_ADD(ts, INTERVAL 3 MONTH)` | `datetime(ts, '+3 months')` |
| Difference in days | `date1 - date2` (integer) | `DATEDIFF(date1, date2)` | `julianday(d1) - julianday(d2)` |
| Truncate to day | `DATE_TRUNC('day', ts)` | `DATE(ts)` | `date(ts)` |
| Truncate to week | `DATE_TRUNC('week', ts)` | `DATE(DATE_SUB(ts, INTERVAL WEEKDAY(ts) DAY))` | `date(ts, 'weekday 1', '-7 days')` |
| Truncate to month | `DATE_TRUNC('month', ts)` | `DATE_FORMAT(ts, '%Y-%m-01')` | `date(ts, 'start of month')` |
| Truncate to year | `DATE_TRUNC('year', ts)` | `DATE_FORMAT(ts, '%Y-01-01')` | `date(ts, 'start of year')` |
| Extract year | `EXTRACT(YEAR FROM ts)` | `YEAR(ts)` / `EXTRACT(YEAR FROM ts)` | `CAST(strftime('%Y', ts) AS INTEGER)` |
| Extract month | `EXTRACT(MONTH FROM ts)` | `MONTH(ts)` | `CAST(strftime('%m', ts) AS INTEGER)` |
| Extract day of week | `EXTRACT(DOW FROM ts)` (0=Sun) | `DAYOFWEEK(ts)` (1=Sun) | `CAST(strftime('%w', ts) AS INTEGER)` (0=Sun) |
| Format | `TO_CHAR(ts, 'YYYY-MM-DD')` | `DATE_FORMAT(ts, '%Y-%m-%d')` | `strftime('%Y-%m-%d', ts)` |
| Parse | `TO_TIMESTAMP('...', 'fmt')` | `STR_TO_DATE('...', 'fmt')` | `datetime('...')` (ISO 8601 only) |

## String Functions

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Concatenate | `'a' \|\| 'b'` or `CONCAT('a','b')` | `CONCAT('a','b')` | `'a' \|\| 'b'` or `CONCAT('a','b')` (3.44+) |
| Length | `LENGTH(s)` (bytes) / `CHAR_LENGTH(s)` | `LENGTH(s)` (bytes) / `CHAR_LENGTH(s)` | `LENGTH(s)` (bytes) |
| Substring | `SUBSTRING(s FROM 2 FOR 3)` / `SUBSTR(s,2,3)` | `SUBSTRING(s, 2, 3)` / `SUBSTR(s,2,3)` | `SUBSTR(s, 2, 3)` |
| Upper / Lower | `UPPER(s)` / `LOWER(s)` | `UPPER(s)` / `LOWER(s)` | `UPPER(s)` / `LOWER(s)` |
| Trim | `TRIM(s)` / `LTRIM(s)` / `RTRIM(s)` | `TRIM(s)` / `LTRIM(s)` / `RTRIM(s)` | `TRIM(s)` / `LTRIM(s)` / `RTRIM(s)` |
| Replace | `REPLACE(s, 'old', 'new')` | `REPLACE(s, 'old', 'new')` | `REPLACE(s, 'old', 'new')` |
| Left pad | `LPAD(s, 10, '0')` | `LPAD(s, 10, '0')` | Not built-in (use `SUBSTR`) |
| Right pad | `RPAD(s, 10, ' ')` | `RPAD(s, 10, ' ')` | Not built-in |
| Repeat | `REPEAT(s, n)` | `REPEAT(s, n)` | Not built-in |
| Reverse | `REVERSE(s)` | `REVERSE(s)` | Not built-in |
| Position/Find | `POSITION('x' IN s)` / `STRPOS(s,'x')` | `LOCATE('x', s)` / `INSTR(s, 'x')` | `INSTR(s, 'x')` |
| Split to array | `STRING_TO_ARRAY(s, ',')` | Not built-in (use JSON or recursive CTE) | Not built-in |
| Array to string | `ARRAY_TO_STRING(arr, ',')` | `GROUP_CONCAT(col SEPARATOR ',')` | `GROUP_CONCAT(col, ',')` |

## Type Casting

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| ANSI CAST | `CAST(x AS INTEGER)` | `CAST(x AS SIGNED)` | `CAST(x AS INTEGER)` |
| Shorthand | `x::integer` | — | — |
| To text | `CAST(x AS TEXT)` or `x::text` | `CAST(x AS CHAR)` | `CAST(x AS TEXT)` |
| To integer | `CAST(x AS INTEGER)` or `x::int` | `CAST(x AS SIGNED)` | `CAST(x AS INTEGER)` |
| To float | `CAST(x AS DOUBLE PRECISION)` | `CAST(x AS DOUBLE)` | `CAST(x AS REAL)` |
| To decimal | `CAST(x AS NUMERIC(10,2))` | `CAST(x AS DECIMAL(10,2))` | `CAST(x AS REAL)` (no true decimal) |
| To date | `CAST(x AS DATE)` or `x::date` | `CAST(x AS DATE)` | `date(x)` |
| To timestamp | `x::timestamptz` | `CAST(x AS DATETIME)` | `datetime(x)` |
| To JSON | `x::jsonb` | `CAST(x AS JSON)` | `json(x)` (3.38+) |

## Regular Expressions

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Match (case-sensitive) | `col ~ 'pattern'` | `col REGEXP 'pattern'` | Not built-in (use extension) |
| Match (case-insensitive) | `col ~* 'pattern'` | `col REGEXP 'pattern'` (CI by default) | Not built-in |
| Not match | `col !~ 'pattern'` | `col NOT REGEXP 'pattern'` | Not built-in |
| Extract | `SUBSTRING(col FROM 'pattern')` | `REGEXP_SUBSTR(col, 'pattern')` (8.0+) | Not built-in |
| Replace | `REGEXP_REPLACE(col, 'pat', 'rep')` | `REGEXP_REPLACE(col, 'pat', 'rep')` (8.0+) | Not built-in |
| Regex flavor | POSIX ERE | ICU (8.0+) or Henry Spencer | — |

> **SQLite note:** SQLite has no built-in regex support. The `REGEXP` operator exists syntactically but requires a user-defined function to be registered at runtime. Many SQLite wrappers (Python's `sqlite3`, Rust's `rusqlite`) support this via extensions.

## Aggregate Functions

| Function | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| `COUNT(*)` | ✅ | ✅ | ✅ |
| `COUNT(DISTINCT col)` | ✅ | ✅ | ✅ |
| `SUM(col)` | ✅ | ✅ | ✅ |
| `AVG(col)` | ✅ | ✅ | ✅ |
| `MIN(col)` / `MAX(col)` | ✅ | ✅ | ✅ |
| `STRING_AGG(col, ',')` | ✅ | — | — |
| `GROUP_CONCAT(col)` | — | ✅ (default limit 1024) | ✅ |
| `ARRAY_AGG(col)` | ✅ | — | — |
| `JSON_AGG(col)` | ✅ | `JSON_ARRAYAGG(col)` (5.7+) | `JSON_GROUP_ARRAY(col)` (3.38+) |
| `JSON_OBJECT_AGG(k, v)` | ✅ | `JSON_OBJECTAGG(k, v)` (5.7+) | `JSON_GROUP_OBJECT(k, v)` (3.38+) |
| `BOOL_AND(col)` / `BOOL_OR(col)` | ✅ | — (`BIT_AND`/`BIT_OR` on integers) | — |
| `PERCENTILE_CONT(0.5)` | ✅ (ordered-set aggregate) | — (use window function hack) | — |
| `FILTER (WHERE ...)` on aggregates | ✅ | ❌ (use `CASE WHEN` inside) | ✅ (3.30+) |

## Conditional Expressions

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| `CASE WHEN ... THEN ... END` | ✅ | ✅ | ✅ |
| `COALESCE(a, b, c)` | ✅ | ✅ | ✅ |
| `NULLIF(a, b)` | ✅ | ✅ | ✅ |
| `GREATEST(a, b, c)` | ✅ | ✅ | ✅ (3.34+) |
| `LEAST(a, b, c)` | ✅ | ✅ | ✅ (3.34+) |
| `IF(cond, true, false)` | ❌ (use `CASE`) | ✅ | ❌ (use `CASE`) or `IIF()` (3.32+) |
| `IFNULL(a, b)` | ❌ (use `COALESCE`) | ✅ | ✅ |
| `IIF(cond, true, false)` | ❌ | ❌ | ✅ (3.32+) |

## JSON Functions

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Access key (→ JSON) | `col -> 'key'` | `col -> '$.key'` / `JSON_EXTRACT(col, '$.key')` | `json_extract(col, '$.key')` |
| Access key (→ text) | `col ->> 'key'` | `col ->> '$.key'` (8.0.21+) / `JSON_UNQUOTE(JSON_EXTRACT(...))` | `json_extract(col, '$.key')` (returns text for strings) |
| Nested access | `col #> '{a,b}'` | `JSON_EXTRACT(col, '$.a.b')` | `json_extract(col, '$.a.b')` |
| Contains | `col @> '{"key": "val"}'` | `JSON_CONTAINS(col, '"val"', '$.key')` | Not built-in |
| Key exists | `col ? 'key'` | `JSON_CONTAINS_PATH(col, 'one', '$.key')` | `json_type(col, '$.key') IS NOT NULL` |
| Set value | `jsonb_set(col, '{key}', '"val"')` | `JSON_SET(col, '$.key', 'val')` | `json_set(col, '$.key', 'val')` |
| Remove key | `col - 'key'` | `JSON_REMOVE(col, '$.key')` | `json_remove(col, '$.key')` |
| Array length | `jsonb_array_length(col)` | `JSON_LENGTH(col)` | `json_array_length(col)` |
| Expand array | `jsonb_array_elements(col)` | `JSON_TABLE(col, '$[*]' ...)` | `json_each(col)` |
| Expand object | `jsonb_each(col)` | `JSON_TABLE(col, '$.*' ...)` | `json_each(col)` |

## Upsert Syntax

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Upsert | `INSERT ... ON CONFLICT (col) DO UPDATE SET ...` | `INSERT ... ON DUPLICATE KEY UPDATE ...` | `INSERT ... ON CONFLICT (col) DO UPDATE SET ...` |
| Reference new values | `EXCLUDED.col` | `VALUES(col)` (deprecated) / alias (8.0.19+) | `excluded.col` |
| Insert-or-ignore | `ON CONFLICT DO NOTHING` | `INSERT IGNORE INTO ...` | `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` |
| RETURNING | ✅ `RETURNING *` | ❌ | ✅ `RETURNING *` (3.35+) |

## Window Functions

| Function | PostgreSQL | MySQL (8.0+) | SQLite (3.25+) |
|---|---|---|---|
| `ROW_NUMBER()` | ✅ | ✅ | ✅ |
| `RANK()` / `DENSE_RANK()` | ✅ | ✅ | ✅ |
| `NTILE(n)` | ✅ | ✅ | ✅ |
| `LEAD(col, n)` / `LAG(col, n)` | ✅ | ✅ | ✅ |
| `FIRST_VALUE(col)` | ✅ | ✅ | ✅ |
| `LAST_VALUE(col)` | ✅ | ✅ | ✅ |
| `NTH_VALUE(col, n)` | ✅ | ✅ | ✅ |
| `PERCENT_RANK()` | ✅ | ✅ | ✅ |
| `CUME_DIST()` | ✅ | ✅ | ✅ |
| Named window (`WINDOW w AS`) | ✅ | ✅ | ✅ |
| `FILTER` on window agg | ✅ | ❌ | ✅ (3.30+) |

## EXPLAIN Syntax

| Operation | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Estimated plan | `EXPLAIN query` | `EXPLAIN query` | `EXPLAIN QUERY PLAN query` |
| Actual execution | `EXPLAIN ANALYZE query` | `EXPLAIN ANALYZE query` (8.0.18+) | ❌ (not available) |
| With buffers | `EXPLAIN (ANALYZE, BUFFERS) query` | — | — |
| JSON format | `EXPLAIN (FORMAT JSON) query` | `EXPLAIN FORMAT=JSON query` | — |
| Tree format | Default | `EXPLAIN FORMAT=TREE query` | — |

## Limits and Gotchas Quick Reference

| Gotcha | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| `\|\|` operator | String concatenation | Logical OR (by default!) | String concatenation |
| Boolean type | Native `BOOLEAN` | `TINYINT(1)` alias | No native; use `INTEGER` (0/1) |
| Foreign keys | Always enforced | Always enforced (InnoDB) | **Must enable per connection** |
| CTE materialization | Inline by default (v12+) | Inlined | Inlined |
| Recursive CTE limit | No limit | `cte_max_recursion_depth = 1000` | No limit |
| `ALTER TABLE` flexibility | Full | Full | Very limited |
| Multi-row upsert | ✅ Multi-row `VALUES` | ✅ Multi-row `VALUES` | ✅ Multi-row `VALUES` |
| Concurrent writers | ✅ Many (MVCC) | ✅ Many (row locks) | **One writer at a time** |
| NULL in UNIQUE | Multiple NULLs allowed | Multiple NULLs allowed | Multiple NULLs allowed |
| Case sensitivity (identifiers) | Lowercased by default | OS-dependent (`lower_case_table_names`) | Case-insensitive |
| Default transaction isolation | `READ COMMITTED` | `REPEATABLE READ` | `SERIALIZABLE` |
