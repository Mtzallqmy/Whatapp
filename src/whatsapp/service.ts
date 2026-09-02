import fs from 'node:fs/promises'
import makeWASocket, {
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import { config } from '../config.js'
import { getSettings } from '../db/settings.js'
import { claimIncomingMessage } from '../db/messages.js'
import type { AppUser } from '../db/types.js'
import { getAuthorizedUser, getUsageLimitState, normalizePhone, recordUserRequest } from '../db/users.js'
import { extractDocumentText, isSupportedDocument, isSupportedImage, withTemporaryMedia } from '../files/processor.js'
import { detectIntent } from '../ai/intent.js'
import { handleCommand, routeAI, runFile, runVision } from '../ai/router.js'
import { logger } from '../utils/logger.js'

export type WhatsAppStatus = 'connected' | 'connecting' | 'disconnected'

let socket: WASocket | null = null
let status: WhatsAppStatus = 'disconnected'
let qrDataUrl: string | null = null
let connectedNumber: string | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let starting = false
let manualStop = false
let generation = 0
const userQueues = new Map<string, Promise<void>>()
const rateWindows = new Map<string, number[]>()

function unwrapMessage(msg: WAMessage) {
  let message: any = msg.message
  if (message?.ephemeralMessage?.message) message = message.ephemeralMessage.message
  if (message?.viewOnceMessage?.message) message = message.viewOnceMessage.message
  if (message?.viewOnceMessageV2?.message) message = message.viewOnceMessageV2.message
  return message
}

function extractText(msg: WAMessage): string {
  const m = unwrapMessage(msg)
  return String(
    m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.documentMessage?.caption || ''
  ).trim()
}

function senderJid(msg: WAMessage): string {
  const key = msg.key as any
  const candidates = [key.remoteJidAlt, key.participantAlt, key.remoteJid, key.participant].filter(Boolean)
  return candidates.find((jid: string) => jid.endsWith('@s.whatsapp.net')) || candidates[0] || ''
}

function senderPhone(msg: WAMessage): string {
  const jid = senderJid(msg)
  return normalizePhone(String(jid).split('@')[0].split(':')[0])
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > config.maxUploadBytes) throw new Error(`حجم الوسائط يتجاوز الحد المسموح (${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB).`)
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function downloadIncomingMedia(msg: WAMessage) {
  const m = unwrapMessage(msg)
  if (m?.imageMessage) {
    const mimeType = String(m.imageMessage.mimetype || 'image/jpeg').toLowerCase()
    const stream = await downloadContentFromMessage(m.imageMessage, 'image')
    return { kind: 'image' as const, mimeType, fileName: `image.${mimeType.split('/')[1] || 'jpg'}`, buffer: await streamToBuffer(stream) }
  }
  if (m?.documentMessage) {
    const mimeType = String(m.documentMessage.mimetype || 'application/octet-stream').toLowerCase()
    const stream = await downloadContentFromMessage(m.documentMessage, 'document')
    return { kind: 'document' as const, mimeType, fileName: String(m.documentMessage.fileName || 'document'), buffer: await streamToBuffer(stream) }
  }
  return null
}

async function sendText(jid: string, text: string): Promise<void> {
  if (!socket) return
  await socket.sendMessage(jid, { text: String(text).slice(0, 60_000) })
}

function withinRateLimit(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - 60_000
  const recent = (rateWindows.get(userId) || []).filter((time) => time > cutoff)
  if (recent.length >= config.maxRequestsPerMinute) {
    rateWindows.set(userId, recent)
    return false
  }
  recent.push(now)
  rateWindows.set(userId, recent)
  return true
}

function permissionError(user: AppUser, intent: 'chat' | 'search' | 'image' | 'vision' | 'file'): string | null {
  if (user.role === 'admin') return null
  if (intent === 'chat' && !user.can_chat) return 'صلاحية المحادثة غير مفعلة لحسابك.'
  if (intent === 'search' && !user.can_search) return 'صلاحية البحث غير مفعلة لحسابك.'
  if (intent === 'image' && !user.can_images) return 'صلاحية توليد الصور غير مفعلة لحسابك.'
  if (intent === 'vision' && !user.can_images) return 'صلاحية تحليل الصور غير مفعلة لحسابك.'
  if (intent === 'file' && !user.can_files) return 'صلاحية الملفات غير مفعلة لحسابك.'
  return null
}

function safeUserError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'خطأ غير معروف'
  const scrubbed = raw
    .replace(/(?:sk|key|token)[-_][A-Za-z0-9._-]{8,}/gi, '[secret]')
    .replace(/https?:\/\/\S+/g, '[service]')
    .slice(0, 350)
  if (/مطلوب|غير مفع|حدد نموذج|لا يوجد مزود|غير مدعوم|حجم|نوع الملف|لم أتمكن/.test(scrubbed)) return scrubbed
  return 'تعذر تنفيذ الطلب الآن. حاول مرة أخرى لاحقًا أو راجع إعدادات المزود من لوحة الإدارة.'
}

async function processAuthorizedMessage(msg: WAMessage, jid: string, user: AppUser): Promise<void> {
  const text = extractText(msg)
  const command = text.startsWith('/') ? await handleCommand(user, text) : { handled: false }
  if (command.handled && command.result) {
    await sendText(jid, command.result.text)
    return
  }

  const media = await downloadIncomingMedia(msg)
  const intent = media?.kind === 'image' ? 'vision' : media?.kind === 'document' ? 'file' : detectIntent(text)
  if (!media && !text) return

  const permission = permissionError(user, intent)
  if (permission) {
    await sendText(jid, permission)
    return
  }

  if (!withinRateLimit(user.id)) {
    await sendText(jid, 'طلبات كثيرة خلال وقت قصير. حاول بعد دقيقة.')
    return
  }

  const limit = await getUsageLimitState(user)
  if (!limit.allowed) {
    const message = limit.reason === 'monthly'
      ? `وصلت إلى حد الاستخدام الشهري (${user.monthly_limit} طلب).`
      : `وصلت إلى حد الاستخدام اليومي (${user.daily_limit} طلب).`
    await sendText(jid, `${message} تواصل مع الأدمن إذا كنت تحتاج زيادة الحد.`)
    return
  }

  if (intent === 'search') await sendText(jid, 'جاري البحث…')
  else if (intent === 'image') await sendText(jid, 'جاري إنشاء الصورة…')
  else if (intent === 'vision') await sendText(jid, 'جاري تحليل الصورة…')
  else if (intent === 'file') await sendText(jid, 'جاري قراءة الملف وتحليله…')

  try {
    await socket?.sendPresenceUpdate('composing', jid)
    let result: any
    if (media?.kind === 'image') {
      if (!isSupportedImage(media.mimeType)) throw new Error('نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WebP.')
      result = await withTemporaryMedia(media.buffer, media.mimeType, media.fileName, async (filePath) => {
        const image = await fs.readFile(filePath)
        return runVision(user, text, image, media.mimeType)
      })
    } else if (media?.kind === 'document') {
      if (!isSupportedDocument(media.mimeType)) throw new Error('نوع الملف غير مدعوم. الأنواع المدعومة: PDF وTXT وDOCX.')
      result = await withTemporaryMedia(media.buffer, media.mimeType, media.fileName, async (filePath) => {
        const extracted = await extractDocumentText(filePath, media.mimeType)
        return runFile(user, text, media.fileName, extracted)
      })
    } else {
      result = (await routeAI(user, text)).result
    }

    await recordUserRequest(user.id, intent)
    if (result.type === 'image') {
      await socket?.sendMessage(jid, { image: result.image, mimetype: result.mimeType, caption: result.caption })
    } else {
      await sendText(jid, result.text)
    }
  } catch (error) {
    logger.error({ err: error, userId: user.id, intent }, 'Failed to process WhatsApp request')
    await sendText(jid, safeUserError(error))
  } finally {
    try { await socket?.sendPresenceUpdate('paused', jid) } catch { /* no-op */ }
  }
}

async function handleMessage(msg: WAMessage): Promise<void> {
  if (!msg.key.remoteJid || msg.key.fromMe) return
  const jid = msg.key.remoteJid
  if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@broadcast')) return

  const claimed = await claimIncomingMessage(String(msg.key.id || ''), jid)
  if (!claimed) return

  const phone = senderPhone(msg)
  if (!phone) return
  const user = await getAuthorizedUser(phone)
  if (!user) {
    const settings = await getSettings()
    if (settings.unauthorizedBehavior === 'message') await sendText(jid, settings.unauthorizedMessage)
    return
  }

  const previous = userQueues.get(user.id) || Promise.resolve()
  const current = previous.catch(() => undefined).then(() => processAuthorizedMessage(msg, jid, user))
  userQueues.set(user.id, current)
  await current.finally(() => {
    if (userQueues.get(user.id) === current) userQueues.delete(user.id)
  })
}

function scheduleReconnect(instance: number): void {
  if (manualStop || reconnectTimer || instance !== generation) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    startWhatsApp().catch((error) => logger.error({ err: error }, 'Automatic WhatsApp reconnect failed'))
  }, 5000)
}

export async function startWhatsApp(): Promise<void> {
  if (starting || status === 'connected' || status === 'connecting') return
  starting = true
  manualStop = false
  status = 'connecting'
  qrDataUrl = null
  const instance = ++generation
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null

  try {
    await fs.mkdir(config.whatsappAuthDir, { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(config.whatsappAuthDir)
    const { version } = await fetchLatestBaileysVersion()
    const nextSocket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: logger.child({ component: 'baileys' }) as any,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 30_000,
      defaultQueryTimeoutMs: 60_000
    })
    socket = nextSocket
    nextSocket.ev.on('creds.update', saveCreds)
    nextSocket.ev.on('connection.update', async (update) => {
      if (instance !== generation) return
      const { connection, lastDisconnect, qr } = update
      if (qr) {
        status = 'connecting'
        qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 })
      }
      if (connection === 'open') {
        status = 'connected'
        qrDataUrl = null
        connectedNumber = normalizePhone(nextSocket.user?.id || '') || null
        logger.info({ connectedNumber }, 'WhatsApp connected')
      } else if (connection === 'connecting') {
        status = 'connecting'
      } else if (connection === 'close') {
        status = 'disconnected'
        connectedNumber = null
        if (socket === nextSocket) socket = null
        const code = (lastDisconnect?.error as any)?.output?.statusCode
        const loggedOut = code === DisconnectReason.loggedOut
        logger.warn({ code, loggedOut }, 'WhatsApp disconnected')
        if (!loggedOut) scheduleReconnect(instance)
      }
    })
    nextSocket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (instance !== generation || type !== 'notify') return
      for (const message of messages) {
        handleMessage(message).catch((error) => logger.error({ err: error }, 'Unhandled WhatsApp message error'))
      }
    })
  } catch (error) {
    status = 'disconnected'
    socket = null
    scheduleReconnect(instance)
    throw error
  } finally {
    starting = false
  }
}

export function getWhatsAppState() {
  return { status, qrDataUrl, connectedNumber }
}

export async function reconnectWhatsApp(): Promise<void> {
  manualStop = true
  generation++
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  const old = socket
  socket = null
  status = 'disconnected'
  try { old?.end(new Error('Admin reconnect')) } catch { /* no-op */ }
  manualStop = false
  await startWhatsApp()
}

export async function logoutWhatsApp(): Promise<void> {
  manualStop = true
  generation++
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  const old = socket
  socket = null
  status = 'disconnected'
  qrDataUrl = null
  connectedNumber = null
  try { await old?.logout() } catch (error) { logger.warn({ err: error }, 'WhatsApp logout call failed; clearing local session') }
  try { old?.end(new Error('Admin logout')) } catch { /* no-op */ }
  await fs.rm(config.whatsappAuthDir, { recursive: true, force: true })
  await fs.mkdir(config.whatsappAuthDir, { recursive: true })
}

export async function resetWhatsApp(): Promise<void> {
  await logoutWhatsApp()
  manualStop = false
  await startWhatsApp()
}

export async function shutdownWhatsApp(): Promise<void> {
  manualStop = true
  generation++
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  try { socket?.end(new Error('Server shutdown')) } catch { /* no-op */ }
  socket = null
  status = 'disconnected'
}
