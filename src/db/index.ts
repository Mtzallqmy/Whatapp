import pg from 'pg'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const { Pool } = pg

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
})

pool.on('error', (error) => logger.error({ err: error }, 'Unexpected PostgreSQL pool error'))

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params)
}

export async function databaseHealth(): Promise<'connected' | 'disconnected'> {
  try {
    await pool.query('SELECT 1')
    return 'connected'
  } catch {
    return 'disconnected'
  }
}
