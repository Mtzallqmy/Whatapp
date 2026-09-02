import test from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@localhost:5432/test'
process.env.ADMIN_PASSWORD ||= 'test-admin-password'
process.env.APP_ENCRYPTION_KEY ||= 'test-encryption-key-that-is-at-least-32-characters'
process.env.COOKIE_SECRET ||= 'test-cookie-secret-that-is-at-least-32-characters'

test('encrypts and decrypts provider secrets without storing plaintext', async () => {
  const { encryptSecret, decryptSecret, maskSecret } = await import('../src/utils/crypto.js')
  const secret = 'sk-proj-abcdef1234567890'
  const encrypted = encryptSecret(secret)
  assert.notEqual(encrypted, secret)
  assert.equal(decryptSecret(encrypted), secret)
  assert.match(maskSecret(secret), /^sk-proj-.*7890$/)
})
