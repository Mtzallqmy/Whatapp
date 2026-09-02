import { query } from './index.js'

export interface UsageInput {
  userId: string
  providerId?: string | null
  provider: string
  model?: string
  type: string
  inputTokens?: number
  outputTokens?: number
  images?: number
  estimatedCostUsd?: number
  metadata?: Record<string, unknown>
}

export async function recordApiUsage(input: UsageInput): Promise<void> {
  const inputTokens = Math.max(0, Math.round(input.inputTokens || 0))
  const outputTokens = Math.max(0, Math.round(input.outputTokens || 0))
  const images = Math.max(0, Math.round(input.images || 0))
  const cost = Math.max(0, Number(input.estimatedCostUsd || 0))
  await query(`
    INSERT INTO usage_logs (
      user_id, provider_id, provider, model, type, input_tokens, output_tokens, images, estimated_cost_usd, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
  `, [
    input.userId, input.providerId || null, input.provider, input.model || '', input.type,
    inputTokens, outputTokens, images, cost, JSON.stringify(input.metadata || {})
  ])
  await query(`
    INSERT INTO usage_daily (user_id, day, input_tokens, output_tokens, estimated_cost_usd)
    VALUES ($1, CURRENT_DATE, $2, $3, $4)
    ON CONFLICT (user_id, day) DO UPDATE SET
      input_tokens = usage_daily.input_tokens + EXCLUDED.input_tokens,
      output_tokens = usage_daily.output_tokens + EXCLUDED.output_tokens,
      estimated_cost_usd = usage_daily.estimated_cost_usd + EXCLUDED.estimated_cost_usd
  `, [input.userId, inputTokens, outputTokens, cost])
}

export async function dashboardStats() {
  const [users, today] = await Promise.all([
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM app_users'),
    query<{
      requests: number
      searches: number
      images: number
      files: number
      input_tokens: string
      output_tokens: string
      cost: string
    }>(`
      SELECT
        COALESCE(SUM(requests),0)::int AS requests,
        COALESCE(SUM(searches),0)::int AS searches,
        COALESCE(SUM(images),0)::int AS images,
        COALESCE(SUM(files),0)::int AS files,
        COALESCE(SUM(input_tokens),0)::text AS input_tokens,
        COALESCE(SUM(output_tokens),0)::text AS output_tokens,
        COALESCE(SUM(estimated_cost_usd),0)::text AS cost
      FROM usage_daily WHERE day = CURRENT_DATE
    `)
  ])
  const row = today.rows[0]
  return {
    users: users.rows[0]?.count || 0,
    requestsToday: row?.requests || 0,
    searchesToday: row?.searches || 0,
    imagesToday: row?.images || 0,
    filesToday: row?.files || 0,
    inputTokensToday: Number(row?.input_tokens || 0),
    outputTokensToday: Number(row?.output_tokens || 0),
    estimatedCostToday: Number(row?.cost || 0)
  }
}
