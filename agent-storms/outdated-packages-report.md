# Outdated Packages Report

This report summarizes the outdated packages across the Buddy monorepo as of February 23, 2026.

## Summary Table

| Package Location   | Outdated Dependency    | Current | Update  | Latest  | OpenCode Version |
| :----------------- | :--------------------- | :------ | :------ | :------ | :--------------- |
| **Root**           | `turbo`                | 2.8.9   | 2.8.10  | 2.8.10  | -                |
| **packages/buddy** | `@types/bun`           | 1.1.18  | 1.1.18  | 1.3.1   | -                |
|                    | `ai`                   | 5.0.124 | 5.0.124 | 6.0.97  | 5.0.124          |
|                    | `hono`                 | 4.11.10 | 4.12.2  | 4.12.2  | 4.10.7           |
|                    | `hono-openapi`         | 1.1.2   | 1.1.2   | 1.2.0   | -                |
|                    | `zod`                  | 3.25.76 | 3.25.76 | 4.3.6   | 4.1.8            |
| **packages/sdk**   | `@hey-api/openapi-ts`  | 0.90.10 | 0.90.10 | 0.92.4  | -                |
|                    | `hono-openapi`         | 1.1.2   | 1.1.2   | 1.2.0   | -                |
| **packages/ui**    | `tailwind-merge`       | 3.4.1   | 3.5.0   | 3.5.0   | -                |
|                    | `@types/react`         | 18.3.28 | 18.3.28 | 19.2.14 | N/A (SolidJS)    |
|                    | `@types/react-dom`     | 18.3.7  | 18.3.7  | 19.2.3  | N/A (SolidJS)    |
|                    | `tailwindcss`          | 4.1.18  | 4.2.0   | 4.2.0   | 4.1.11           |
| **packages/web**   | `tailwindcss`          | 4.1.18  | 4.2.0   | 4.2.0   | 4.1.11           |
|                    | `@vitejs/plugin-react` | 4.7.0   | 4.7.0   | 5.1.4   | N/A (SolidJS)    |
|                    | `vite`                 | 5.4.21  | 5.4.21  | 7.3.1   | 7.1.4            |

## Key Bumps & OpenCode Parity

- **Vite & React Types**: Significant major version updates are available for `vite` (v7), `@vitejs/plugin-react` (v5), and React types (v19).
  - _OpenCode Status_: **Adopted**. OpenCode is using `vite` v7.1.4. (Note: OpenCode uses SolidJS, so React packages are not applicable to them).
- **AI SDK**: The `ai` (Vercel AI SDK) has a major update from v5 to v6.
  - _OpenCode Status_: **Not Adopted**. OpenCode is still currently on `ai` v5.0.124 (parity with Buddy).
- **Zod**: `zod` shows a version `4.3.6` available, which is likely a major change if currently on `3.x`.
  - _OpenCode Status_: **Adopted**. OpenCode is using `zod` v4.1.8.
- **Hono**: Small patch/minor updates for `hono` and `hono-openapi`.
- **Tailwind**: `tailwindcss` v4.2.0 is available.
  - _OpenCode Status_: **Adopted**. OpenCode is using `tailwindcss` v4.1.11.
