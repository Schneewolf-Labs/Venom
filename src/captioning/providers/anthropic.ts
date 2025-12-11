/**
 * Anthropic Claude VLM Provider
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Logger } from '../../types.js';
import {
  VlmProvider,
  VlmProviderConfig,
  VlmProviderRegistry,
  type CaptionInput,
  type VlmResponse,
} from '../provider.js';

/**
 * Anthropic Claude provider for vision-language captioning
 */
export class AnthropicProvider extends VlmProvider {
  private client: Anthropic;

  constructor(config: VlmProviderConfig, logger: Logger) {
    super(config, logger);

    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl && { baseURL: config.baseUrl }),
    });
  }

  get name(): string {
    return 'anthropic';
  }

  validate(): string[] {
    const errors: string[] = [];

    if (!this.config.apiKey) {
      errors.push('Anthropic API key is required');
    }

    if (!this.config.model) {
      errors.push('Model is required');
    }

    return errors;
  }

  async caption(input: CaptionInput, prompt: string): Promise<VlmResponse> {
    this.logger.debug(`Anthropic captioning: ${input.url}`);

    // Build the message content
    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    // Add the screenshot image
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.mediaType,
        data: input.screenshotBase64,
      },
    });

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

    content.push({
      type: 'text',
      text: contextText,
    });

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    });

    // Extract the text response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Anthropic');
    }

    return {
      text: textBlock.text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: this.config.model,
    };
  }
}

// Register the provider
VlmProviderRegistry.register('anthropic', AnthropicProvider);
VlmProviderRegistry.register('claude', AnthropicProvider); // Alias
