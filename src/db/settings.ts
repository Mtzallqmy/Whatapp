import { z } from 'zod'
import { query } from './index.js'
import type { ModelRoutes } from './types.js'

const modelRouteSchema = z.object({ providerId: z.string().default(''), model: z.string().trim().max(160).default('') })
export const modelRoutesSchema = z.object({
  chat: modelRouteSchema,
  advanced: modelRouteSchema,
  vision: modelRouteSchema,
  search: modelRouteSchema,
  image: modelRouteSchema,
  searchProviderId: z.string().default('')
})

export interface AppSettings {
  unauthorizedBehavior: 'ignore' | 'message'
  unauthorizedMessage: string
  modelRoutes: ModelRoutes
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { rows } = await query<{ value: T }>('SELECT value FROM app_settings WHERE key = $1', [key])
  return rows[0]?.value ?? fallback
}

export async function getSettings(): Promise<AppSettings> {
  const behaviorRaw = await getSetting('unauthorized_behavior', 'ignore')
  const unauthorizedBehavior = behaviorRaw === 'message' ? 'message' : 'ignore'
  const unauthorizedMessage = String(await getSetting('unauthorized_message', 'هذه خدمة خاصة.'))
  const rawRoutes = await getSetting('model_routes', {})
  const modelRoutes = modelRoutesSchema.parse(rawRoutes)
  return { unauthorizedBehavior, unauthorizedMessage, modelRoutes }
}

const updateSchema = z.object({
  unauthorizedBehavior: z.enum(['ignore', 'message']),
  unauthorizedMessage: z.string().trim().min(1).max(500),
  modelRoutes: modelRoutesSchema
})

export async function updateSettings(input: unknown): Promise<AppSettings> {
  const value = updateSchema.parse(input)
  const updates: Array<[string, unknown]> = [
    ['unauthorized_behavior', value.unauthorizedBehavior],
    ['unauthorized_message', value.unauthorizedMessage],
    ['model_routes', value.modelRoutes]
  ]
  for (const [key, settingValue] of updates) {
    await query(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [key, JSON.stringify(settingValue)])
  }
  return value
}
