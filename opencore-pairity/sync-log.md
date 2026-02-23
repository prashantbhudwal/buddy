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

## 2026-02-22 - Add glob/grep/bash parity tools and close prompt mismatch

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - `packages/opencode/src/tool/glob.ts`
  - `packages/opencode/src/tool/grep.ts`
  - `packages/opencode/src/tool/bash.ts`
  - latest history sampled via `./opencore-pairity/scripts/upstream-history.sh --max-count 5`
- Pairs touched:
  - `packages/buddy/src/tool/glob.ts` -> `packages/opencode/src/tool/glob.ts`
  - `packages/buddy/src/tool/grep.ts` -> `packages/opencode/src/tool/grep.ts`
  - `packages/buddy/src/tool/bash.ts` -> `packages/opencode/src/tool/bash.ts`
  - `packages/buddy/src/tool/registry.ts` -> `packages/opencode/src/tool/registry.ts`
  - `packages/buddy/src/session/prompts/learning-companion.txt` (Buddy-side prompt/tool contract alignment)
- Summary:
  - Added missing parity-core tools (`glob`, `grep`, `bash`) to close runtime/prompt mismatch.
  - Wired tools into `ToolRegistry` and added tool descriptions under `packages/buddy/src/tool/*.txt`.
  - Updated prompt policy to prefer new specialized search tools before bash.
  - Added backend tests for registry presence and execution behavior (`packages/buddy/test/tooling-parity.test.ts`).
  - Expanded `pairs.tsv` with new parity mappings for `glob`, `grep`, and `bash`.
- Validation:
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `total=43 match=1 diff=42 missing=0` (exit 1 by design)
  - coverage: `./opencore-pairity/scripts/screen-coverage.sh` -> `Exact summary total=35 mapped=35 unmapped=0`, `Rename summary total=8 unmapped=0`
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 5` -> success
  - backend checks:
    - `bun run --cwd packages/buddy typecheck` -> pass
    - `bun run --cwd packages/buddy test` -> pass
    - `bun run typecheck` -> pass
    - `bun test` -> pass
- Decision:
  - synced
- Next step:
  - evaluate next parity-core additions (`edit`/`apply_patch`) or keep prompt/tool contract scoped to currently shipped tools.

## 2026-02-22 - Add edit/apply_patch core tooling parity

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - `packages/opencode/src/tool/edit.ts` (recent upstream: `02a949506`, `270b807cd`, `624dd94b5`)
  - `packages/opencode/src/tool/apply_patch.ts` (recent upstream: `021d9d105`, `f4cf3f497`, `74bd52e8a`)
  - `packages/opencode/src/patch/index.ts` (recent upstream: `2dcca4755`, `b7ad6bd83`, `41ce56494`)
- Pairs touched:
  - `packages/buddy/src/tool/edit.ts` -> `packages/opencode/src/tool/edit.ts`
  - `packages/buddy/src/tool/apply_patch.ts` -> `packages/opencode/src/tool/apply_patch.ts`
  - `packages/buddy/src/patch/index.ts` -> `packages/opencode/src/patch/index.ts`
  - `packages/buddy/src/tool/registry.ts` -> `packages/opencode/src/tool/registry.ts`
  - `packages/buddy/src/session/prompts/learning-companion.txt` (Buddy prompt/tool contract alignment)
- Summary:
  - Added Buddy-native parity ports for `edit` and `apply_patch` with OpenCode-compatible input contracts.
  - Ported a minimal patch parser/chunk applier in `src/patch/index.ts` to support patch envelope operations.
  - Registered tools in `ToolRegistry`, added tool docs, and extended backend parity tests.
  - Updated parity mappings so coverage scripts track the newly ported core files.
- Validation:
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `total=46 match=1 diff=45 missing=0` (exit 1 by design)
  - coverage: `./opencore-pairity/scripts/screen-coverage.sh` -> `Exact summary total=38 mapped=38 unmapped=0`, `Rename summary total=8 unmapped=0`
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 5` -> success
  - backend checks:
    - `bun run --cwd packages/buddy typecheck` -> pass
    - `bun run --cwd packages/buddy test` -> pass
  - workspace checks:
    - `bun run typecheck` -> pass
    - `bun test` -> pass
    - `bun run build` -> pass
- Decision:
  - synced
- Next step:
  - evaluate parity gaps for `multiedit`/`todo`/`question` once Buddy product scope requires them.

## 2026-02-23 - Add backend+web testing parity harness and blocking gates

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - `packages/opencode/test/**` parity targets listed in `opencore-pairity/test-pairs.tsv`
  - `packages/app/src/**/*.test.ts` parity targets listed in `opencore-pairity/test-pairs.tsv`
- Pairs touched:
  - backend parity suite: `packages/buddy/test/parity/**` -> `packages/opencode/test/**`
  - web parity suite: `packages/web/test/parity/**` -> `packages/app/src/**/*.test.ts`
  - parity contract: `opencore-pairity/test-pairs.tsv`
  - parity validation script: `opencore-pairity/scripts/test-coverage.sh`
- Summary:
  - Fixed curriculum default-read baseline regression so backend test baseline is green.
  - Added backend test preload isolation (`bunfig.toml`, `test/preload.ts`) and reusable tmp fixture.
  - Added web Happy DOM preload and parity test files for layout/prompt/store/runtime/persistence helpers.
  - Added parity mapping contract `test-pairs.tsv` and strict coverage checker `test-coverage.sh`.
  - Added blocking parity scripts (`test:parity`, `check:parity`) at root and package level.
- Validation:
  - backend tests: `bun run --cwd packages/buddy test` -> pass (67/67)
  - web tests: `bun run --cwd packages/web test` -> pass (51/51)
  - parity tests: `bun run test:parity` -> pass (backend 42/42, web 42/42)
  - test coverage: `./opencore-pairity/scripts/test-coverage.sh` -> pass (`rows=77 ported=41 na=36 deferred=0`)
  - coverage screen: `./opencore-pairity/scripts/screen-coverage.sh` -> pass (`unmapped_exact=0`, `unmapped_rename=0`)
  - drift report: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `diff=45 missing=0` (expected non-zero until further core syncs)
  - full gate: `bun run check:parity` -> fail by design on current pair drift (diff stage)
- Decision:
  - synced
- Next step:
  - continue parity-core file syncing to reduce `diff-pairs` drift and move `check:parity` toward green.
