# AGENTS.md

## Backend Learnings (non-obvious)
- Directory middleware in `src/index.ts` must skip global endpoints using `endsWith("/health" | "/event")`; `c.req.path` includes the `/api` prefix and exact matches silently fail.
- SSE stability depends on both `Bun.serve({ idleTimeout })` and heartbeat cadence; keep heartbeat interval safely below idle timeout or streams disconnect while prompts still complete.
- Multi-tenant boundaries require coordinated edits across `src/index.ts`, `src/project/instance.ts`, `src/bus/index.ts`, `src/session/session-store.ts`, and `src/session/tools.ts`.
