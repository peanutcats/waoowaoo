import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import { customApiProviderManifests } from '@/lib/ai-providers/custom/manifest'
import { findBuiltinCapabilities } from '@/lib/ai-registry/capabilities-catalog'
import { normalizeProvidersInput, resolveProviderByIdOrKey } from '@/lib/user-api/api-config-provider-normalization'
import { mergeProvidersForDisplay } from '@/app/[locale]/profile/components/api-config/selectors'
import { putUserApiConfig } from '@/lib/user-api/api-config-service'
import { decryptApiKey, encryptApiKey } from '@/lib/crypto-utils'
import { executeCustomImage } from '@/lib/ai-providers/custom/image'
import type { AiProviderImageExecutionContext } from '@/lib/ai-providers/runtime-types'
import { customImageSize } from '@/lib/ai-providers/custom/image-size'

const fetchMock = vi.hoisted(() => vi.fn<typeof fetch>())
vi.mock('@/lib/media/outbound-fetch', () => ({ fetchSafeProviderRequest: fetchMock, fetchSafeOutboundMedia: fetchMock }))

beforeEach(() => {
  fetchMock.mockReset()
  process.env.API_ENCRYPTION_KEY = randomBytes(32).toString('hex')
  ensureAiCatalogsRegistered()
})

describe('custom API configuration', () => {
  it('provides declared capabilities for arbitrary IDs, without inferring a protocol from the ID', () => {
    expect(findBuiltinCapabilities('llm', 'anthropic-compatible:one', 'arbitrary-model')).toMatchObject({ llm: { protocol: 'anthropic-messages', codexRuntimeWireApi: 'responses' } })
    expect(findBuiltinCapabilities('llm', 'gemini-compatible:one', 'not-named-gemini')).toMatchObject({ llm: { protocol: 'google-generative-ai' } })
    expect(findBuiltinCapabilities('llm', 'unknown', 'arbitrary-model')).toBeUndefined()
    expect(findBuiltinCapabilities('video', 'openai-compatible:one', 'arbitrary-model')).toBeUndefined()
  })

  it('keeps multiple connections distinct after reloading and never falls back to another instance key', () => {
    const saved = [{ id: 'openai-compatible:one', name: 'First', baseUrl: 'https://first.example/v1', hasApiKey: true },
      { id: 'openai-compatible:two', name: 'Second', baseUrl: 'https://second.example/v1', hasApiKey: true }]
    const displayed = mergeProvidersForDisplay(saved, [{ id: 'openai-compatible', name: 'Chat', modelTypes: ['llm'] }])
    expect(displayed).toEqual(saved.map((provider) => ({ ...provider, modelTypes: ['llm'] })))
    expect(resolveProviderByIdOrKey(saved, 'openai-compatible:deleted')).toBeNull()
    expect(normalizeProvidersInput([{ ...saved[0], baseUrl: 'https://first.example/v1/chat/completions' }])[0].baseUrl).toBe('https://first.example/v1')
  })

  it('encrypts keys on save, retains omitted keys, and requires re-entry before changing their destination', async () => {
    const provider = { id: 'anthropic-compatible:one', name: 'Native', baseUrl: 'https://first.example/v1', apiKey: encryptApiKey('old-test-value') }
    const upsert = vi.fn().mockResolvedValue({})
    const client = { userPreference: { findUnique: vi.fn().mockResolvedValue({ customProviders: JSON.stringify([provider]), customModels: '[]' }), upsert } }
    await putUserApiConfig('unit-user', { providers: [{ ...provider, apiKey: undefined }] }, client as never)
    let stored = JSON.parse(upsert.mock.calls[0][0].update.customProviders)[0]
    expect(stored.apiKey).toBe(provider.apiKey)
    await expect(putUserApiConfig('unit-user', { providers: [{ ...provider, baseUrl: 'https://second.example/v1', apiKey: undefined }] }, client as never))
      .rejects.toMatchObject({ details: { code: 'PROVIDER_ENDPOINT_CHANGE_REQUIRES_KEY' } })
    expect(upsert).toHaveBeenCalledTimes(1)
    await putUserApiConfig('unit-user', { providers: [{ ...provider, apiKey: 'new-test-value' }] }, client as never)
    stored = JSON.parse(upsert.mock.calls[1][0].update.customProviders)[0]
    expect(stored.apiKey).not.toBe('new-test-value')
    expect(decryptApiKey(stored.apiKey)).toBe('new-test-value')
  })

  it.each(customApiProviderManifests.map((manifest) => [manifest.providerKey, manifest] as const))('%s connection checks only GET models and handles HTTP rejection', async (_key, manifest) => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [] }))
    const input = { apiKey: 'test', baseUrl: 'https://api.example/v1' }
    const result = await manifest.adapter.connectionTest!.diagnose(input)
    expect(result.success).toBe(true)
    expect(result.steps.find((step) => step.name === 'textGen')?.status).toBe('skip')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: 'unauthorized' } }, { status: 401 }))
    expect((await manifest.adapter.connectionTest!.diagnose(input)).success).toBe(false)
  })
})

const imageInput = (): AiProviderImageExecutionContext => ({ userId: 'unit-user',
  providerConfig: { id: 'openai-images:one', name: 'Images', apiKey: 'test-only', baseUrl: 'https://images.example/v1' },
  selection: { variantSubKind: 'official', provider: 'openai-images:one', modelId: 'image-model', modelKey: 'openai-images:one::image-model' }, prompt: 'A tree',
})
describe('custom image endpoints', () => {
  it('maps project ratios to pixel sizes and sends explicitly chosen pixel presets unchanged', async () => {
    expect(customImageSize({ aspectRatio: '16:9', resolution: '1024' })).toBe('1024x576')
    expect(customImageSize({ aspectRatio: '9:16', resolution: '1536' })).toBe('864x1536')
    expect(customImageSize({ aspectRatio: '16:9', resolution: '1792x1024' })).toBe('1792x1024')
    expect(() => customImageSize({ size: '1024x1024', resolution: '1024' })).toThrow('CONFLICT')
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ url: 'https://images.example/result.png' }] }))
    await executeCustomImage({ ...imageInput(), options: { aspectRatio: '16:9', resolution: '1024' } })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).size).toBe('1024x576')
  })
  it('sends generation JSON to the configured endpoint with the exact model ID', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ url: 'https://images.example/result.png' }] }))
    const result = await executeCustomImage(imageInput())
    expect(result.imageUrl).toBe('https://images.example/result.png')
    expect(fetchMock.mock.calls[0][0]).toBe('https://images.example/v1/images/generations')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ model: 'image-model', prompt: 'A tree', n: 1 })
  })
  it('sends a multipart edit without manually setting its boundary', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64')
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ b64_json: png }] }))
    const result = await executeCustomImage({ ...imageInput(), options: { referenceImages: [`data:image/png;base64,${png}`] } })
    expect(result.imageUrl).toBe(`data:image/png;base64,${png}`)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://images.example/v1/images/edits')
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('image')).toBeInstanceOf(Blob)
    expect(new Headers(init?.headers).has('content-type')).toBe(false)
  })
  it('preserves HTTP failures without retrying a potentially accepted generation', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: 'busy' } }, { status: 503 }))
    await expect(executeCustomImage(imageInput())).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
