import type { AIProvider, ChatMessage, TextGenerationResult } from '../types.js'
import { fetchJson } from './http.js'

export class OpenRouterProvider implements AIProvider {
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://openrouter.ai/api/v1') {}

  async chat({ model, system, messages }: { model: string; system: string; messages: ChatMessage[] }): Promise<TextGenerationResult> {
    const json = await fetchJson(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages] })
    }, 'OpenRouter')
    return {
      text: String(json.choices?.[0]?.message?.content || '').trim() || 'لم أتمكن من إنشاء رد.',
      usage: { inputTokens: Number(json.usage?.prompt_tokens || 0), outputTokens: Number(json.usage?.completion_tokens || 0) }
    }
  }

  async vision({ model, system, messages, image, mimeType }: { model: string; system: string; messages: ChatMessage[]; image: Buffer; mimeType: string }): Promise<TextGenerationResult> {
    const formatted: any[] = [{ role: 'system', content: system }, ...messages]
    const last = formatted.at(-1)
    if (last) last.content = [
      { type: 'text', text: last.content },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image.toString('base64')}` } }
    ]
    const json = await fetchJson(`${this.baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: formatted })
    }, 'OpenRouter')
    return {
      text: String(json.choices?.[0]?.message?.content || '').trim() || 'لم أتمكن من تحليل الصورة.',
      usage: { inputTokens: Number(json.usage?.prompt_tokens || 0), outputTokens: Number(json.usage?.completion_tokens || 0) }
    }
  }
}
