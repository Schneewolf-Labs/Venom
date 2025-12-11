/**
 * Captioning module exports
 */

export { Captioner, DEFAULT_PROMPT, type CaptionerConfig } from './captioner.js';
export {
  VlmProvider,
  VlmProviderRegistry,
  type VlmProviderConfig,
  type CaptionInput,
  type VlmResponse,
} from './provider.js';

// Export individual providers
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export { OllamaProvider } from './providers/ollama.js';
