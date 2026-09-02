import pino from 'pino'
import { config } from '../config.js'

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'apiKey', '*.apiKey', 'req.headers.authorization', 'req.headers.cookie',
      'password', '*.password', 'encrypted_key', '*.encrypted_key', 'credentials', '*.credentials'
    ],
    censor: '[REDACTED]'
  },
  base: { service: 'whatsapp-ai-gateway' }
})
