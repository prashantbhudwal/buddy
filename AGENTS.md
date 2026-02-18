# AGENTS.md

This repo is a Bun + TypeScript monorepo managed with Turborepo.
Primary packages:
- `packages/buddy`: backend API (Bun + Hono + hono-openapi)
- `packages/web`: frontend (React + Vite + TanStack Router + TanStack Query)
- `packages/ui`: shared UI (shadcn/ui + Tailwind v4)
- `packages/sdk`: OpenAPI-generated client (hey-api/openapi-ts)

Editor/assistant rule files:
- Cursor rules: none found (`.cursor/rules/`, `.cursorrules`)
- Copilot instructions: none found (`.github/copilot-instructions.md`)

## Commands (run from repo root)
### Install
```bash
bun install
```

### Dev (run in separate terminals)
```bash
bun run dev       # backend http://localhost:3000 (PORT=... to override)
bun run dev:web   # web http://localhost:1420
```

### Typecheck / Build
```bash
bun run typecheck
bun run build
```

### Lint
```bash
bun run lint
```
Note: `lint` is wired to `turbo run lint`, but no workspace currently defines a `lint` script.

### SDK generation (requires backend running)
```bash
bun run sdk:generate
# or
API_URL="http://localhost:3000/doc" bun run sdk:generate
```

### Run a single package task (Turbo filter)
```bash
bun run build -- --filter=@buddy/backend
bun run build -- --filter=@buddy/web
bun run typecheck -- --filter=@buddy/ui
```

### Run a single package task (direct)
```bash
bun run --cwd packages/buddy dev
bun run --cwd packages/web dev
bun run --cwd packages/sdk generate
```

## Ports & endpoints
- Backend: `http://localhost:3000` (OpenAPI docs at `/doc`)
- Backend endpoints: `GET /health`, `GET|POST /items`, `GET|PATCH|DELETE /items/:id`
- Web dev server: `http://localhost:1420` (routes live under `packages/web/src/routes/*`)

## Tests (Bun)
There are no committed tests yet, but Bun's built-in test runner is the expected default (see `spec/expectations.md`).

```bash
# Run all tests found under the current directory
bun test

# Run tests in one package (pattern match)
bun test packages/buddy
bun test packages/web

# Run a single test file
bun test packages/buddy/src/routes/items.test.ts

# Run a single test by name (regex)
bun test -t "items\\.create"

# Coverage
bun test --coverage
```

## Code style (follow existing code; avoid drive-by reformatting)
### TypeScript
- Strict TS is enabled (`tsconfig.json`); keep types sound rather than casting.
- Avoid `any`; prefer `unknown` + narrowing (zod, type guards, `in` checks).
- Use `import type { ... }` for type-only imports (see `packages/ui/src/lib/utils.ts`).
- Prefer type inference for locals; add explicit types for exports/public APIs.

### Imports & module resolution
- ESM everywhere (`"type": "module"`); no `require`.
- Group imports: external deps, workspace packages (`@buddy/*`), then relative imports.
- Runtime/server TS (notably `packages/buddy`): prefer `.js` in relative imports so emitted ESM is resolvable
  (example: `packages/buddy/src/index.ts` imports `./routes/items.js`).
- Path aliases:
  - `packages/ui`: `@/*` -> `packages/ui/src/*` (tsconfig paths)
  - `packages/web`: `@/*` -> `packages/web/src/*` (tsconfig paths)
  - `packages/web` Vite also rewrites UI-internal imports so `@/lib/*` and `@/components/ui/*` resolve to `packages/ui/src/...`
- If you add new `@/...` imports inside `packages/ui` (e.g. `@/hooks/*`), either:
  - extend `packages/web/vite.config.ts` alias rules, or
  - switch those imports in UI to relative paths.

### Formatting
- No repo-wide Prettier/ESLint/Biome config is committed; keep each file consistent with its neighbors.
- Indentation: 2 spaces.
- Multiline objects/arrays/calls: keep trailing commas (existing style).
- Semicolons vary (web app has some; backend/UI/sdk mostly omit). Do not "normalize" semicolons.

### Naming & file layout
- Components: PascalCase; hooks: `useX`; variables/functions: camelCase; constants: UPPER_SNAKE_CASE when truly constant.
- TanStack Router:
  - Routes live in `packages/web/src/routes/*`.
  - Each route file exports `Route` created via `createFileRoute` / `createRootRoute`.
- Backend (Hono):
  - Route modules live in `packages/buddy/src/routes/*` and are composed from `packages/buddy/src/index.ts`.
  - OpenAPI `operationId` uses `group.action` (examples: `health.check`, `items.list`).

### Error handling
- Prefer early returns; keep happy-path left-aligned.
- Backend:
  - Validate request params/body with `validator(...)` + zod.
  - Return expected errors as JSON + status (`c.json({ error: "..." }, 404)`), and include those statuses in `describeRoute.responses`.
  - CORS is currently wide-open (`origin: "*"`) for dev; avoid expanding surface area without a reason.
- Frontend:
  - Check `res.ok` before parsing; throw Errors from `queryFn` / `mutationFn` so React Query can handle them.
  - Avoid hardcoding hosts in new code; if you introduce an `/api` prefix, align it across:
    - `packages/web/vite.config.ts` proxy
    - `packages/sdk/scripts/generate.ts` (`baseUrl`)
    - backend route mounting

### UI conventions
- Shared UI components live in `packages/ui/src/components/ui`.
- Export public UI surface from `packages/ui/src/index.ts` and consume via `@buddy/ui`.
- Tailwind v4 scanning for the UI workspace is enabled via `@source "./**/*.{ts,tsx}";` in `packages/ui/src/index.css`; do not remove.

## Generated / do-not-edit
- `packages/web/src/routeTree.gen.ts` is generated by TanStack Router (gitignored). Never hand-edit.
- `packages/sdk/src/client.gen.ts` and `packages/sdk/src/types.gen.ts` are generated by `bun run sdk:generate` (gitignored).
- Build artifacts are ignored: `dist/`, `.turbo/`, `*.tsbuildinfo`, `*.log` (see `.gitignore`).

## Project expectations (aspirational; from `spec/expectations.md`)
- Testing: Bun test runner; happy-dom for DOM-like tests.
- Linting/formatting: eslint + prettier (not set up yet).
- Storage: sqlite is expected later (current backend uses in-memory arrays).
- Tauri: do not start a Tauri migration unless explicitly requested.
