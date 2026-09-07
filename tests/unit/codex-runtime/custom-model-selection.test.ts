import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCodexModelGatewayUpstream } from '@/lib/codex-model-gateway/selection'

const mock = vi.hoisted(() => ({ selection: vi.fn(), config: vi.fn(), provider: vi.fn() }))
vi.mock('@/lib/ai-exec/llm-runtime', () => ({ resolveLlmRuntimeModel: mock.selection }))
vi.mock('@/lib/config-service', () => ({ getUserModelConfig: mock.config }))
vi.mock('@/lib/user-api/runtime-config', () => ({ getProviderConfig: mock.provider }))

beforeEach(() => {
  mock.config.mockResolvedValue({ assistantModel: 'selected' })
  mock.provider.mockResolvedValue({ apiKey: 'test-key', baseUrl: 'https://api.example/v1' })
})
describe('custom models are selectable by the main assistant gateway', () => {
  it.each(['openai-compatible', 'openai-responses', 'anthropic-compatible', 'gemini-compatible'])('accepts %s instances without changing arbitrary model IDs', async (provider) => {
    mock.selection.mockResolvedValue({ provider: `${provider}:one`, modelId: 'openai/my-custom-id', modelKey: `${provider}:one::openai/my-custom-id` })
    const result = await resolveCodexModelGatewayUpstream({ userId: 'unit-user', projectId: 'project', assistantId: 'workspace-command' })
    expect(result).toMatchObject({ runtimeModelId: 'openai/my-custom-id', modelId: 'openai/my-custom-id', providerKey: provider })
    expect(mock.provider).toHaveBeenLastCalledWith('unit-user', `${provider}:one`)
  })
  it('does not advertise an image-only provider as an assistant model', async () => {
    mock.selection.mockResolvedValue({ provider: 'openai-images:one', modelId: 'image-model', modelKey: 'openai-images:one::image-model' })
    await expect(resolveCodexModelGatewayUpstream({ userId: 'unit-user', projectId: 'project', assistantId: 'workspace-command' }))
      .rejects.toMatchObject({ code: 'PROVIDER_RESPONSES_UNSUPPORTED' })
  })
})
