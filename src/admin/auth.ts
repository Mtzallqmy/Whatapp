import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config.js'
import { safeEqualText } from '../utils/crypto.js'

const COOKIE = 'wa_admin_session'
const SESSION_MS = 1000 * 60 * 60 * 24 * 7

function sign(value: string): string {
  return crypto.createHmac('sha256', config.cookieSecret).update(value).digest('base64url')
}

function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS, nonce: crypto.randomBytes(16).toString('base64url') })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function readSession(req: Request): string | null {
  const token = String(req.cookies?.[COOKIE] || '')
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !safeEqualText(signature, sign(payload))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number }
    if (!data.exp || data.exp < Date.now()) return null
    return token
  } catch {
    return null
  }
}

function csrfFor(sessionToken: string): string {
  return crypto.createHmac('sha256', config.cookieSecret).update(`csrf:${sessionToken}`).digest('base64url')
}

export function isAdmin(req: Request): boolean {
  return Boolean(readSession(req))
}

export function sessionInfo(req: Request) {
  const session = readSession(req)
  return { authenticated: Boolean(session), csrfToken: session ? csrfFor(session) : null }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!readSession(req)) return res.status(401).json({ error: 'unauthorized' })
  next()
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const session = readSession(req)
  const supplied = String(req.get('x-csrf-token') || '')
  if (!session || !safeEqualText(supplied, csrfFor(session))) return res.status(403).json({ error: 'invalid csrf token' })
  next()
}

export function login(req: Request, res: Response) {
  const supplied = String(req.body?.password || '')
  if (!safeEqualText(supplied, config.adminPassword)) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' })
  const session = createSessionToken()
  res.cookie(COOKIE, session, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MS,
    path: '/'
  })
  res.json({ ok: true, csrfToken: csrfFor(session) })
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'strict', path: '/' })
  res.json({ ok: true })
}
