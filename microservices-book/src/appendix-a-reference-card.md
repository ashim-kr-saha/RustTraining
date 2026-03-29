# Appendix A: Microservices Reference Card

A compact cheat sheet covering the key APIs, types, and patterns from every chapter. Print this, pin it on your wall, or `Ctrl+F` it during code reviews.

---

## Axum Extractors

| Extractor | Source | Example | Notes |
|-----------|--------|---------|-------|
| `Path<T>` | URL segments | `Path((org, id)): Path<(String, i64)>` | Deserializes via `serde` |
| `Query<T>` | `?key=value` | `Query(params): Query<Pagination>` | `#[derive(Deserialize)]` |
| `Json<T>` | Request body | `Json(body): Json<CreateTask>` | Consumes body — must be **last** |
| `State<T>` | `Router::with_state()` | `State(pool): State<PgPool>` | `T: Clone + Send + Sync + 'static` |
| `Extension<T>` | Middleware-injected | `Extension(user): Extension<User>` | Legacy — prefer `State` |
| `HeaderMap` | All headers | `headers: HeaderMap` | Raw header access |
| `TypedHeader<T>` | Typed header | `TypedHeader(auth): TypedHeader<Authorization<Bearer>>` | Requires `axum-extra` |
| `Form<T>` | `x-www-form-urlencoded` | `Form(data): Form<LoginForm>` | Consumes body |
| `Multipart` | `multipart/form-data` | `mut multipart: Multipart` | Streaming — consumes body |
| `ConnectInfo<T>` | Socket address | `ConnectInfo(addr): ConnectInfo<SocketAddr>` | Requires `.into_make_service_with_connect_info()` |
| `MatchedPath` | Route pattern | `path: MatchedPath` | e.g. `"/users/{id}"` |
| `OriginalUri` | Full URI | `OriginalUri(uri): OriginalUri` | Before nest() prefix stripping |

> **Rule:** Body-consuming extractors (`Json`, `Form`, `Multipart`) must appear as the **last** function parameter. Only one per handler.

---

## Axum Routing Cheat Sheet

```rust
// Basic routes
Router::new()
    .route("/items", get(list).post(create))
    .route("/items/{id}", get(read).put(update).delete(remove))
    // Nesting — all routes under /api/v1
    .nest("/api/v1", api_router)
    // Merging — combine multiple routers (state types must match)
    .merge(health_router)
    // Fallback for unmatched routes
    .fallback(|| async { (StatusCode::NOT_FOUND, "Not found") })
    // Shared state
    .with_state(app_state)
```

---

## Tower Standard Layers

| Layer | Purpose | Example |
|-------|---------|---------|
| `TimeoutLayer` | Abort if handler exceeds duration | `TimeoutLayer::new(Duration::from_secs(30))` |
| `CorsLayer` | CORS headers | `CorsLayer::permissive()` or `CorsLayer::new().allow_origin(...)` |
| `CompressionLayer` | gzip/brotli response compression | `CompressionLayer::new()` |
| `DecompressionLayer` | Decompress request bodies | `DecompressionLayer::new()` |
| `RateLimitLayer` | Limit request rate | `RateLimitLayer::new(100, Duration::from_secs(60))` |
| `ConcurrencyLimitLayer` | Max concurrent requests | `ConcurrencyLimitLayer::new(1000)` |
| `TraceLayer` | OpenTelemetry-compatible spans | `TraceLayer::new_for_http()` |
| `SetRequestIdLayer` | Inject request IDs | `SetRequestIdLayer::x_request_id(MakeRequestUuid)` |
| `PropagateRequestIdLayer` | Copy request ID to response | Chain with `SetRequestIdLayer` |

**Layer ordering** — outermost wraps first:

```rust
ServiceBuilder::new()
    .layer(TraceLayer::new_for_http())      // 1st: trace the whole request
    .layer(TimeoutLayer::new(secs(30)))     // 2nd: enforce timeout
    .layer(CorsLayer::permissive())         // 3rd: CORS headers
    .layer(CompressionLayer::new())         // 4th: compress response
    .service(app)
```

---

## SQLx Macro Quick Reference

| Macro | Returns | Compile-Time Checked | Use Case |
|-------|---------|---------------------|----------|
| `query!("SQL", ...)` | Anonymous record | ✅ | Quick inline queries |
| `query_as!(Type, "SQL", ...)` | Named struct | ✅ | Map to domain types |
| `query_scalar!("SQL", ...)` | Single value | ✅ | `SELECT COUNT(*)`, `SELECT id` |
| `QueryBuilder::new("SQL")` | Dynamic SQL | ❌ | `WHERE ... IN (...)`, dynamic filters |
| `query("SQL").bind(v)` | Row | ❌ | Runtime-constructed queries |
| `query_as::<_, T>("SQL").bind(v)` | Named struct | ❌ | Runtime queries with struct mapping |

### Type Overrides in `query!`

```rust
// Force NOT NULL (column may be nullable but you guarantee non-null)
sqlx::query_as!(Task, r#"SELECT id as "id!", title FROM tasks"#)

// Force nullable
sqlx::query_as!(Task, r#"SELECT id as "id?", title FROM tasks"#)

// Explicit Rust type
sqlx::query_as!(Task, r#"SELECT id as "id: i32" FROM tasks"#)
```

---

## PostgreSQL ↔ Rust Type Map (SQLx)

| PostgreSQL | Rust | Notes |
|-----------|------|-------|
| `BIGSERIAL` / `INT8` | `i64` | Primary keys |
| `SERIAL` / `INT4` | `i32` | |
| `SMALLINT` | `i16` | |
| `TEXT` / `VARCHAR` | `String` | |
| `BOOLEAN` | `bool` | |
| `TIMESTAMPTZ` | `chrono::DateTime<Utc>` | Requires `chrono` feature |
| `TIMESTAMP` | `chrono::NaiveDateTime` | No timezone |
| `DATE` | `chrono::NaiveDate` | |
| `UUID` | `uuid::Uuid` | Requires `uuid` feature |
| `JSONB` | `serde_json::Value` | Requires `json` feature |
| `BYTEA` | `Vec<u8>` | |
| `NUMERIC` | `rust_decimal::Decimal` | Requires `rust_decimal` feature |
| `INET` | `std::net::IpAddr` | ||
| `FLOAT8` | `f64` | |
| `FLOAT4` | `f32` | |
| `NULL` column | `Option<T>` | Any nullable column |

---

## gRPC / Tonic Patterns

### Proto Field Types → Rust Types

| Proto Type | Rust Type | Notes |
|-----------|-----------|-------|
| `string` | `String` | |
| `int64` | `i64` | |
| `int32` | `i32` | |
| `bool` | `bool` | |
| `double` | `f64` | |
| `float` | `f32` | |
| `bytes` | `Vec<u8>` | |
| `google.protobuf.Timestamp` | `prost_types::Timestamp` | |
| `optional string` | `Option<String>` | Proto3 explicit optional |
| `repeated Foo` | `Vec<Foo>` | |
| `map<string, int32>` | `HashMap<String, i32>` | |

### Streaming Patterns

| Pattern | Proto Keyword | Rust Server Return |
|---------|--------------|-------------------|
| Unary | (none) | `Result<Response<T>, Status>` |
| Server-streaming | `returns (stream T)` | `Result<Response<ReceiverStream<Result<T, Status>>>, Status>` |
| Client-streaming | `rpc Foo(stream T)` | Request contains `Streaming<T>` |
| Bidirectional | Both `stream` | Both patterns combined |

### gRPC Status Codes → HTTP Equivalents

| gRPC Code | HTTP Status | When to Use |
|-----------|-------------|------------|
| `OK` | 200 | Success |
| `INVALID_ARGUMENT` | 400 | Bad request payload |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `ALREADY_EXISTS` | 409 | Unique constraint violation |
| `PERMISSION_DENIED` | 403 | Forbidden |
| `UNAUTHENTICATED` | 401 | Missing/invalid credentials |
| `RESOURCE_EXHAUSTED` | 429 | Rate limited |
| `INTERNAL` | 500 | Unexpected server error |
| `UNAVAILABLE` | 503 | Service down / retry later |
| `DEADLINE_EXCEEDED` | 504 | Timeout |

---

## `PgPool` Configuration Reference

```rust
PgPoolOptions::new()
    .max_connections(20)              // Max pool size
    .min_connections(5)               // Eager warm connections
    .acquire_timeout(Duration::from_secs(3))  // Wait for connection
    .idle_timeout(Duration::from_secs(600))   // Close idle connections
    .max_lifetime(Duration::from_secs(1800))  // Recycle connections
    .connect("postgres://user:pass@host/db")
    .await?;
```

**Pool sizing rule of thumb:** `max_connections` = CPU cores × 2 + disk spindles (usually 2–4× vCPU count for cloud instances).

---

## Tower Service Trait

```rust
pub trait Service<Request> {
    type Response;
    type Error;
    type Future: Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>>;
    fn call(&mut self, req: Request) -> Self::Future;
}
```

Every Axum handler compiles into a `Service`. Every Tonic server is a `Service`. Every middleware wraps a `Service`. This is the unifying abstraction.

---

## Protocol Multiplexing Decision Tree

```
Incoming TCP connection
        │
        ▼
   Is content-type
  "application/grpc"?
     /         \
   Yes          No
    │            │
    ▼            ▼
  Tonic        Axum
  (gRPC)      (REST)
```

Both protocols use HTTP/2 under the hood. The `content-type` header is the discriminator.

---

## Common `cargo` Commands for This Stack

```bash
# Development
cargo run                           # Start the server
cargo watch -x run                  # Auto-restart on file changes

# Database
sqlx database create                # Create the database
sqlx migrate run                    # Apply all migrations
sqlx prepare                        # Generate offline query data for CI

# Protobuf
cargo build                         # build.rs runs tonic-build automatically

# Testing
cargo test                          # Run all tests
cargo test -- --nocapture           # See println! output
DATABASE_URL=postgres://... cargo test  # Integration tests with real DB

# Linting
cargo clippy -- -D warnings         # Treat warnings as errors
cargo fmt --check                   # Check formatting
```

---

> **Tip:** Bookmark this appendix. When you're deep in an implementation and can't remember whether `query!` returns an anonymous struct or a named one, or which gRPC status maps to HTTP 409 — this is where you come.
