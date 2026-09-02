import type { SearchAdapter, SearchResult } from '../types.js'
import { fetchJson } from '../providers/http.js'

export class BraveSearchAdapter implements SearchAdapter {
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://api.search.brave.com/res/v1/web/search') {}
  async search(query: string): Promise<SearchResult> {
    const url = new URL(this.baseUrl)
    url.searchParams.set('q', query)
    url.searchParams.set('count', '6')
    const json = await fetchJson(url.toString(), {
      method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey }
    }, 'Brave Search')
    return {
      sources: (json.web?.results || []).slice(0, 6).filter((r: any) => r.url).map((r: any) => ({
        title: String(r.title || r.url), url: String(r.url), snippet: String(r.description || '').slice(0, 1800)
      }))
    }
  }
}
