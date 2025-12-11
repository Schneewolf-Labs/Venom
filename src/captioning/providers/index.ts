/**
 * VLM Provider exports
 *
 * Import this file to register all built-in providers
 */

// Import providers to trigger registration
import './anthropic.js';
import './openai.js';
import './ollama.js';

// Re-export for convenience
export { AnthropicProvider } from './anthropic.js';
export { OpenAIProvider } from './openai.js';
export { OllamaProvider } from './ollama.js';
