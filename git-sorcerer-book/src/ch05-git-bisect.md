# Ch 05: Finding Bugs with Git Bisect 🟡

> **What you'll learn:**
> - How `git bisect` performs a binary search through your commit history to find the exact commit that introduced a regression
> - The difference between interactive bisect (manual testing) and `git bisect run` (fully automated with a test script)
> - How `git bisect skip` handles commits that can't be tested (e.g., build failures, missing dependencies)
> - Why bisect works on any property — not just bugs, but performance regressions, flaky tests, and even missing features

---

## The Problem: "It Worked Last Week"

A bug report comes in: the login page is returning 500 errors. You haven't touched the login code in weeks. The QA team says it was working yesterday. Between "yesterday" and "today," you merged 47 commits from three feature branches.

Where did the bug come from?

**The Panic Way:** Manually check out each commit, one by one, starting from yesterday's `main` and working forward. "Did it work on commit 1? Yes. Commit 2? Yes. Commit 3? No." This is a linear search — O(n) — and on a repo with 10,000 commits and a 10-minute test cycle, this could take weeks.

**The Sorcerer Way:** Use `git bisect` — a binary search through commit history. On 10,000 commits, binary search finds the bad commit in **~14 steps** (log₂ 10,000 ≈ 13.3), no matter how many commits are in between.

## How Bisect Works: Binary Search Through Time

```mermaid
graph TD
    subgraph "Initial state: known good and known bad"
        GOOD["GOOD: a1b2c3d (2 weeks ago)<br/>Tests pass, login works"]
        BAD["BAD: f8e9d0c (HEAD, main)<br/>Tests fail, login 500s"]
    end

    subgraph "Step 1: bisect checks midpoint"
        M1["M1: ~7 days ago<br/>tests? → GOOD"]
    end

    subgraph "Step 2: new midpoint between M1 and BAD"
        M2["M2: ~10 days ago<br/>tests? → GOOD"]
    end

    subgraph "Step 3: new midpoint between M2 and BAD"
        M3["M3: ~12 days ago<br/>tests? → BAD"]
    end

    subgraph "Step 4: final narrowing"
        M4["M4: ~11 days ago<br/>tests? → GOOD"]
        M5["M5: ~11.5 days ago<br/>tests? → BAD → FOUND!<br/>First bad commit: abc1234"]
    end

    GOOD --> M1
    M1 --> BAD
    M2 --> BAD
    M3 --> M5
    M4 --> M5
    M5 -. "First bad commit"| M5

    style GOOD fill:#22c55e,color:#fff
    style BAD fill:#ef4444,color:#fff
    style M1 fill:#22c55e,color:#fff
    style M2 fill:#22c55e,color:#fff
    style M3 fill:#ef4444,color:#fff
    style M4 fill:#22c55e,color:#fff
    style M5 fill:#ef4444,color:#fff
```

Git starts with two endpoints: a **known good** commit (where the bug didn't exist) and a **known bad** commit (where the bug exists). It checks out the midpoint commit and asks: "Is this good or bad?" If it's good, the bug was introduced in the second half. If it's bad, the bug was introduced between the good commit and this midpoint. Either way, the search space is cut in half. Repeat until the range is one commit.

## Basic Workflow: Interactive Bisect

```bash
# 1. Start the bisect session
$ git bisect start
$ git bisect bad           # Current commit (HEAD) is bad
$ git bisect good a1b2c3d  # This commit was good (2 weeks ago)

# 2. Git checks out the midpoint commit
Bisecting: 128 commits left to test.
[abc1234] Some commit message from the middle

# 3. You test the code
$ python test_login.py
# Tests pass → this commit is good
$ git bisect good

# 4. Git checks out the next midpoint
Bisecting: 64 commits left to test.
[def5678] Another middle commit

$ python test_login.py
# Tests fail → this commit is bad
$ git bisect bad

# 5. Repeat until Git finds the first bad commit
Bisecting: 0 commits left to test.
abc0123 is the first bad commit

commit abc01234e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
Author: Bob <bob@example.com>
Date:   Mon Mar 1 14:32:00 2023 +0000

    refactor: simplify login validation logic

    Removed redundant null check to streamline auth flow.

 src/auth/login.py | 5 +----
 1 file changed, 1 insertion(+), 4 deletions(-)

# 6. Reset to return to your original branch
$ git bisect reset
Previous HEAD position was abc0123 refactor: simplify login...
Switched to branch 'main'
```

Each step cuts the search space in half. 1024 commits → 512 → 256 → 128 → 64 → 32 → 16 → 8 → 4 → 2 → 1. That's **10 steps**, not 1024.

## Automated Bisect with `git bisect run`

The interactive workflow requires you to manually test each commit. If your test is automated (a script that exits 0 for good, 1 for bad), `git bisect run` does the entire search without any human intervention.

```bash
# Create a test script that exits 0 if the bug is absent, 1 if present
$ cat > test_regression.sh << 'EOF'
#!/bin/bash
# Exit 0 (good) if the bug is NOT present
# Exit 1 (bad) if the bug IS present

# Run the login test
python -c "
import requests
try:
    r = requests.post('http://localhost:8000/login', json={'user': 'test', 'pass': 'test'})
    assert r.status_code == 200, f'Login failed with {r.status_code}'
    exit(0)  # GOOD
except Exception as e:
    print(f'Login broken: {e}')
    exit(1)  # BAD
"
EOF
$ chmod +x test_regression.sh

# Start bisect with known good and bad endpoints
$ git bisect start
$ git bisect bad HEAD
$ git bisect good a1b2c3d

# Run the automated search
$ git bisect run ./test_regression.sh
running './test_regression.sh'
Bisecting: 128 commits left to test.
running './test_regression.sh'
Bisecting: 64 commits left to test.
running './test_regression.sh'
...
Bisecting: 0 commits left to test.
abc0123 is the first bad commit
bisect found first bad commit

# The entire search ran automatically — no manual testing required.
$ git bisect reset
```

### Exit Code Convention

`git bisect run` interprets your script's exit code as follows:

| Exit Code | Meaning | What Bisect Does |
|---|---|---|
| **0** | Good — the bug is NOT present in this commit | Narrows the search to the **second half** (after this commit) |
| **1-127** | Bad — the bug IS present in this commit | Narrows the search to the **first half** (between good and this commit) |
| **125** | Skip — this commit can't be tested | Skips this commit and tries the next midpoint |
| **126-127** | Reserved — treated as "bad" | Same as 1-127 |
| **> 127** | Fatal error — bisect aborts | The entire bisect session is terminated |

### Handling Build Failures with `--skip`

Sometimes a commit in the middle of your bisect range won't build or has a broken dependency. You can't test it. You must skip it.

```bash
$ git bisect start
$ git bisect bad HEAD
$ git bisect good v2.0

# Git checks out a commit that doesn't compile
$ cargo build
error[E0432]: unresolved import `crate::new_module`

# You can't test this commit — skip it
$ git bisect skip
Bisecting: 64 commits left to test.
[def5678] Next midpoint commit

# Continue testing until done
$ git bisect run ./test_regression.sh
```

**Warning:** Skipping commits can cause bisect to give incorrect results. If the first bad commit is in a skipped range, bisect can't find it. If many commits are skipped in a cluster, the first bad commit might be in the middle of the skipped range and you'll get an approximate answer (or no answer at all). Skips are a tradeoff between accuracy and coverage.

## Bisect Beyond Bugs: Performance Regressions and Flaky Tests

`git bisect` doesn't just find bugs. It finds **any change in behavior** that you can test for.

### Performance Regressions

```bash
$ cat > test_perf.sh << 'EOF'
#!/bin/bash
# Exit 0 if the API is fast (< 200ms), 1 if slow (> 200ms)
START=$(date +%s%N)
curl -s http://localhost:8000/api/endpoint > /dev/null
END=$(date +%s%N)
ELAPSED=$(( (END - START) / 1000000 ))

if [ $ELAPSED -lt 200 ]; then
  echo "PASS: ${ELAPSED}ms < 200ms threshold"
  exit 0  # GOOD
else
  echo "FAIL: ${ELAPSED}ms > 200ms threshold"
  exit 1  # BAD
fi
EOF
$ chmod +x test_perf.sh

$ git bisect start
$ git bisect bad HEAD          # API is slow now
$ git bisect good v2.0         # API was fast at v2.0
$ git bisect run ./test_perf.sh
# Found the exact commit that caused the performance regression
```

### Flaky Test Identification

If a test is flaky (sometimes passes, sometimes fails), you can use `git bisect` to find the commit that introduced the flakiness — by running the test multiple times per commit and checking the failure rate.

```bash
$ cat > test_flakiness.sh << 'EOF'
#!/bin/bash
# Run the test 10 times. If it fails more than 2 times, mark as bad.
FAILURES=0
for i in {1..10}; do
  pytest tests/test_core.py -x -q > /dev/null 2>&1 || FAILURES=$((FAILURES + 1))
done

if [ $FAILURES -gt 2 ]; then
  echo "FLAKY: $FAILURES/10 runs failed"
  exit 1  # BAD
else
  echo "STABLE: $FAILURES/10 runs failed"
  exit 0  # GOOD
fi
EOF
$ chmod +x test_flakiness.sh

$ git bisect start
$ git bisect bad HEAD
$ git bisect good v1.0  # Before the flakiness appeared
$ git bisect run ./test_flakiness.sh
```

### Missing Feature Detection

Did someone accidentally delete a route? Remove a CLI flag? Delete a config key? If you can write a test that checks for the feature's presence, `git bisect` will find the commit that removed it.

```bash
$ cat > test_missing_feature.sh << 'EOF'
#!/bin/bash
# Exit 0 if the feature is present, 1 if missing
if grep -q "experimental_flag" config.yaml; then
  exit 0  # GOOD — feature is present
else
  exit 1  # BAD — feature was removed
fi
EOF
$ chmod +x test_missing_feature.sh

$ git bisect start
$ git bisect bad HEAD          # Feature is missing now
$ git bisect good v3.0         # Feature was present at v3.0
$ git bisect run ./test_missing_feature.sh
```

## The Panic Way vs. The Sorcerer Way

**The Panic Way:**
```bash
# "Something broke between last week and today. Let me just
# manually check out commits one by one..."
$ git checkout abc1234  # No, still broken
$ git checkout def5678  # Still broken
$ git checkout ghi9012  # Still broken
# ... 45 checkouts later ...
$ git checkout mno7890  # Ah, this one works! So the bug was introduced
# between mno7890 and the next commit. Let me check those...
# THREE HOURS LATER.
```

**The Sorcerer Way:**
```bash
# ✅ FIX: Let Git do the binary search. 1024 commits, 10 steps.
$ git bisect start
$ git bisect bad HEAD
$ git bisect good v2.0
$ git bisect run ./automated_test.sh
# 2 minutes later: "abc0123 is the first bad commit"
$ git bisect reset
# Back to work. Total time: 2 minutes.
```

## Bisect with Merge Commits and Reverts

Bisect handles merge commits correctly: if a merge introduced the bug (i.e., one of its parent branches contains the bad commit), bisect will traverse into the branch that introduced it. This is known as **first-parent traversal**.

```bash
# If your repo has many merge commits and you want to skip them
$ git bisect start --first-parent
# This treats each merge as a single step, ignoring the individual
# commits inside merged branches. Useful for monorepos where
# feature branches merge into main and you want to know WHICH
# merge introduced the bug, not which individual commit.
```

If the bug was a revert, bisect will find the revert commit as the "first bad commit" — because the revert **undid** the fix. At that point, you can investigate why the revert happened and re-apply the original fix.

## Bisect Reset Is Mandatory

Always run `git bisect reset` when you're done. Bisect leaves your repo in a detached HEAD state. If you forget to reset, you'll be working in detached HEAD — and new commits won't be on any branch.

```bash
# At the end of EVERY bisect session:
$ git bisect reset
# This returns your HEAD to the branch you were on before bisect started.
# It does NOT delete any commits. It does NOT modify your working tree.
# It just moves HEAD back.
```

If you forgot to run `git bisect reset` and made commits in detached HEAD state, you can recover them via the reflog (see Chapter 8).

<details>
<summary><strong>🏋️ Exercise: Automate a Bisect Session with a Test Script</strong> (click to expand)</summary>

### The Challenge

A developer introduced a breaking change in the `calculate_total()` function in a Python project. At the time of this bug, `calculate_total([1, 2, 3])` was returning `5` instead of `6`. The project has 1,024 commits between `v1.0` (where the function was correct) and `main` (where the bug exists).

**Your task:** Write a `test_regression.sh` script that `git bisect run` can use. The script should:
1. Exit 0 if `calculate_total([1, 2, 3])` returns `6` (good)
2. Exit 1 if `calculate_total([1, 2, 3])` returns anything other than `6` (bad)
3. Handle the case where `calculate_total` doesn't exist yet (during early commits) by exiting 125 (skip)

Then provide the full bisect command sequence.

<details>
<summary>🔑 Solution</summary>

```bash
#!/bin/bash
# ============================================================
# test_regression.sh — Automated test for git bisect
# Exit 0: good (function works correctly)
# Exit 1: bad (function is broken)
# Exit 125: skip (function doesn't exist yet, can't test)
# ============================================================

# 1. Check if the calc module exists in this commit.
#    If not, skip — we can't test what doesn't exist.
if [ ! -f "src/calc.py" ]; then
  echo "SKIP: src/calc.py doesn't exist in this commit"
  exit 125
fi

# 2. Run the test in a subprocess so any import errors don't
#    affect the bisect session.
RESULT=$(python3 -c "
import sys
try:
    from src.calc import calculate_total
    result = calculate_total([1, 2, 3])
    if result == 6:
        sys.exit(0)   # GOOD — function returns correct value
    else:
        sys.exit(1)   # BAD — function returns wrong value
except ImportError:
    sys.exit(125)     # SKIP — module doesn't exist in this commit
except NameError:
    sys.exit(125)     # SKIP — function doesn't exist yet
except Exception as e:
    # Any other error (e.g., syntax error in calc.py) — skip
    sys.exit(125)
" 2>&1)

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "PASS: calculate_total([1,2,3]) = 6"
elif [ $EXIT_CODE -eq 1 ]; then
  echo "FAIL: calculate_total([1,2,3]) ≠ 6"
else
  echo "SKIP: $RESULT"
fi

exit $EXIT_CODE
```

### Full Bisect Command Sequence

```bash
# Make the script executable
$ chmod +x test_regression.sh

# Start the bisect session
$ git bisect start
$ git bisect bad HEAD        # Current main: function returns 5
$ git bisect good v1.0       # v1.0: function returns 6

# Run the automated bisect
$ git bisect run ./test_regression.sh
running './test_regression.sh'
Bisecting: 512 commits left to test.
running './test_regression.sh'
PASS: calculate_total([1,2,3]) = 6
Bisecting: 256 commits left to test.
running './test_regression.sh'
FAIL: calculate_total([1,2,3]) ≠ 6
...
Bisecting: 0 commits left to test.
abc1234 is the first bad commit

# Show the offending commit
$ git show bisect/bad
commit abc1234e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
Author: Developer <dev@example.com>
Date:   2023-06-15 09:23:41 +0200

    refactor: simplify sum calculation

- def calculate_total(items):
-     return sum(items)
+ def calculate_total(items):
+     total = 0
+     for item in items:
+         total += item - 1   # 💥 Off-by-one error
+     return total

# Clean up
$ git bisect reset

# Fix: The bug is obvious — the developer introduced an off-by-one error.
# Revert the commit or fix the function directly.
```

**Key Insight:** The test script must handle **three states**: good, bad, and skip. Skipping is critical for commits where the test cannot even run (e.g., the module doesn't exist, a dependency is missing, the build fails). Without skip handling, bisect will give false results or abort.

The script uses exit code 125 for skips because `git bisect run` reserves this code specifically for "this commit can't be tested." Any exit code between 1 and 124 is treated as "bad." Exit code 0 is treated as "good."

</details>
</details>

> **Key Takeaways**
> - `git bisect` performs binary search through commit history — O(log n) instead of O(n) — finding a bad commit in ~14 steps even across thousands of commits
> - `git bisect run <script>` automates the entire session; the script exits 0 for good, 1 for bad, and 125 for skip (untestable commits)
> - Bisect works for any detectable change: bugs, performance regressions, missing features, flaky tests — anything you can write a test script for
> - Always run `git bisect reset` when done to avoid staying in detached HEAD state
> - `git bisect --first-parent` traverses only merge commits, useful for finding which merge introduced a bug in a monorepo

> **See also:** [Chapter 6: Merge Strategies and the DAG 🔴](ch06-merge-strategies-dag.md) to understand how merge commits affect bisect history, and [Chapter 8: The Reflog (Time Travel) 🔴](ch08-reflog-time-travel.md) for recovering commits if you make commits during bisect and forget to reset.