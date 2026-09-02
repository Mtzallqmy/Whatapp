import crypto from 'node:crypto'
import { z } from 'zod'
import { decryptSecret, encryptSecret, maskSecret } from '../utils/crypto.js'
import { query } from './index.js'
import type { ProviderCategory, ProviderConfig, ProviderRecord, ProviderType, ProviderWithSecret } from './types.js'

const providerTypes = ['openai', 'gemini', 'openrouter', 'anthropic', 'tavily', 'serper', 'brave'] as const
const providerInputSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(providerTypes),
  name: z.string().trim().min(1).max(100),
  apiKey: z.string().trim().min(1).max(500).optional(),
  baseUrl: z.string().trim().url().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  providerConfig: z.record(z.string(), z.unknown()).default({})
})

function categoryFor(type: ProviderType): ProviderCategory {
  return ['tavily', 'serper', 'brave'].includes(type) ? 'search' : 'ai'
}

function sanitizeProvider(row: ProviderRecord) {
  const { encrypted_key: _encrypted, ...safe } = row
  return safe
}

export async function listProviders() {
  const { rows } = await query<ProviderRecord>('SELECT * FROM ai_providers ORDER BY category, created_at DESC')
  return rows.map(sanitizeProvider)
}

export async function saveProvider(input: unknown) {
  const value = providerInputSchema.parse(input)
  const id = value.id || crypto.randomUUID()
  const category = categoryFor(value.type)
  const existing = value.id ? (await query<ProviderRecord>('SELECT * FROM ai_providers WHERE id = $1', [value.id])).rows[0] : undefined
  if (!existing && !value.apiKey) throw new Error('API Key مطلوب عند إضافة مزود جديد')
  const encryptedKey = value.apiKey ? encryptSecret(value.apiKey) : existing!.encrypted_key
  const keyHint = value.apiKey ? maskSecret(value.apiKey) : existing!.key_hint

  if (value.isDefault) {
    await query('UPDATE ai_providers SET is_default = FALSE WHERE category = $1', [category])
  }

  const { rows } = await query<ProviderRecord>(`
    INSERT INTO ai_providers (id, type, category, name, encrypted_key, key_hint, base_url, config, enabled, is_default)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
    ON CONFLICT (id) DO UPDATE SET
      type = EXCLUDED.type, category = EXCLUDED.category, name = EXCLUDED.name,
      encrypted_key = EXCLUDED.encrypted_key, key_hint = EXCLUDED.key_hint,
      base_url = EXCLUDED.base_url, config = EXCLUDED.config,
      enabled = EXCLUDED.enabled, is_default = EXCLUDED.is_default, updated_at = NOW()
    RETURNING *
  `, [
    id, value.type, category, value.name, encryptedKey, keyHint, value.baseUrl || null,
    JSON.stringify(value.providerConfig), value.enabled, value.isDefault
  ])
  return sanitizeProvider(rows[0]!)
}

export async function deleteProvider(id: string): Promise<void> {
  z.string().uuid().parse(id)
  await query('DELETE FROM ai_providers WHERE id = $1', [id])
}

export async function getProviderById(id: string): Promise<ProviderWithSecret | null> {
  if (!id) return null
  const { rows } = await query<ProviderRecord>('SELECT * FROM ai_providers WHERE id = $1 AND enabled = TRUE LIMIT 1', [id])
  const row = rows[0]
  return row ? { ...row, apiKey: decryptSecret(row.encrypted_key) } : null
}

export async function getDefaultProvider(category: ProviderCategory): Promise<ProviderWithSecret | null> {
  const { rows } = await query<ProviderRecord>(`
    SELECT * FROM ai_providers
    WHERE category = $1 AND enabled = TRUE
    ORDER BY is_default DESC, created_at ASC LIMIT 1
  `, [category])
  const row = rows[0]
  return row ? { ...row, apiKey: decryptSecret(row.encrypted_key) } : null
}

export function providerPricing(config: ProviderConfig) {
  return {
    inputCostPer1M: Number(config.inputCostPer1M || 0),
    outputCostPer1M: Number(config.outputCostPer1M || 0),
    imageCost: Number(config.imageCost || 0),
    requestCost: Number(config.requestCost || 0)
  }
}
