# Dependency Resolution

Turns an unordered issue set into ordered, conflict-free batches. Run this
fully before dispatching a single subagent — the point is to decide safe
parallelism up front, not discover a collision mid-run.

## 1. Pull the issue set

**From an epic:**

```bash
gh issue view <epic-number> --json body,title,url
```

Parse every `- [ ] #<n>` / `- [x] #<n>` line in the `## Tasks` section. A
plain `#<n>` mention in prose is not a task-list entry.

**From a label query** (the user named a filter):

```bash
gh issue list --state open --label P1 --label tax --json number,title,url --limit 100
```

## 2. Drop what's done, flag inconsistencies

For each candidate:

```bash
gh issue view <n> --json state,title,body,url,labels
```

- Unchecked + `OPEN`: in scope.
- Checked + `CLOSED`: done, drop silently.
- Checked + still `OPEN`, or unchecked + `CLOSED`: the epic's bookkeeping
  disagrees with reality. Surface it (which issue, which mismatch) before
  proceeding — don't silently pick a side. (Label queries can't have this
  mismatch.)

## 3. Extract signals from each remaining issue's body

**Explicit dependency phrases** — case-insensitive match for:

```
blocked by #123
depends on #123
after #123
requires #123
```

If `#123` is also in the working set, record an edge `123 → n` (123 worked,
or at least its PR opened, before `n`'s subagent starts). If `#123` isn't in
the set, ignore it.

Several REPORT.md issues cross-reference each other in prose — e.g. #2
mentions the "Criterio de caja toggle" (#31), #4 merges §2.3+§8.2, #35
folds in #4.7. Read these as **soft ordering hints**, and as **hard
conflicts** when they touch the same file.

**File/module anchors** — collect backtick-quoted paths that look real
(contain `/`, or end in `.ts .tsx .rs .sql .json .md`) from the issue's
Description / Fix / Implementation notes. Same "pull the concrete anchors"
move `github-issue-worker`'s preflight does.

Two issues **conflict** if their anchor sets share an exact path (a full
file path, or a specific named module — not merely "both touch `src/`").
When unsure whether a shared anchor is specific enough, treat it as a
conflict — serializing a pair that could have run parallel is far cheaper
than two subagents corrupting the same file.

**AutoMono hot files** — treat any two issues sharing one of these as a
hard conflict:

| File | Why |
|---|---|
| `src/App.tsx` | central screen switch + drag-drop wiring; every screen feature touches it |
| `src/db/invoices.ts` | shared query layer for Dashboard / Facturas / ResumenTrimestral |
| `src/lib/quarterlyDeclaration.ts` | the single source of tax truth |
| `src/lib/modeloReport.ts` | modelo expected-casilla logic |
| `src-tauri/src/lib.rs` | command registration + `all_migrations()` |
| `src/locales/en/common.json` + `.../es/common.json` | any i18n-string change |
| `src-tauri/migrations/` | numbering collides — **never** parallelize two migration-adding issues |

## 4. Build ordered, conflict-free batches

1. Topologically order by the step-3 dependency edges. Issues with no
   unresolved incoming edge are eligible for the current level.
2. Within a level, walk issues in stable order (by number) and add each to
   the first existing batch with no conflict against it; if it conflicts
   with every batch in the level, open a new batch.
3. The schedule is the ordered batch list: batches run strictly in sequence
   (batch 2 starts only once every subagent in batch 1 finished); issues in
   a batch run concurrently.

## 5. Present the plan

Before dispatching anything, print the batch schedule as a table: batch
number, issue numbers, and — for anything not running alongside everything
else in its level — the one-line reason (dependency edge, or which issue it
conflicts with on which file).

Get the user's confirmation by default. Skip waiting only under the same
hard-override rule `github-issue-worker` uses (the user already said "just
go" for this run). The printed plan itself is never optional.
