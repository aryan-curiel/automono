# Follow-up Issues

Working an issue often surfaces adjacent work that's out of scope for the
current PR (a discovered bug, a deferred cleanup, a `ponytail:` comment you
had to leave behind). Handle it here — don't fold it into the current PR,
don't file it silently.

## When to propose one

Something you noticed but deliberately didn't fix because it wasn't in the
confirmed plan's scope — not every nice-to-have. If it's small enough to
just do under the current plan, prefer that.

A `ponytail:` comment you _added_ during this work (a deliberate shortcut
with a known ceiling) is a candidate — surface it so the deferral is
tracked, not lost. (`ponytail:ponytail-debt` harvests these repo-wide if the
user wants the full ledger.)

## Propose, don't create

1. List each candidate follow-up in the final report with a one-line
   rationale for why it's out of scope for this PR.
2. Ask which (if any) to file. **Never** create a follow-up without explicit
   approval.

## Creating approved follow-ups

Use the `github-issue-creator` skill — don't hand-roll `gh issue create`
here; it owns the label taxonomy and body conventions. Invoke it once per
approved follow-up (or once for a batch), giving it:

- The substance (what / why) from what you discovered.
- A note that it originated from issue #<number> / PR #<pr-number>, so the
  new body opens with `Discovered while working on #<number>.`

## Cross-reference back

After the follow-up issue(s) exist, close the loop:

```bash
ISSUE_BODY="$(mktemp -t issuebody)"
gh issue view <number> --json body -q .body > "$ISSUE_BODY"
# append a "## Follow-ups" section listing the new issue(s)
gh issue edit <number> --body-file "$ISSUE_BODY"

PR_BODY="$(mktemp -t prbody)"
gh pr view <pr-number> --json body -q .body > "$PR_BODY"
# append the same follow-up references
gh pr edit <pr-number> --body-file "$PR_BODY"
```

Re-fetch both bodies immediately before editing. Fresh `mktemp` each time —
never a fixed name across parallel worktrees. Include the new issue URL(s)
in the final report.
