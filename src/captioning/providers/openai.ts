/**
 * OpenAI GPT-4 Vision VLM Provider
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
 * OpenAI response types (minimal typing for the API)
 */
interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIChoice {
  message: OpenAIMessage;
  finish_reason: string;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
  model: string;
}

/**
 * OpenAI GPT-4 Vision provider for vision-language captioning
 */
export class OpenAIProvider extends VlmProvider {
  private baseUrl: string;

  constructor(config: VlmProviderConfig, logger: Logger) {
    super(config, logger);
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  get name(): string {
    return 'openai';
  }

  validate(): string[] {
    const errors: string[] = [];

    if (!this.config.apiKey) {
      errors.push('OpenAI API key is required');
    }

    if (!this.config.model) {
      errors.push('Model is required');
    }

    return errors;
  }

  async caption(input: CaptionInput, prompt: string): Promise<VlmResponse> {
    this.logger.debug(`OpenAI captioning: ${input.url}`);

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

    // Build the request payload
    const payload = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${input.mediaType};base64,${input.screenshotBase64}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: contextText,
            },
          ],
        },
      ],
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as OpenAIResponse;

    const textContent = data.choices[0]?.message?.content;
    if (!textContent) {
      throw new Error('No text response from OpenAI');
    }

    return {
      text: textContent,
      tokensUsed: data.usage.total_tokens,
      model: data.model,
    };
  }
}

// Register the provider
VlmProviderRegistry.register('openai', OpenAIProvider);
VlmProviderRegistry.register('gpt4', OpenAIProvider); // Alias
VlmProviderRegistry.register('gpt-4', OpenAIProvider); // Alias
