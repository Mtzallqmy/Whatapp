import type { AIProvider, ChatMessage, ImageGenerationResult, TextGenerationResult } from '../types.js'
import { fetchJson } from './http.js'

function usage(json: any) {
  return {
    inputTokens: Number(json.usageMetadata?.promptTokenCount || 0),
    outputTokens: Number(json.usageMetadata?.candidatesTokenCount || 0)
  }
}

function contents(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }))
}

export class GeminiProvider implements AIProvider {
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta') {}

  private url(model: string) {
    return `${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
  }

  async chat({ model, system, messages }: { model: string; system: string; messages: ChatMessage[] }): Promise<TextGenerationResult> {
    const json = await fetchJson(this.url(model), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: contents(messages) })
    }, 'Gemini')
    const text = json.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('\n').trim()
    return { text: text || 'لم أتمكن من إنشاء رد.', usage: usage(json) }
  }

  async vision({ model, system, messages, image, mimeType }: { model: string; system: string; messages: ChatMessage[]; image: Buffer; mimeType: string }): Promise<TextGenerationResult> {
    const bodyContents = contents(messages)
    const last = bodyContents.at(-1)
    if (last) last.parts.push({ inlineData: { mimeType, data: image.toString('base64') } } as any)
    const json = await fetchJson(this.url(model), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: bodyContents })
    }, 'Gemini')
    const text = json.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('\n').trim()
    return { text: text || 'لم أتمكن من تحليل الصورة.', usage: usage(json) }
  }

  async image({ model, prompt }: { model: string; prompt: string }): Promise<ImageGenerationResult> {
    const json = await fetchJson(this.url(model), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    }, 'Gemini')
    const parts = json.candidates?.[0]?.content?.parts || []
    const imagePart = parts.find((part: any) => part.inlineData?.data)
    if (!imagePart) throw new Error('النموذج المحدد لم يرجع صورة. تحقق من أن نموذج Gemini يدعم توليد الصور.')
    return {
      image: Buffer.from(imagePart.inlineData.data, 'base64'),
      mimeType: imagePart.inlineData.mimeType || 'image/png',
      usage: usage(json)
    }
  }
}
