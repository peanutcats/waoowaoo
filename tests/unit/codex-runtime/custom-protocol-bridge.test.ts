import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createCustomLanguageModel } from '@/lib/ai-providers/custom/language-model'
import { bridgeCustomResponses, toCustomModelOptions } from '@/lib/codex-model-gateway/custom-protocol-bridge'
import { normalizeCustomApiBaseUrl } from '@/lib/ai-providers/custom/config'
import type { LanguageModelV3, LanguageModelV3StreamPart } from '@ai-sdk/provider'

const usage = { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
const tools = [{ type: 'function', name: 'get_scene', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }]
const body = { model: 'my-model', stream: true, instructions: 'Be helpful', input: [{ role: 'user', content: 'Find scene one' }], tools }
const scope = 'test-user/project/model'
function sse(events: unknown[]): Response {
  return new Response(events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
type WireItem = { type: string; call_id: string; name: string; arguments: string; content: { text: string }[] }
type WireEvent = { type: string; sequence_number: number; delta?: string; response: { output: WireItem[]; usage: Record<string, number> } }
function events(text: string): WireEvent[] {
  return text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)))
}
const chat = (tool = false) => sse([
  { id: 'chatcmpl_test', object: 'chat.completion.chunk', created: 1, model: 'my-model', choices: [{ index: 0, delta: tool
    ? { tool_calls: [{ index: 0, id: 'call_one', type: 'function', function: { name: 'get_scene', arguments: '{"id":' } }] }
    : { role: 'assistant', content: 'Hello' }, finish_reason: null }] },
  ...(tool ? [{ id: 'chatcmpl_test', object: 'chat.completion.chunk', created: 1, model: 'my-model', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"1"}' } }] }, finish_reason: null }] }] : []),
  { id: 'chatcmpl_test', object: 'chat.completion.chunk', created: 1, model: 'my-model', choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage }, '[DONE]',
])
const anthropic = () => sse([
  { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'my-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_one', name: 'get_scene', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"id":"1"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 4 } },
  { type: 'message_stop' },
])
const gemini = () => sse([
  { candidates: [{ index: 0, content: { role: 'model', parts: [{ functionCall: { name: 'get_scene', args: { id: '1' } }, thoughtSignature: 'native-signature' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 }, modelVersion: 'my-model' },
])

beforeEach(() => { process.env.API_ENCRYPTION_KEY = randomBytes(32).toString('hex') })

describe('custom native protocol bridge (mock HTTP only)', () => {
  it('uses the Responses endpoint with exact model IDs for ordinary language-model calls', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'resp_test', created_at: 1, model: 'my-model',
      output: [{ type: 'message', role: 'assistant', id: 'msg_test', content: [{ type: 'output_text', text: 'Hello', annotations: [], logprobs: [] }] }],
      usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } }))
    const model = createCustomLanguageModel({ providerId: 'openai-responses', modelId: 'my-model', apiKey: 'test', baseUrl: 'https://api.example.com/custom/v1/responses', fetch: fetchMock })
    const result = await model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }] })
    expect(result.content).toMatchObject([{ type: 'text', text: 'Hello' }])
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/custom/v1/responses')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('my-model')
  })

  it('propagates downstream cancellation to the provider stream', async () => {
    const cancel = vi.fn()
    const upstreamStream = new ReadableStream<LanguageModelV3StreamPart>({ cancel })
    const model = { doStream: vi.fn().mockResolvedValue({ stream: upstreamStream }) } as unknown as LanguageModelV3
    const response = await bridgeCustomResponses({ model, body, scope, signal: new AbortController().signal })
    await response.body!.cancel('client disconnected')
    expect(cancel).toHaveBeenCalledWith('client disconnected')
    expect(model.doStream).toHaveBeenCalledTimes(1)
  })

  it('groups parallel tool calls and their results for native Messages requests', () => {
    const result = toCustomModelOptions({ input: [
      { type: 'function_call', call_id: 'one', name: 'get_scene', arguments: '{"id":"1"}' },
      { type: 'function_call', call_id: 'two', name: 'get_scene', arguments: '{"id":"2"}' },
      { type: 'function_call_output', call_id: 'one', output: 'first' },
      { type: 'function_call_output', call_id: 'two', output: 'second' },
    ] }, scope)
    expect(result.options.prompt.map((message) => [message.role, message.content.length])).toEqual([['assistant', 2], ['tool', 2]])
  })
  it.each([
    ['openai-compatible', '/v1/chat/completions', 'authorization', () => chat(true)],
    ['anthropic-compatible', '/v1/messages', 'x-api-key', anthropic],
    ['gemini-compatible', '/v1/models/my-model:streamGenerateContent?alt=sse', 'x-goog-api-key', gemini],
  ] as const)('uses %s native auth, endpoint and tool history', async (provider, path, auth, fixture) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => fixture())
    const model = createCustomLanguageModel({ providerId: `${provider}:instance`, modelId: 'my-model', apiKey: 'test-only-key', baseUrl: 'https://api.example.com/v1', fetch: fetchMock })
    const response = await bridgeCustomResponses({ model, body, scope, signal: new AbortController().signal })
    const emitted = events(await response.text())
    const terminal = emitted.at(-1)!
    expect(terminal.type).toBe('response.completed')
    expect(terminal.response.usage).toMatchObject({ input_tokens: 10, output_tokens: 4, total_tokens: 14 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`https://api.example.com${path}`)
    expect(new Headers(init?.headers).get(auth)).toContain('test-only-key')
    expect(String(url)).not.toContain('test-only-key')
    const call = terminal.response.output.find((item: WireItem) => item.type === 'function_call')!
    expect(call).toMatchObject({ name: 'get_scene', arguments: '{"id":"1"}', status: 'completed' })
    const next = { ...body, input: [...body.input, ...terminal.response.output, { type: 'function_call_output', call_id: call.call_id, output: 'scene result' }] }
    const second = await bridgeCustomResponses({ model, body: next, scope, signal: new AbortController().signal })
    await second.text()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const replayed = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    if (provider === 'gemini-compatible') {
      const modelTurn = replayed.contents.find((message: { role: string }) => message.role === 'model')
      expect(modelTurn.parts[0]).toMatchObject({ thoughtSignature: 'native-signature', functionCall: { name: 'get_scene', args: { id: '1' } } })
      expect(JSON.stringify(replayed.contents)).toContain('functionResponse')
    } else if (provider === 'anthropic-compatible') {
      expect(replayed.messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: call.call_id, content: 'scene result' })
    } else expect(replayed.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: call.call_id, content: 'scene result' })
    expect(() => toCustomModelOptions(next, 'different-user')).toThrow('CONTINUATION_SCOPE_INVALID')
  })

  it('streams text deltas and preserves text in a non-stream JSON response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => chat())
    const model = createCustomLanguageModel({ providerId: 'openai-compatible', modelId: 'my-model', apiKey: 'test', baseUrl: 'https://api.example.com/v1', fetch: fetchMock })
    const streamed = events(await (await bridgeCustomResponses({ model, body, scope, signal: new AbortController().signal })).text())
    expect(streamed.find((event) => event.type === 'response.output_text.delta')?.delta).toBe('Hello')
    expect(streamed.map((event) => event.sequence_number)).toEqual(streamed.map((_, index) => index))
    const response = await bridgeCustomResponses({ model, body: { ...body, stream: false }, scope, signal: new AbortController().signal })
    expect(response.headers.get('content-type')).toContain('application/json')
    expect((await response.json()).output[0].content[0].text).toBe('Hello')
  })

  it('does not report success for a truncated native stream or retry it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(sse([{ choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }] }]))
    const model = createCustomLanguageModel({ providerId: 'openai-compatible', modelId: 'my-model', apiKey: 'test', baseUrl: 'https://api.example.com/v1', fetch: fetchMock })
    const emitted = events(await (await bridgeCustomResponses({ model, body, scope, signal: new AbortController().signal })).text())
    expect(emitted.at(-1)?.type).toBe('response.failed')
    expect(emitted.some((event) => event.type === 'response.completed')).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects stateful upstream histories and unsupported hosted tools before sending anything', () => {
    expect(() => toCustomModelOptions({ ...body, previous_response_id: 'resp_remote' }, scope)).toThrow('FULL_HISTORY')
    expect(() => toCustomModelOptions({ ...body, tools: [{ type: 'web_search' }] }, scope)).toThrow('TOOL_TYPE_UNSUPPORTED')
  })

  it('preserves exact custom tool input and inline images', () => {
    const translated = toCustomModelOptions({ ...body, tools: [{ type: 'custom', name: 'apply_patch' }], input: [
      { role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,aGVsbG8=' }] },
      { type: 'custom_tool_call', call_id: 'ct1', name: 'apply_patch', input: '*** Begin Patch\n*** End Patch' },
      { type: 'custom_tool_call_output', call_id: 'ct1', output: 'ok' },
    ] }, scope)
    expect(translated.customTools.has('apply_patch')).toBe(true)
    expect(translated.options.prompt[1].content).toEqual([{ type: 'file', mediaType: 'image/png', data: 'aGVsbG8=' }])
    expect(translated.options.prompt[2].content).toMatchObject([{ input: { input: '*** Begin Patch\n*** End Patch' } }])
  })
})

describe('custom base URL normalization', () => {
  it.each([
    ['openai-compatible', 'https://api.example.com/prefix/v1/chat/completions/', 'https://api.example.com/prefix/v1'],
    ['openai-responses', 'https://api.example.com/v1/responses', 'https://api.example.com/v1'],
    ['openai-images', 'https://api.example.com/v1/images/edits', 'https://api.example.com/v1'],
    ['anthropic-compatible', 'https://api.example.com/v1/messages', 'https://api.example.com/v1'],
    ['gemini-compatible', 'https://api.example.com/v1beta/models/model:generateContent', 'https://api.example.com/v1beta'],
  ])('normalizes %s without inventing a version prefix', (provider, url, expected) => {
    expect(normalizeCustomApiBaseUrl(provider, url)).toBe(expected)
  })
  it.each(['http://api.example.com/v1', 'https://name:secret@api.example.com/v1', 'https://api.example.com/v1?key=test', 'https://api.example.com/v1#secret'])('rejects unsafe credential endpoint %s', (url) => {
    expect(() => normalizeCustomApiBaseUrl('openai-compatible', url)).toThrow()
  })
})
