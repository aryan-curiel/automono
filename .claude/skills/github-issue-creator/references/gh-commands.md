# `gh` Commands

`gh` infers the repo (`aryan-curiel/automono`) from the git remote — no
`--repo` flag needed from inside the checkout.

## List labels (confirm the taxonomy hasn't drifted)

```bash
gh label list --limit 100
```

Current set: `P0`–`P3` (severity), `tax` / `backend` / `frontend` / `ai` /
`security` / `perf` (area), plus GitHub defaults `bug` / `enhancement` used
alongside the native Issue Type. See
[label-taxonomy.md](label-taxonomy.md).

## List open epics (only if using epic grouping)

```bash
gh issue list --state open --json number,title,url,body \
  --jq '[.[] | select(.title | startswith("Epic — "))]'
```

## Inspect an existing issue for tone/format

```bash
gh issue view <number> --json number,title,body,labels,state
```

Issues #2–#43 are the reference for body shape and label combos.

## Create the issue

Write the body to a scratch file first — inline `--body` mangles multi-line
markdown. Generate a fresh `mktemp` path each time (never a fixed
`/tmp/issue-body.md` — it collides across parallel worktrees).

```bash
BODY="$(mktemp -t issue)"
cat > "$BODY" <<'EOF'
From REPORT.md §2.2.

## Repro / where it is
...

## Fix
...
EOF

gh issue create \
  --title "Rust invoice-issue path stores unrounded floating-point money" \
  --body-file "$BODY" \
  --type Bug --label "P0" --label "bug" --label "backend" --label "tax"
```

`--type` is required because `gh issue create` doesn't run a template form.
`gh issue create` prints the created issue URL — capture it for the summary.

## Bulk-create (many issues at once)

For a batch like the REPORT.md backlog, write a small shell script with an
`issue()` helper (title, labels, heredoc body) rather than 40 hand calls —
see `scratchpad/create_issues.sh` from the REPORT.md run for the pattern.

## Append a task to an epic's checklist

Re-fetch first:

```bash
EPIC="$(mktemp -t epicbody)"
gh issue view <epic-number> --json body -q .body > "$EPIC"
printf -- '- [ ] #%s %s\n' "<new-issue-number>" "<short title>" >> "$EPIC"
gh issue edit <epic-number> --body-file "$EPIC"
```

If the epic has no `## Tasks` section yet, add one before appending.

## Update an epic's description (only after user confirms wording)

```bash
EPIC="$(mktemp -t epicbody)"
gh issue view <epic-number> --json body -q .body > "$EPIC"
# patch the Description section only; leave Tasks and everything else alone
gh issue edit <epic-number> --body-file "$EPIC"
```

## Final report to the user

After creation, always print:

1. The issue URL.
2. The Issue Type and every label, each with a one-line reason (e.g.
   "`P0` — a wrong IVA figure would reach AEAT"; "`backend` + `tax` — the
   bug is in `invoicing.rs` and it's tax math").
3. A 2–4 sentence summary of the issue's substance.
4. Which epic it was linked under, if any (or that none was used).
5. If an epic's description was updated (or considered and skipped), one
   line saying so.
