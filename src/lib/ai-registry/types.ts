import type { InternalLLMStreamStepMeta } from '@/lib/llm-observe/internal-stream-context'
import type { LLMStreamKind } from '@/lib/llm-observe/types'
import type { ChatMessageContent } from '@/lib/ai-registry/message-content'
import { isReasoningEffort, type ReasoningEffort } from '@/lib/ai-registry/reasoning-effort'

export type AiModality = 'llm' | 'vision' | 'image' | 'video' | 'music' | 'voice'
export type AiExecutionMode = 'sync' | 'async' | 'stream' | 'batch'
export type AiVariantSubKind = 'official' | 'user-template'
export type AiLlmProtocol =
  | 'openai-responses'
  | 'openai-compatible-chat'
  | 'openrouter-chat'
  | 'google-generative-ai'
  | 'anthropic-messages'

/** Provider wire verified specifically for Codex custom model providers. */
export type AiCodexRuntimeWireApi = 'responses'

export type AiPublicReasoningMode = 'none' | 'native' | 'summary_auto'

export type AiOptionValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

export interface AiUnknownObject {
  [key: string]: unknown
}

export interface AiReadonlyUnknownObject {
  readonly [key: string]: unknown
}

export type AiOptionValidator = (value: unknown) => AiOptionValidationResult
export type AiOptionObjectValidator = (options: AiReadonlyUnknownObject) => AiOptionValidationResult
export type AiOptionNormalizer = (options: AiReadonlyUnknownObject) => AiUnknownObject

export type AiOptionSchema = {
  allowedKeys: ReadonlySet<string>
  required?: readonly string[]
  requiresOneOf?: ReadonlyArray<{ keys: readonly string[]; message: string }>
  conflicts?: ReadonlyArray<{ keys: readonly string[]; message: string; allowSameValue?: boolean }>
  validators: { readonly [key: string]: AiOptionValidator }
  objectValidators?: readonly AiOptionObjectValidator[]
  normalize?: AiOptionNormalizer
}

export type AiVariantDescriptor = {
  modelKey: string
  providerKey: string
  providerId: string
  modelId: string
  modality: AiModality

  familyRef?: string

  display: {
    name: string
    sourceLabel: string
    label: string
  }

  execution: {
    mode: AiExecutionMode
    externalIdPrefix?: string
  }

  capabilities: ModelCapabilities
  optionSchema: AiOptionSchema
  inputContracts?: AiUnknownObject
}

export type AiResolvedSelection = {
  provider: string
  modelId: string
  modelKey: string
  variantSubKind: AiVariantSubKind
  variantData?: AiUnknownObject
}

export type AiResolvedLlmSelection = AiResolvedSelection

export type AiLlmMessage = {
  role: 'user' | 'assistant' | 'system'
  content: ChatMessageContent
}

export interface AiLlmCallOptions {
  reasoning?: boolean
  reasoningEffort?: ReasoningEffort
  projectId?: string
  action?: string
  openRouterSessionId?: string
  streamStepId?: string
  streamStepAttempt?: number
  streamStepTitle?: string
  streamStepIndex?: number
  streamStepTotal?: number
  __skipAutoStream?: boolean
}

export interface AiLlmStreamCallbacks {
  onStage?: (stage: {
    stage: 'submit' | 'streaming' | 'fallback' | 'completed'
    provider?: string | null
    step?: InternalLLMStreamStepMeta
  }) => void
  onChunk?: (chunk: {
    kind: LLMStreamKind
    delta: string
    seq: number
    lane?: string | null
    step?: InternalLLMStreamStepMeta
  }) => void
  onComplete?: (text: string, step?: InternalLLMStreamStepMeta) => void
  onError?: (error: unknown, step?: InternalLLMStreamStepMeta) => void
}

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: ChatMessageContent }

export type AiStepMeta = {
  stepId: string
  stepAttempt?: number
  stepTitle: string
  stepIndex: number
  stepTotal: number
}

export type AiTextMessages = Array<{
  role: 'user' | 'assistant' | 'system'
  content: ChatMessageContent
}>

export type AiStepExecutionInput = {
  userId: string
  model: string
  messages: AiTextMessages
  projectId?: string
  action: string
  meta: AiStepMeta
  reasoning?: boolean
  reasoningEffort?: ReasoningEffort
}

export type AiStepExecutionResult = AiLlmExecutionResult

export type AiVisionStepExecutionInput = {
  userId: string
  model: string
  prompt: string
  imageUrls: string[]
  projectId?: string
  action?: string
  meta?: AiStepMeta
  reasoning?: boolean
  reasoningEffort?: ReasoningEffort
}

export type AiVisionStepExecutionResult = AiLlmExecutionResult

export type AiLlmProviderConfig = {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
}

export type AiLlmExecutionInput = {
  userId: string
  providerKey: string
  selection: AiResolvedLlmSelection
  providerConfig: AiLlmProviderConfig
  messages: AiLlmMessage[]
  reasoning: boolean
  reasoningEffort: ReasoningEffort
  openRouterSessionId?: string
}

export type AiLlmUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedInputTokens?: number
  cacheWriteTokens?: number
  cacheHitRate?: number
  providerCostCredits?: number
}

export type AiLlmTermination = {
  readonly kind: 'normal' | 'token_limit' | 'safety' | 'tool_call' | 'unknown'
  readonly rawReason: string | null
}

export type AiLlmExecutionResult = {
  schemaVersion: 1
  provider: string
  modelId: string
  text: string
  reasoning: string
  termination: AiLlmTermination
  usage: AiLlmUsage
  response: {
    id?: string
    modelId?: string
    timestamp?: string
  }
  providerMetadata?: AiUnknownObject
}

export type UnifiedModelType = 'llm' | 'image' | 'video' | 'music' | 'voice'
export type CapabilityValue = string | number | boolean
export type CapabilityOptionValue = CapabilityValue
export type CapabilitySelections = Record<string, Record<string, CapabilityValue>>

export type CapabilityValidationCode =
  | 'CAPABILITY_SHAPE_INVALID'
  | 'CAPABILITY_NAMESPACE_INVALID'
  | 'CAPABILITY_FIELD_INVALID'
  | 'CAPABILITY_VALUE_NOT_ALLOWED'

export interface CapabilityValidationIssue {
  code: CapabilityValidationCode
  field: string
  message: string
  allowedValues?: readonly CapabilityOptionValue[]
}

export interface CapabilityFieldI18n {
  labelKey?: string
  unitKey?: string
  optionLabelKeys?: Record<string, string>
}

export type CapabilityFieldI18nMap = Record<string, CapabilityFieldI18n>

export interface LLMCapabilities {
  protocol: AiLlmProtocol
  codexRuntimeWireApi?: AiCodexRuntimeWireApi
  publicReasoningMode?: AiPublicReasoningMode
  reasoningEffortOptions?: ReasoningEffort[]
  /** Product default for this exact model, before a user/platform choice. */
  defaultReasoningEffort?: ReasoningEffort
  /**
   * Total input+output token window the model accepts. Any caller that must
   * bound what it sends reads it from here; deriving a window from a model id,
   * a provider name or a hardcoded constant is what this field exists to stop.
   * Absent means undeclared, and consumers must fail closed rather than assume
   * a default — an assumed window is either wasted context or a hard overflow.
   */
  contextWindow?: number
  fieldI18n?: CapabilityFieldI18nMap
}

export interface ImageCapabilities {
  maxReferenceImages?: number
  resolutionOptions?: string[]
  qualityOptions?: string[]
  fieldI18n?: CapabilityFieldI18nMap
}

export type VideoInputMode =
  | 'text_to_video'
  | 'first_frame'
  | 'first_last_frame'
  | 'reference'

export interface VideoCapabilities {
  firstFrameAspectRatio?: 'selected' | 'adaptive'
  supportedInputModes?: VideoInputMode[]
  supportsTextToVideo?: boolean
  generationModeOptions?: string[]
  generateAudioOptions?: boolean[]
  durationOptions?: number[]
  resolutionOptions?: string[]
  firstlastframe?: boolean
  supportGenerateAudio?: boolean
  assetReferenceMultiReference?: boolean
  maxReferenceImages?: number
  maxReferenceAudios?: number
  maxReferenceVideos?: number
  maxReferenceFiles?: number
  referenceAudioRequiresVisual?: boolean
  minReferenceAudioDurationMs?: number
  maxReferenceAudioDurationMs?: number
  maxTotalReferenceAudioDurationMs?: number
  minReferenceVideoDurationMs?: number
  maxReferenceVideoDurationMs?: number
  minTotalReferenceVideoDurationMs?: number
  maxTotalReferenceVideoDurationMs?: number
  referenceVideoMimeTypes?: string[]
  maxTotalReferenceVideoBytes?: number
  fieldI18n?: CapabilityFieldI18nMap
}

export type MusicGenerationMode = 'prompt' | 'composition_plan'

export interface MusicCompositionPlanCapabilities {
  maxChunks: number
  minChunkDurationMs: number
  maxChunkDurationMs: number
  minPlanDurationMs: number
  maxPlanDurationMs: number
  maxPositiveStyles: number
  maxNegativeStyles: number
  contextAdherenceOptions: Array<'low' | 'medium' | 'high'>
}

export interface MusicCapabilities {
  generationModes?: MusicGenerationMode[]
  compositionPlan?: MusicCompositionPlanCapabilities
  durationSecondsOptions?: number[]
  durationSecondsRange?: {
    min: number
    max: number
  }
  vocalModeOptions?: string[]
  outputFormatOptions?: string[]
  bpmOptions?: number[]
  /**
   * Provider wire limit for one generation prompt, in characters. Absent means
   * the provider publishes no such limit.
   */
  promptMaxChars?: number
  fieldI18n?: CapabilityFieldI18nMap
}

export interface VoiceCapabilities {
  languageOptions?: string[]
  languageMode?: 'explicit' | 'inferred'
  descriptionMinChars?: number
  descriptionMaxChars?: number
  previewTextMinChars?: number
  previewTextMaxChars?: number
  previewSelection?: 'first'
  fieldI18n?: CapabilityFieldI18nMap
}

export interface ModelCapabilities {
  llm?: LLMCapabilities
  image?: ImageCapabilities
  video?: VideoCapabilities
  music?: MusicCapabilities
  voice?: VoiceCapabilities
}

const CAPABILITY_NAMESPACES = new Set<keyof ModelCapabilities>([
  'llm',
  'image',
  'video',
  'music',
  'voice',
])

const LLM_ALLOWED_FIELDS = new Set<keyof LLMCapabilities>([
  'protocol',
  'codexRuntimeWireApi',
  'publicReasoningMode',
  'reasoningEffortOptions',
  'defaultReasoningEffort',
  'contextWindow',
  'fieldI18n',
])

const IMAGE_ALLOWED_FIELDS = new Set<keyof ImageCapabilities>([
  'maxReferenceImages',
  'resolutionOptions',
  'qualityOptions',
  'fieldI18n',
])

const VIDEO_ALLOWED_FIELDS = new Set<keyof VideoCapabilities>([
  'firstFrameAspectRatio',
  'supportedInputModes',
  'supportsTextToVideo',
  'generationModeOptions',
  'generateAudioOptions',
  'durationOptions',
  'resolutionOptions',
  'firstlastframe',
  'supportGenerateAudio',
  'assetReferenceMultiReference',
  'maxReferenceImages',
  'maxReferenceAudios',
  'maxReferenceVideos',
  'maxReferenceFiles',
  'referenceAudioRequiresVisual',
  'minReferenceAudioDurationMs',
  'maxReferenceAudioDurationMs',
  'maxTotalReferenceAudioDurationMs',
  'minReferenceVideoDurationMs',
  'maxReferenceVideoDurationMs',
  'minTotalReferenceVideoDurationMs',
  'maxTotalReferenceVideoDurationMs',
  'referenceVideoMimeTypes',
  'maxTotalReferenceVideoBytes',
  'fieldI18n',
])

const MUSIC_ALLOWED_FIELDS = new Set<keyof MusicCapabilities>([
  'generationModes',
  'compositionPlan',
  'durationSecondsOptions',
  'durationSecondsRange',
  'vocalModeOptions',
  'outputFormatOptions',
  'bpmOptions',
  'promptMaxChars',
  'fieldI18n',
])

const VOICE_ALLOWED_FIELDS = new Set<keyof VoiceCapabilities>([
  'languageOptions',
  'languageMode',
  'descriptionMinChars',
  'descriptionMaxChars',
  'previewTextMinChars',
  'previewTextMaxChars',
  'previewSelection',
  'fieldI18n',
])

function isRecord(value: unknown): value is AiUnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0)
}

function isReasoningEffortArray(value: unknown): value is ReasoningEffort[] {
  return Array.isArray(value) && value.length > 0 && value.every(isReasoningEffort)
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function isBooleanArray(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'boolean')
}

function makeAllowedIssue(
  field: string,
  value: unknown,
  allowedValues: readonly CapabilityOptionValue[],
): CapabilityValidationIssue {
  return {
    code: 'CAPABILITY_VALUE_NOT_ALLOWED',
    field,
    allowedValues,
    message: `Value ${String(value)} is not allowed`,
  }
}

function validateFieldI18nMap(
  issues: CapabilityValidationIssue[],
  namespace: keyof ModelCapabilities,
  rawFieldI18n: unknown,
  allowedFields: Readonly<Record<string, readonly CapabilityOptionValue[] | undefined>>,
) {
  if (rawFieldI18n === undefined) return
  if (!isRecord(rawFieldI18n)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: `capabilities.${namespace}.fieldI18n`,
      message: 'fieldI18n must be an object',
    })
    return
  }

  for (const [field, rawConfig] of Object.entries(rawFieldI18n)) {
    if (!(field in allowedFields)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${namespace}.fieldI18n.${field}`,
        message: `Unknown i18n field: ${field}`,
      })
      continue
    }

    if (!isRecord(rawConfig)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${namespace}.fieldI18n.${field}`,
        message: 'field i18n config must be an object',
      })
      continue
    }

    if (rawConfig.labelKey !== undefined && !isNonEmptyString(rawConfig.labelKey)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${namespace}.fieldI18n.${field}.labelKey`,
        message: 'labelKey must be a non-empty string',
      })
    }

    if (rawConfig.unitKey !== undefined && !isNonEmptyString(rawConfig.unitKey)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${namespace}.fieldI18n.${field}.unitKey`,
        message: 'unitKey must be a non-empty string',
      })
    }

    if (rawConfig.optionLabelKeys !== undefined) {
      if (!isRecord(rawConfig.optionLabelKeys)) {
        issues.push({
          code: 'CAPABILITY_FIELD_INVALID',
          field: `capabilities.${namespace}.fieldI18n.${field}.optionLabelKeys`,
          message: 'optionLabelKeys must be an object',
        })
        continue
      }

      const allowedOptionKeys = new Set((allowedFields[field] || []).map((value) => String(value)))
      for (const [optionKey, optionLabel] of Object.entries(rawConfig.optionLabelKeys)) {
        if (!isNonEmptyString(optionLabel)) {
          issues.push({
            code: 'CAPABILITY_FIELD_INVALID',
            field: `capabilities.${namespace}.fieldI18n.${field}.optionLabelKeys.${optionKey}`,
            message: 'option label must be a non-empty string',
          })
        }
        if (allowedOptionKeys.size > 0 && !allowedOptionKeys.has(optionKey)) {
          issues.push({
            code: 'CAPABILITY_VALUE_NOT_ALLOWED',
            field: `capabilities.${namespace}.fieldI18n.${field}.optionLabelKeys.${optionKey}`,
            message: `Option key ${optionKey} is not defined in ${field}Options`,
            allowedValues: Array.from(allowedOptionKeys),
          })
        }
      }
    }
  }
}

function validateNamespaceShape(
  issues: CapabilityValidationIssue[],
  namespace: keyof ModelCapabilities,
  value: unknown,
) {
  if (value === undefined) return
  if (!isRecord(value)) {
    issues.push({
      code: 'CAPABILITY_SHAPE_INVALID',
      field: `capabilities.${namespace}`,
      message: `capabilities.${namespace} must be an object`,
    })
  }
}

function validateNamespaceAllowedFields(
  issues: CapabilityValidationIssue[],
  namespace: keyof ModelCapabilities,
  value: unknown,
  allowedFields: ReadonlySet<string>,
) {
  if (!isRecord(value)) return
  for (const field of Object.keys(value)) {
    if (allowedFields.has(field)) continue
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: `capabilities.${namespace}.${field}`,
      message: field === 'i18n'
        ? 'Use fieldI18n instead of i18n'
        : `Unknown capability field: ${field}`,
    })
  }
}

function validateLLMCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return
  const protocol = raw.protocol
  const allowedProtocols: readonly AiLlmProtocol[] = [
    'openai-responses',
    'openai-compatible-chat',
    'openrouter-chat',
    'google-generative-ai',
    'anthropic-messages',
  ]
  if (!allowedProtocols.includes(protocol as AiLlmProtocol)) {
    issues.push(makeAllowedIssue('capabilities.llm.protocol', protocol, allowedProtocols))
  }
  if (
    raw.codexRuntimeWireApi !== undefined
    && raw.codexRuntimeWireApi !== 'responses'
  ) {
    issues.push(makeAllowedIssue(
      'capabilities.llm.codexRuntimeWireApi',
      raw.codexRuntimeWireApi,
      ['responses'],
    ))
  }
  const publicReasoningModes: readonly AiPublicReasoningMode[] = [
    'none',
    'native',
    'summary_auto',
  ]
  if (
    raw.publicReasoningMode !== undefined
    && !publicReasoningModes.includes(raw.publicReasoningMode as AiPublicReasoningMode)
  ) {
    issues.push(makeAllowedIssue(
      'capabilities.llm.publicReasoningMode',
      raw.publicReasoningMode,
      publicReasoningModes,
    ))
  }
  const options = raw.reasoningEffortOptions
  const normalizedOptions = isReasoningEffortArray(options) ? options : undefined
  if (options !== undefined && !normalizedOptions) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.llm.reasoningEffortOptions',
      message: 'reasoningEffortOptions must contain only canonical reasoning effort values',
    })
  }

  if (normalizedOptions || raw.defaultReasoningEffort !== undefined) {
    if (!isReasoningEffort(raw.defaultReasoningEffort)
      || !normalizedOptions?.includes(raw.defaultReasoningEffort)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: 'capabilities.llm.defaultReasoningEffort',
        message: 'defaultReasoningEffort must be explicitly declared within reasoningEffortOptions',
      })
    }
  }

  const contextWindow = raw.contextWindow
  if (
    contextWindow !== undefined
    && (typeof contextWindow !== 'number'
      || !Number.isSafeInteger(contextWindow)
      || contextWindow <= 0)
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.llm.contextWindow',
      message: 'contextWindow must be a positive integer token count',
    })
  }

  validateFieldI18nMap(issues, 'llm', raw.fieldI18n, {
    reasoningEffort: normalizedOptions,
  })
}

function validateImageCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return

  if (raw.maxReferenceImages !== undefined && (!Number.isInteger(raw.maxReferenceImages) || (raw.maxReferenceImages as number) < 0)) {
    issues.push({ code: 'CAPABILITY_FIELD_INVALID', field: 'capabilities.image.maxReferenceImages', message: 'maxReferenceImages must be a non-negative integer' })
  }
  const resolutionOptions = raw.resolutionOptions
  if (resolutionOptions !== undefined && !isStringArray(resolutionOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.image.resolutionOptions',
      message: 'resolutionOptions must be a non-empty string array',
    })
  }

  const qualityOptions = raw.qualityOptions
  if (qualityOptions !== undefined && !isStringArray(qualityOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.image.qualityOptions',
      message: 'qualityOptions must be a non-empty string array',
    })
  }

  validateFieldI18nMap(issues, 'image', raw.fieldI18n, {
    resolution: isStringArray(resolutionOptions) ? resolutionOptions : undefined,
    quality: isStringArray(qualityOptions) ? qualityOptions : undefined,
  })
}

function validateVideoCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return
  if (raw.firstFrameAspectRatio !== undefined && raw.firstFrameAspectRatio !== 'selected' && raw.firstFrameAspectRatio !== 'adaptive') {
    issues.push({ code: 'CAPABILITY_FIELD_INVALID', field: 'capabilities.video.firstFrameAspectRatio', message: 'firstFrameAspectRatio must be selected or adaptive' })
  }

  const supportedInputModes = raw.supportedInputModes
  const validInputModes = new Set<VideoInputMode>([
    'text_to_video',
    'first_frame',
    'first_last_frame',
    'reference',
  ])
  if (
    supportedInputModes !== undefined
    && (
      !isStringArray(supportedInputModes)
      || supportedInputModes.some((mode) => !validInputModes.has(mode as VideoInputMode))
      || new Set(supportedInputModes).size !== supportedInputModes.length
    )
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.supportedInputModes',
      message: 'supportedInputModes must contain unique canonical video input modes',
    })
  }

  if (raw.supportsTextToVideo !== undefined && typeof raw.supportsTextToVideo !== 'boolean') {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.supportsTextToVideo',
      message: 'supportsTextToVideo must be boolean',
    })
  }

  const generationModeOptions = raw.generationModeOptions
  if (generationModeOptions !== undefined && !isStringArray(generationModeOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.generationModeOptions',
      message: 'generationModeOptions must be a non-empty string array',
    })
  }

  const generateAudioOptions = raw.generateAudioOptions
  if (generateAudioOptions !== undefined && !isBooleanArray(generateAudioOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.generateAudioOptions',
      message: 'generateAudioOptions must be a boolean array',
    })
  }

  const durationOptions = raw.durationOptions
  if (durationOptions !== undefined && !isNumberArray(durationOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.durationOptions',
      message: 'durationOptions must be a finite number array',
    })
  }

  const resolutionOptions = raw.resolutionOptions
  if (resolutionOptions !== undefined && !isStringArray(resolutionOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.resolutionOptions',
      message: 'resolutionOptions must be a non-empty string array',
    })
  }

  if (raw.supportGenerateAudio !== undefined && typeof raw.supportGenerateAudio !== 'boolean') {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.supportGenerateAudio',
      message: 'supportGenerateAudio must be boolean',
    })
  }

  if (raw.firstlastframe !== undefined && typeof raw.firstlastframe !== 'boolean') {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.firstlastframe',
      message: 'firstlastframe must be boolean',
    })
  }

  if (raw.assetReferenceMultiReference !== undefined && typeof raw.assetReferenceMultiReference !== 'boolean') {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.assetReferenceMultiReference',
      message: 'assetReferenceMultiReference must be boolean',
    })
  }

  if (
    raw.maxReferenceImages !== undefined
    && (!Number.isInteger(raw.maxReferenceImages) || (raw.maxReferenceImages as number) <= 0)
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.maxReferenceImages',
      message: 'maxReferenceImages must be a positive integer',
    })
  }

  if (
    raw.maxReferenceAudios !== undefined
    && (!Number.isInteger(raw.maxReferenceAudios) || (raw.maxReferenceAudios as number) <= 0)
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.maxReferenceAudios',
      message: 'maxReferenceAudios must be a positive integer',
    })
  }

  if (
    raw.maxReferenceVideos !== undefined
    && (!Number.isInteger(raw.maxReferenceVideos) || (raw.maxReferenceVideos as number) <= 0)
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.maxReferenceVideos',
      message: 'maxReferenceVideos must be a positive integer',
    })
  }

  if (
    raw.maxReferenceFiles !== undefined
    && (!Number.isInteger(raw.maxReferenceFiles) || (raw.maxReferenceFiles as number) <= 0)
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.maxReferenceFiles',
      message: 'maxReferenceFiles must be a positive integer',
    })
  }

  if (
    raw.referenceAudioRequiresVisual !== undefined
    && typeof raw.referenceAudioRequiresVisual !== 'boolean'
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.referenceAudioRequiresVisual',
      message: 'referenceAudioRequiresVisual must be boolean',
    })
  }

  for (const field of [
    'minReferenceAudioDurationMs', 'maxReferenceAudioDurationMs', 'maxTotalReferenceAudioDurationMs',
    'minReferenceVideoDurationMs', 'maxReferenceVideoDurationMs', 'minTotalReferenceVideoDurationMs', 'maxTotalReferenceVideoDurationMs',
    'maxTotalReferenceVideoBytes',
  ] as const) {
    const value = raw[field]
    if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.video.${field}`,
        message: `${field} must be a positive integer`,
      })
    }
  }

  if (raw.referenceVideoMimeTypes !== undefined && (!isStringArray(raw.referenceVideoMimeTypes)
    || raw.referenceVideoMimeTypes.length === 0
    || raw.referenceVideoMimeTypes.some((mimeType) => !mimeType.startsWith('video/')))) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.referenceVideoMimeTypes',
      message: 'referenceVideoMimeTypes must contain video MIME types',
    })
  }

  validateFieldI18nMap(issues, 'video', raw.fieldI18n, {
    generationMode: isStringArray(generationModeOptions) ? generationModeOptions : undefined,
    generateAudio: isBooleanArray(generateAudioOptions) ? generateAudioOptions : undefined,
    duration: isNumberArray(durationOptions) ? durationOptions : undefined,
    resolution: isStringArray(resolutionOptions) ? resolutionOptions : undefined,
  })
}

function validateMusicCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return

  const generationModes = raw.generationModes
  const allowedGenerationModes: readonly MusicGenerationMode[] = ['prompt', 'composition_plan']
  if (
    generationModes !== undefined
    && (!isStringArray(generationModes)
      || generationModes.some((mode) => !allowedGenerationModes.includes(mode as MusicGenerationMode)))
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.music.generationModes',
      message: 'generationModes must contain only prompt or composition_plan',
      allowedValues: allowedGenerationModes,
    })
  }

  const compositionPlan = raw.compositionPlan
  if (compositionPlan !== undefined) {
    if (!isRecord(compositionPlan)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: 'capabilities.music.compositionPlan',
        message: 'compositionPlan must be an object',
      })
    } else {
      const requiredPositiveIntegers = [
        'maxChunks',
        'minChunkDurationMs',
        'maxChunkDurationMs',
        'minPlanDurationMs',
        'maxPlanDurationMs',
        'maxPositiveStyles',
        'maxNegativeStyles',
      ] as const
      for (const field of requiredPositiveIntegers) {
        const value = compositionPlan[field]
        if (!Number.isSafeInteger(value) || (value as number) <= 0) {
          issues.push({
            code: 'CAPABILITY_FIELD_INVALID',
            field: `capabilities.music.compositionPlan.${field}`,
            message: `${field} must be a positive integer`,
          })
        }
      }
      if (
        typeof compositionPlan.minChunkDurationMs === 'number'
        && typeof compositionPlan.maxChunkDurationMs === 'number'
        && compositionPlan.maxChunkDurationMs < compositionPlan.minChunkDurationMs
      ) {
        issues.push({
          code: 'CAPABILITY_FIELD_INVALID',
          field: 'capabilities.music.compositionPlan.maxChunkDurationMs',
          message: 'maxChunkDurationMs must be >= minChunkDurationMs',
        })
      }
      if (
        typeof compositionPlan.minPlanDurationMs === 'number'
        && typeof compositionPlan.maxPlanDurationMs === 'number'
        && compositionPlan.maxPlanDurationMs < compositionPlan.minPlanDurationMs
      ) {
        issues.push({
          code: 'CAPABILITY_FIELD_INVALID',
          field: 'capabilities.music.compositionPlan.maxPlanDurationMs',
          message: 'maxPlanDurationMs must be >= minPlanDurationMs',
        })
      }
      const adherenceOptions = compositionPlan.contextAdherenceOptions
      if (
        !isStringArray(adherenceOptions)
        || adherenceOptions.some((value) => !['low', 'medium', 'high'].includes(value))
      ) {
        issues.push({
          code: 'CAPABILITY_FIELD_INVALID',
          field: 'capabilities.music.compositionPlan.contextAdherenceOptions',
          message: 'contextAdherenceOptions must contain only low, medium, or high',
          allowedValues: ['low', 'medium', 'high'],
        })
      }
    }
  }

  if (
    Array.isArray(generationModes)
    && generationModes.includes('composition_plan')
    && compositionPlan === undefined
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.music.compositionPlan',
      message: 'compositionPlan capabilities are required when composition_plan is supported',
    })
  }

  const durationSecondsOptions = raw.durationSecondsOptions
  if (durationSecondsOptions !== undefined && !isNumberArray(durationSecondsOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.music.durationSecondsOptions',
      message: 'durationSecondsOptions must be a finite number array',
    })
  }

  const durationSecondsRange = raw.durationSecondsRange
  if (durationSecondsRange !== undefined) {
    const validRange = isRecord(durationSecondsRange)
      && typeof durationSecondsRange.min === 'number'
      && Number.isFinite(durationSecondsRange.min)
      && durationSecondsRange.min > 0
      && typeof durationSecondsRange.max === 'number'
      && Number.isFinite(durationSecondsRange.max)
      && durationSecondsRange.max >= durationSecondsRange.min
    if (!validRange) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: 'capabilities.music.durationSecondsRange',
        message: 'durationSecondsRange must contain finite positive min/max values with max >= min',
      })
    }
  }

  const vocalModeOptions = raw.vocalModeOptions
  if (vocalModeOptions !== undefined && !isStringArray(vocalModeOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.music.vocalModeOptions',
      message: 'vocalModeOptions must be a non-empty string array',
    })
  }

  const outputFormatOptions = raw.outputFormatOptions
  if (outputFormatOptions !== undefined && !isStringArray(outputFormatOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.music.outputFormatOptions',
      message: 'outputFormatOptions must be a non-empty string array',
    })
  }

  const bpmOptions = raw.bpmOptions
  if (bpmOptions !== undefined && !isNumberArray(bpmOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.music.bpmOptions',
      message: 'bpmOptions must be a finite number array',
    })
  }

  if (
    raw.promptMaxChars !== undefined
    && (!Number.isInteger(raw.promptMaxChars) || (raw.promptMaxChars as number) <= 0)
  ) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.music.promptMaxChars',
      message: 'promptMaxChars must be a positive integer',
    })
  }

  validateFieldI18nMap(issues, 'music', raw.fieldI18n, {
    durationSeconds: isNumberArray(durationSecondsOptions) ? durationSecondsOptions : undefined,
    vocalMode: isStringArray(vocalModeOptions) ? vocalModeOptions : undefined,
    outputFormat: isStringArray(outputFormatOptions) ? outputFormatOptions : undefined,
    bpm: isNumberArray(bpmOptions) ? bpmOptions : undefined,
  })
}

function validateVoiceCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return

  for (const field of ['descriptionMinChars', 'descriptionMaxChars', 'previewTextMinChars', 'previewTextMaxChars'] as const) {
    const value = raw[field]
    if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) {
      issues.push({ code: 'CAPABILITY_FIELD_INVALID', field: `capabilities.voice.${field}`, message: 'Character limit must be a positive integer' })
    }
  }
  for (const [minField, maxField] of [['descriptionMinChars', 'descriptionMaxChars'], ['previewTextMinChars', 'previewTextMaxChars']] as const) {
    const min = raw[minField]
    const max = raw[maxField]
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      issues.push({ code: 'CAPABILITY_FIELD_INVALID', field: `capabilities.voice.${maxField}`, message: 'Maximum must not be smaller than minimum' })
    }
  }
  if (raw.languageMode !== undefined && raw.languageMode !== 'explicit' && raw.languageMode !== 'inferred') {
    issues.push({ code: 'CAPABILITY_FIELD_INVALID', field: 'capabilities.voice.languageMode', message: 'Unsupported language mode' })
  }
  if (raw.previewSelection !== undefined && raw.previewSelection !== 'first') {
    issues.push({ code: 'CAPABILITY_FIELD_INVALID', field: 'capabilities.voice.previewSelection', message: 'Unsupported preview selection' })
  }

  const languageOptions = raw.languageOptions
  if (languageOptions !== undefined && !isStringArray(languageOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.voice.languageOptions',
      message: 'languageOptions must be a non-empty string array',
    })
  }

  validateFieldI18nMap(issues, 'voice', raw.fieldI18n, {
    language: isStringArray(languageOptions) ? languageOptions : undefined,
  })
}

function validateOptionFieldValue(
  fieldPath: string,
  value: unknown,
  allowedValues: readonly CapabilityOptionValue[],
): CapabilityValidationIssue | null {
  if (!allowedValues.includes(value as CapabilityOptionValue)) {
    return makeAllowedIssue(fieldPath, value, allowedValues)
  }
  return null
}

export function validateOptionValueAgainstAllowed(
  fieldPath: string,
  value: unknown,
  allowedValues: readonly CapabilityOptionValue[],
): CapabilityValidationIssue[] {
  const issue = validateOptionFieldValue(fieldPath, value, allowedValues)
  return issue ? [issue] : []
}

export function validateModelCapabilities(
  modelType: UnifiedModelType,
  capabilities: unknown,
): CapabilityValidationIssue[] {
  const issues: CapabilityValidationIssue[] = []
  const expectedNamespace: keyof ModelCapabilities = modelType

  if (capabilities === undefined || capabilities === null) return issues
  if (!isRecord(capabilities)) {
    issues.push({
      code: 'CAPABILITY_SHAPE_INVALID',
      field: 'capabilities',
      message: 'capabilities must be an object',
    })
    return issues
  }

  for (const namespace of Object.keys(capabilities)) {
    if (!CAPABILITY_NAMESPACES.has(namespace as keyof ModelCapabilities)) {
      issues.push({
        code: 'CAPABILITY_NAMESPACE_INVALID',
        field: `capabilities.${namespace}`,
        message: `Unknown capabilities namespace: ${namespace}`,
      })
      continue
    }

    if (namespace !== expectedNamespace) {
      issues.push({
        code: 'CAPABILITY_NAMESPACE_INVALID',
        field: `capabilities.${namespace}`,
        allowedValues: [expectedNamespace],
        message: `Namespace ${namespace} is not allowed for model type ${modelType}`,
      })
    }
  }

  validateNamespaceShape(issues, 'llm', (capabilities as ModelCapabilities).llm)
  validateNamespaceShape(issues, 'image', (capabilities as ModelCapabilities).image)
  validateNamespaceShape(issues, 'video', (capabilities as ModelCapabilities).video)
  validateNamespaceShape(issues, 'music', (capabilities as ModelCapabilities).music)
  validateNamespaceShape(issues, 'voice', (capabilities as ModelCapabilities).voice)

  validateNamespaceAllowedFields(issues, 'llm', (capabilities as ModelCapabilities).llm, LLM_ALLOWED_FIELDS)
  validateNamespaceAllowedFields(issues, 'image', (capabilities as ModelCapabilities).image, IMAGE_ALLOWED_FIELDS)
  validateNamespaceAllowedFields(issues, 'video', (capabilities as ModelCapabilities).video, VIDEO_ALLOWED_FIELDS)
  validateNamespaceAllowedFields(issues, 'music', (capabilities as ModelCapabilities).music, MUSIC_ALLOWED_FIELDS)
  validateNamespaceAllowedFields(issues, 'voice', (capabilities as ModelCapabilities).voice, VOICE_ALLOWED_FIELDS)

  validateLLMCapabilities(issues, (capabilities as ModelCapabilities).llm)
  validateImageCapabilities(issues, (capabilities as ModelCapabilities).image)
  validateVideoCapabilities(issues, (capabilities as ModelCapabilities).video)
  validateMusicCapabilities(issues, (capabilities as ModelCapabilities).music)
  validateVoiceCapabilities(issues, (capabilities as ModelCapabilities).voice)

  return issues
}
