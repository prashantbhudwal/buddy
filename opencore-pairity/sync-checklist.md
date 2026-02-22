# OpenCore Pairity Checklist

## Per Sync Run

1. Ensure OpenCode path resolves:
   - `echo ${OPENCODE_DIR:-unset}`
   - or pass `--opencode-dir`
2. Run drift report:
   - `./opencore-pairity/scripts/diff-pairs.sh --changed-only`
   - `./opencore-pairity/scripts/screen-coverage.sh`
3. For each changed pair:
   - inspect OpenCode commits:
     `./opencore-pairity/scripts/upstream-history.sh --since <last_synced_sha>`
   - port behavior changes into Buddy
   - keep Buddy-only product logic out of mapped core when possible
4. Validate Buddy after porting:
   - `bun run typecheck -- --filter=@buddy/backend`
   - `bun run test -- --filter=@buddy/backend`
5. Record what was synced:
   - add entry in `opencore-pairity/sync-log.md` with touched pair rows and upstream SHAs
   - update PR description with a link to the new log entry

## When Adding A New OpenCode Feature To Buddy

1. Classify the feature:
   - parity-core (tool/agent/session/permission/runtime infra), or
   - buddy-product (learning-specific behavior/UI/domain)
2. If parity-core:
   - add mapping row in `pairs.tsv` with priority and note
   - run parity scripts (diff, coverage, upstream history)
   - add `sync-log.md` entry with upstream refs and intent
3. If buddy-product:
   - do not force-add to `pairs.tsv`
   - add brief `sync-log.md` note explaining why it is intentionally out of scope

## Docs Or Mapping Change Run

Use this when changing only parity docs/mappings (`README.md`, `pairs.tsv`, `sync-checklist.md`, scripts).

1. Run:
   - `./opencore-pairity/scripts/diff-pairs.sh --changed-only`
   - `./opencore-pairity/scripts/screen-coverage.sh`
   - `./opencore-pairity/scripts/upstream-history.sh --max-count 5`
2. Add `sync-log.md` entry with:
   - reason for contract/mapping change
   - whether new pairs were added/removed
   - next expected parity sync action

## Rules

- Do not bulk-copy all upstream changes blindly.
- Prefer parity for infra behavior (looping, tooling, truncation, permissions).
- Keep React/web product differences outside parity core.
- No parity task is done without updating `sync-log.md`.
