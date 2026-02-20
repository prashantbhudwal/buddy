import { Hono } from 'hono'
import { openAPIRouteHandler } from 'hono-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { GlobalRoutes } from './routes/global.js'
import { SessionRoutes } from './routes/session.js'
import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from './project/directory.js'
import { Instance } from './project/instance.js'

const app = new Hono()
const api = new Hono()
const directoryRoots = allowedDirectoryRoots()

api.route('/', GlobalRoutes())
api.use(async (c, next) => {
  if (c.req.path.endsWith('/health') || c.req.path.endsWith('/event')) {
    return next()
  }

  const rawDirectory =
    c.req.query('directory') ??
    c.req.header('x-buddy-directory') ??
    c.req.header('x-opencode-directory') ??
    process.cwd()

  const directory = resolveDirectory(rawDirectory)
  if (!isAllowedDirectory(directory, directoryRoots)) {
    return c.json({ error: 'Directory is outside allowed roots' }, 403)
  }

  return Instance.provide({
    directory,
    fn: next,
  })
})
api.route('/session', SessionRoutes())

app
  .use(logger())
  .use(cors({ origin: '*' }))
  .route('/api', api)

// Add OpenAPI docs endpoint
app.get(
  '/doc',
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: 'Buddy API',
        version: '1.0.0',
        description: 'Buddy API Documentation',
      },
      openapi: '3.1.1',
    },
  }),
)

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

if (import.meta.main) {
  if (!process.env.KIMI_API_KEY) {
    console.error(
      'KIMI_API_KEY is missing in the repo root .env file; chat prompts will fail.',
    )
  }
  console.log(`Server starting on http://localhost:${port}`)
  console.log(`API docs available at http://localhost:${port}/doc`)
  Bun.serve({
    port,
    idleTimeout: 120,
    fetch: app.fetch,
  })
}

export { app }
