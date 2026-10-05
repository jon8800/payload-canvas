// `@payload-toolkit/builder/ai`: the AiAdapter interface and helpers for writing your own adapter.
// The built-in adapters have their own entry points (`/ai/openrouter`, `/ai/anthropic`, …), so a
// site loads only the one it uses. See the README, "AI adapters".
export type {
  AiAdapter,
  AiChatRequest,
  AiClientConfig,
  AiContentBlock,
  AiEffort,
  AiMessage,
  AiModelEvent,
  AiModelRequest,
  AiOptions,
  AiStopReason,
  AiStreamEvent,
  AiSystemPart,
  AiToolDefinition,
  AiUsage,
} from './types'
export { adapterIdentity } from './loop'
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
