export async function fetchJson(url: string, init: RequestInit, label: string): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const text = await res.text()
    let json: any = {}
    try { json = text ? JSON.parse(text) : {} } catch { json = { message: text.slice(0, 500) } }
    if (!res.ok) {
      const message = json?.error?.message || json?.message || json?.detail || `${label} HTTP ${res.status}`
      throw new Error(String(message).slice(0, 500))
    }
    return json
  } finally {
    clearTimeout(timeout)
  }
}
