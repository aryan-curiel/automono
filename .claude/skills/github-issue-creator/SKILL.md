---
name: github-issue-creator
description: >-
  Use when the user asks to create, file, or draft a new GitHub issue in this
  repo (a bug, task, or feature) — e.g. "create an issue for X", "file a bug
  about Y", "add this to the backlog". Covers setting the native GitHub Issue
  Type (Bug / Task / Feature), applying this repo's severity + area labels,
  optionally linking to a parent Epic, and formatting the body to match
  existing issues.
---

# GitHub Issue Creator

Creates well-formed GitHub issues for **AutoMono** (`aryan-curiel/automono`)
using `gh`. This repo has **no issue-template YAML** — the body conventions
in [references/issue-body-template.md](references/issue-body-template.md) are
the source of truth. It uses GitHub's native Issue Type (`Bug` / `Task` /
`Feature`) set via `--type`, plus a small flat label set (severity `P0`–`P3`
+ area labels). It's a **single-maintainer personal project**: epics are
*optional*, not mandatory.

## Quick Start

1. Determine the Issue Type (`Bug` / `Task` / `Feature`) and gather the
   substance: current state, what needs to change, why it matters, acceptance
   criteria (or repro + expected/actual for a bug).
2. Pick labels from the **actual** label set (`gh label list`), never invent
   one:
   - **exactly one** severity — `P0` / `P1` / `P2` / `P3`
   - **one or more** area labels — `tax`, `backend`, `frontend`, `ai`,
     `security`, `perf` (a bug can be `backend` + `tax`; a feature often just
     `enhancement` + one area)
   - keep the legacy `bug` / `enhancement` labels **in addition to** the
     Issue Type, matching how issues #2–#43 were filed.
   See [references/label-taxonomy.md](references/label-taxonomy.md).
3. **Epic linking is optional.** If the user wants epic grouping, or an
   obviously-matching `Epic — <Theme>` issue is already open, propose it and
   confirm. Otherwise skip straight to creation — labels are the primary
   grouping mechanism here. See
   [references/epic-workflow.md](references/epic-workflow.md).
4. Build the body from
   [references/issue-body-template.md](references/issue-body-template.md)
   (write it to a scratch file — inline `--body` mangles multi-line markdown)
   and create it:
   ```bash
   gh issue create --title "Rust invoice path stores unrounded money" \
     --body-file "$(mktemp -t issue)" \
     --type Bug --label "P0" --label "bug" --label "backend" --label "tax"
   ```
5. If linked to an epic, append the new issue to the epic's `## Tasks`
   checklist and check whether the epic's `Description` is now stale (propose
   + confirm before editing). See
   [references/epic-workflow.md](references/epic-workflow.md).
6. Report back — see [references/gh-commands.md](references/gh-commands.md)
   for the exact commands and the final summary format.

## Core Directives

- **ALWAYS** set exactly one Issue Type via `--type` (`Bug` / `Task` /
  `Feature`). `Feature` doubles as the Epic type (an epic is a `Feature`
  issue titled `Epic — <Theme>`).
- **ALWAYS** apply exactly one `P0`–`P3` severity label and at least one area
  label, all from `gh label list` — never invent a label. Mirror the
  existing convention of also carrying `bug` / `enhancement` alongside the
  native type.
- **ASK** the user how severe/urgent the issue is when it isn't stated or
  clearly implied — default to `P2` on "not sure / just backlog", never
  guess `P0`/`P1` silently. `P0` is filing-correctness or data-loss only.
- **DO NOT** force an epic. Propose one only if the user asks for grouping or
  a matching open epic exists; confirm before assigning or creating. A plain
  labelled issue with no epic is the normal case in this repo.
- **ALWAYS** ground the body in real anchors — actual file paths and
  `file:line` refs (`src/lib/quarterlyDeclaration.ts:21`), real migration
  numbers, real table/column names — not "the relevant module". Match the
  specificity of `REPORT.md` and issues #2–#43.
- **DO NOT** create an issue without at least a Description + Acceptance
  criteria (task/feature) or Repro + Expected/Actual (bug).
- **ALWAYS** end by printing: the created issue URL, its Issue Type + labels
  (each with a one-line reason), a 2–4 sentence summary of the body, and —
  if an epic was touched — which epic and whether its description was
  updated.
- **NEVER** push code, open a PR, or start implementing as part of this
  skill — it files the issue and stops. Use `github-issue-worker` to work
  one.

## Reference Directory

| Scenario | Trigger Keywords | Reference File |
|---|---|---|
| Which Issue Type / labels to pick, full label list | label, issue type, --type, severity, P0, area, taxonomy | [references/label-taxonomy.md](references/label-taxonomy.md) |
| Optional epic matching / creation / linking | epic, parent, grouping, Feature type, theme | [references/epic-workflow.md](references/epic-workflow.md) |
| Body structure per issue type | template, body, description, acceptance criteria, repro steps | [references/issue-body-template.md](references/issue-body-template.md) |
| Exact `gh` invocations for each step | gh issue create, gh issue edit, gh label list | [references/gh-commands.md](references/gh-commands.md) |

## Related Skills

- [[github-issue-worker]] — works a single existing issue end to end (branch,
  plan, draft PR, CI gates, ready-for-review).
- [[github-epic-worker]] — batch-works every open child issue of an epic, one
  isolated worktree per issue.
- [[ponytail:ponytail]] — the laziness discipline; an issue body should ask
  for the smallest change that fixes the root cause, not a redesign.
