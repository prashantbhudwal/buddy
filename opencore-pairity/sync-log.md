# OpenCore Pairity Sync Log

Append-only log for parity runs and parity contract changes.

## Entry Template

```md
## YYYY-MM-DD - <short title>

- Type: parity-sync | contract-change
- Buddy refs: <branch/commit/pr>
- OpenCode refs: <commit sha list or range>
- Pairs touched:
  - packages/buddy/src/... -> packages/opencode/src/...
- Summary:
  - <what changed and why>
- Validation:
  - diff-pairs: <command + result>
  - upstream-history: <command + result>
  - backend checks: <commands + result>
- Decision:
  - synced | partial-sync | deferred
- Next step:
  - <follow-up action>
```

## 2026-02-22 - Bootstrap sync kit

- Type: contract-change
- Buddy refs: working tree
- OpenCode refs: local `/Users/prashantbhudwal/code/opencode` HEAD at run time
- Pairs touched:
  - new mapping created in `pairs.tsv` (13 files)
- Summary:
  - Initialized parity kit with file mappings, drift/history scripts, checklist, and governance contract.
- Validation:
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `diff=13 missing=0`
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 3` -> success
  - backend checks: not run in this task
- Decision:
  - synced
- Next step:
  - use this log for every parity task and include upstream SHAs for actual code syncs.

## 2026-02-22 - Add intent and risk context for future agents

- Type: contract-change
- Buddy refs: working tree
- OpenCode refs: local `/Users/prashantbhudwal/code/opencode` HEAD at run time
- Pairs touched:
  - none (documentation-only parity governance update)
- Summary:
  - Added explicit bidirectional maintenance contract language for future parity-core additions.
  - Added `CONTEXT.md` documenting original intent, product boundary, and known risks.
  - Updated checklist to classify new OpenCode features as parity-core vs buddy-product.
- Validation:
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `diff=13 missing=0` (exit 1 by design)
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 5` -> success
  - backend checks: not run in this docs-only task
- Decision:
  - synced
- Next step:
  - for the next parity-core feature port, add/adjust `pairs.tsv` first, then log upstream SHAs in a parity-sync entry.

## 2026-02-22 - Methodical final screening and mapping expansion

- Type: contract-change
- Buddy refs: working tree
- OpenCode refs: local `/Users/prashantbhudwal/code/opencode` HEAD at run time
- Pairs touched:
  - expanded `pairs.tsv` from 13 to 40 mappings
  - added route rename mappings (`routes/*` -> `server/routes/*`)
  - added list/system/global/message-v2 rename mappings
  - added exact-path coverage rows for remaining core-compatible files
- Summary:
  - Performed full Buddy/OpenCode backend file screening.
  - Found unmapped parity-relevant files in tools, bus, config, routes, schema, and bootstrap layers.
  - Added `screen-coverage.sh` to automate exact-path and known-rename coverage checks.
  - Updated README/checklist contract to require coverage screening alongside drift/history checks.
- Validation:
  - coverage (before expansion): `./opencore-pairity/scripts/screen-coverage.sh` -> `unmapped_exact=5`
  - coverage (after expansion): `./opencore-pairity/scripts/screen-coverage.sh` -> `unmapped_exact=0, unmapped_rename=0`
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `total=40 match=1 diff=39 missing=0` (exit 1 by design)
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 2` -> success
  - backend checks: not run in this parity-governance task
- Decision:
  - synced
- Next step:
  - keep new parity-core files blocked on adding a `pairs.tsv` row and green `screen-coverage.sh`.
