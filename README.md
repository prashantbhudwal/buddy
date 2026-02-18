# Buddy Monorepo

Licensed under the O’Saasy License (see LICENSE).

A simple CRUD monorepo using:

- **Backend**: Bun + Hono + hono-openapi
- **Frontend**: React + Vite + TanStack Router + TanStack Query
- **UI**: shadcn/ui components in `packages/ui`
- **SDK**: Auto-generated client (placeholder setup)

## Structure

```
buddy/
├── packages/
│   ├── buddy/     # Backend API (Hono + OpenAPI)
│   ├── web/       # Frontend (React + Vite)
│   ├── ui/        # UI components (shadcn)
│   └── sdk/       # Generated API client
├── package.json   # Root workspace config
└── turbo.json     # Turborepo config
```

## Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Start the backend (from root)

```bash
bun run dev
```

The backend will start on http://localhost:3000

API docs available at: http://localhost:3000/doc

### 3. Start the frontend (from root, in a new terminal)

```bash
bun run dev:web
```

The frontend will start on http://localhost:1420

### 4. Test the CRUD

Navigate to http://localhost:1420/items

You can:

- Create new items
- Edit existing items
- Delete items
- View all items

## API Endpoints

- `GET /health` - Health check
- `GET /doc` - OpenAPI documentation
- `GET /items` - List all items
- `GET /items/:id` - Get single item
- `POST /items` - Create item
- `PATCH /items/:id` - Update item
- `DELETE /items/:id` - Delete item

## Scripts (from root)

```bash
# Start backend dev server (Terminal 1)
bun run dev

# Start frontend dev server (Terminal 2)
bun run dev:web

# Type check all packages
bun run typecheck

# Build all packages
bun run build

# Generate SDK from OpenAPI
bun run sdk:generate

# Add shadcn component to shared UI package
cd packages/ui && bunx shadcn@latest add button
```

**Note:** Run backend and frontend in separate terminals so you can see logs clearly.

## Notes

- Uses in-memory storage (data resets on restart)
- OpenAPI spec auto-generated from route definitions
- TanStack Router generates routes from files in `src/routes/`
