import type { ProviderWithSecret } from '../../db/types.js'
import type { SearchAdapter } from '../types.js'
import { BraveSearchAdapter } from './brave.js'
import { SerperSearchAdapter } from './serper.js'
import { TavilySearchAdapter } from './tavily.js'

export function createSearchAdapter(provider: ProviderWithSecret): SearchAdapter {
  if (provider.type === 'tavily') return new TavilySearchAdapter(provider.apiKey)
  if (provider.type === 'serper') return new SerperSearchAdapter(provider.apiKey)
  if (provider.type === 'brave') return new BraveSearchAdapter(provider.apiKey, provider.base_url || undefined)
  throw new Error(`مزود البحث ${provider.type} غير مدعوم.`)
}
