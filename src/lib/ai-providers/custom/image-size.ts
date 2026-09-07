export const CUSTOM_IMAGE_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'] as const
export const CUSTOM_IMAGE_RESOLUTIONS = ['1024', '1536', '2048', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'] as const

/** Pixel strings are sent literally. A numeric long edge preserves the requested ratio in multiples of 8. */
export function customImageSize(input: { size?: string; resolution?: string; aspectRatio?: string }): string | undefined {
  if (input.size && input.resolution) throw new Error('CUSTOM_IMAGE_SIZE_AND_RESOLUTION_CONFLICT')
  const requested = input.size ?? input.resolution
  if (requested && /^\d+x\d+$/.test(requested)) return requested
  if (!requested && !input.aspectRatio) return undefined
  const longEdge = Number(requested ?? '1024')
  if (![1024, 1536, 2048].includes(longEdge)) throw new Error('CUSTOM_IMAGE_RESOLUTION_UNSUPPORTED')
  const ratio = input.aspectRatio ?? '1:1'
  if (!(CUSTOM_IMAGE_RATIOS as readonly string[]).includes(ratio)) throw new Error('CUSTOM_IMAGE_ASPECT_RATIO_UNSUPPORTED')
  const [width, height] = ratio.split(':').map(Number)
  const unit = Math.floor(longEdge / (Math.max(width, height) * 8)) * 8
  return `${width * unit}x${height * unit}`
}
