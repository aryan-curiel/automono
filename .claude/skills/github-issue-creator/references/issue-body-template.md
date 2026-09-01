# Issue Body Templates

This repo has **no `.github/ISSUE_TEMPLATE/*.yml`** — these conventions are
the source of truth. Formatting below matches how issues #2–#43 render (the
bar to hit): a one-line `Part of #<epic>` only when there's an epic, then a
severity line, then `##` sections. Ground every section in real
`file:line` anchors, the way `REPORT.md` does.

## Bug (Issue Type: `Bug`)

Title: `<short summary of the defect>` — plain, no `Bug —` prefix (issues
#2–#29 don't use one).

```markdown
<Part of #<epic-number> — only if linked to an epic>

From REPORT.md §<n>.  <!-- or: Discovered while working on #<n>. -->

## Repro / where it is

<Concrete: the file:line, the function, the input that triggers it. For a
tax bug, the modelo and the casilla.>

- `src/lib/quarterlyDeclaration.ts:21-32`
- `src/components/DeclarationWizard.tsx:97`

## Expected vs actual

**Expected:** <...>
**Actual:** <...>

## Fix

<The smallest change that fixes the root cause — not a redesign. Bullet the
concrete edits. Note any test to add.>
```

## Task (Issue Type: `Task`)

Title: `<verb-first summary>` — e.g. "Extract a shared `<ListRow>` primitive".

```markdown
<Part of #<epic-number> — only if linked>

From REPORT.md §<n>.

## Description

<Current state and what needs to change. File paths, not aspiration.>

## Acceptance criteria

1. <numbered, checkable>
2. <...>

## Implementation notes

<Optional. Sequencing, gotchas, what NOT to do. A real diff snippet in a
fenced block (```ts / ```rust / ```sql) when it clarifies the shape — not a
full implementation.>
```

## Feature (Issue Type: `Feature`)

Title: `Feature: <capability>` — matches #30–#43.

```markdown
<Part of #<epic-number> — only if linked>

From REPORT.md §8.<n>.

## What

<The capability, in the user's terms. What the autónomo can do that they
can't today.>

## Why it matters

<One paragraph. For AutoMono this is usually "replaces a manual chore" or
"prevents a filing mistake".>

## Sketch

<Optional. Which existing pieces it builds on — e.g. "reuses
`duplicateInvoice`'s line copy", "the `user_context` scaffolding already
exists". Rough steps, not a spec.>
```

## Epic (Issue Type: `Feature`, title prefix `Epic — `)

Only when the user asks for epic grouping.

```markdown
## Description

<What this epic covers and why, grounded in a concrete source (REPORT.md, a
recurring pain point) — not generic scope.>

## Tasks

- [ ] #<issue> <short title>
- [ ] #<issue> <short title>

## Success criteria

<Plain prose or a short list. KPI tables are overkill for a personal
project — use them only if the user wants metrics.>
```

## General rules

- Real file paths and `file:line` when known; real modelo/casilla/table
  names; never placeholders like "the relevant service".
- Tables are fine when several parallel items exist (a fix-by-fix table).
- `Part of #<epic>` and the `**Severity:**`-style lines, when present, go
  before the first `##` heading.
- Keep the "Fix" / "Sketch" section honest about scope — the smallest
  root-cause change, per `ponytail`.
