# Execution

Runs after the plan is confirmed (or the user opted out of waiting).

## 1. Confirm the branch, again

```bash
git branch --show-current
gh issue develop <number> --list
```

Don't assume preflight's branch is still checked out.

## 2. Open the draft PR first

Before implementation — it's the running record. Push the branch so the PR
can be created:

```bash
git commit --allow-empty -m "chore: start #<number>"
git push -u origin "$(git branch --show-current)"

PR_BODY="$(mktemp -t prbody)"
cat > "$PR_BODY" <<'EOF'
Closes #<number>

## Summary
<1-2 sentences from the plan's scope>

## Plan
- [ ] <step 1 from the confirmed plan>
- [ ] <step 2>
- [ ] <step 3>

## Validation
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] `bun run build`
- [ ] `cd src-tauri && cargo test`   <!-- drop if no Rust change -->
- [ ] manual: <exercise via `bun run tauri dev`, if behavioral/UI>
EOF

gh pr create --draft --title "<title matching issue intent>" \
  --body-file "$PR_BODY" --base main
```

`Closes #<number>` links the PR and auto-closes the issue on merge —
required, not a plain mention.

**Generate a fresh `mktemp` path at every point of use** — a fixed
`/tmp/...` name collides across parallel worktrees (the epic-worker runs
several of these at once).

Commit message convention (from `git log`): `fix:` / `feat:` / `chore:`
prefixes, imperative. End commit messages with the Co-Authored-By /
Claude-Session trailers per the session rules.

## 3. Work the plan, commit at milestones

A milestone is "a checklist item is done and verified", not "a file was
touched".

```bash
git add <specific files>
git commit -m "fix: <what changed, why>"
```

**Do not push after every commit** — each push re-runs CI (`lint`, `test`,
`build`, `cargo test` on macOS runners). Commit locally, keep going.

Update the PR _description_ at each milestone (a metadata edit, no push, no
CI):

```bash
PR_BODY="$(mktemp -t prbody)"
gh pr view <pr-number> --json body -q .body > "$PR_BODY"
# check off completed items; note deviations from the plan; don't regenerate
gh pr edit <pr-number> --body-file "$PR_BODY"
```

Re-fetch the body immediately before every edit — don't trust an earlier
copy.

## 4. Verify, then move straight to ready for review

Run the gates for real (`superpowers:verification-before-completion` —
evidence before assertions):

```bash
bun run lint
bun run test              # + `bun run test src/lib/<file>.test.ts`
bun run build             # typecheck (tsc) + vite build
cd src-tauri && cargo test && cd ..   # only if Rust changed
```

**All green:** proceed immediately to ready-for-review in the same flow —
not a separate step the user must ask for:

```bash
PR_BODY="$(mktemp -t prbody)"
gh pr view <pr-number> --json body -q .body > "$PR_BODY"
# final description, all boxes checked
gh pr edit <pr-number> --body-file "$PR_BODY"
git push
gh pr ready <pr-number>
```

This is the second and last push of the flow.

**Only pause instead of flipping ready when:**

- a gate actually failed — fix and re-run, don't mark ready on red;
- the change is behavioral/UI and the repo's bar is to actually run it
  (`bun run tauri dev`), and you can't do that headless — say so explicitly
  in the report and ask the user to exercise the feature before flipping it
  ready.

Don't invent other pause conditions — a clean gate run is enough to proceed.

## 5. Final report

Always print, in order:

1. **Issue URL** — `gh issue view <number> --json url -q .url`.
2. **PR URL** — `gh pr view <pr-number> --json url -q .url`.
3. **Summary of work done** — 3–6 sentences keyed to the plan steps.
4. **Validation results** — which gates ran and passed (paste the tail of
   failures if any).
5. **Follow-ups** — see
   [follow-up-issues.md](follow-up-issues.md) if any are worth proposing.

Do not merge, push to `main`, force-push, or deploy — those need separate
explicit authorization.
