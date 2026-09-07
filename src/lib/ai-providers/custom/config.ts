/** Explicit wire protocols. A model name never selects a protocol or a host. */
export const CUSTOM_API_PROTOCOLS = [
  { id: 'openai-compatible', name: 'OpenAI Chat Completions', modelTypes: ['llm'], protocol: 'openai-compatible-chat', suffix: '/chat/completions' },
  { id: 'openai-responses', name: 'OpenAI Responses', modelTypes: ['llm'], protocol: 'openai-responses', suffix: '/responses' },
  { id: 'openai-images', name: 'OpenAI Images', modelTypes: ['image'], protocol: undefined, suffix: '/images/generations' },
  { id: 'anthropic-compatible', name: 'Anthropic Messages', modelTypes: ['llm'], protocol: 'anthropic-messages', suffix: '/messages' },
  { id: 'gemini-compatible', name: 'Gemini GenerateContent', modelTypes: ['llm'], protocol: 'google-generative-ai', suffix: '' },
] as const

export function customApiProtocol(providerId: string) {
  const key = providerId.split(':', 1)[0]
  return CUSTOM_API_PROTOCOLS.find((item) => item.id === key)
}

/** Accept an API base URL or the chosen protocol's complete endpoint. */
export function normalizeCustomApiBaseUrl(providerId: string, value: string): string {
  const config = customApiProtocol(providerId)
  if (!config) throw new Error('CUSTOM_API_PROTOCOL_UNSUPPORTED')
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('CUSTOM_API_BASE_URL_REQUIRES_HTTPS_WITHOUT_CREDENTIALS_QUERY_OR_FRAGMENT')
  }
  let path = url.pathname.replace(/\/+$/, '')
  if (config.suffix && path.endsWith(config.suffix)) path = path.slice(0, -config.suffix.length)
  if (config.id === 'openai-images' && path.endsWith('/images/edits')) path = path.slice(0, -'/images/edits'.length)
  if (config.id === 'gemini-compatible') path = path.replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/, '')
  // Version prefixes are intentionally not guessed: gateways often use their own paths.
  url.pathname = path
  return url.toString().replace(/\/+$/, '')
}
