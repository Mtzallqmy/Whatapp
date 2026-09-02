import type { AIProvider, ChatMessage, ImageGenerationResult, TextGenerationResult } from '../types.js'
import { fetchJson } from './http.js'

function responseText(json: any): string {
  if (typeof json.output_text === 'string' && json.output_text.trim()) return json.output_text.trim()
  const chunks: string[] = []
  for (const item of json.output || []) {
    for (const content of item.content || []) {
      if ((content.type === 'output_text' || content.type === 'text') && content.text) chunks.push(content.text)
    }
  }
  return chunks.join('\n').trim()
}

function toInput(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: [{ type: 'input_text', text: message.content }]
  }))
}

export class OpenAIProvider implements AIProvider {
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://api.openai.com/v1') {}

  async chat({ model, system, messages }: { model: string; system: string; messages: ChatMessage[] }): Promise<TextGenerationResult> {
    const json = await fetchJson(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions: system, input: toInput(messages) })
    }, 'OpenAI')
    return {
      text: responseText(json) || 'لم أتمكن من إنشاء رد.',
      usage: { inputTokens: Number(json.usage?.input_tokens || 0), outputTokens: Number(json.usage?.output_tokens || 0) }
    }
  }

  async vision({ model, system, messages, image, mimeType }: { model: string; system: string; messages: ChatMessage[]; image: Buffer; mimeType: string }): Promise<TextGenerationResult> {
    const input = toInput(messages)
    const last = input.at(-1)
    if (last) last.content.push({ type: 'input_image' as any, image_url: `data:${mimeType};base64,${image.toString('base64')}` } as any)
    const json = await fetchJson(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions: system, input })
    }, 'OpenAI')
    return {
      text: responseText(json) || 'لم أتمكن من تحليل الصورة.',
      usage: { inputTokens: Number(json.usage?.input_tokens || 0), outputTokens: Number(json.usage?.output_tokens || 0) }
    }
  }

  async image({ model, prompt, size = '1024x1024' }: { model: string; prompt: string; size?: string }): Promise<ImageGenerationResult> {
    const json = await fetchJson(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size })
    }, 'OpenAI')
    const item = json.data?.[0]
    if (item?.b64_json) return { image: Buffer.from(item.b64_json, 'base64'), mimeType: 'image/png' }
    if (item?.url) {
      const res = await fetch(item.url)
      if (!res.ok) throw new Error(`تعذر تنزيل الصورة الناتجة (${res.status})`)
      return { image: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get('content-type') || 'image/png' }
    }
    throw new Error('لم ترجع خدمة الصور ملفًا صالحًا')
  }
}
