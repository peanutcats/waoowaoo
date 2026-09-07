import type { AiProviderManifest } from '@/lib/ai-providers/manifest'
import { createAiProviderFailureAdapter, readProviderJsonResponse } from '@/lib/ai-providers/failure'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { stringArrayValidator, nonEmptyStringValidator, enumValidator } from '@/lib/ai-providers/shared/option-schema'
import { fetchSafeProviderRequest } from '@/lib/media/outbound-fetch'
import { CUSTOM_API_PROTOCOLS, normalizeCustomApiBaseUrl } from './config'
import { createCustomLanguageModel } from './language-model'
import { executeCustomImage } from './image'
import { CUSTOM_IMAGE_RATIOS, CUSTOM_IMAGE_RESOLUTIONS, customImageSize } from './image-size'

export const customApiProviderManifests: readonly AiProviderManifest[] = CUSTOM_API_PROTOCOLS.map((config) => ({
  providerKey: config.id,
  apiConfig: { visibility: 'visible', name: config.name, customModels: [...config.modelTypes] },
  platformCredentials: { envPrefix: `PLATFORM_${config.id.replaceAll('-', '_').toUpperCase()}`, requiresBaseUrl: true },
  catalogs: {
    capabilities: [{
      provider: config.id, modelId: '*', modelType: config.protocol ? 'llm' : 'image',
      capabilities: config.protocol
        ? { llm: { protocol: config.protocol, codexRuntimeWireApi: 'responses', publicReasoningMode: 'none' } }
        : { image: { maxReferenceImages: 1, resolutionOptions: [...CUSTOM_IMAGE_RESOLUTIONS] } },
    }],
    pricing: [], apiConfigModels: [], platformModels: [],
  },
  mediaInputs: [{ modality: config.protocol ? 'vision' : 'image', transports: { image: ['inline-data-url'] } }],
  adapter: {
    providerKey: config.id,
    failure: createAiProviderFailureAdapter(config.id),
    ...(config.protocol ? { languageModel: {
      create: (input) => {
        if (input.protocol !== config.protocol) throw new Error('CUSTOM_API_PROTOCOL_MISMATCH')
        return createCustomLanguageModel({ providerId: input.selection.provider, modelId: input.selection.modelId,
          apiKey: input.providerConfig.apiKey, baseUrl: input.providerConfig.baseUrl ?? '' })
      },
    } } : { image: {
      describe: (selection) => describeMediaVariantBase({
        modality: 'image', selection, executionMode: 'sync',
        optionSchema: {
          allowedKeys: new Set(['provider', 'modelId', 'modelKey', 'referenceImages', 'size', 'resolution', 'aspectRatio', 'quality', 'responseFormat']),
          validators: { referenceImages: stringArrayValidator({ maxLength: 1 }), size: nonEmptyStringValidator(),
            resolution: enumValidator(CUSTOM_IMAGE_RESOLUTIONS), aspectRatio: enumValidator(CUSTOM_IMAGE_RATIOS),
            quality: nonEmptyStringValidator(), responseFormat: enumValidator(['url', 'b64_json']) },
          objectValidators: [(options) => {
            try {
              customImageSize({ size: typeof options.size === 'string' ? options.size : undefined,
                resolution: typeof options.resolution === 'string' ? options.resolution : undefined,
                aspectRatio: typeof options.aspectRatio === 'string' ? options.aspectRatio : undefined })
              return { ok: true }
            } catch { return { ok: false, reason: 'custom_image_size_invalid' } }
          }],
        },
      }),
      execute: executeCustomImage,
    } }),
    connectionTest: {
      diagnose: async (input) => {
        try {
          const baseUrl = normalizeCustomApiBaseUrl(config.id, input.baseUrl ?? '')
          const headers: Record<string, string> = config.id === 'anthropic-compatible'
            ? { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' }
            : config.id === 'gemini-compatible' ? { 'x-goog-api-key': input.apiKey }
              : { authorization: `Bearer ${input.apiKey}` }
          const response = await fetchSafeProviderRequest(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(15_000) })
          if (!response.ok) { await response.body?.cancel(); throw new Error('CUSTOM_API_MODELS_HTTP_ERROR') }
          await readProviderJsonResponse({ response, provider: config.id, phase: 'connection' })
          return { success: true, steps: [
            { name: 'models', status: 'pass', messageKey: 'connectionTest.modelsOk' },
            { name: 'textGen', status: 'skip', messageKey: 'connectionTest.skippedSpend' },
          ] }
        } catch {
          return { success: false, steps: [
            { name: 'models', status: 'fail', messageKey: 'connectionTest.providerError' },
            { name: 'textGen', status: 'skip', messageKey: 'connectionTest.skippedSpend' },
          ] }
        }
      },
    },
  },
}))
