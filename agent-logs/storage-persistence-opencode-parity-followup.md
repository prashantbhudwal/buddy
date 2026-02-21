## trace

- Planned storage direction with OpenCode parity and reduced architecture churn.
  - Evaluated ordering question (persistence vs notebook MVP).
    - Answer found: implement persistence-first behind `SessionStore`, then notebook UX, then memories/curriculum files before DB mirroring.
- Implemented full Buddy storage migration (single phase, OpenCode-parity semantics, modular style).
  - Added SQLite + Drizzle foundation and schema/migrations.
    - Answer found: project-scoped persistence works with existing API shapes.
  - Ported project resolution and upgraded instance context (`directory`, `worktree`, `project`).
    - Answer found: project identity from git root commit with global fallback.
  - Replaced in-memory session persistence internals with SQL storage layer.
    - Answer found: session/message/part persistence survives runtime disposal.
- Ran smoke and route/store validations.
  - SDK generation + focused tests passed.
    - Answer found: core storage migration was functionally sound.
- Investigated “reply does not come”.
  - Traced SSE + processor flow.
    - Answer found: `text-delta`/`reasoning-delta` persisted to DB but in-memory part text was stale; final `part.updated` overwrote UI with empty text.
  - Patched delta handlers to mutate in-memory part text too.
    - Answer found: assistant replies render again.
- Reviewed external code-review findings against OpenCode.
  - Checked active abort scoping.
    - Answer found: OpenCode is directory-scoped; Buddy project-scope migration introduced busy/abort mismatch across directories in same repo.
  - Checked storage writability fallback behavior.
    - Answer found: OpenCode does not probe writability; Buddy needed explicit writability validation to avoid `SQLITE_READONLY` with pre-existing read-only dirs.
  - Patched both issues and added regression coverage.
    - Answer found: tests pass with project-wide busy/abort and writable-path fallback behavior.

## tasks

- Read current agent logs and markdown planning artifacts to align next steps.
- Built full storage/persistence migration in backend with OpenCode-parity schema + behavior.
- Added global path bootstrap, DB client, schema modules, and initial migration.
- Ported project resolution and extended instance context to include project/worktree.
- Replaced `SessionStore` persistence internals with SQL-backed storage layer.
- Updated session routes for project-scoped listing and directory filter semantics.
- Initialized DB/migrations on server startup.
- Updated backend tests for project-scope and persistence semantics.
- Ran typecheck/build/tests and SDK generation smoke validations.
- Diagnosed and fixed blank assistant reply rendering (delta overwrite bug).
- Verified and fixed two review findings:
  - Project-scoped active abort map.
  - Writability probing before keeping preferred XDG paths.
- Added regression test for cross-directory busy/abort in same project.

## decisions

- Keep OpenCode as source of truth for storage architecture/behavior, but keep Buddy code modular/smaller files.
- Ship full schema now (single-phase migration), not partial core tables.
- Use project-scoped session persistence semantics in Buddy.
- Keep external API payload shapes stable for existing web/sdk usage.
- Scope runtime abort controllers by project (not directory) to match Buddy’s project-scoped session semantics.
- Validate path writability at startup and fall back to `/tmp` when preferred XDG locations are not writable.
