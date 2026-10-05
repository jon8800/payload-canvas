// `@payload-toolkit/builder/ai`: the AiAdapter and AiImageAdapter interfaces and helpers for writing your own adapter.
// The built-in adapters have their own entry points (`/ai/openrouter`, `/ai/anthropic`, …), so a
// site loads only the one it uses. See the README, "AI adapters".
export type {
  AiAdapter,
  AiChatRequest,
  AiClientConfig,
  AiContentBlock,
  AiEffort,
  AiGeneratedImage,
  AiImageAdapter,
  AiImageAspectRatio,
  AiImageLimits,
  AiImageRequest,
  AiImageResult,
  AiImagesClientConfig,
  AiImageUsage,
  AiMessage,
  AiModelEvent,
  AiModelRequest,
  AiOptions,
  AiStopReason,
  AiStreamEvent,
  AiSystemPart,
  AiToolDefinition,
  AiToolImage,
  AiUsage,
} from './types'
export { adapterIdentity } from './loop'
export {
  AiImageError,
  closestRatio,
  decodeImageData,
  IMAGE_ASPECT_RATIOS,
  imageSize,
  isAspectRatio,
  sizeForRatio,
  sniffImageType,
  toGeneratedImage,
  type AiImageErrorCode,
} from './images/shared'
export {
  chatTools,
  createOpenAIFormatAdapter,
  parseArguments,
  portableSchema,
  toChatMessages,
  type ChatMessage,
  type ChatTool,
  type OpenAIFormatAdapterOptions,
  type OpenAIFormatTransportOptions,
} from './openai-format'
