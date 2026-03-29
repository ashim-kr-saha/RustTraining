# Appendix: Summary and Reference Card

A quick-reference cheat sheet for everything covered in this book. Print this, bookmark it, or keep it open in a split pane while writing macros.

---

## `macro_rules!` Fragment Specifiers

| Specifier | Matches | Can Be Followed By |
|-----------|---------|-------------------|
| `$x:expr` | Any expression | `=>`, `,`, `;` |
| `$x:ident` | An identifier (not a keyword) | Anything |
| `$x:ty` | A type | `=>`, `,`, `;`, `=`, `\|`, `>`, `>>`, `[`, `{`, `as`, `where` |
| `$x:pat` | A pattern | `=>`, `,`, `=`, `\|`, `if`, `in` |
| `$x:path` | A path | `=>`, `,`, `;`, `=`, `\|`, `>`, `>>`, `[`, `{`, `as`, `where` |
| `$x:stmt` | A statement | `=>`, `,`, `;` |
| `$x:block` | A block `{ ... }` | Anything |
| `$x:item` | A top-level item | Anything |
| `$x:meta` | Attribute content | Anything |
| `$x:literal` | A literal value | Anything |
| `$x:lifetime` | A lifetime `'a` | Anything |
| `$x:vis` | A visibility modifier (or empty) | Anything except `,` before ident |
| `$x:tt` | A single token tree | Anything |

## `macro_rules!` Repetition Syntax

| Pattern | Meaning |
|---------|---------|
| `$($x:expr),*` | Zero or more `expr`, separated by `,` |
| `$($x:expr),+` | One or more `expr`, separated by `,` |
| `$($x:expr)?` | Zero or one `expr` (optional) |
| `$($x:expr),+ $(,)?` | One or more with optional trailing comma |
| `$( $key:expr => $val:expr ),*` | Paired repetition — `$key` and `$val` must have same count |

## Declarative Macro Patterns

| Pattern | Use Case | Chapter |
|---------|----------|---------|
| Multiple rules (top-to-bottom) | Overloaded macros | Ch 1 |
| `$crate::path` | Cross-crate path resolution | Ch 2 |
| TT-munching | Process tokens one at a time | Ch 3 |
| Push-down accumulation | Build output across recursion | Ch 3 |
| Internal rules (`@name`) | Private helper arms | Ch 3 |
| Callback macros | Pass output to another macro | Ch 3 |

## Procedural Macro Signatures

```rust
// Derive macro — appends code, original item preserved
#[proc_macro_derive(Name)]
#[proc_macro_derive(Name, attributes(helper))]  // with helper attributes
pub fn derive_fn(input: TokenStream) -> TokenStream { ... }

// Attribute macro — replaces the item
#[proc_macro_attribute]
pub fn attr_fn(attr: TokenStream, item: TokenStream) -> TokenStream { ... }

// Function-like macro — arbitrary invocation
#[proc_macro]
pub fn fn_like(input: TokenStream) -> TokenStream { ... }
```

## `Cargo.toml` for a Proc-Macro Crate

```toml
[lib]
proc-macro = true

[dependencies]
syn = { version = "2", features = ["full"] }
quote = "1"
proc-macro2 = "1"

[dev-dependencies]
trybuild = "1"
```

## Common `syn` Types

| Type | Represents | Access Pattern |
|------|-----------|---------------|
| `DeriveInput` | A struct/enum/union with derives | `parse_macro_input!(input as DeriveInput)` |
| `ItemFn` | A function definition | `parse_macro_input!(item as ItemFn)` |
| `Data::Struct(DataStruct)` | Struct data | `ast.data` → match on `Data::Struct` |
| `Data::Enum(DataEnum)` | Enum data | `ast.data` → match on `Data::Enum` |
| `Fields::Named(FieldsNamed)` | Named struct fields `{ x: i32 }` | `data.fields` → match on `Fields::Named` |
| `Fields::Unnamed(FieldsUnnamed)` | Tuple struct fields `(i32, i32)` | `data.fields` → match on `Fields::Unnamed` |
| `Fields::Unit` | Unit struct | `data.fields` → match on `Fields::Unit` |
| `Field` | A single field | `.ident`, `.ty`, `.vis`, `.attrs` |
| `Generics` | Generic parameters | `ast.generics` |
| `Attribute` | An attribute `#[...]` | `field.attrs`, `ast.attrs` |
| `Type` | Any type expression | `field.ty` |
| `Ident` | An identifier | `ast.ident`, `field.ident` |
| `Variant` | An enum variant | `data.variants.iter()` |

## `syn` Essential Functions

```rust
// Parse input
let ast = parse_macro_input!(input as DeriveInput);
let ast: DeriveInput = syn::parse2(token_stream)?;

// Split generics for impl blocks (THE most important function)
let (impl_generics, ty_generics, where_clause) = ast.generics.split_for_impl();

// Add trait bounds to generics
let mut generics = ast.generics.clone();
for param in generics.type_params_mut() {
    param.bounds.push(syn::parse_quote!(::std::fmt::Debug));
}

// Create a where clause if none exists
let where_clause = generics.make_where_clause();

// Create errors with spans
syn::Error::new(span, "message");
syn::Error::new_spanned(&token, "message");
err.to_compile_error();  // → TokenStream with compile_error!()
err1.combine(err2);      // Accumulate multiple errors
```

## `quote!` Interpolation

```rust
use quote::{quote, format_ident};

// Basic interpolation
let name: &Ident = &ast.ident;
quote! { struct #name { } }

// Repetition (zero or more, comma-separated)
let fields: Vec<&Ident> = /* ... */;
let types: Vec<&Type> = /* ... */;
quote! { #(pub #fields: #types,)* }

// Repetition (semicolon-separated)
quote! { #(println!("{}", #fields);)* }

// Nested repetition
quote! { #(#(#inner_items)*)* }

// Create new identifiers
let getter = format_ident!("get_{}", field_name);
let builder = format_ident!("{}Builder", struct_name);

// Interpolate a string as a string literal
let name_str = name.to_string(); // String
quote! { println!("{}", #name_str); } // Interpolated as a literal
```

## Error Handling Pattern

```rust
#[proc_macro_derive(MyTrait)]
pub fn derive_fn(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    impl_my_trait(&ast)
        .unwrap_or_else(|err| err.to_compile_error())
        .into()
}

fn impl_my_trait(ast: &DeriveInput) -> syn::Result<proc_macro2::TokenStream> {
    // Use ? freely — errors carry spans
    let fields = match &ast.data {
        Data::Struct(d) => match &d.fields {
            Fields::Named(f) => &f.named,
            _ => return Err(Error::new_spanned(&ast.ident, "need named fields")),
        },
        _ => return Err(Error::new_spanned(&ast.ident, "need a struct")),
    };
    
    Ok(quote! { /* ... */ })
}
```

## Testing Quick Reference

```bash
# Install debugging tools
cargo install cargo-expand

# View macro expansion (requires nightly)
cargo +nightly expand
cargo +nightly expand --lib
cargo +nightly expand main

# Run trybuild tests
cargo test
TRYBUILD=overwrite cargo test  # Generate/update .stderr snapshots
```

## Debugging Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `expected proc_macro::TokenStream, found proc_macro2::TokenStream` | Missing `.into()` | Add `.into()` at the return boundary |
| `proc macro panicked` | Unwrap/panic in macro code | Use `syn::Result` + `to_compile_error()` |
| Type error in generated code | Wrong path or missing bounds | Run `cargo expand` to see output |
| `cannot find value` in macro expansion | Hygiene issue (wrong span) | Use `Span::call_site()` for user-visible idents |
| `macro undefined` in another crate | Missing `#[macro_export]` or wrong import | Add `#[macro_export]`, use `$crate` |
| Recursion limit exceeded | Deep TT-munching | Add `#![recursion_limit = "N"]` or switch to proc-macro |
| Attribute not recognized on field | Forgot to register helper | Add `attributes(helper)` to `proc_macro_derive` |

## Ecosystem Crates

| Crate | Purpose | When to Use |
|-------|---------|-------------|
| `syn` | Parse TokenStream → AST | Every proc-macro |
| `quote` | Generate code from templates | Every proc-macro |
| `proc-macro2` | Testable token types | Every proc-macro |
| `trybuild` | Snapshot-test compile errors | Testing proc-macros |
| `cargo-expand` | View macro expansion | Debugging |
| `darling` | Declarative attribute parsing | Complex attribute args |
| `paste` | Identifier concatenation in `macro_rules!` | When you need `[<get_ $field>]` in declarative macros |
| `proc-macro-error` | Ergonomic error emission | Alternative to manual `syn::Error` |

---

> **See also:**
> - [The Rust Reference: Macros](https://doc.rust-lang.org/reference/macros.html)
> - [The Little Book of Rust Macros](https://danielkeep.github.io/tlborm/book/)
> - [`syn` documentation](https://docs.rs/syn/)
> - [`quote` documentation](https://docs.rs/quote/)
> - [`proc-macro2` documentation](https://docs.rs/proc-macro2/)
> - [`trybuild` documentation](https://docs.rs/trybuild/)
