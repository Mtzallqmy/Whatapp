import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import mammoth from 'mammoth'
import { config } from '../config.js'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (data: Buffer) => Promise<{ text?: string }>

const allowedDocumentMime = new Set([
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])

const imageMime = new Set(['image/jpeg', 'image/png', 'image/webp'])

function extensionFor(mimeType: string, originalName = ''): string {
  if (mimeType === 'application/pdf') return '.pdf'
  if (mimeType === 'text/plain') return '.txt'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx'
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  const ext = path.extname(path.basename(originalName)).toLowerCase()
  return ['.pdf', '.txt', '.docx', '.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.bin'
}

export async function withTemporaryMedia<T>(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  handler: (filePath: string) => Promise<T>
): Promise<T> {
  if (buffer.byteLength > config.maxUploadBytes) throw new Error(`حجم الملف يتجاوز الحد المسموح (${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB).`)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ai-'))
  const filePath = path.join(dir, `${crypto.randomUUID()}${extensionFor(mimeType, originalName)}`)
  try {
    await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 })
    return await handler(filePath)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function isSupportedImage(mimeType: string): boolean {
  return imageMime.has(mimeType.toLowerCase())
}

export function isSupportedDocument(mimeType: string): boolean {
  return allowedDocumentMime.has(mimeType.toLowerCase())
}

export async function extractDocumentText(filePath: string, mimeType: string): Promise<string> {
  let text = ''
  if (mimeType === 'text/plain') {
    text = await fs.readFile(filePath, 'utf8')
  } else if (mimeType === 'application/pdf') {
    const parsed = await pdfParse(await fs.readFile(filePath))
    text = parsed.text || ''
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const parsed = await mammoth.extractRawText({ path: filePath })
    text = parsed.value || ''
  } else {
    throw new Error('نوع الملف غير مدعوم. الأنواع المدعومة: PDF وTXT وDOCX.')
  }
  const cleaned = text.replace(/\u0000/g, '').trim()
  if (!cleaned) throw new Error('لم أتمكن من استخراج نص من الملف.')
  return cleaned.slice(0, 100_000)
}
