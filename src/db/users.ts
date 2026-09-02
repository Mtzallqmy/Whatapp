import crypto from 'node:crypto'
import { z } from 'zod'
import { config } from '../config.js'
import { query } from './index.js'
import type { AppUser } from './types.js'

export function normalizePhone(input = ''): string {
  return String(input).replace(/\D/g, '')
}

const userInputSchema = z.object({
  id: z.string().uuid().optional(),
  phone: z.string().min(7).max(30),
  name: z.string().trim().max(100).default(''),
  enabled: z.boolean().default(true),
  role: z.enum(['admin', 'user']).default('user'),
  dailyLimit: z.coerce.number().int().positive().max(100000).default(config.defaultDailyLimit),
  monthlyLimit: z.union([z.coerce.number().int().positive().max(3000000), z.null()]).optional().default(null),
  canChat: z.boolean().default(true),
  canSearch: z.boolean().default(true),
  canImages: z.boolean().default(true),
  canFiles: z.boolean().default(false)
})

export type UserInput = z.input<typeof userInputSchema>

export async function listUsers(): Promise<(AppUser & { requests_today: number; requests_month: number })[]> {
  const { rows } = await query<AppUser & { requests_today: number; requests_month: number }>(`
    SELECT u.*,
      COALESCE(d.requests, 0)::int AS requests_today,
      COALESCE(m.requests, 0)::int AS requests_month
    FROM app_users u
    LEFT JOIN usage_daily d ON d.user_id = u.id AND d.day = CURRENT_DATE
    LEFT JOIN LATERAL (
      SELECT SUM(requests)::int AS requests
      FROM usage_daily
      WHERE user_id = u.id AND day >= date_trunc('month', CURRENT_DATE)::date
    ) m ON TRUE
    ORDER BY u.created_at DESC
  `)
  return rows
}

export async function saveUser(input: UserInput): Promise<AppUser> {
  const value = userInputSchema.parse(input)
  const phone = normalizePhone(value.phone)
  if (phone.length < 7 || phone.length > 20) throw new Error('رقم واتساب غير صالح')
  let id = value.id || crypto.randomUUID()
  if (!value.id) {
    const existing = await query<{ id: string }>('SELECT id FROM app_users WHERE phone = $1 LIMIT 1', [phone])
    if (existing.rows[0]?.id) id = existing.rows[0].id
  }
  const { rows } = await query<AppUser>(`
    INSERT INTO app_users (
      id, phone, name, enabled, role, daily_limit, monthly_limit,
      can_chat, can_search, can_images, can_files, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    ON CONFLICT (id) DO UPDATE SET
      phone = EXCLUDED.phone, name = EXCLUDED.name, enabled = EXCLUDED.enabled,
      role = EXCLUDED.role, daily_limit = EXCLUDED.daily_limit, monthly_limit = EXCLUDED.monthly_limit,
      can_chat = EXCLUDED.can_chat, can_search = EXCLUDED.can_search,
      can_images = EXCLUDED.can_images, can_files = EXCLUDED.can_files, updated_at = NOW()
    RETURNING *
  `, [
    id, phone, value.name, value.enabled, value.role, value.dailyLimit, value.monthlyLimit,
    value.canChat, value.canSearch, value.canImages, value.canFiles
  ])
  return rows[0]!
}

export async function deleteUser(id: string): Promise<void> {
  z.string().uuid().parse(id)
  await query('DELETE FROM app_users WHERE id = $1', [id])
}

export async function getAuthorizedUser(phone: string): Promise<AppUser | null> {
  const normalized = normalizePhone(phone)
  const { rows } = await query<AppUser>('SELECT * FROM app_users WHERE phone = $1 AND enabled = TRUE LIMIT 1', [normalized])
  return rows[0] || null
}

export async function getUsageLimitState(user: AppUser): Promise<{ allowed: boolean; reason?: 'daily' | 'monthly'; today: number; month: number }> {
  if (user.role === 'admin') return { allowed: true, today: 0, month: 0 }
  const { rows } = await query<{ today: number; month: number }>(`
    SELECT
      COALESCE(SUM(requests) FILTER (WHERE day = CURRENT_DATE), 0)::int AS today,
      COALESCE(SUM(requests) FILTER (WHERE day >= date_trunc('month', CURRENT_DATE)::date), 0)::int AS month
    FROM usage_daily WHERE user_id = $1
  `, [user.id])
  const usage = rows[0] || { today: 0, month: 0 }
  if (usage.today >= user.daily_limit) return { allowed: false, reason: 'daily', ...usage }
  if (user.monthly_limit !== null && usage.month >= user.monthly_limit) return { allowed: false, reason: 'monthly', ...usage }
  return { allowed: true, ...usage }
}

export async function recordUserRequest(userId: string, kind: 'chat' | 'search' | 'image' | 'vision' | 'file'): Promise<void> {
  const search = kind === 'search' ? 1 : 0
  const image = kind === 'image' ? 1 : 0
  const file = kind === 'file' ? 1 : 0
  await query(`
    INSERT INTO usage_daily (user_id, day, requests, searches, images, files)
    VALUES ($1, CURRENT_DATE, 1, $2, $3, $4)
    ON CONFLICT (user_id, day) DO UPDATE SET
      requests = usage_daily.requests + 1,
      searches = usage_daily.searches + EXCLUDED.searches,
      images = usage_daily.images + EXCLUDED.images,
      files = usage_daily.files + EXCLUDED.files
  `, [userId, search, image, file])
  await query('UPDATE app_users SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1', [userId])
}

export async function getUserUsageSummary(userId: string): Promise<{ today: number; month: number; costToday: number }> {
  const { rows } = await query<{ today: number; month: number; cost_today: string }>(`
    SELECT
      COALESCE(SUM(requests) FILTER (WHERE day = CURRENT_DATE), 0)::int AS today,
      COALESCE(SUM(requests) FILTER (WHERE day >= date_trunc('month', CURRENT_DATE)::date), 0)::int AS month,
      COALESCE(SUM(estimated_cost_usd) FILTER (WHERE day = CURRENT_DATE), 0)::text AS cost_today
    FROM usage_daily WHERE user_id = $1
  `, [userId])
  const row = rows[0]
  return { today: row?.today || 0, month: row?.month || 0, costToday: Number(row?.cost_today || 0) }
}
