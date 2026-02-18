---
name: commit-batch
description: write clear commit messages and batch changes into logical commits.
---

## Introduction

A diff shows what changed. A good commit message explains why it changed.
Make commits easy to scan in `git log --oneline` and useful later in `git blame`.

## The Seven Rules (Adapted For Conventional Commits)

1. Separate subject from body with a blank line
2. Limit the subject line to 50 characters (72 hard limit)
3. Capitalize the subject (the description part)
4. Do not end the subject with a period
5. Use the imperative mood in the subject
6. Wrap the body at 72 characters
7. Use the body to explain what and why, not how

### Subject Line Format

Use Conventional Commits and treat the whole first line as the subject:

```
type(scope): Subject
```

- `type` is lowercase
- `scope` is optional
- `Subject` is imperative and Capitalized
- No trailing period

### Imperative Mood Test

Your subject should complete:

```
If applied, this commit will <subject>
```

Good:

- `feat: Add items CRUD endpoints`

Bad:

- `feat: Added items CRUD endpoints`
- `feat: Adding items CRUD endpoints`

## Conventional Commits

Format:

```
type(scope): Subject
```

Types:

- feat: new feature
- fix: bug fix
- docs: documentation only
- refactor: refactor (no behavior change intended)
- test: tests
- chore: tooling, deps, repo hygiene
- style: formatting only (rare; avoid if it causes noise)

Examples:

- `chore: Setup monorepo tooling`
- `feat(api): Add items CRUD endpoints`
- `feat(ui): Add shadcn button component`
- `fix(ui): Generate Tailwind utilities for shared UI`
- `docs: Document dev commands`

## Batching And Staging Rules

Goal: each commit is one idea.

Rules:

- Never use `git add .`
- Batch by concern (not by file count)
- Prefer smaller, reviewable commits
- Put cleanup and deletions in their own commit

### Recommended Commit Order (Monorepo)

1. Root/workspace config
2. Backend/infrastructure
3. Shared libraries/packages
4. Apps that consume shared packages
5. Docs / internal skills
6. Cleanup

### Staging Workflow

For each commit:

```bash
git status --short
git diff

# stage only what belongs
git add <paths>

# sanity check
git diff --staged

git commit -m "type(scope): Subject"
```

Helpful commands:

```bash
git add -u                 # stage deletions/renames only
git restore --staged <p>   # unstage a path
```

## When To Use A Body

Add a body when it saves future you time:

- why the change exists
- behavior before vs after
- constraints/tradeoffs
- follow-ups

Template:

```
type(scope): Subject

Explain what changed and why.
Wrap at 72 characters.

Notes:
- side effects
- migration steps

Refs: #123
```

## Smell Checks

- If you cannot write a 50-72 char subject, the commit is too big.
- If the message says "updates" / "misc" / "wip", the commit is not one idea.
- If the body explains how, move that explanation to code/comments instead.
