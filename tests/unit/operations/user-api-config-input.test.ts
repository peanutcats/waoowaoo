import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createUserApiConfigOperations } from '@/lib/operations/domains/config/user-api-config-ops'

vi.mock('@/lib/user-api/api-config', () => ({
  getUserApiConfig: vi.fn(),
  putUserApiConfig: vi.fn(),
}))

const schema = createUserApiConfigOperations().put_user_api_config.inputSchema

describe('API configuration save operation input', () => {
  it.each([
    'openai-compatible:connection-a::Ali/deepseek-v4-flash-0731',
    'openai-responses:connection-b::provider/model:revision',
    'anthropic-compatible:connection-c::claude-model',
    'gemini-compatible:connection-d::gemini-model',
    'openrouter::provider/model',
    '',
  ])('accepts a selected Assistant model through the save boundary: %s', (assistantModel) => {
    const input = { defaultModels: { assistantModel } }
    expect(schema.safeParse(input)).toEqual({ success: true, data: input })
    // The operation also publishes JSON Schema to clients: keep both boundaries consistent.
    if (!(schema instanceof z.ZodType)) throw new Error('Expected a Zod operation schema')
    const jsonSchema = z.toJSONSchema(schema) as unknown as {
      properties: { defaultModels: { properties: { assistantModel: { pattern: string } } } }
    }
    expect(new RegExp(jsonSchema.properties.defaultModels.properties.assistantModel.pattern).test(assistantModel)).toBe(true)
  })

  it.each(['model-only', 'openai-compatible:connection:model', '::model', 'provider::', 'provider:instance::'])(
    'rejects an invalid model identity: %s', (assistantModel) => {
      expect(schema.safeParse({ defaultModels: { assistantModel } }).success).toBe(false)
    },
  )
})
