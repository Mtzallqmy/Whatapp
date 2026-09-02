import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './index.js'
import { logger } from '../utils/logger.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(here, '../../migrations')

export async function runMigrations(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
    for (const file of files) {
      const already = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file])
      if (already.rowCount) continue
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file])
        await client.query('COMMIT')
        logger.info({ migration: file }, 'Database migration applied')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    client.release()
  }
}
