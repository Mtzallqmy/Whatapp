export type UserRole = 'admin' | 'user'

export interface AppUser {
  id: string
  phone: string
  name: string
  enabled: boolean
  role: UserRole
  daily_limit: number
  monthly_limit: number | null
  can_chat: boolean
  can_search: boolean
  can_images: boolean
  can_files: boolean
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export type ProviderCategory = 'ai' | 'search'
export type ProviderType = 'openai' | 'gemini' | 'openrouter' | 'anthropic' | 'tavily' | 'serper' | 'brave'

export interface ProviderConfig {
  inputCostPer1M?: number
  outputCostPer1M?: number
  imageCost?: number
  requestCost?: number
  headers?: Record<string, string>
  [key: string]: unknown
}

export interface ProviderRecord {
  id: string
  type: ProviderType
  category: ProviderCategory
  name: string
  encrypted_key: string
  key_hint: string
  base_url: string | null
  config: ProviderConfig
  enabled: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ProviderWithSecret extends ProviderRecord {
  apiKey: string
}

export interface ModelRoute {
  providerId: string
  model: string
}

export interface ModelRoutes {
  chat: ModelRoute
  advanced: ModelRoute
  vision: ModelRoute
  search: ModelRoute
  image: ModelRoute
  searchProviderId: string
}
