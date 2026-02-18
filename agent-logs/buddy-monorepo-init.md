## trace

- Initial request: Set up Buddy monorepo with working CRUD page
  - Explored OpenCode structure for reference patterns
  - Created package structure: buddy (backend), web (frontend), ui (shadcn), sdk (client)
  - **Backend setup**
    - Hono + hono-openapi (v1.1.2 matching OpenCode)
    - In-memory CRUD API for Items
    - Auto-generated OpenAPI docs at `/doc`
    - Answer: Use `hono-openapi` not `@hono/zod-openapi` for compatibility
  - **Frontend setup**
    - React + Vite + TanStack Router + TanStack Query
    - CRUD page at `/items` with create/edit/delete functionality
    - Dark mode by default
  - **Monorepo workflow**
    - Root commands: `bun run dev` (backend), `bun run dev:web` (frontend)
    - Separate terminals like OpenCode pattern
    - Answer: No `dev:all` - run separately for clear logs
  - **Shadcn/UI configuration**
    - Moved from packages/web to packages/ui (shared package)
    - Copied theme from ~/Code/shadcn-themes (radix-nova style, gray base)
    - Fixed component imports to use `@/` aliases
    - Added Vite alias resolution for cross-package imports
    - **Issue**: Buttons rendering as plain text (no styles)
      - Root cause: Tailwind not scanning UI package files
      - Solution: Added `@source "./**/*.{ts,tsx}"` to packages/ui/src/index.css
      - Result: Button utilities (bg-primary, text-primary-foreground) now generated
  - **Cleanup**
    - Added .turbo/ to .gitignore (normal to have per-package)
    - Typecheck passes for all packages
    - Build succeeds

## tasks

- [x] Create root monorepo structure with turbo.json
- [x] Set up packages/buddy - Hono backend with CRUD API
- [x] Set up packages/web - Vite + React + TanStack Router
- [x] Set up packages/ui - shadcn/ui shared components
- [x] Set up packages/sdk - placeholder for generated client
- [x] Configure root scripts (bun run dev, bun run dev:web)
- [x] Move shadcn from web to ui package with proper exports
- [x] Apply shadcn-themes configuration (radix-nova, gray palette)
- [x] Fix button styling - add @source directive for Tailwind v4
- [x] Enable dark mode by default
- [x] Verify typecheck and build pass for all packages

## decisions

- Use `hono-openapi` v1.1.2 (not @hono/zod-openapi) to match OpenCode patterns
- Keep shadcn in packages/ui as shared library, not in web app
- Use `@/` imports within UI package, resolve via Vite aliases in web
- Run dev servers in separate terminals (no concurrently/dev:all)
- Use Tailwind v4 with @source directive to scan UI package files
- Dark mode default via document.documentElement.classList.add("dark")
