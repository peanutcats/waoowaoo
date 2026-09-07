import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { captureProviderHttpFailure, readProviderJsonResponse } from '@/lib/ai-providers/failure'
import { fetchSafeOutboundMedia, fetchSafeProviderRequest } from '@/lib/media/outbound-fetch'
import { normalizeCustomApiBaseUrl } from './config'
import { customImageSize } from './image-size'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024

async function referenceBlob(source: string): Promise<Blob> {
  const inline = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(source)
  if (inline) {
    const bytes = Buffer.from(inline[2], 'base64')
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('CUSTOM_IMAGE_REFERENCE_SIZE_INVALID')
    return new Blob([bytes], { type: inline[1] })
  }
  const response = await fetchSafeOutboundMedia(source, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok || !/^image\/(png|jpeg|webp)(;|$)/.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel()
    throw new Error('CUSTOM_IMAGE_REFERENCE_INVALID')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('CUSTOM_IMAGE_REFERENCE_EMPTY')
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let length = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.length
      if (length > MAX_IMAGE_BYTES) throw new Error('CUSTOM_IMAGE_REFERENCE_TOO_LARGE')
      chunks.push(new Uint8Array(part.value))
    }
  } finally { await reader.cancel() }
  return new Blob(chunks, { type: response.headers.get('content-type')!.split(';')[0] })
}

export async function executeCustomImage(input: AiProviderImageExecutionContext): Promise<GenerateResult> {
  const baseUrl = normalizeCustomApiBaseUrl(input.selection.provider, input.providerConfig.baseUrl ?? '')
  const options = input.options ?? {}
  const references = options.referenceImages ?? []
  if (references.length > 1) throw new Error('CUSTOM_IMAGE_MAX_ONE_REFERENCE')
  const fields: Record<string, string | number> = { model: input.selection.modelId, prompt: input.prompt, n: 1 }
  const size = customImageSize(options)
  if (size) fields.size = size
  for (const [option, field] of [['quality', 'quality'], ['responseFormat', 'response_format']] as const) {
    if (typeof options[option] === 'string') fields[field] = options[option]!
  }
  // Do not silently discard media options the selected endpoint cannot represent.
  for (const name of ['outputFormat', 'keepOriginalAspectRatio']) {
    if (options[name] !== undefined) throw new Error(`CUSTOM_IMAGE_OPTION_UNSUPPORTED:${name}`)
  }
  const headers: Record<string, string> = { authorization: `Bearer ${input.providerConfig.apiKey}` }
  let body: BodyInit
  if (references.length) {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.set(key, String(value))
    const blob = await referenceBlob(references[0])
    form.set('image', blob, `reference.${blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]}`)
    body = form
  } else {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(fields)
  }
  const response = await fetchSafeProviderRequest(`${baseUrl}/images/${references.length ? 'edits' : 'generations'}`, {
    method: 'POST', headers, body, signal: AbortSignal.timeout(180_000),
  })
  if (!response.ok) throw await captureProviderHttpFailure({ response, provider: input.selection.provider, phase: 'submit' })
  const payload = await readProviderJsonResponse({ response, provider: input.selection.provider, phase: 'submit' }) as {
    data?: { url?: string; b64_json?: string }[]
  }
  const result = payload.data?.[0]
  if (result?.b64_json && /^[A-Za-z0-9+/=]+$/.test(result.b64_json)) {
    const bytes = Buffer.from(result.b64_json, 'base64')
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('CUSTOM_IMAGE_RESPONSE_SIZE_INVALID')
    const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null
    if (!mime) throw new Error('CUSTOM_IMAGE_RESPONSE_FORMAT_INVALID')
    return { success: true, imageBase64: result.b64_json, imageUrl: `data:${mime};base64,${result.b64_json}` }
  }
  if (result?.url) return { success: true, imageUrl: result.url }
  throw new Error('CUSTOM_IMAGE_RESPONSE_EMPTY')
}
