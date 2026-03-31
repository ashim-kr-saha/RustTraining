# Appendix A: Reference Card

> A tear-out-style quick reference for every major API, pattern, and decision matrix covered in this book. Keep this open in a second tab while building.

---

## Widget Lifecycle (Chapter 1)

### StatelessWidget

| Phase | Method | Purpose |
|-------|--------|---------|
| Create | `build(BuildContext)` | Returns the widget tree; called on every rebuild |

### StatefulWidget

| Phase | Method | Called When |
|-------|--------|------------|
| 1. Create | `createState()` | Widget instantiated |
| 2. Init | `initState()` | State object inserted into tree (once) |
| 3. Dependencies | `didChangeDependencies()` | `InheritedWidget` ancestor changes |
| 4. Build | `build(BuildContext)` | `setState()`, dependency change, or parent rebuild |
| 5. Update | `didUpdateWidget(old)` | Parent rebuilds with new config (same `runtimeType` + `key`) |
| 6. Deactivate | `deactivate()` | State removed from tree (may be reinserted) |
| 7. Dispose | `dispose()` | State permanently removed — cancel timers, streams, controllers |

### Key Rules

- Never call `setState()` inside `build()`.
- Always call `super.dispose()` **last** in `dispose()`.
- Always call `super.initState()` **first** in `initState()`.
- Use `const` constructors to skip rebuild when parent rebuilds.

---

## RenderObject Constraint Protocol (Chapter 1)

```
Constraints go DOWN → Parent tells child "you have this much space"
Sizes go UP → Child tells parent "I need this much space"
Parent positions child → Offset set in parentData
```

| Class | Constraint Type | Key Fields |
|-------|----------------|------------|
| `RenderBox` | `BoxConstraints` | `minWidth`, `maxWidth`, `minHeight`, `maxHeight` |
| `RenderSliver` | `SliverConstraints` | `scrollOffset`, `remainingPaintExtent`, `crossAxisExtent` |

---

## Rendering Engine Comparison (Chapter 2)

| Feature | Skia | Impeller | CanvasKit (Web) | HTML (Web) |
|---------|------|----------|-----------------|------------|
| Shader compilation | Runtime (jank) | Pre-compiled (smooth) | Runtime (cached) | N/A |
| Custom painting | Full | Full | Full | Limited |
| Text rendering | Native | Native | HarfBuzz (WASM) | Browser |
| Bundle size | N/A | N/A | ~2 MB | ~400 KB |
| Best for | Legacy/desktop | iOS, Android | Rich apps | SEO, size |

---

## State Management Decision Matrix (Chapter 3)

| Criterion | `setState` | BLoC | Riverpod |
|-----------|-----------|------|----------|
| Scope | Single widget | Feature module | App-wide |
| Testability | Manual | Excellent (pure functions) | Excellent (overrides) |
| Boilerplate | None | High (Event/State classes) | Low |
| Async support | Manual | `mapEventToState` | `AsyncNotifier` |
| DevTools | Widget inspector | BLoC Observer | Riverpod Observer |
| Learning curve | Trivial | Moderate | Moderate |
| Best for | Local UI state | Large teams, strict patterns | Most apps |

### Riverpod Provider Types

| Provider | Use Case | Example |
|----------|----------|---------|
| `Provider` | Computed/derived values, service locators | Database instance, router |
| `StateProvider` | Simple mutable state (int, string, enum) | Search query, toggle |
| `NotifierProvider` | Complex synchronous state with methods | Editor state, form state |
| `AsyncNotifierProvider` | Complex async state with methods | Auth state, document loader |
| `FutureProvider` | One-shot async reads | Config fetch, initial data |
| `StreamProvider` | Reactive streams | WebSocket, Firestore |

### Provider Modifiers

| Modifier | Effect |
|----------|--------|
| `.autoDispose` | Dispose when no listeners remain |
| `.family(arg)` | Parameterized — creates one provider per argument |
| `.autoDispose.family(arg)` | Both: per-argument + auto-cleanup |

---

## GoRouter Quick Reference (Chapter 4)

### Route Definition

```dart
GoRoute(
  path: '/users/:id',         // Path parameter
  name: 'user-profile',       // Named route
  builder: (context, state) {
    final id = state.pathParameters['id']!;
    final tab = state.uri.queryParameters['tab'];
    return UserScreen(id: id, tab: tab);
  },
  redirect: (context, state) {
    // Return null to proceed, or a path to redirect
    return isAuthenticated ? null : '/login';
  },
  routes: [                    // Nested routes
    GoRoute(path: 'settings', ...),
  ],
)
```

### Navigation Methods

| Method | Purpose | Example |
|--------|---------|---------|
| `context.go('/path')` | Replace current stack | `context.go('/home')` |
| `context.push('/path')` | Push onto stack | `context.push('/details')` |
| `context.pop()` | Pop top route | `context.pop()` |
| `context.goNamed('name')` | Navigate by name | `context.goNamed('user', pathParameters: {'id': '42'})` |
| `context.pushNamed('name')` | Push by name | Same as above |

### Shell Routes

| Type | Purpose |
|------|---------|
| `ShellRoute` | Shared scaffold around child routes (persistent app bar, nav) |
| `StatefulShellRoute` | Preserves state of each branch independently (bottom nav tabs) |

### Web URL Strategy

```dart
// main.dart — use path-based URLs (no hash)
GoRouter.optionURLReflectsImperativeAPIs = true;
usePathUrlStrategy(); // from package:flutter_web_plugins
```

---

## Isolate Patterns (Chapter 5)

### Choosing the Right Pattern

| Pattern | Use Case | Zero-Copy | Lifetime |
|---------|----------|-----------|----------|
| `compute()` / `Isolate.run()` | One-shot CPU work | ✅ (via `Isolate.exit`) | Single call |
| `Isolate.spawn()` + `Isolate.exit()` | One-shot with `TransferableTypedData` | ✅ | Single call |
| Long-lived worker Isolate | Repeated tasks (DB, search) | Partial | App lifetime |
| Drift `createInBackground()` | SQLite on background Isolate | ✅ (Drift handles it) | App lifetime |

### Memory Passing Rules

| Data Type | Can Cross Isolate? | Zero-Copy? |
|-----------|-------------------|------------|
| `int`, `double`, `bool`, `String` | ✅ | Copy |
| `List`, `Map` (of primitives) | ✅ | Copy |
| `Uint8List`, `Float64List` | ✅ | ✅ via `Isolate.exit()` or `TransferableTypedData` |
| Classes with methods | ✅ (if fields are sendable) | Copy |
| `Function`, closures | ❌ | N/A |
| `ReceivePort`, `SendPort` | ✅ (ports are sendable) | N/A |
| FFI `Pointer` | ❌ (address not valid cross-Isolate) | N/A |
| `RenderObject`, `Element` | ❌ | N/A |

### Event Loop Priority

```
1. Microtasks (Future.then, scheduleMicrotask) — drain ALL before proceeding
2. Event queue (Timer, I/O callbacks, gesture events) — one at a time
3. Never: Isolate.run() results arrive via event queue
```

---

## Platform Channel Data Types (Chapter 6)

### MethodChannel Codec Mapping

| Dart | Android (Java/Kotlin) | iOS (Swift) | Web (JS) |
|------|----------------------|-------------|----------|
| `null` | `null` | `nil` | `null` |
| `bool` | `Boolean` | `Bool` / `NSNumber` | `Boolean` |
| `int` (≤32 bit) | `Integer` | `Int` / `NSNumber` | `Number` |
| `int` (>32 bit) | `Long` | `Int64` / `NSNumber` | `Number` |
| `double` | `Double` | `Double` / `NSNumber` | `Number` |
| `String` | `String` | `String` | `String` |
| `Uint8List` | `byte[]` | `FlutterStandardTypedData` | `Uint8Array` |
| `Int32List` | `int[]` | `FlutterStandardTypedData` | `Int32Array` |
| `Float64List` | `double[]` | `FlutterStandardTypedData` | `Float64Array` |
| `List` | `ArrayList` | `Array` / `NSArray` | `Array` |
| `Map` | `HashMap` | `Dictionary` / `NSDictionary` | `Object` |

### Channel Types

| Channel | Direction | Use Case |
|---------|-----------|----------|
| `MethodChannel` | Dart ↔ Native (request/response) | One-shot calls (get battery, start scan) |
| `EventChannel` | Native → Dart (stream) | Continuous data (sensor readings, BLE) |
| `BasicMessageChannel` | Dart ↔ Native (raw messages) | Custom codecs, simple data passing |

### dart:ffi Quick Reference

```dart
// Load library
final lib = DynamicLibrary.open('libcrypto.dylib');    // macOS
final lib = DynamicLibrary.open('libcrypto.so');        // Linux/Android
final lib = DynamicLibrary.process();                   // Statically linked

// Look up function
typedef NativeAdd = Int32 Function(Int32, Int32);       // C signature
typedef DartAdd = int Function(int, int);               // Dart signature
final add = lib.lookupFunction<NativeAdd, DartAdd>('add_numbers');

// Call
final result = add(3, 4); // => 7

// Strings (must allocate + free)
final ptr = name.toNativeUtf8();                        // malloc
final cString = ptr.toDartString();                     // read back
calloc.free(ptr);                                       // ✅ Always free
```

---

## Adaptive Breakpoints (Chapter 7)

### Recommended Breakpoints

| Width | Layout | Navigation | Input |
|-------|--------|------------|-------|
| < 600px | Single column | Bottom nav | Touch |
| 600–839px | Two columns (compact) | Navigation rail | Touch/Stylus |
| 840–1199px | Two columns (medium) | Navigation rail | Mouse/Touch |
| ≥ 1200px | Three columns (expanded) | Sidebar | Mouse/Keyboard |

### Input Mode Detection

```dart
// Detect primary input modality
final isTouchPrimary = MediaQuery.of(context).navigationMode == NavigationMode.directional;

// Platform-specific checks
final isDesktop = !kIsWeb &&
    (Platform.isMacOS || Platform.isWindows || Platform.isLinux);
final isMobile = !kIsWeb &&
    (Platform.isIOS || Platform.isAndroid);

// Hover support check (in MouseRegion)
MouseRegion(
  onEnter: (_) => setState(() => _isHovered = true),
  onExit: (_) => setState(() => _isHovered = false),
  child: ...,
)
```

### Keyboard Shortcut Pattern

```dart
Shortcuts(
  shortcuts: {
    SingleActivator(LogicalKeyboardKey.keyS, meta: true): SaveIntent(),
    SingleActivator(LogicalKeyboardKey.keyS, control: true): SaveIntent(),
  },
  child: Actions(
    actions: {
      SaveIntent: CallbackAction<SaveIntent>(onInvoke: (_) => save()),
    },
    child: Focus(autofocus: true, child: ...),
  ),
)
```

---

## Common Pitfalls Checklist

| Pitfall | Chapter | Fix |
|---------|---------|-----|
| Rebuilding entire tree on state change | Ch 1, 3 | Use `const`, select specific providers |
| Shader compilation jank on first animation | Ch 2 | Use Impeller, or warm up shaders |
| Prop-drilling state through 5+ widgets | Ch 3 | Use Riverpod providers |
| Hardcoded routes as strings | Ch 4 | Use named routes with type-safe params |
| Blocking UI thread with heavy computation | Ch 5 | Use `Isolate.run()` or background worker |
| Passing closures across Isolates | Ch 5 | Pass `SendPort` and message instead |
| Forgetting to free FFI memory | Ch 6 | Always `calloc.free()` allocated pointers |
| Same layout on phone and desktop | Ch 7 | Use `LayoutBuilder` for adaptive breakpoints |
| Not disposing controllers/timers | Ch 1 | Always override `dispose()` |
| Using `setState` in a `FutureBuilder` callback | Ch 1, 3 | Use Riverpod `AsyncNotifier` instead |
