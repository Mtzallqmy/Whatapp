import type { ProviderWithSecret } from '../../db/types.js'
import type { AIProvider } from '../types.js'
import { GeminiProvider } from './gemini.js'
import { OpenAIProvider } from './openai.js'
import { OpenRouterProvider } from './openrouter.js'

export function createAIProvider(provider: ProviderWithSecret): AIProvider {
  if (provider.type === 'openai') return new OpenAIProvider(provider.apiKey, provider.base_url || undefined)
  if (provider.type === 'gemini') return new GeminiProvider(provider.apiKey, provider.base_url || undefined)
  if (provider.type === 'openrouter') return new OpenRouterProvider(provider.apiKey, provider.base_url || undefined)
  if (provider.type === 'anthropic') throw new Error('مزود Anthropic محجوز للتوسعة المستقبلية ولم يُفعّل بعد.')
  throw new Error(`المزود ${provider.type} ليس مزود ذكاء اصطناعي صالحًا لهذه العملية.`)
}
