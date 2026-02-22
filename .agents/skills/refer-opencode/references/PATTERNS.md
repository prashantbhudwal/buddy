# Implementation Patterns (Parity-Aware)

Use these patterns when applying OpenCode to Buddy.

## 1) Classify First: `parity-core` vs `buddy-product`

Use this decision table before touching code:

| Change type | Classification | Action |
| --- | --- | --- |
| tool execution, agent loop, permission matching, runtime/session plumbing | parity-core | map in `pairs.tsv`, run parity scripts, log sync |
| learning UX/domain behavior, curriculum/memory strategy, React presentation | buddy-product | use OpenCode as inspiration, do not force parity mapping |

## 2) Single Source Pattern

When working parity-core tasks, do not restate dynamic process details here.
Use `opencore-pairity/sync-checklist.md` as the executable workflow.

## 3) Minimal-Port Pattern

Port behavior, not whole subsystems.

Good:

- Copy a specific loop guard or permission-matching fix from OpenCode.
- Keep Buddy's package boundaries and naming.

Bad:

- Copy full unrelated modules "for consistency."
- Pull OpenCode app/UI assumptions into Buddy backend parity files.

## 4) Mapping-Driven Pattern

Always resolve counterparts from `opencore-pairity/pairs.tsv` first.
If no row exists, use coverage tooling and then add a mapping row.

Do not maintain duplicate mapping lists in this skill file.

## 5) Parity Mapping Update Pattern

When a new parity-core file appears:

1. add row to `opencore-pairity/pairs.tsv`
2. follow `opencore-pairity/sync-checklist.md`
3. record decision in `opencore-pairity/sync-log.md`

## 6) Divergence Logging Pattern

If you intentionally diverge from OpenCode:

- Keep the divergence scoped to Buddy product needs.
- Record it in `sync-log.md` as `partial-sync` or `deferred`.
- State why parity was not applied.

## 7) Route/Loop Contract Pattern

When changing event/session routes:

1. preserve wire behavior first
2. preserve Buddy-specific scope constraints second
3. log intentional divergence in parity log

## 8) Message/Tool Loop Pattern

For regressions in "stuck send," empty output, or tool-call loops:

1. compare live Buddy and OpenCode loop files
2. verify stream part lifecycle behavior
3. verify tool metadata/truncation behavior

## 9) Fork Decision Pattern

Default decision is selective parity, not full fork.

Switch to fork only if all are true:

1. Product behavior is moving toward near-1:1 OpenCode behavior.
2. UI/runtime divergence cost is lower than upstream sync cost.
3. Team is ready for ongoing merge debt across a much larger codebase.
