# Label Taxonomy

Pulled from `gh label list` on `aryan-curiel/automono`. Re-run it if in
doubt — this is a snapshot.

## Issue Type — required, set via `--type`, not a label

This repo uses GitHub's native Issue Type field. Set it with
`gh issue create --type <name>` / `gh issue edit --type <name>`. This is a
personal account: the Issue Types are fixed at exactly three — `Bug`,
`Task`, `Feature` — no custom types.

| Issue Type | Use for |
|---|---|
| `Bug` | A defect — wrong, unexpected, or filing-incorrect behavior. Most of REPORT.md §2–§7. |
| `Task` | A scoped unit of work that isn't a user-facing feature — a refactor, a perf fix, a test, a chore. |
| `Feature` | A new capability. Also doubles as the Epic type: an epic is a `Feature` issue titled `Epic — <Theme>`. |

## Severity — required, exactly one, as a label

`P0` / `P1` / `P2` / `P3` (created for this repo). This is the primary triage
axis — every issue gets one.

| Label | Meaning | Examples |
|---|---|---|
| `P0` | Filing-correctness or data-loss. A wrong number goes to AEAT, or user data can be destroyed. | #2 (cash/accrual basis), #3 (unrounded money) |
| `P1` | Wrong but recoverable, or a security hole, or the highest-leverage feature. | #4 (Modelo 130), #9/#10 (backup), #29 (CSV injection), #30 (deadline reminders) |
| `P2` | Polish, performance, UX friction. The bulk of the backlog. | #17–#26 |
| `P3` | Nice-to-have, cosmetic, non-urgent cleanup. | #21, #22, #27, #28 |

**Decision flow:** if the user states or implies urgency, use it. Otherwise
ask "how bad is this — does a wrong number reach the tax office (P0), is it
just wrong-but-fixable (P1), or is it polish (P2)?" Default to `P2` on
unsure. Never assign `P0` without a data-loss or filing-correctness
rationale.

## Area — one or more, as labels

| Label | Scope |
|---|---|
| `tax` | Spanish tax logic: `src/lib/quarterlyDeclaration.ts`, `modeloReport.ts`, `taxCalendar.ts`, `lateInterest.ts`, `src/features/*/taxDefaults.ts`, AEAT modelo extraction. |
| `backend` | Rust / Tauri: `src-tauri/src/**`, migrations, PDF generation, backup/restore, file attach, `invoke` command boundary. |
| `frontend` | React: `src/screens/`, `src/components/`, `src/db/`, i18n, charts, forms. |
| `ai` | LLM code: `src-tauri/src/llm.rs`, `receipt_extract.rs`, `modelo_review.rs`, `user_context.rs`, prompts, model choice, cost. |
| `security` | Data-safety / trust boundaries: path validation, CSV injection, key storage, restore safety. |
| `perf` | Performance: unmemoized recompute, redundant queries, bundle weight, blocking I/O. |

A single issue can carry several (`#3` is `backend` + `tax`; `#9` is
`backend` + `perf`). Pick every area the change actually touches.

## Legacy `bug` / `enhancement`

The repo also carries GitHub's default `bug` and `enhancement` labels.
Issues #2–#43 apply them **in addition to** the native Issue Type
(`Bug` issues get `bug`, `Feature`/`Task` improvements get `enhancement`).
Keep doing that for consistency with the existing set.

Other GitHub defaults (`documentation`, `duplicate`, `good first issue`,
`help wanted`, `invalid`, `question`, `wontfix`) are available but not part
of the convention — use only if the user asks.

## Epics skip severity/area

An `Epic — <Theme>` issue (`Feature` type) carries no `P*` or area labels —
its children do.
