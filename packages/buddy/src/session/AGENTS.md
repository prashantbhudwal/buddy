# AGENTS.md

## Session Learnings (non-obvious)
- The agent loop is manual (OpenCode-style): `processAssistantResponse()` runs multiple `streamText` steps and continues on `tool-calls`/`unknown` or tool activity without text output.
- `SESSION_MAX_STEPS` controls loop depth (default `8`, hard cap `24`); the final step forces text-only output by disabling tools and appending `prompts/max-steps.txt`.
- Assistant history intentionally serializes completed/error tool results into assistant text (`[tool:name] ...`); this serialization directly affects the next model step behavior.
- Prompt text files are runtime assets loaded with `Bun.file(new URL(...))`; build must copy `src/session/prompts/*.txt` into `dist/session/prompts`.
- Session storage is tenant-scoped via `Instance.state`; direct calls outside `Instance.provide({ directory })` collapse into the cwd tenant and can mask isolation bugs.
- Session/bus isolation tests should always run per explicit directory context; otherwise tests pass while multi-project runtime behavior still leaks.
