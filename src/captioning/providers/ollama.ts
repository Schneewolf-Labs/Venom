/**
 * Ollama VLM Provider for local vision models
 */

import type { Logger } from '../../types.js';
import {
  VlmProvider,
  VlmProviderConfig,
  VlmProviderRegistry,
  type CaptionInput,
  type VlmResponse,
} from '../provider.js';

/**
 * Ollama response types
 */
interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Ollama provider for local vision-language models (LLaVA, etc.)
 */
export class OllamaProvider extends VlmProvider {
  private baseUrl: string;

  constructor(config: VlmProviderConfig, logger: Logger) {
    super(config, logger);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  get name(): string {
    return 'ollama';
  }

  validate(): string[] {
    const errors: string[] = [];

    if (!this.config.model) {
      errors.push('Model is required (e.g., llava, bakllava)');
    }

    return errors;
  }

  async caption(input: CaptionInput, prompt: string): Promise<VlmResponse> {
    this.logger.debug(`Ollama captioning: ${input.url}`);

    // Build context text
    let contextText = prompt;

    if (input.htmlContext) {
      contextText += `\n\n## HTML Context\n${input.htmlContext}`;
    }

    if (input.cssContext) {
      contextText += `\n\n## CSS Context\n${input.cssContext}`;
    }

    contextText += `\n\n## Page Information
- URL: ${input.url}
- Title: ${input.title}
- Description: ${input.description || 'N/A'}
- Load Time: ${input.loadTime}ms
- HTTP Status: ${input.statusCode}`;

    // Build the request payload for Ollama generate endpoint
    const payload = {
      model: this.config.model,
      prompt: contextText,
      images: [input.screenshotBase64],
      stream: false,
      options: {
        num_predict: this.config.maxTokens,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as OllamaResponse;

    if (!data.response) {
      throw new Error('No response from Ollama');
    }

    // Estimate tokens (Ollama provides counts when available)
    const tokensUsed = (data.prompt_eval_count || 0) + (data.eval_count || 0);

    return {
      text: data.response,
      tokensUsed: tokensUsed || Math.ceil(data.response.length / 4), // Rough estimate if not provided
      model: data.model,
    };
  }
}

// Register the provider
VlmProviderRegistry.register('ollama', OllamaProvider);
VlmProviderRegistry.register('llava', OllamaProvider); // Alias
VlmProviderRegistry.register('local', OllamaProvider); // Alias
