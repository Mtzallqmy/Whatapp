import type { SearchAdapter, SearchResult } from '../types.js'
import { fetchJson } from '../providers/http.js'

export class TavilySearchAdapter implements SearchAdapter {
  constructor(private readonly apiKey: string) {}
  async search(query: string): Promise<SearchResult> {
    const json = await fetchJson('https://api.tavily.com/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, query, search_depth: 'advanced', include_answer: false, max_results: 6 })
    }, 'Tavily')
    return {
      sources: (json.results || []).slice(0, 6).filter((r: any) => r.url).map((r: any) => ({
        title: String(r.title || r.url), url: String(r.url), snippet: String(r.content || '').slice(0, 1800)
      }))
    }
  }
}
