# Dispatch

Runs a confirmed (or override-skipped) batch plan from
[dependency-resolution.md](dependency-resolution.md): one subagent per issue,
isolated worktree per subagent, one batch at a time.

## 1. One `Agent` call per issue, all in the same response

For every issue in the current batch, call the `Agent` tool with
`isolation: "worktree"` — the native worktree mechanism
`superpowers:using-git-worktrees` prefers over a hand-rolled `git worktree
add`. Don't create worktrees manually.

Issue every `Agent` call for the batch **in one response** — one call per
response runs them sequentially, defeating the batch (per
`superpowers:dispatching-parallel-agents`).

Subagents run in the background (the tool default); you're notified as each
finishes.

## 2. Prompt structure — self-contained, one per issue

Each subagent starts cold — it hasn't seen the epic, the batch plan, or why
this issue is in this batch. Give it everything:

```
Implement GitHub issue #<n> in the AutoMono repo (aryan-curiel/automono)
<if part of an epic: (part of epic #<epic-number>)>.

Invoke the github-issue-worker skill for issue #<n> and follow it fully:
preflight, plan, draft PR, milestone commits, CI-gate verification,
ready-for-review.

Gates for this repo: `bun run lint`, `bun run test`, `bun run build`, and
`cd src-tauri && cargo test` if you touch Rust.

<if this issue has a dependency edge from step 3 of dependency-resolution.md:>
This issue depends on #<blocker-n>, which may not be merged to main yet.
Before branching, check: `gh pr view <blocker-pr-number> --json state,headRefName`.
If #<blocker-n>'s PR is still open (not merged), base your branch on its
branch instead of main:
  gh issue develop <n> --checkout --base <blocker-branch-name>
Set your PR's base to <blocker-branch-name> and note in the PR description
it's stacked on PR #<blocker-pr-number> pending that merge. If #<blocker-n>
merged to main by the time you run this, branch from main as normal.

<plan-approval instruction:>
<if the batch plan was confirmed/overridden with "skip waiting":>
Skip waiting for plan approval on this issue too — proceed straight to
execution once your plan is written down.
<otherwise:>
Wait for the user's confirmation on your implementation plan before
executing, per github-issue-worker's normal default.

Report back: issue URL, PR URL, one-paragraph summary of what you did, and
validation results (what you ran, pass/fail).
```

Fill in every `<...>` — a literal placeholder in a subagent prompt is a
broken dispatch.

## 3. Wait for the whole batch before the next

A later batch may stack on an earlier batch's branch. Don't dispatch batch
N+1 until every subagent in batch N has reported back — the task-completion
notifications tell you when each finishes; don't poll, just wait.

If a subagent fails or gets stuck, don't silently proceed — surface the
failure and ask whether to retry that issue, skip it (and drop anything that
depended on it, re-running the ordering for what's left), or pause the run.

## 4. Collect results, report per batch and at the end

After each batch, note per issue: issue URL, PR URL, worktree path/branch
(from the `Agent` result — worktrees with no changes are auto-cleaned, so a
missing path means the subagent made no changes, itself worth flagging), and
status.

At the end of the whole run, print one table covering every issue that was
in scope (including any dropped for a state mismatch), plus a short paragraph
on the set overall — what shipped, what's still open, what needs a human
decision.
