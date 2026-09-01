# Preflight

Run this before writing a line of code. `gh` infers the repo
(`aryan-curiel/automono`) from the remote — no `--repo` flag needed.
Use `rg`, never `grep` (per this user's global instructions).

## 1. Confirm the issue still needs doing

### 1a. Basic status check

```bash
gh issue view <number> --json number,title,state,body,url,labels
```

- `state == CLOSED`: stop, tell the user. Check `closedByPullRequestsReferences`
  or the timeline for how it closed.
- Open: check for a PR that already addresses it —
  ```bash
  gh pr list --search "<number> in:body" --state all --json number,title,state,url
  ```
  If one already closes/resolves it, stop and say so.
- Skim `gh issue view <number> --comments` for a note that it was handled
  elsewhere.

### 1b. Verify the request still applies to the current code

Most AutoMono issues came from `REPORT.md` and carry hard `file:line`
anchors. Check them:

1. **Pull the anchors** out of the body — file paths, `file:line`, function
   names, migration numbers, casilla/table/column names, screenshots.
2. **Check they still exist and still read as described**:
   ```bash
   rg -n "<anchor>" src src-tauri
   ```
   - Bug: read the implementation at that anchor today. Does the defect
     still reproduce as the code reads now, or did a later commit fix it /
     make it impossible?
   - Feature/task: search for whether it already shipped under other naming.
   - An anchor (file/function) that no longer exists is a strong signal the
     issue predates a refactor and needs re-scoping, not blind execution.
3. **Check for doctrine drift** on product-behavior issues: skim `CLAUDE.md`,
   `PRODUCT.md`, `PRD.md`, `FEATURES.md` / `FUTURE_FEATURES.md`, and the
   relevant `new-design/*.md` for anything changed since the issue was filed
   that would make the ask wrong (e.g. a locked design constraint the issue
   would now violate — second accent color, responsive layout, decorative
   motion).
4. **Check recency of related work**:
   ```bash
   git log --oneline --since="<issue created-at>" -- <path>
   ```
   The recent history (`git log --oneline -15`) already shows heavy review
   churn on charts, keyboard access, and the Facturado/Neto basis — re-read
   the issue with that context.

If this surfaces a mismatch (partially done, already fixed, no longer
applicable, needs re-scoping), stop and lay out exactly what you found. Let
the user decide: proceed as-is, re-scope, close, or drop.

### 1c. Skipping this check

If the user says to skip it ("skip the relevance check", "I already
confirmed", "just start") — skip 1b, still run 1a (cheap, catches
already-closed). Note the skip in the plan/PR.

## 2. Get onto the right branch

```bash
git status
git branch --show-current
```

**If on `main`:**

```bash
git fetch origin
git rev-list --count HEAD..origin/main   # 0 = up to date
```

If behind, `git pull --ff-only`. Then:

```bash
gh issue develop <number> --checkout
```

This creates an issue-linked branch (auto-named from the title) and checks
it out. Prefer it over a hand-named branch — the link shows in the issue
sidebar and this skill relies on it later.

**If not on `main`:** verify the current branch is the one linked to this
issue:

```bash
gh issue develop <number> --list
```

Compare to `git branch --show-current`. Match → continue. No match → tell
the user, ask whether to switch/create the linked branch rather than working
on the wrong one.

**Worktree note:** if checkout fails with `'<branch>' is already used by
worktree at '<path>'`, run `git worktree list`, work from that existing
worktree instead of forcing a conflicting checkout. `.claude/worktrees/` is
where this repo's isolated worktrees live.

## 3. Detect and disclose partial prior work

If `gh issue develop --list` shows an existing branch, or the checked-out
branch has commits beyond a fresh branch off `main`:

```bash
git log origin/main..HEAD --oneline
```

Any commits mean prior work. Do **not** silently resume:

1. Summarize what those commits did.
2. Propose a status comment on the issue ("Resuming — X and Y done,
   continuing with Z"); confirm the wording.
3. Post it: `gh issue comment <number> --body "..."`
4. Plan with that prior work as known context, not something to redo.
