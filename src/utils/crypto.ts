import crypto from 'node:crypto'
import { config } from '../config.js'

const KEY_VERSION = 'v1'

function keyBytes(): Buffer {
  return crypto.createHash('sha256').update(config.encryptionKey, 'utf8').digest()
}

export function encryptSecret(value: string): string {
  if (!value) throw new Error('Secret cannot be empty')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [KEY_VERSION, iv, tag, ciphertext].map((part) => Buffer.isBuffer(part) ? part.toString('base64url') : part).join('.')
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.')
  let ivB64: string | undefined
  let tagB64: string | undefined
  let dataB64: string | undefined
  if (parts.length === 4 && parts[0] === KEY_VERSION) [, ivB64, tagB64, dataB64] = parts
  else if (parts.length === 3) [ivB64, tagB64, dataB64] = parts // backwards compatibility with the MVP
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted secret payload')

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final()
  ]).toString('utf8')
}

export function maskSecret(value: string): string {
  const clean = value.trim()
  if (clean.length <= 8) return `••••${clean.slice(-4)}`
  const prefixLength = Math.min(8, Math.max(3, clean.indexOf('-') + 1))
  return `${clean.slice(0, prefixLength)}••••••••••${clean.slice(-4)}`
}

export function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}
