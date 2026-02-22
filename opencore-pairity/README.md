# OpenCore Pairity Sync Kit

This folder defines how Buddy keeps benefiting from OpenCode core infra changes
without becoming a full fork.

## Scope

Only core agent/runtime files that should stay close to OpenCode are tracked.
See `pairs.tsv` for the source of truth.

## Will This Still Work As Buddy Grows?

Yes, if new OpenCode-inspired work follows this rule:

- If it is core infra parity work, add it to `pairs.tsv` and track it with this kit.
- If it is Buddy product work (learning UX/domain behavior), keep it outside parity mappings.

This lets Buddy keep benefiting from OpenCode optimizations while avoiding full-fork merge debt.

## Maintenance Contract (Bidirectional)

This folder is intentionally treated as a contract, not optional notes.

- If you change any mapped core file in `pairs.tsv`, you must update:
  - `opencore-pairity/sync-log.md` (new entry)
  - `opencore-pairity/pairs.tsv` only if mapping/scope changed
- If you change `pairs.tsv`, `README.md`, or `sync-checklist.md`, you must run:
  - `./opencore-pairity/scripts/diff-pairs.sh --changed-only`
  - `./opencore-pairity/scripts/screen-coverage.sh`
  - `./opencore-pairity/scripts/upstream-history.sh --max-count 5`
  and add a `sync-log.md` entry describing why the contract changed.

If one side changes, the other side must be updated in the same task/PR.

- If you add a new OpenCode feature to Buddy and it belongs in core parity, you must:
  - add a row to `pairs.tsv`
  - run parity scripts (diff, coverage, upstream history)
  - add a `sync-log.md` entry with rationale and upstream references

## Quick Start

1. Compare mapped files:

```bash
./opencore-pairity/scripts/diff-pairs.sh
```

2. Show only files that drifted:

```bash
./opencore-pairity/scripts/diff-pairs.sh --changed-only
```

3. Review upstream commit history for mapped files:

```bash
./opencore-pairity/scripts/upstream-history.sh --max-count 8
```

4. Optional: inspect changes since a known OpenCode commit:

```bash
./opencore-pairity/scripts/upstream-history.sh --since <opencode_commit_sha>
```

5. Run methodical coverage screening (checks for unmapped parity candidates):

```bash
./opencore-pairity/scripts/screen-coverage.sh
```

## Path Resolution

Scripts resolve OpenCode from:

1. `--opencode-dir <path>` option
2. `OPENCODE_DIR` environment variable
3. `~/code/opencode`
4. `~/Code/opencode`

## Suggested Cadence

- Run weekly or before major Buddy agent changes.
- Port only behavior/perf/reliability changes from mapped files.
- Keep Buddy product-specific behavior outside the mapped core where possible.
- Run `screen-coverage.sh` after adding new OpenCode-inspired core features.

Use `sync-checklist.md` as the operational runbook.

## Intentions And Risks Context

See `CONTEXT.md` for the original intent behind this folder and the known failure modes future agents should account for.

## Definition Of Done For Pairity Work

A parity task is complete only when all are true:

1. Code changes are made (or explicitly deferred) for targeted pairs.
2. `sync-log.md` has an entry with date, pairs touched, upstream SHAs, and decision.
3. `diff-pairs.sh --changed-only` output is reviewed and attached to task notes.
4. `screen-coverage.sh` output is reviewed and attached to task notes.
5. Backend validation commands are run (or failures documented).
