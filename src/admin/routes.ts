import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { login, logout, requireAdmin, requireCsrf, sessionInfo } from './auth.js'
import { dashboardStats } from '../db/usage.js'
import { deleteProvider, listProviders, saveProvider } from '../db/providers.js'
import { getSettings, updateSettings } from '../db/settings.js'
import { deleteUser, listUsers, saveUser } from '../db/users.js'
import {
  getWhatsAppState, logoutWhatsApp, reconnectWhatsApp, resetWhatsApp, startWhatsApp
} from '../whatsapp/service.js'

export const adminRouter = express.Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'محاولات دخول كثيرة. حاول لاحقًا.' }
})
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: 'draft-8',
  legacyHeaders: false
})

adminRouter.get('/session', (req, res) => res.json(sessionInfo(req)))
adminRouter.post('/login', loginLimiter, login)

adminRouter.use(adminLimiter, requireAdmin)
adminRouter.post('/logout', requireCsrf, logout)
adminRouter.use(requireCsrf)

adminRouter.get('/dashboard', async (_req, res, next) => {
  try { res.json(await dashboardStats()) } catch (error) { next(error) }
})

adminRouter.get('/users', async (_req, res, next) => {
  try { res.json(await listUsers()) } catch (error) { next(error) }
})
adminRouter.post('/users', async (req, res, next) => {
  try { res.json(await saveUser(req.body)) } catch (error) { next(error) }
})
adminRouter.patch('/users/:id', async (req, res, next) => {
  try { res.json(await saveUser({ ...req.body, id: req.params.id })) } catch (error) { next(error) }
})
adminRouter.delete('/users/:id', async (req, res, next) => {
  try { await deleteUser(req.params.id); res.json({ ok: true }) } catch (error) { next(error) }
})

adminRouter.get('/providers', async (_req, res, next) => {
  try { res.json(await listProviders()) } catch (error) { next(error) }
})
adminRouter.post('/providers', async (req, res, next) => {
  try { res.json(await saveProvider(req.body)) } catch (error) { next(error) }
})
adminRouter.patch('/providers/:id', async (req, res, next) => {
  try { res.json(await saveProvider({ ...req.body, id: req.params.id })) } catch (error) { next(error) }
})
adminRouter.delete('/providers/:id', async (req, res, next) => {
  try { await deleteProvider(req.params.id); res.json({ ok: true }) } catch (error) { next(error) }
})

adminRouter.get('/settings', async (_req, res, next) => {
  try { res.json(await getSettings()) } catch (error) { next(error) }
})
adminRouter.put('/settings', async (req, res, next) => {
  try { res.json(await updateSettings(req.body)) } catch (error) { next(error) }
})

adminRouter.get('/whatsapp', (_req, res) => res.json(getWhatsAppState()))
adminRouter.post('/whatsapp/connect', async (_req, res, next) => {
  try { await startWhatsApp(); res.json({ ok: true }) } catch (error) { next(error) }
})
adminRouter.post('/whatsapp/reconnect', async (_req, res, next) => {
  try { await reconnectWhatsApp(); res.json({ ok: true }) } catch (error) { next(error) }
})
adminRouter.post('/whatsapp/logout', async (_req, res, next) => {
  try { await logoutWhatsApp(); res.json({ ok: true }) } catch (error) { next(error) }
})
// Backwards-compatible MVP endpoint: clears the session and immediately starts a new pairing flow.
adminRouter.post('/whatsapp/reset', async (_req, res, next) => {
  try { await resetWhatsApp(); res.json({ ok: true }) } catch (error) { next(error) }
})
