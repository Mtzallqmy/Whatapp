import type { SearchAdapter, SearchResult } from '../types.js'
import { fetchJson } from '../providers/http.js'

export class SerperSearchAdapter implements SearchAdapter {
  constructor(private readonly apiKey: string) {}
  async search(query: string): Promise<SearchResult> {
    const json = await fetchJson('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': this.apiKey },
      body: JSON.stringify({ q: query, num: 6 })
    }, 'Serper')
    return {
      sources: (json.organic || []).slice(0, 6).filter((r: any) => r.link).map((r: any) => ({
        title: String(r.title || r.link), url: String(r.link), snippet: String(r.snippet || '').slice(0, 1800)
      }))
    }
  }
}
