# Epic Workflow (optional)

AutoMono is a single-maintainer personal project. **Epics are optional** —
the default is a flat, labelled issue with no parent. Use an epic only when:

- the user explicitly asks to group issues under a theme, or
- you're filing several related issues at once and a container genuinely
  helps track them (e.g. the REPORT.md §8 feature set), or
- an `Epic — <Theme>` issue is already open and the new issue plainly
  belongs in it.

If none of those apply, skip this file entirely — create the issue with its
labels and stop.

## 1. List candidate epics

No native Epic type — filter open issues on the `Epic — ` title prefix:

```bash
gh issue list --state open --json number,title,url,body \
  --jq '[.[] | select(.title | startswith("Epic — "))]'
```

## 2. Propose a match, then confirm

> "This looks like it belongs under **#N — Epic — Backup & restore
> safety**. Assign it there?"

Confirm before assigning. If nothing fits and the user wants an epic, go to
step 3.

## 3. Create a new epic (only after a yes)

```bash
gh issue create --title "Epic — <Theme>" --type Feature \
  --body-file "$(mktemp -t epic)"
```

Body: `## Description`, `## Tasks`, `## Success criteria` (see
[issue-body-template.md](issue-body-template.md#epic-issue-type-feature-title-prefix-epic-)).
Keep it focused — if it exists to hold three known issues, say so.

## 4. Link the child issue in

Append it to the epic's `## Tasks` checklist. Re-fetch the body first — never
blind-overwrite:

```bash
gh issue view <epic-number> --json body -q .body > "$(mktemp -t epicbody)"
# append: - [ ] #<new-issue-number> <short title>
gh issue edit <epic-number> --body-file <that file>
```

Add the child's `Part of #<epic-number>` as the first line of its own body.

## 5. Check whether the epic's description is now stale

If the new issue represents a facet the epic's `## Description` doesn't
mention, **propose the specific wording change and confirm** before editing.
If the epic already covers it fine, say so and skip. Don't silently rewrite
an epic description.
