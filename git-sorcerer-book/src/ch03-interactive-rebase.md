# Ch 03: The Power of Interactive Rebase 🟡

> **What you'll learn:**
> - Why `git rebase -i` is the most powerful tool for writing clean, reviewable Git history before pushing
> - How to squash fix-up commits, reword messages, drop bad commits, and split monolithic commits using the interactive rebase todo list
> - The DAG transformation that happens during rebase: commits are *copied*, not moved
> - Why `git rebase --onto` lets you surgically transplant a sub-branch between any two points in your history

---

## Why History Quality Matters

Commits are not just for you — they're for the next person. A clean, well-structured commit history is a form of documentation. When you look at `git log` six months later (or when a new hire does), each commit should be a **coherent, testable, atomic unit** that tells the story of how the code evolved.

The problem is that real development is messy. You make a commit, realize you forgot something, make a "fix" commit, then another typo, then you add debug logging and commit *that* too:

```
* abc1234 (HEAD -> feature) Fix typo in variable name
* def5678 Remove debug logging that slipped in
* ghi9012 Actually fix the null reference
* jkl3456 Add new user authentication
* mno7890 Initial commit of auth module
```

This history tells no one anything useful. Every commit after the first one could have been part of the first commit. Reviewers will force-push this and force-push this to be a single, atomic feature commit. This is what `git rebase -i` is for.

## What Rebase Actually Does

At a high level, `git rebase` changes the **base** (parent) of your commits. It does this by **creating new commit objects** — it doesn't move the originals. The old commits are abandoned and become unreachable (recoverable via the reflog — see Chapter 8).

### The DAG Transformation

**Before rebase:**
```
main:    A -- B -- C
feature:      \      \
               D -- E -- F
```

**After rebase onto main:**
```
main:    A -- B -- C
                     \
feature:              D' -- E' -- F'
```

The commits D, E, F are abandoned. D', E', F' are **new commits** with the same content but different SHA-1 hashes (because their parents are different — D's parent was B, but D''s parent is C).

```mermaid
graph TD
    subgraph "Before Rebase"
        A["A"] --> B["B"] --> C["C (main tip)"]
        B --> D["D (feature base)"]
        D --> E["E"]
        E --> F["F (feature tip)"]
    end

    subgraph "After Rebase"
        A2["A"] --> B2["B"] --> C2["C (main tip)"]
        C2 --> D3["D' (copied, new parent)"]
        D3 --> E3["E' (copied, new parent)"]
        E3 --> F3["F' (copied, new parent)"]
    end

    F -. "abandoned\n(old commits)| D3:F3

    style A fill:#9ca3af,color:fff
    style B fill:#9ca3af,color:#fff
    style C fill:#9ca3af,color:#fff
    style D fill:#ef4444,color:#fff
    style E fill:#ef4444,color:#fff
    style F fill:#ef4444,color:#fff
    style A2 fill:#9ca3af,color:#fff
    style B2 fill:#9ca3af,color:#fff
    style C2 fill:#22c55e,color:#fff
    style D3 fill:#3b82f6,color:#fff
    style E3 fill:#3b82f6,color:#fff
    style F3 fill:#3b82f6,color:#fff
```

## The Interactive Rebase Todo List

When you run `git rebase -i HEAD~3`, Git opens your editor with a todo list like this:

```
pick abc1234 Initial commit of auth module
pick def5678 Add new user authentication
pick ghi9012 Actually fix the null reference
pick jkl3456 Remove debug logging that slipped in
pick mno7890 Fix typo in variable name

# Rebase pqr1234..mno7890 onto pqr1234 (3 commands)
#
# Commands:
# p, pick <commit> = use commit
# r, reword <commit> = use commit, but edit the commit message
# e, edit <commit> = use commit, but stop for amending
# s, squash <commit> = use commit, but meld into previous commit
# f, fixup <commit> = like squash, but discard this commit's message
# d, drop <commit> = remove commit
```

### The Six Core Actions

| Command | Abbreviation | What It Does | Use Case |
|---|---|---|---|
| **pick** | `p` | Use the commit exactly as-is (no changes) | Good commits you want to keep unchanged |
| **reword** | `r` | Use the commit but pause to edit the message | Fix typos, improve commit message grammar |
| **edit** | `e` | Use the commit but stop so you can amend the snapshot | Split a commit into two; add forgotten files |
| **squash** | `s` | Meld into the *previous* commit (keeps both messages) | Combine a commit with its fix-up |
| **fixup** | `f` | Meld into the *previous* commit (discards this message) | Remove "fix typo" noise from history |
| **drop** | `d` | Delete the commit entirely | Remove accidental commits (AWS keys, blobs, etc.) |

### Example: Cleaning Up a Messy Feature Branch

Here's your messy reality:

```bash
$ git log --oneline feature
abc1234 Fix typo in config.json      # (typo)
def5678 Debug: print all env vars    # (accidentally committed debug code)
ghi9012 Fix the fix                   # (fix for the previous fix)
jkl3456 Add authentication            # (this is the real feature)
mno7890 Initial commit                # (root commit — leave alone)
```

You want exactly **one** clean commit on top of main. Here's the interactive rebase todo list you write:

```
pick mno7890 Initial commit
pick jkl3456 Add authentication
fixup ghi9012 Fix the fix
fixup def5678 Debug: print all env vars
fixup abc1234 Fix typo in config.json
```

Wait — that's backward. `fixup` melds into the **previous** commit (the one above it in the list). You want everything *after* `jkl3456` to squash into `jkl3456`. The correct todo list is:

```
pick mno7890 Initial commit
pick jkl3456 Add authentication
fixup ghi9012 Fix the fix
fixup def5678 Debug: print all env vars
fixup abc1234 Fix typo in config.json
```

After rebase finishes, you have exactly **one** commit on top of main with the combined content of all five original commits.

```bash
$ git log --oneline feature
z9y8x7w Add authentication
mno7890 Initial commit
```

One commit. One message. One atomic unit.

## The `--autosquash` Workflow

If you know *while you're working* that a commit is a fixup for a previous commit, you can use `--autosquash` to avoid the interactive editor entirely.

```bash
# Original commit with a typo in the message
$ git commit -m "Add authentication module"

# Later, you realize you forgot to handle null references
$ git add -A
$ git commit --fixup HEAD   # Creates: "fixup! Add authentication module"

# Even later, you fix a typo
$ git add -A
$ git commit --fixup HEAD   # Creates: "fixup! fixup! Add authentication module"

# Now rebase with autosquash — Git rewites the todo list automatically
$ git rebase -i --autosquash main
```

The `--autosquash` flag looks at all `fixup!` and `squash!` prefixed messages and automatically reorders them under the correct parent commit. The rebase todo list is pre-populated. You just save and quit, and it happens.

```bash
# After rebase: everything squashed into one commit
$ git log --oneline
abc1234 Add authentication module
def5678 Initial commit
```

**Principal engineers use `--fixup` and `--autosquash` as their daily workflow.** They never make a typo and later run `rebase -i` to clean it up. They `git commit --fixup HEAD` *as they work*, and all the squashing happens automatically when they're ready to push.

## Rewriting a Commit's Message (The Safe Way)

You pushed a commit and realize the commit message has a typo:

```bash
# The Panic Way (Destructive)
# 1. `git reset --soft HEAD~1` (undo the commit)
# 2. `git commit -m "New message"` (recommit)
# 3. `git push --force` (force-push because history changed)
# This works but is error-prone if you have uncommitted changes.

# The Sorcerer Way (Safe)
$ git commit --amend -m "Fixed typo in config.json"

# But wait — you already pushed
$ git push --force-with-lease origin feature
# `--force-with-lease` is SAFER than `--force` because it checks
# that no one else has pushed since your last fetch.
```

The `--force-with-lease` option is **always** safer than `--force`. It only forces the push if your local view of `origin/feature` matches what's currently on the remote. If someone else pushed to `feature` since you last fetched, `--force-with-lease` fails instead of silently wiping their commits.

## Splitting a Monolithic Commit

Someone committed 20 files in one commit with the message "WIP: everything works now." You need to separate the authentication changes from the UI changes from the database changes. `git rebase -i` can do this too:

```bash
$ git rebase -i HEAD~1  # Rebase the single commit
# Change "pick" to "edit" for the commit you want to split
edit abc1234 WIP: everything works now
```

When rebase stops at that commit, it checks it out in a state where the changes are in your working tree but **nothing is staged**. You now selectively stage and commit:

```bash
# Rebase has stopped — the commit's changes are unstaged in your working tree
$ git status
# On branch feature
# Changes not staged for commit:
#   (use "git add <file>..." to update what will be committed)
#   modified: auth/login.py
#   modified: auth/validator.py
#   modified: ui/dashboard.html
#   modified: ui/styles.css
#   modified: db/migrations/001.sql

# Stage only the auth files
$ git add auth/login.py auth/validator.py
$ git commit -m "Add authentication module with validator"

# Stage the db/migrations
$ git add db/migrations/001.sql
$ git commit -m "Add initial database migration for authentication"

# Stage the UI changes
$ git add ui/dashboard.html ui/styles.css
$ git commit -m "Update dashboard UI with authenticated state"

# Done — tell rebase to continue (there's nothing left to continue,
# but this finalizes the split
$ git rebase --continue

# Result:
$ git log --oneline --reverse
abc123a Add authentication module with validator
def567b Add initial database migration for authentication
ghi901c Update dashboard UI with authenticated state
```

One monolithic commit is now three clean, atomic commits.

## `rebase --onto`: Surgical Branch Transplants

The standard `git rebase main` takes your current branch's commits and replays them onto `main`. But what if you want to transplant a **subset** of commits from one branch to another?

**Scenario:** You have `main → feature-A → feature-B`. `feature-B` was branched off `feature-A`, but you actually want `feature-B`'s commits to sit directly on top of `main`. `feature-B` depends on `main`, not on `feature-A`.

```
Before:
main:    A -- B -- C
feature-A:         \      \
                    D -- E
feature-B:              \      \
                         F -- G
```

What you want is `feature-B`'s commits (F, G) onto `main` (on top of C) and leave `main`:

```
main:    A -- B -- C
                 \
feature-B (new):  F' -- G'
feature-A (unchanged): D -- E
```

```bash
$ git rebase --onto main feature-A feature-B
# Translation: "Take everything on feature-B that isn't on feature-A,
# and replay it onto main."
```

`--onto` takes three arguments:
1. **`--onto <new-base>`** — Where you want the commits to end up (`main`)
2. **`<upstream>`** — The commit you want to start *after* (`feature-A`). Git takes everything reachable from `feature-B` that isn't reachable from `feature-A`.
3. **`<branch>`** — The branch you're currently on (`feature-B`).

## The Panic Way vs. The Sorcerer Way: Rebase Conflicts

Rebase can produce conflicts just like merge. The difference is: rebase applies commits **one at a time** and stops at the first conflict, while merge applies all conflicts at once.

**The Panic Way:**
```bash
$ git rebase main
CONFLICT (content): Merge conflict in auth.py
error: could not apply abc1234... Add auth module

# Panic! What do I do?!
$ git rebase --abort  # Aborts the entire rebase, losing all progress
# Now I have to start over from scratch.
```

**The Sorcerer Way:**
```bash
$ git rebase main
CONFLICT (content): Merge conflict in auth.py

# I resolve the conflict in auth.py, then:
$ git add auth.py

# The Sorcerer knows rerere is enabled (see Chapter 7), so Git
# will remember this conflict resolution automatically.
$ git rebase --continue

# If rerere is enabled: Git auto-resolves the same conflict
# in subsequent commits. No manual work needed.
```

<details>
<summary><strong>🏋️ Exercise: Clean Up a Feature Branch with Interactive Rebase</strong> (click to expand)</summary>

### The Challenge

Your colleague pushed a feature branch with the following commit history:

```bash
$ git log --oneline feature/data-pipeline
5f4e3d2 Update README with pipeline usage          # (good commit)
4d3c2b1 Remove commented-out code                   # (should be squashed into the commit above)
3c2b1a0 Fix lint error in pipeline.py               # (should be squashed into the original pipeline commit)
2b1a0f9 Add data pipeline processor                   # (good commit — the actual feature)
1a0f9e8 Fix typo in requirements.txt                # (should be squashed into the pipeline commit)
0f9e8d7 Fix typo in pipeline.py                    # (typo fix — noise)
e8d7c6b Initial project setup                       # (root commit — don't touch)
```

Your task: Use `git rebase -i` to transform this into exactly two clean commits:
1. `e8d7c6b Initial project setup` (unchanged)
2. `abc1234 Add data pipeline processor` (containing the combined content of commits `0f9e8d7`, `1a0f9e8`, `2b1a0f9`, `3c2b1a0`, `4d3c2b1`, `5f4e3d2`)

**Requirements:**
- The final result must be exactly two commits after "Initial project setup"
- The final commit message must be "Add data pipeline processor with README"
- Use `fixup` to eliminate all noise commits
- Use `reword` to set the final message

<details>
<summary>🔑 Solution</summary>

```bash
# 1. Start interactive rebase from the commit BEFORE feature commits
$ git rebase -i e8d7c6b

# 2. The editor opens with the default todo list:
pick 0f9e8d7 Fix typo in pipeline.py
pick 1a0f9e8 Fix typo in requirements.txt
pick 2b1a0f9 Add data pipeline processor
pick 3c2b1a0 Fix lint error in pipeline.py
pick 4d3c2b1 Remove commented-out code
pick 5f4e3d2 Update README with pipeline usage

# 3. Reorder and rewrite it to:
reword 2b1a0f9 Add data pipeline processor    # Move this FIRST (it's the real feature)
fixup 3c2b1a0 Fix lint error in pipeline.py   # Meld into above
fixup 0f9e8d7 Fix typo in pipeline.py         # Meld into above
fixup 1a0f9e8 Fix typo in requirements.txt    # Meld into above
fixup 4d3c2b1 Remove commented-out code       # Meld into above
squash 5f4e3d2 Update README with pipeline usage  # Meld but keep message for editing

# 4. Save and quit the todo list.
#    Git replays commits in this order:
#    - Replays 2b1a0f9 (Add data pipeline processor)
#    - Git pauses for you to reword the message
#    - You type: "Add data pipeline processor with README"
#    - Git continues and squashes fixup commits silently
#    - Git squashes the README commit — opens editor again with both messages
#    - You keep the final message you wrote and save

# 5. If a conflict appears:
#    CONFLICT (content): Merge conflict in pipeline.py
#    $ git add pipeline.py
#    $ git rebase --continue
#    (resolve conflicts as needed, repeat)

# 6. Verify the final result:
$ git log --oneline feature/data-pipeline
# abcdefg Add data pipeline processor with README
# e8d7c6b Initial project setup

# Success! Exactly 2 commits after "Initial project setup" — clean history.
```

**Key Insight:** The order of commits in the todo list **matters**. Rebase processes them top-to-bottom. By moving `2b1a0f9` (the actual feature) to the top and using `fixup` for all the commits that came *after* it, you told Git: "replay the feature commit first, then apply all the typos and cleanup commits on top of it and meld them together."

The `squash` for the README commit (instead of `fixup`) ensures its message is preserved for editing. If you used `fixup` for everything, you'd only get the message from `2b1a0f9`.

</details>
</details>

> **Key Takeaways**
> - `git rebase -i` rewrites history by creating **new commit objects** — old commits are abandoned but recoverable via the reflog (see Chapter 8)
> - The six interactive rebase actions: **pick**, **reword**, **edit**, **squash**, **fixup**, **drop** — each serves a specific purpose
> - `git commit --fixup HEAD` + `git rebase -i --autosquash main` is the principal engineer's workflow for keeping history clean as you go
> - `git rebase --onto <new-base> <upstream> <branch>` lets you transplant a subset of commits between any two points
> - Always use `--force-with-lease` instead of `--force` when pushing rewritten history — it prevents overwriting other contributors' commits

> **See also:** [Chapter 4: Git Worktrees and Stashing 🟡](ch04-worktrees-stashing.md) for context-switching workflows, and [Chapter 8: The Reflog (Time Travel) 🔴](ch08-reflog-time-travel.md) for recovering commits abandoned during a rebase if something goes wrong.