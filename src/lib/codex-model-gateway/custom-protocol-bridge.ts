import { randomUUID } from 'node:crypto'
import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3Message, LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { encryptApiKey, decryptApiKey } from '@/lib/crypto-utils'

type RecordValue = Record<string, unknown>
type AssistantContent = Extract<LanguageModelV3Message, { role: 'assistant' }>['content']
const CONTINUATION_PREFIX = 'wao_custom_v1:'
const MAX_CONTINUATION_CHARS = 4 * 1024 * 1024
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): string => typeof value === 'string' ? value : ''
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('CUSTOM_BRIDGE_REQUIRED_STRING')
  return value
}

function messageContent(value: unknown): Extract<LanguageModelV3Message, { role: 'user' }>['content'] {
  if (typeof value === 'string') return [{ type: 'text', text: value }]
  if (!Array.isArray(value)) throw new Error('CUSTOM_BRIDGE_MESSAGE_CONTENT_INVALID')
  return value.map((part) => {
    if (!record(part)) throw new Error('CUSTOM_BRIDGE_MESSAGE_PART_INVALID')
    if (part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') {
      return { type: 'text', text: requiredString(part.text) }
    }
    if (part.type === 'input_image') {
      const source = requiredString(part.image_url)
      const inline = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(source)
      // Native SDKs differ in remote image support. Only already-projected inline input is portable.
      if (!inline) throw new Error('CUSTOM_BRIDGE_IMAGE_REQUIRES_INLINE_DATA')
      return { type: 'file', mediaType: inline[1], data: inline[2] }
    }
    throw new Error(`CUSTOM_BRIDGE_CONTENT_UNSUPPORTED:${String(part.type)}`)
  })
}

type Replay = { scope: string; keys: string[]; content: AssistantContent }
const itemKey = (item: RecordValue) => string(item.call_id) || string(item.id)

/** Translate a complete stateless Responses history; never execute tools in the bridge. */
export function toCustomModelOptions(body: RecordValue, scope: string): {
  options: LanguageModelV3CallOptions
  customTools: Set<string>
} {
  if (body.previous_response_id) throw new Error('CUSTOM_BRIDGE_REQUIRES_FULL_HISTORY')
  const input = typeof body.input === 'string'
    ? [{ role: 'user', content: body.input }]
    : Array.isArray(body.input) ? body.input : []
  const replayByKey = new Map<string, Replay>()
  for (const item of input) {
    if (!record(item) || item.type !== 'reasoning' || !string(item.encrypted_content).startsWith(CONTINUATION_PREFIX)) continue
    const encoded = string(item.encrypted_content).slice(CONTINUATION_PREFIX.length)
    if (encoded.length > MAX_CONTINUATION_CHARS) throw new Error('CUSTOM_BRIDGE_CONTINUATION_TOO_LARGE')
    const replay = JSON.parse(decryptApiKey(encoded)) as Replay
    if (replay.scope !== scope || !Array.isArray(replay.keys) || !Array.isArray(replay.content)) throw new Error('CUSTOM_BRIDGE_CONTINUATION_SCOPE_INVALID')
    for (const key of replay.keys) replayByKey.set(key, replay)
  }
  const prompt: LanguageModelV3CallOptions['prompt'] = []
  if (body.instructions) prompt.push({ role: 'system', content: requiredString(body.instructions) })
  const replayed = new Set<Replay>()
  const toolNames = new Map<string, string>()
  for (const item of input) {
    if (!record(item)) throw new Error('CUSTOM_BRIDGE_INPUT_INVALID')
    if (item.type === 'function_call' || item.type === 'custom_tool_call') toolNames.set(requiredString(item.call_id), requiredString(item.name))
  }
  for (const item of input) {
    if (!record(item)) throw new Error('CUSTOM_BRIDGE_INPUT_INVALID')
    if (item.type === 'reasoning') continue // Opaque replay below restores native signatures and reasoning.
    const replay = replayByKey.get(itemKey(item))
    if (replay && item.type !== 'function_call_output' && item.type !== 'custom_tool_call_output') {
      if (!replayed.has(replay)) { prompt.push({ role: 'assistant', content: replay.content }); replayed.add(replay) }
      continue
    }
    if (item.type === 'function_call' || item.type === 'custom_tool_call') {
      prompt.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: requiredString(item.call_id),
        toolName: requiredString(item.name), input: item.type === 'custom_tool_call' ? { input: string(item.input) } : JSON.parse(requiredString(item.arguments)) }] })
    } else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
      const toolCallId = requiredString(item.call_id)
      const toolName = toolNames.get(toolCallId)
      if (!toolName) throw new Error('CUSTOM_BRIDGE_ORPHAN_TOOL_RESULT')
      prompt.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId, toolName,
        output: typeof item.output === 'string' ? { type: 'text', value: item.output }
          : { type: 'text', value: JSON.stringify(item.output ?? '') } }] })
    } else if (item.type === 'message' || item.role) {
      if (item.role === 'system' || item.role === 'developer') {
        const content = messageContent(item.content)
        if (content.some((part) => part.type !== 'text')) throw new Error('CUSTOM_BRIDGE_SYSTEM_IMAGE_UNSUPPORTED')
        prompt.push({ role: 'system', content: content.map((part) => part.type === 'text' ? part.text : '').join('\n') })
      } else if (item.role === 'user' || item.role === 'assistant') {
        prompt.push({ role: item.role, content: messageContent(item.content) })
      } else throw new Error('CUSTOM_BRIDGE_ROLE_UNSUPPORTED')
    } else throw new Error(`CUSTOM_BRIDGE_INPUT_UNSUPPORTED:${String(item.type)}`)
  }
  // Rejoin adjacent assistant/tool parts: Anthropic requires all parallel tool results in one user turn.
  const joined: LanguageModelV3CallOptions['prompt'] = []
  for (const message of prompt) {
    const last = joined.at(-1)
    if (last && last.role === message.role && last.role !== 'system' && message.role !== 'system') {
      joined[joined.length - 1] = { ...message, content: [...last.content, ...message.content] } as LanguageModelV3Message
    } else joined.push(message)
  }
  const customTools = new Set<string>()
  const tools: NonNullable<LanguageModelV3CallOptions['tools']> = []
  for (const tool of Array.isArray(body.tools) ? body.tools : []) {
    if (!record(tool) || (tool.type !== 'function' && tool.type !== 'custom')) throw new Error('CUSTOM_BRIDGE_TOOL_TYPE_UNSUPPORTED')
    const name = requiredString(tool.name)
    if (tool.type === 'custom') customTools.add(name)
    tools.push({ type: 'function', name, description: string(tool.description), inputSchema: tool.type === 'custom'
      ? { type: 'object', properties: { input: { type: 'string', description: 'The exact input to the custom tool.' } }, required: ['input'], additionalProperties: false }
      : record(tool.parameters) ? tool.parameters : { type: 'object', properties: {} } })
  }
  let toolChoice: LanguageModelV3CallOptions['toolChoice']
  if (body.tool_choice === 'auto' || body.tool_choice === 'none' || body.tool_choice === 'required') toolChoice = { type: body.tool_choice }
  else if (record(body.tool_choice) && (body.tool_choice.type === 'function' || body.tool_choice.type === 'custom')) {
    toolChoice = { type: 'tool', toolName: requiredString(body.tool_choice.name) }
  } else if (body.tool_choice !== undefined) throw new Error('CUSTOM_BRIDGE_TOOL_CHOICE_UNSUPPORTED')
  const options: LanguageModelV3CallOptions = { prompt: joined, tools, toolChoice }
  if (typeof body.max_output_tokens === 'number') options.maxOutputTokens = body.max_output_tokens
  if (typeof body.temperature === 'number') options.temperature = body.temperature
  if (typeof body.top_p === 'number') options.topP = body.top_p
  if (record(body.text) && record(body.text.format) && body.text.format.type !== 'text') {
    const format = body.text.format
    if (format.type !== 'json_schema' && format.type !== 'json_object') throw new Error('CUSTOM_BRIDGE_FORMAT_UNSUPPORTED')
    options.responseFormat = { type: 'json', ...(record(format.schema) ? { schema: format.schema } : {}), ...(typeof format.name === 'string' ? { name: format.name } : {}) }
  }
  return { options, customTools }
}

/** Exactly one SDK submission, no retry loop and no provider-hosted tool execution. */
export async function bridgeCustomResponses(input: {
  model: LanguageModelV3
  body: RecordValue
  scope: string
  signal: AbortSignal
}): Promise<Response> {
  const { options, customTools } = toCustomModelOptions(input.body, input.scope)
  const result = await input.model.doStream({ ...options, abortSignal: input.signal })
  const reader = result.stream.getReader()
  const responseId = id('resp')
  const output: RecordValue[] = []
  const parts: AssistantContent = []
  const entries = new Map<string, { index: number; part: number; done?: boolean }>()
  let sequence = 0
  let terminal = false
  let finish: Extract<LanguageModelV3StreamPart, { type: 'finish' }> | undefined
  const response = (status: string): RecordValue => ({ id: responseId, object: 'response', created_at: Math.floor(Date.now() / 1000),
    model: input.body.model, status, output: structuredClone(output) })
  const events: RecordValue[] = [
    { type: 'response.created', response: response('in_progress') },
    { type: 'response.in_progress', response: response('in_progress') },
  ]
  function emit(type: string, fields: RecordValue) { events.push({ type, ...fields }) }
  function add(key: string, item: RecordValue, part: AssistantContent[number]) {
    const entry = { index: output.length, part: parts.length }
    entries.set(key, entry); output.push(item); parts.push(part)
    emit('response.output_item.added', { output_index: entry.index, item: structuredClone(item) })
    return entry
  }
  function complete(entry: { index: number; part: number; done?: boolean }) {
    if (entry.done) return
    const item = output[entry.index]
    item.status = 'completed'; entry.done = true
    if (item.type === 'message') {
      const text = (parts[entry.part] as { text: string }).text
      const part = { type: 'output_text', text, annotations: [] }
      item.content = [part]
      emit('response.output_text.done', { output_index: entry.index, item_id: item.id, content_index: 0, text })
      emit('response.content_part.done', { output_index: entry.index, item_id: item.id, content_index: 0, part })
    } else if (item.type === 'function_call') {
      emit('response.function_call_arguments.done', { output_index: entry.index, item_id: item.id, arguments: item.arguments })
    } else if (item.type === 'custom_tool_call') {
      emit('response.custom_tool_call_input.done', { output_index: entry.index, item_id: item.id, input: item.input })
    }
    emit('response.output_item.done', { output_index: entry.index, item: structuredClone(item) })
  }
  function process(part: LanguageModelV3StreamPart) {
    if (part.type === 'error') throw new Error('CUSTOM_PROVIDER_STREAM_ERROR', { cause: part.error })
    if (part.type === 'finish') { finish = part; return }
    if (part.type === 'text-start') {
      const entry = add(`text:${part.id}`, { type: 'message', id: id('msg'), role: 'assistant', status: 'in_progress', content: [] },
        { type: 'text', text: '', providerOptions: part.providerMetadata })
      emit('response.content_part.added', { output_index: entry.index, item_id: output[entry.index].id, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
    } else if (part.type === 'text-delta') {
      const entry = entries.get(`text:${part.id}`)
      if (!entry) throw new Error('CUSTOM_BRIDGE_TEXT_DELTA_WITHOUT_START')
      ;(parts[entry.part] as { text: string }).text += part.delta
      if (part.providerMetadata) parts[entry.part].providerOptions = part.providerMetadata
      emit('response.output_text.delta', { output_index: entry.index, item_id: output[entry.index].id, content_index: 0, delta: part.delta })
    } else if (part.type === 'text-end') {
      const entry = entries.get(`text:${part.id}`)
      if (!entry) throw new Error('CUSTOM_BRIDGE_TEXT_END_WITHOUT_START')
      if (part.providerMetadata) parts[entry.part].providerOptions = part.providerMetadata
      complete(entry)
    } else if (part.type === 'reasoning-start') {
      entries.set(`reasoning:${part.id}`, { index: -1, part: parts.length })
      parts.push({ type: 'reasoning', text: '', providerOptions: part.providerMetadata })
    } else if (part.type === 'reasoning-delta' || part.type === 'reasoning-end') {
      const entry = entries.get(`reasoning:${part.id}`)
      if (!entry) throw new Error('CUSTOM_BRIDGE_REASONING_WITHOUT_START')
      if (part.type === 'reasoning-delta') (parts[entry.part] as { text: string }).text += part.delta
      if (part.providerMetadata) parts[entry.part].providerOptions = part.providerMetadata
    } else if (part.type === 'tool-input-start') {
      if (part.providerExecuted) throw new Error('CUSTOM_BRIDGE_PROVIDER_EXECUTED_TOOL_UNSUPPORTED')
      if (!customTools.has(part.toolName)) add(`tool:${part.id}`, { type: 'function_call', id: id('fc'), call_id: part.id, name: part.toolName, arguments: '', status: 'in_progress' },
        { type: 'tool-call', toolCallId: part.id, toolName: part.toolName, input: {}, providerOptions: part.providerMetadata })
    } else if (part.type === 'tool-input-delta') {
      const entry = entries.get(`tool:${part.id}`)
      if (!entry) return // Custom tool JSON is unwrapped once complete.
      output[entry.index].arguments = string(output[entry.index].arguments) + part.delta
      emit('response.function_call_arguments.delta', { output_index: entry.index, item_id: output[entry.index].id, delta: part.delta })
    } else if (part.type === 'tool-call') {
      if (part.providerExecuted) throw new Error('CUSTOM_BRIDGE_PROVIDER_EXECUTED_TOOL_UNSUPPORTED')
      const args: unknown = JSON.parse(part.input)
      let entry = entries.get(`tool:${part.toolCallId}`)
      const custom = customTools.has(part.toolName)
      if (!entry) {
        if (custom && (!record(args) || typeof args.input !== 'string')) throw new Error('CUSTOM_BRIDGE_CUSTOM_INPUT_INVALID')
        entry = add(`tool:${part.toolCallId}`, { type: custom ? 'custom_tool_call' : 'function_call', id: id(custom ? 'ctc' : 'fc'),
          call_id: part.toolCallId, name: part.toolName, status: 'in_progress', ...(custom ? { input: '' } : { arguments: '' }) },
        { type: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, input: args, providerOptions: part.providerMetadata })
        emit(custom ? 'response.custom_tool_call_input.delta' : 'response.function_call_arguments.delta', {
          output_index: entry.index, item_id: output[entry.index].id, delta: custom ? (args as { input: string }).input : part.input,
        })
      }
      parts[entry.part] = { type: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, input: args, providerOptions: part.providerMetadata }
      output[entry.index][custom ? 'input' : 'arguments'] = custom ? (args as { input: string }).input : part.input
      complete(entry)
    } else if (part.type === 'file' || part.type === 'tool-result' || part.type === 'tool-approval-request') {
      throw new Error(`CUSTOM_BRIDGE_OUTPUT_UNSUPPORTED:${part.type}`)
    }
  }
  function finalize() {
    if (!finish || !['stop', 'tool-calls', 'length'].includes(finish.finishReason.unified)) throw new Error('CUSTOM_PROVIDER_STREAM_NOT_COMPLETED')
    for (const entry of entries.values()) {
      if (entry.index >= 0 && !entry.done) throw new Error('CUSTOM_PROVIDER_STREAM_ITEM_INCOMPLETE')
    }
    // Preserve native Gemini thought signatures / Anthropic reasoning in authenticated opaque history.
    // Keys and prompts never enter logs; scope binds the replay to this user, project and model.
    const replay: Replay = { scope: input.scope, keys: output.map(itemKey), content: parts }
    const encoded = encryptApiKey(JSON.stringify(replay))
    if (encoded.length > MAX_CONTINUATION_CHARS) throw new Error('CUSTOM_BRIDGE_CONTINUATION_TOO_LARGE')
    const marker = { type: 'reasoning', id: id('rs'), summary: [], encrypted_content: CONTINUATION_PREFIX + encoded }
    emit('response.output_item.added', { output_index: output.length, item: marker })
    emit('response.output_item.done', { output_index: output.length, item: marker })
    output.push(marker)
    const completed = response(finish.finishReason.unified === 'length' ? 'incomplete' : 'completed')
    if (finish.finishReason.unified === 'length') completed.incomplete_details = { reason: 'max_output_tokens' }
    completed.usage = { input_tokens: finish.usage.inputTokens.total ?? 0, output_tokens: finish.usage.outputTokens.total ?? 0,
      total_tokens: (finish.usage.inputTokens.total ?? 0) + (finish.usage.outputTokens.total ?? 0),
      input_tokens_details: { cached_tokens: finish.usage.inputTokens.cacheRead ?? 0 },
      output_tokens_details: { reasoning_tokens: finish.usage.outputTokens.reasoning ?? 0 } }
    emit(finish.finishReason.unified === 'length' ? 'response.incomplete' : 'response.completed', { response: completed })
    terminal = true
  }
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!events.length && !terminal) {
          const next = await reader.read()
          if (next.done) finalize()
          else process(next.value)
        }
      } catch {
        terminal = true
        await reader.cancel().catch(() => undefined)
        emit('response.failed', { response: { ...response('failed'), error: { code: 'server_error', message: 'Custom provider stream failed or ended without a valid terminal result.' } } })
      }
      const event = events.shift()
      if (event) controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: sequence++ })}\n\n`))
      else controller.close()
    },
    cancel(reason) { terminal = true; return reader.cancel(reason) },
  })
  if (input.body.stream !== false) return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
  // The same one upstream request also serves clients requesting a JSON response.
  const text = await new Response(stream).text()
  const last = text.trim().split('\n\n').at(-1)?.split('\n').find((line) => line.startsWith('data: '))
  if (!last) throw new Error('CUSTOM_BRIDGE_RESPONSE_EMPTY')
  const event = JSON.parse(last.slice(6)) as { response: unknown }
  return Response.json(event.response)
}
