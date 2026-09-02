import { z } from 'zod'

try {
  process.loadEnvFile()
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  ADMIN_PASSWORD: z.string().min(10, 'ADMIN_PASSWORD must be at least 10 characters'),
  APP_ENCRYPTION_KEY: z.string().min(32, 'APP_ENCRYPTION_KEY must be at least 32 characters'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  WHATSAPP_AUTH_DIR: z.string().min(1).default('/data/whatsapp'),
  BOT_NAME: z.string().min(1).max(80).default('مساعدي'),
  DEFAULT_DAILY_LIMIT: z.coerce.number().int().positive().default(100),
  MAX_MEMORY_MESSAGES: z.coerce.number().int().min(4).max(50).default(16),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(15 * 1024 * 1024),
  MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(12),
  WHATSAPP_AUTO_START: z.enum(['true', 'false']).default('true')
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
  throw new Error(`Invalid environment configuration: ${details}`)
}

const env = parsed.data

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  databaseSsl: env.DATABASE_SSL === 'true',
  adminPassword: env.ADMIN_PASSWORD,
  encryptionKey: env.APP_ENCRYPTION_KEY,
  cookieSecret: env.COOKIE_SECRET,
  whatsappAuthDir: env.WHATSAPP_AUTH_DIR,
  botName: env.BOT_NAME,
  defaultDailyLimit: env.DEFAULT_DAILY_LIMIT,
  maxMemoryMessages: env.MAX_MEMORY_MESSAGES,
  maxUploadBytes: env.MAX_UPLOAD_BYTES,
  maxRequestsPerMinute: env.MAX_REQUESTS_PER_MINUTE,
  whatsappAutoStart: env.WHATSAPP_AUTO_START === 'true'
} as const
