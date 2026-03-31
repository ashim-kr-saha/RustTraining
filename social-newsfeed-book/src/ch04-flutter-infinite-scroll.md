# 4. The Flutter Infinite Scroll Architecture 🟡

> **The Problem:** The user opens the app and sees a feed. They flick their thumb upward and posts stream endlessly — images load instantly, videos autoplay silently, and the scroll never stutters. Behind this seemingly simple UX lies a complex client architecture: cursor-based pagination, aggressive memory management (disposing off-screen video players that consume 50 MB each), local SQLite caching for offline-first behavior, and a state management strategy that keeps the UI buttery smooth at 60 fps.

---

## Why Not OFFSET-Based Pagination?

The server API is the contract between client and backend. The most common beginner mistake: using SQL `OFFSET` for pagination.

| | OFFSET-Based | Cursor-Based |
|---|---|---|
| API call | `GET /feed?page=3&size=20` | `GET /feed?cursor=eyJ0cyI6...&size=20` |
| Server query | `SELECT ... OFFSET 40 LIMIT 20` | `SELECT ... WHERE (ts, id) < (?, ?) LIMIT 20` |
| Performance | $O(N)$ — DB scans and discards OFFSET rows | $O(\log N)$ — index seek |
| Consistency | **Broken** — new posts shift items between pages | **Stable** — cursor is a fixed point in time |
| Duplicate posts? | Yes — when new posts push items to next page | No — cursor anchors to exact position |
| Deleted posts? | Yes — skipped items cause gaps | No — cursor skips over deleted items naturally |

### The Cursor Contract

The cursor is an opaque, base64-encoded token containing a `(timestamp, post_id)` tuple. The server returns it in every response:

```json
{
  "posts": [ ... ],
  "next_cursor": "eyJ0cyI6MTcxMTkzMjgwMCwiaWQiOjk5MDAxfQ==",
  "has_more": true
}
```

Decoded: `{"ts": 1711932800, "id": 99001}`

The server query using the cursor:

```sql
SELECT p.id, p.author_id, p.content, p.created_at, p.score
FROM ranked_feed p
WHERE p.user_id = $1
  AND (p.created_at, p.id) < ($2, $3)   -- cursor comparison
ORDER BY p.created_at DESC, p.id DESC
LIMIT $4;                                -- page_size
```

The `(created_at, id)` composite comparison ensures:
- Deterministic ordering even when timestamps collide.
- Index-only scan on `(user_id, created_at DESC, id DESC)`.

---

## Flutter Architecture: The Infinite List

```mermaid
flowchart TB
    subgraph UI Layer
        LS["ListView.builder<br/>(slivers + viewport)"]
        SC["ScrollController<br/>(position listener)"]
    end

    subgraph State Management ["State (Riverpod)"]
        FN["FeedNotifier<br/>• List&lt;Post&gt; posts<br/>• String? nextCursor<br/>• bool isLoading<br/>• bool hasMore"]
    end

    subgraph Data Layer
        REPO["FeedRepository"]
        API["FeedApiClient<br/>(Dio + interceptors)"]
        CACHE["LocalCache<br/>(SQLite + drift)"]
    end

    SC -->|"position > 80%"| FN
    FN -->|"fetchNextPage()"| REPO
    REPO -->|"network first"| API
    REPO -->|"fallback / prefetch"| CACHE
    API -->|"Response + cursor"| REPO
    REPO -->|"append posts"| FN
    FN -->|"notify listeners"| LS
    CACHE -->|"persist for offline"| REPO

    style LS fill:#74c0fc,stroke:#333
    style FN fill:#ffd43b,stroke:#333
    style CACHE fill:#69db7c,stroke:#333
```

### The ScrollController Trigger

The key to infinite scroll: detect when the user is **near the bottom** and fetch the next page before they reach it.

```dart
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // Load initial page
    ref.read(feedNotifierProvider.notifier).fetchNextPage();
  }

  void _onScroll() {
    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.position.pixels;
    // Trigger fetch when 80% scrolled
    if (currentScroll >= maxScroll * 0.8) {
      ref.read(feedNotifierProvider.notifier).fetchNextPage();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final feedState = ref.watch(feedNotifierProvider);

    return RefreshIndicator(
      onRefresh: () =>
          ref.read(feedNotifierProvider.notifier).refresh(),
      child: ListView.builder(
        controller: _scrollController,
        itemCount: feedState.posts.length + (feedState.hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index >= feedState.posts.length) {
            return const Center(child: CircularProgressIndicator());
          }
          return PostCard(post: feedState.posts[index]);
        },
      ),
    );
  }
}
```

### The FeedNotifier (Riverpod)

```dart
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'feed_notifier.g.dart';

class FeedState {
  final List<Post> posts;
  final String? nextCursor;
  final bool isLoading;
  final bool hasMore;

  const FeedState({
    this.posts = const [],
    this.nextCursor,
    this.isLoading = false,
    this.hasMore = true,
  });

  FeedState copyWith({
    List<Post>? posts,
    String? nextCursor,
    bool? isLoading,
    bool? hasMore,
  }) =>
      FeedState(
        posts: posts ?? this.posts,
        nextCursor: nextCursor ?? this.nextCursor,
        isLoading: isLoading ?? this.isLoading,
        hasMore: hasMore ?? this.hasMore,
      );
}

@riverpod
class FeedNotifier extends _$FeedNotifier {
  @override
  FeedState build() => const FeedState();

  Future<void> fetchNextPage() async {
    if (state.isLoading || !state.hasMore) return;
    state = state.copyWith(isLoading: true);

    try {
      final repo = ref.read(feedRepositoryProvider);
      final response = await repo.getFeed(
        cursor: state.nextCursor,
        pageSize: 20,
      );

      state = state.copyWith(
        posts: [...state.posts, ...response.posts],
        nextCursor: response.nextCursor,
        isLoading: false,
        hasMore: response.hasMore,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false);
      // Error handling: show snackbar, retry logic, etc.
    }
  }

  Future<void> refresh() async {
    state = const FeedState(); // Reset state
    await fetchNextPage();
  }
}
```

---

## Memory Management: The Real Challenge

A social feed with mixed media is a **memory minefield**:

| Content Type | Memory per Item | Danger |
|---|---|---|
| Text-only post | ~2 KB | None |
| Single image (decoded) | 2–8 MB | Moderate |
| Image carousel (5 images) | 10–40 MB | High |
| Video player (initialized) | 30–80 MB | **Critical** |
| Video player (buffered, playing) | 50–150 MB | **Catastrophic** |

A user scrolling through 100 posts with 20 videos would consume **1–3 GB of RAM** without mitigation. iOS will kill the app at ~1.5 GB; Android gets aggressive at ~800 MB.

### Strategy 1: Dispose Off-Screen Video Players

```mermaid
flowchart LR
    subgraph Viewport ["Visible Viewport (3 posts)"]
        P5["Post 5<br/>🎥 PLAYING"]
        P6["Post 6<br/>🖼️ Image"]
        P7["Post 7<br/>🎥 PLAYING"]
    end

    subgraph Buffer ["Buffer Zone (±2 posts)"]
        P3["Post 3<br/>🎥 PAUSED<br/>controller alive"]
        P4["Post 4<br/>📝 Text"]
        P8["Post 8<br/>🎥 PAUSED<br/>controller alive"]
        P9["Post 9<br/>🖼️ Image"]
    end

    subgraph Disposed ["Off-Screen (disposed)"]
        P1["Post 1<br/>🎥 DISPOSED<br/>thumbnail only"]
        P2["Post 2<br/>🖼️ evicted"]
        P10["Post 10<br/>🎥 DISPOSED"]
    end

    style P5 fill:#69db7c,stroke:#333
    style P7 fill:#69db7c,stroke:#333
    style P3 fill:#ffd43b,stroke:#333
    style P8 fill:#ffd43b,stroke:#333
    style P1 fill:#ff6b6b,stroke:#333
    style P10 fill:#ff6b6b,stroke:#333
```

```dart
class VideoPostCard extends StatefulWidget {
  final Post post;
  const VideoPostCard({super.key, required this.post});

  @override
  State<VideoPostCard> createState() => _VideoPostCardState();
}

class _VideoPostCardState extends State<VideoPostCard>
    with AutomaticKeepAliveClientMixin {
  VideoPlayerController? _controller;
  bool _isVisible = false;

  @override
  bool get wantKeepAlive => false; // Allow disposal when off-screen

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  void _onVisibilityChanged(VisibilityInfo info) {
    final visible = info.visibleFraction > 0.5;
    if (visible && !_isVisible) {
      _initializePlayer();
    } else if (!visible && _isVisible) {
      _disposePlayer();
    }
    _isVisible = visible;
  }

  Future<void> _initializePlayer() async {
    _controller = VideoPlayerController.networkUrl(
      Uri.parse(widget.post.videoUrl!),
    );
    await _controller!.initialize();
    _controller!.setLooping(true);
    _controller!.setVolume(0); // Autoplay muted
    _controller!.play();
    if (mounted) setState(() {});
  }

  void _disposePlayer() {
    _controller?.dispose();
    _controller = null;
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return VisibilityDetector(
      key: Key('video-${widget.post.id}'),
      onVisibilityChanged: _onVisibilityChanged,
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: _controller?.value.isInitialized == true
            ? VideoPlayer(_controller!)
            : CachedNetworkImage(
                imageUrl: widget.post.thumbnailUrl!,
                fit: BoxFit.cover,
              ),
      ),
    );
  }
}
```

### Strategy 2: Image Cache with Size Limit

Use `cached_network_image` with a bounded cache:

```dart
// In your app initialization
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

class FeedCacheManager extends CacheManager {
  static const key = 'feedImageCache';

  FeedCacheManager()
      : super(
          Config(
            key,
            maxNrOfCacheObjects: 200,        // Max 200 images
            stalePeriod: const Duration(days: 7),
          ),
        );
}
```

### Strategy 3: Pool Video Controllers

Instead of creating/destroying controllers, maintain a pool of 3–5 reusable controllers:

```dart
class VideoControllerPool {
  static const int maxControllers = 4;
  final _pool = <String, VideoPlayerController>{};
  final _lruOrder = <String>[];

  Future<VideoPlayerController> acquire(String url) async {
    if (_pool.containsKey(url)) {
      // Move to end of LRU
      _lruOrder.remove(url);
      _lruOrder.add(url);
      return _pool[url]!;
    }

    // Evict oldest if at capacity
    if (_pool.length >= maxControllers) {
      final oldest = _lruOrder.removeAt(0);
      await _pool.remove(oldest)?.dispose();
    }

    final controller = VideoPlayerController.networkUrl(Uri.parse(url));
    await controller.initialize();
    _pool[url] = controller;
    _lruOrder.add(url);
    return controller;
  }

  Future<void> disposeAll() async {
    for (final c in _pool.values) {
      await c.dispose();
    }
    _pool.clear();
    _lruOrder.clear();
  }
}
```

---

## Local SQLite Cache: Offline-First UX

When the user opens the app with no network, they should still see their last-loaded feed. We cache feed pages in SQLite (via `drift`):

### Schema

```dart
// Using drift (formerly moor) for type-safe SQLite
class CachedPosts extends Table {
  IntColumn get id => integer()();
  IntColumn get authorId => integer()();
  TextColumn get authorName => text()();
  TextColumn get authorAvatarUrl => text().nullable()();
  TextColumn get content => text()();
  TextColumn get imageUrls => text().nullable()();  // JSON array
  TextColumn get videoUrl => text().nullable()();
  TextColumn get thumbnailUrl => text().nullable()();
  IntColumn get likeCount => integer()();
  IntColumn get commentCount => integer()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get feedPosition => integer()();  // Order in the feed
  DateTimeColumn get cachedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}
```

### Cache Strategy: Network-First with Fallback

```dart
class FeedRepository {
  final FeedApiClient _api;
  final AppDatabase _db;

  FeedRepository(this._api, this._db);

  Future<FeedResponse> getFeed({
    String? cursor,
    int pageSize = 20,
  }) async {
    try {
      // 1. Try network first
      final response = await _api.getFeed(
        cursor: cursor,
        pageSize: pageSize,
      );

      // 2. Cache the response locally
      await _cacheResponse(response, isFirstPage: cursor == null);

      return response;
    } catch (e) {
      // 3. Fallback to local cache on network failure
      if (cursor == null) {
        // First page — return cached feed
        final cachedPosts = await _db.getCachedFeed(limit: pageSize);
        if (cachedPosts.isNotEmpty) {
          return FeedResponse(
            posts: cachedPosts,
            nextCursor: null,
            hasMore: false,  // Can't paginate offline
          );
        }
      }
      rethrow; // No cache available
    }
  }

  Future<void> _cacheResponse(
    FeedResponse response, {
    required bool isFirstPage,
  }) async {
    if (isFirstPage) {
      // Clear old cache on refresh
      await _db.clearCachedFeed();
    }
    await _db.insertCachedPosts(response.posts);
  }
}
```

---

## Optimistic UI Updates

When a user taps "Like", don't wait for the server response:

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Flutter UI
    participant S as State
    participant API as API Server

    U->>UI: Tap ❤️
    UI->>S: Optimistic update:<br/>likeCount++, isLiked=true
    S->>UI: Rebuild with new state
    Note over UI: User sees instant feedback<br/>(< 16ms)

    S->>API: POST /v1/posts/{id}/like
    alt Success
        API-->>S: 200 OK
        Note over S: No-op (already updated)
    else Failure
        API-->>S: Error
        S->>S: Rollback: likeCount--, isLiked=false
        S->>UI: Rebuild with rollback
    end
```

```dart
class PostCardNotifier extends StateNotifier<Post> {
  final FeedApiClient _api;

  PostCardNotifier(Post post, this._api) : super(post);

  Future<void> toggleLike() async {
    final wasLiked = state.isLiked;
    final oldCount = state.likeCount;

    // Optimistic update
    state = state.copyWith(
      isLiked: !wasLiked,
      likeCount: wasLiked ? oldCount - 1 : oldCount + 1,
    );

    try {
      if (wasLiked) {
        await _api.unlikePost(state.id);
      } else {
        await _api.likePost(state.id);
      }
    } catch (e) {
      // Rollback on failure
      state = state.copyWith(
        isLiked: wasLiked,
        likeCount: oldCount,
      );
    }
  }
}
```

---

## Performance Budget

| Metric | Target | How to Measure |
|---|---|---|
| First Contentful Paint | < 1.5s | Flutter DevTools timeline |
| Scroll frame budget | < 16.6ms (60 fps) | `SchedulerBinding.addTimingsCallback` |
| Memory (RSS) | < 400 MB | `dart:developer` + Xcode Instruments |
| Image decode time | < 50ms per image | `PaintingBinding.instantiateImageCodec` timing |
| Video player init | < 300ms | Custom Stopwatch around `initialize()` |
| Cache DB query | < 5ms | drift query logging |

### Jank Detection

```dart
void setupJankDetection() {
  SchedulerBinding.instance.addTimingsCallback((timings) {
    for (final timing in timings) {
      final buildDuration = timing.buildDuration.inMilliseconds;
      final rasterDuration = timing.rasterDuration.inMilliseconds;
      final totalFrame = timing.totalSpan.inMilliseconds;

      if (totalFrame > 16) {
        debugPrint(
          '⚠️ JANK: frame=${totalFrame}ms '
          'build=${buildDuration}ms '
          'raster=${rasterDuration}ms',
        );
      }
    }
  });
}
```

---

## The Full Client Architecture

```mermaid
flowchart TB
    subgraph Presentation ["Presentation Layer"]
        FS["FeedScreen<br/>(ListView.builder)"]
        PC["PostCard<br/>(Image / Video / Text)"]
        SC["ScrollController"]
    end

    subgraph State ["State Layer (Riverpod)"]
        FN["FeedNotifier<br/>• posts[]<br/>• cursor<br/>• isLoading"]
        PN["PostCardNotifier<br/>• likeCount<br/>• isLiked"]
    end

    subgraph Data ["Data Layer"]
        REPO["FeedRepository<br/>(network-first + fallback)"]
        API["FeedApiClient<br/>(Dio, retry, auth)"]
        DB["SQLite (drift)<br/>cached_posts table"]
        IMG["Image Cache<br/>(flutter_cache_manager)"]
        VP["VideoControllerPool<br/>(4 max, LRU eviction)"]
    end

    subgraph Network ["Network"]
        GW["API Gateway"]
    end

    FS --> SC
    SC -->|"80% threshold"| FN
    FS --> PC
    PC --> PN
    PC --> IMG
    PC --> VP
    FN --> REPO
    REPO --> API
    REPO --> DB
    API --> GW

    style FS fill:#74c0fc,stroke:#333
    style FN fill:#ffd43b,stroke:#333
    style REPO fill:#69db7c,stroke:#333
    style DB fill:#b197fc,stroke:#333
```

---

> **Key Takeaways**
>
> 1. **Cursor-based pagination** is mandatory. OFFSET-based pagination causes duplicate and missing posts as the feed shifts. The cursor is an opaque `(timestamp, id)` tuple.
> 2. **Dispose off-screen video players aggressively.** Each initialized video controller consumes 30–80 MB. Use `VisibilityDetector` to init/dispose based on viewport position. Pool up to 4 controllers with LRU eviction.
> 3. **Cache the feed in SQLite** for offline-first UX. Network-first fetch with local fallback. Clear cache on refresh to prevent stale data.
> 4. **Optimistic UI updates** for likes/saves — update the state immediately, then fire the API call. Rollback only on failure. The user should never wait for a network round-trip.
> 5. **Monitor jank relentlessly.** Any frame over 16ms is a dropped frame. Use `SchedulerBinding.addTimingsCallback` to detect and log jank in production.
