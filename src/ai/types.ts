export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface TextGenerationResult {
  text: string
  usage: TokenUsage
}

export interface ImageGenerationResult {
  image: Buffer
  mimeType: string
  usage?: TokenUsage
}

export interface AIProvider {
  chat(input: { model: string; system: string; messages: ChatMessage[] }): Promise<TextGenerationResult>
  vision?(input: { model: string; system: string; messages: ChatMessage[]; image: Buffer; mimeType: string }): Promise<TextGenerationResult>
  image?(input: { model: string; prompt: string; size?: string }): Promise<ImageGenerationResult>
}

export interface SearchSource {
  title: string
  url: string
  snippet: string
}

export interface SearchResult {
  sources: SearchSource[]
}

export interface SearchAdapter {
  search(query: string): Promise<SearchResult>
}
