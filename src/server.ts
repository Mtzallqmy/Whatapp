import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { ZodError } from 'zod'
import { adminRouter } from './admin/routes.js'
import { config } from './config.js'
import { databaseHealth, pool } from './db/index.js'
import { runMigrations } from './db/migrations.js'
import { logger } from './utils/logger.js'
import { getWhatsAppState, shutdownWhatsApp, startWhatsApp } from './whatsapp/service.js'

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '../public')

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(express.static(publicDir, { etag: true, maxAge: config.nodeEnv === 'production' ? '1h' : 0 }))

app.get('/health', async (_req, res) => {
  const database = await databaseHealth()
  const whatsapp = getWhatsAppState().status
  const ok = database === 'connected'
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'error', whatsapp, database })
})

app.use('/api/admin', adminRouter)
app.get('/', (_req, res) => res.redirect('/admin.html'))
app.use((_req, res) => res.status(404).json({ error: 'not found' }))
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'بيانات غير صالحة', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) })
  }
  logger.error({ err: error, method: req.method, path: req.path }, 'HTTP request failed')
  res.status(500).json({ error: 'حدث خطأ داخلي. راجع السجلات.' })
})

await runMigrations()
const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info({ port: config.port }, 'HTTP server listening')
})
server.requestTimeout = 120_000
server.headersTimeout = 65_000

if (config.whatsappAutoStart) {
  startWhatsApp().catch((error) => logger.error({ err: error }, 'Initial WhatsApp start failed'))
}

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Shutting down')
  await shutdownWhatsApp()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await pool.end()
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    shutdown(signal).then(() => process.exit(0)).catch((error) => {
      logger.error({ err: error }, 'Shutdown failed')
      process.exit(1)
    })
  })
}
