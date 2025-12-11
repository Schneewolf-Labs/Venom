/**
 * Abstract VLM Provider interface for pluggable captioning backends
 */

import type { CaptionResult, Logger } from '../types.js';

/**
 * Input for captioning request
 */
export interface CaptionInput {
  /** Base64 encoded screenshot image */
  screenshotBase64: string;
  /** Image media type */
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  /** Page URL */
  url: string;
  /** Page title */
  title: string;
  /** Page meta description */
  description?: string;
  /** HTML context summary */
  htmlContext?: string;
  /** CSS context summary */
  cssContext?: string;
  /** HTTP status code */
  statusCode: number;
  /** Page load time in ms */
  loadTime: number;
}

/**
 * Raw response from VLM provider
 */
export interface VlmResponse {
  /** Raw text response */
  text: string;
  /** Tokens used (input + output) */
  tokensUsed: number;
  /** Model that was used */
  model: string;
}

/**
 * Configuration for VLM providers
 */
export interface VlmProviderConfig {
  /** API key */
  apiKey: string;
  /** Model identifier */
  model: string;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Optional base URL for API */
  baseUrl?: string;
  /** Optional additional headers */
  headers?: Record<string, string>;
}

/**
 * Abstract base class for VLM providers
 */
export abstract class VlmProvider {
  protected config: VlmProviderConfig;
  protected logger: Logger;

  constructor(config: VlmProviderConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Provider name identifier
   */
  abstract get name(): string;

  /**
   * Send a captioning request to the VLM
   */
  abstract caption(input: CaptionInput, prompt: string): Promise<VlmResponse>;

  /**
   * Check if the provider is properly configured
   */
  abstract validate(): string[];

  /**
   * Parse VLM response into structured caption result
   */
  parseResponse(response: VlmResponse): CaptionResult {
    const text = response.text;

    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          caption: parsed.caption || text,
          visualElements: Array.isArray(parsed.visualElements)
            ? parsed.visualElements
            : [],
          pageType: parsed.pageType || 'unknown',
          confidence: typeof parsed.confidence === 'number'
            ? parsed.confidence
            : 0.8,
          model: response.model,
          timestamp: new Date(),
          tokensUsed: response.tokensUsed,
        };
      }
    } catch {
      // JSON parsing failed
    }

    // Fallback: use the raw text as caption
    return {
      caption: text.slice(0, 1000),
      visualElements: [],
      pageType: 'unknown',
      confidence: 0.5,
      model: response.model,
      timestamp: new Date(),
      tokensUsed: response.tokensUsed,
    };
  }
}

/**
 * Registry for VLM providers
 */
export class VlmProviderRegistry {
  private static providers = new Map<string, new (config: VlmProviderConfig, logger: Logger) => VlmProvider>();

  /**
   * Register a provider class
   */
  static register(name: string, providerClass: new (config: VlmProviderConfig, logger: Logger) => VlmProvider): void {
    this.providers.set(name.toLowerCase(), providerClass);
  }

  /**
   * Get a provider by name
   */
  static get(name: string): (new (config: VlmProviderConfig, logger: Logger) => VlmProvider) | undefined {
    return this.providers.get(name.toLowerCase());
  }

  /**
   * List registered providers
   */
  static list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create a provider instance
   */
  static create(name: string, config: VlmProviderConfig, logger: Logger): VlmProvider {
    const ProviderClass = this.get(name);
    if (!ProviderClass) {
      throw new Error(`Unknown VLM provider: ${name}. Available: ${this.list().join(', ')}`);
    }
    return new ProviderClass(config, logger);
  }
}
