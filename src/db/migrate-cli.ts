import { runMigrations } from './migrations.js'
import { pool } from './index.js'
import { logger } from '../utils/logger.js'

try {
  await runMigrations()
  logger.info('Database migrations complete')
} finally {
  await pool.end()
}
