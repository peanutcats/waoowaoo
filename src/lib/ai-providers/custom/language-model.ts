import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { fetchSafeProviderRequest } from '@/lib/media/outbound-fetch'
import { customApiProtocol, normalizeCustomApiBaseUrl } from './config'

export function createCustomLanguageModel(input: {
  providerId: string
  modelId: string
  apiKey: string
  baseUrl: string
  fetch?: typeof fetch
}): LanguageModelV3 {
  const config = customApiProtocol(input.providerId)
  const baseURL = normalizeCustomApiBaseUrl(input.providerId, input.baseUrl)
  const options = { baseURL, apiKey: input.apiKey, fetch: input.fetch ?? fetchSafeProviderRequest }
  switch (config?.id) {
    case 'openai-compatible': return createOpenAICompatible({ ...options, name: 'custom' }).chatModel(input.modelId)
    case 'openai-responses': return createOpenAI(options).responses(input.modelId)
    case 'anthropic-compatible': return createAnthropic(options)(input.modelId)
    case 'gemini-compatible': return createGoogleGenerativeAI(options)(input.modelId)
    default: throw new Error('CUSTOM_API_LANGUAGE_PROTOCOL_UNSUPPORTED')
  }
}
