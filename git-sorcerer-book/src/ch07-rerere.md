# Ch 07: Rerere (Reuse Recorded Resolution) 🔴

> **What you'll learn:**
> - What `git config rerere.enabled true` does and why it's the most underused superpower in Git
> - How the `.git/rr-cache` directory stores conflict resolutions as pairs of "pre-resolution" and "post-resolution" file content
> - Why rerere eliminates hours of repetitive work during long-running rebase sessions and recurring merges
> - The limitations of rerere: when it helps, when it doesn't, and how to manually populate its cache

---

## The Problem: "I Already Solved This Conflict"

You're rebasing a long-lived feature branch onto the latest `main`. The rebase touches 47 commits. The first commit applies cleanly. The second applies cleanly. The third produces a merge conflict in `src/config.py`. You open the file, resolve the conflict, stage it, and continue.

The fourth commit produces **the exact same conflict** in `src/config.py`. You open the file — it's the same two chunks of code fighting over the same lines. You resolve it again, the same way.

The seventh commit produces **the exact same conflict again**.

By the 12th commit, you've resolved the same `src/config.py` conflict five times. You're furious. You wish Git would just *remember* how you solved this.

**The Sorcerer's Answer:** It can. It's called `rerere`.

## What Is Rerere?

`rerere` stands for **Re**use **Re**corded **Re**solution. It's a Git feature that:

1. **Records** every merge conflict you resolve (the "conflicted state" of the file)
2. **Stores** your resolution (the "resolved state" of the file)
3. **Automatically applies** the same resolution the next time the same conflict appears

It works for merges, rebases, cherry-picks, and any other operation that produces a conflict. Once enabled, it works silently in the background. You don't need to change your workflow at all — except to enjoy the fact that recurring conflicts disappear.

```mermaid
graph TD
    subgraph "First occurrence of a conflict"
        C1["Commit A modifies src/config.py"]
        C2["Commit B also modifies src/config.py"]
        M["Merge/rebase produces conflict"]
        U["You resolve the conflict manually"]
        S["Rerere records: conflic hunks → resolved hunks"]
    end

    subgraph "Second occurrence of the same conflict"
        C3["New commit C modifies src/config.py the same way"]
        C4["Commit D also modifies src/config.py the same way"]
        M2["Merge/rebase produces the SAME conflict"]
        R["Rerere auto-resolves it — no manual work needed"]
    end

    C1 --> C2 --> M --> U --> S
    C3 --> C4 --> M2 --> R

    style M fill:#ef4444,color:#fff
    style U fill:#f59e0b,color:#000
    style S fill:#22c55e,color:#fff
    style M2 fill:#ef4444,color:#fff
    style R fill:#22c55e,color:#fff
```

## How Rerere Works: The `.git/rr-cache` Directory

When you enable rerere, Git creates `.git/rr-cache/`. This is a simple key-value store on disk. The "key" is the SHA-1 hash of the **conflicted hunk** (the raw conflict markers). The "value" is your **resolved hunk** (the file content after you fixed the conflict).

```
.git/rr-cache/
├── a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0/
│   ├── preimage    # The file with conflict markers (<<<<<<< , =======, >>>>>>>)
│   └── postimage   # The resolved file (your fix)
├── b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1/
│   ├── preimage
│   └── postimage
└── ...
```

The `preimage` is the file as Git computed it during the 3-way merge — complete with `<<<<<<< HEAD`, `=======`, and `>>>>>>> feature` markers. Git hashes this content and uses the hash as the directory name.

The `postimage` is the file after you resolved the conflict. When the same `preimage` hash appears again (which happens when the same two hunks conflict in the same way), Git finds the matching `postimage` and applies it automatically — without any human intervention.

### Enabling Rerere

```bash
# Enable globally (recommended — you'll want this in every repo)
$ git config --global rerere.enabled true

# Or enable for a single repo
$ git config rerere.enabled true
```

That's all. No other configuration needed. Rerere starts recording immediately.

## Rerere in Action: A Long-Running Rebase

You have a feature branch with 20 commits. `main` has moved forward by 50 commits. You rebase:

```bash
$ git checkout feature/long-lived
$ git rebase main
CONFLICT (content): Merge conflict in src/config.py
Auto-merging src/config.py

# You resolve the conflict:
$ vim src/config.py
# edit the conflict markers
$ git add src/config.py
$ git rebase --continue

# Rerere prints:
# Recorded resolution for 'src/config.py'
# Rerere: Auto-merging src/config.py
# Rerere: Resolved conflict automatically

# The next commit also conflicts in src/config.py — same conflict
# Rerere resolves it WITHOUT stopping the rebase
# The rebase continues silently

# Result: 20 commits rebased, 5 conflicts resolved automatically,
# only 1 required manual intervention
```

## Rerere Is Not a Merge Driver

Rerere doesn't change how Git computes merges. It doesn't improve the 3-way merge algorithm. It doesn't know anything about "correct" resolutions. It's purely a cache: "last time I saw these exact conflict markers, here's what you wanted me to produce. If you see them again, use the same output."

This means:
- Rerere is **perfect** for recurring conflicts in long-running branches (rebasing, merging, cherry-picking).
- Rerere is **useless** for conflicts you've never seen before (first-time merges, new branches).
- Rerere doesn't help with conflicts in different files or different lines — only *identical* conflict markers.

## Sharing Rerere Cache Across a Team

By default, `.git/rr-cache/` is local to your machine. But if you want your team to share conflict resolutions, you can commit the rr-cache directory to your repo:

```bash
$ git add .git/rr-cache/
$ git commit -m "Add rerere cache for team sharing"
```

This is an advanced technique. Most teams don't share rr-cache — each developer resolves conflicts independently. But if you have a canonical set of merge resolutions (e.g., a team lead who resolves all PR conflicts), sharing the rr-cache means everyone else's rebases auto-resolve the same way.

**Warning:** Committing rr-cache to a public repo is rare. Most repos `.gitignore` the `.git/` directory. If you commit rr-cache, you're committing metadata that's normally internal. Only do this if you explicitly want it.

## Rerere Garbage Collection

The rr-cache grows indefinitely. Git provides `rerere.gc` to control how many days unused entries are kept:

```bash
# Default: 60 days (keep unused resolutions for 60 days)
$ git config rerere.gc 60

# Keep forever (no garbage collection)
$ git config rerere.gc 0

# Clear the entire rr-cache
$ rm -rf .git/rr-cache/
```

In practice, you rarely need to worry about this. The rr-cache is tiny — each entry is two small files. Even 1,000 recorded resolutions take up only a few megabytes.

## The Panic Way vs. The Sorcerer Way

**The Panic Way:**
```bash
$ git rebase main
CONFLICT (content): Merge conflict in src/config.py
# You resolve the conflict manually.
$ git add -A && git rebase --continue

# Next commit: SAME conflict
CONFLICT (content): Merge conflict in src/config.py
# "I just resolved this! Why is it happening AGAIN?!"
# You resolve it again. Manually. For the fifth time.
# You curse at Git and wish it were smarter.
```

**The Sorcerer Way:**
```bash
# ✅ FIX: Rerere has been enabled globally for months.
$ git rebase main
CONFLICT (content): Merge conflict in src/config.py
# You resolve the conflict manually — first time only.
$ git add -A && git rebase --continue
# Rerere records: "conflict_markers → resolved_content"

# Next commit: SAME conflict
# Rerere auto-resolves it — rebase never stops
$ git rebase --continue  # Already resolved — nothing to do
# The rebase finishes without a single additional manual resolution.
```

## Rerere Limitations: When It Doesn't Help

| Scenario | Does Rerere Help? | Why |
|---|---|---|
| Same conflict in the same file during rebase | ✅ Yes | Identical preimage → identical postimage |
| Same conflict in a different file | ❌ No | Different file content → different preimage hash |
| Same conflict but with whitespace changes | ❌ No | Whitespace changes the conflict markers, which changes the preimage hash |
| First-time merge (never seen this conflict) | ❌ No | Rerere only helps with previously-seen conflicts |
| Conflicts during `git stash apply` | ✅ Yes | Stash apply uses the same 3-way merge logic |
| Conflicts during `git cherry-pick` | ✅ Yes | Cherry-pick also uses 3-way merge |

## Combining Rerere with `rerere-train.sh`

Git ships with a shell script called `rerere-train.sh` (in the `contrib/` directory of Git's source tree) that pre-populates the rr-cache by replaying historical merges from the reflog. This is useful when you're taking over a repo with a history of painful, repetitive conflicts and you want to "train" rerere on past resolutions.

```bash
# Find the script in Git's source tree
$ git clone https://github.com/git/git.git
$ cd git
$ cp contrib/rerere-train.sh /usr/local/bin/

# Train rerere on the last 100 commits' merge resolutions
$ rerere-train.sh HEAD~100..HEAD
```

The script replays each merge from the reflog, extracts conflict resolutions that were manually resolved, and seeds them into the rr-cache. Future merges of the same conflicts resolve automatically.

<details>
<summary><strong>🏋️ Exercise: Seed Rerere with Historical Conflicts and Auto-Resolve Them</strong> (click to expand)</summary>

### The Challenge

You're working on a repo where a developer repeatedly rebased a `feature/database-migration` branch onto `main` and resolved the same conflict in `db/schema.py` each time. The conflict was manually resolved 5 times over the past 3 weeks. The developer left the company.

Your task:
1. Enable rerere
2. Manually seed the rr-cache by simulating the conflict and resolving it once
3. Create a second occurrence of the same conflict in a test rebase
4. Prove that rerere auto-resolves it without human intervention

<details>
<summary>🔑 Solution</summary>

```bash
# 1. Enable rerere globally
$ git config --global rerere.enabled true

# 2. Create the first conflict scenario
$ git checkout -b test-rerere
$ echo "DB_URL = 'postgresql://localhost/production'" > db/schema.py
$ git add db/schema.py
$ git commit -m "Set production DB URL"

# Create a conflicting change on main
$ git checkout main
$ echo "DB_URL = 'postgresql://localhost/staging'" > db/schema.py
$ git add db/schema.py
$ git commit -m "Set staging DB URL"

# 3. Try to merge the test branch — produces a conflict
$ git merge test-rerere
CONFLICT (content): Merge conflict in db/schema.py
Auto-merging db/schema.py

# Check the rr-cache — nothing yet (we haven't resolved it)
$ ls .git/rr-cache/
# Empty — no resolutions recorded

# 4. Resolve the conflict
$ cat > db/schema.py << 'EOF'
DB_URL = 'postgresql://localhost/production'
# Override for local development:
# DB_URL = 'postgresql://localhost:5432/dev'
EOF

$ git add db/schema.py
$ git commit --no-edit  # Complete the merge
# Rerere says: "Recorded resolution for 'db/schema.py'"

# 5. Verify the rr-cache now contains the resolution
$ ls .git/rr-cache/
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0/  # New entry

$ cat .git/rr-cache/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0/postimage
DB_URL = 'postgresql://localhost/production'
# Override for local development:
# DB_URL = 'postgresql://localhost:5432/dev'

# 6. Create a second conflict to prove auto-resolution
$ git reset --hard HEAD~1  # Undo the merge to get back to pre-merge state
$ echo "DB_URL = 'postgresql://localhost/production'" > db/schema.py
$ git add db/schema.py
$ git commit -m "Set production DB URL (again)"

# Merge main again — SAME conflict
$ git merge main
Auto-merging db/schema.py
CONFLICT (content): Merge conflict in db/schema.py

# BUT WAIT — rerere auto-resolves it
$ cat db/schema.py
DB_URL = 'postgresql://localhost/production'
# Override for local development:
# DB_URL = 'postgresql://localhost:5432/dev'

# The conflict is GONE — auto-resolved by rerere
$ git add db/schema.py
$ git commit --no-edit
# Merge commit completed — zero manual intervention

echo "Rerere auto-resolved the conflict successfully!"
```

**Key Insight:** The rr-cache is keyed by the **conflicted hunks' SHA-1 hash**. When the same two code blocks conflict in the same lines in the same file, Git produces the same `preimage` hash. Even if the file content above or below the conflict changed, the conflict *itself* is identical — so the preimage hash matches, and rerere finds the cached resolution.

After step 6, the conflict was auto-resolved without any human intervention. The rebase or merge continued automatically. You didn't need to open the file or type a single command.

</details>
</details>

> **Key Takeaways**
> - `git config rerere.enabled true` is the single most impactful Git configuration you can set — it eliminates recurring merge conflicts during rebases and merges
> - Rerere stores conflict resolutions as preimage (conflicted) → postimage (resolved) pairs in `.git/rr-cache/`
> - Rerere only helps with *identical* conflicts — the same conflict markers in the same file must appear again
> - Rerere works for merges, rebases, cherry-picks, and stash applies — any 3-way merge operation
> - The rr-cache is local by default; sharing it across a team is possible but uncommon
> - Rerere doesn't prevent conflicts — it just remembers how you solved them so you don't have to repeat yourself

> **See also:** [Chapter 6: Merge Strategies and the DAG 🔴](ch06-merge-strategies-dag.md) to understand how the merge algorithm produces conflicts, and [Chapter 8: The Reflog (Time Travel) 🔴](ch08-reflog-time-travel.md) for recovering from any merge or rebase disaster that rerere couldn't prevent.