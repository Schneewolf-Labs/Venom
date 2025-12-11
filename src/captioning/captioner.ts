/**
 * VLM (Vision Language Model) captioning service
 *
 * This module provides a provider-agnostic interface for generating
 * captions using various VLM backends (Anthropic, OpenAI, Ollama, etc.)
 */

import type {
  PageCapture,
  CaptionResult,
  Logger,
} from '../types.js';
import { FilesystemManager } from '../storage/filesystem.js';
import {
  VlmProvider,
  VlmProviderConfig,
  VlmProviderRegistry,
  type CaptionInput,
} from './provider.js';

// Import providers to register them
import './providers/index.js';

/**
 * Default prompt template for captioning
 */
export const DEFAULT_PROMPT = `You are analyzing a screenshot of a web page along with its HTML structure and CSS styling.

Please provide a detailed caption that describes:

1. **Page Type**: What type of page is this? (e.g., homepage, article, product page, login form, dashboard, etc.)

2. **Visual Layout**: Describe the overall visual structure and layout of the page. What are the main sections?

3. **Key Visual Elements**: List the most important visual elements you can identify (headers, navigation, images, buttons, forms, etc.)

4. **Content Summary**: Briefly summarize what content or information is being presented.

5. **Design Style**: Describe the visual design style (modern, minimalist, corporate, playful, etc.) and any notable design patterns.

6. **Color Scheme**: Note the primary colors used in the design.

Respond in JSON format with the following structure:
{
  "caption": "A comprehensive 2-3 sentence description of the page",
  "pageType": "The type of page",
  "visualElements": ["element1", "element2", ...],
  "confidence": 0.0-1.0
}`;

/**
 * Captioning configuration
 */
export interface CaptionerConfig {
  /** VLM provider name (anthropic, openai, ollama) */
  provider: string;
  /** Provider-specific configuration */
  providerConfig: VlmProviderConfig;
  /** Whether to include HTML context */
  includeHtml: boolean;
  /** Whether to include CSS context */
  includeCss: boolean;
  /** Custom prompt template */
  promptTemplate?: string;
}

/**
 * Captioner class for generating descriptions using VLM providers
 */
export class Captioner {
  private provider: VlmProvider;
  private config: CaptionerConfig;
  private filesystem: FilesystemManager;
  private logger: Logger;

  constructor(
    config: CaptionerConfig,
    filesystem: FilesystemManager,
    logger: Logger
  ) {
    this.config = config;
    this.filesystem = filesystem;
    this.logger = logger;

    // Create the provider instance
    this.provider = VlmProviderRegistry.create(
      config.provider,
      config.providerConfig,
      logger
    );

    // Validate provider configuration
    const validationErrors = this.provider.validate();
    if (validationErrors.length > 0) {
      throw new Error(`Invalid provider configuration: ${validationErrors.join(', ')}`);
    }

    this.logger.info(`Captioner initialized with provider: ${this.provider.name}`);
  }

  /**
   * Get the current provider name
   */
  getProviderName(): string {
    return this.provider.name;
  }

  /**
   * List available providers
   */
  static listProviders(): string[] {
    return VlmProviderRegistry.list();
  }

  /**
   * Generate a caption for a page capture
   */
  async caption(capture: PageCapture): Promise<CaptionResult> {
    this.logger.info(`Generating caption for: ${capture.url}`);

    // Read screenshot as base64
    const screenshotBase64 = await this.filesystem.readScreenshotBase64(
      capture.screenshotPath
    );

    // Build caption input
    const input: CaptionInput = {
      screenshotBase64,
      mediaType: 'image/png',
      url: capture.url,
      title: capture.html.title,
      description: capture.html.description,
      statusCode: capture.statusCode,
      loadTime: capture.loadTime,
    };

    // Add HTML context if configured
    if (this.config.includeHtml) {
      input.htmlContext = this.summarizeHtml(capture);
    }

    // Add CSS context if configured
    if (this.config.includeCss) {
      input.cssContext = this.summarizeCss(capture);
    }

    // Get prompt
    const prompt = this.config.promptTemplate || DEFAULT_PROMPT;

    try {
      // Send to provider
      const response = await this.provider.caption(input, prompt);

      // Parse response into structured result
      const result = this.provider.parseResponse(response);

      this.logger.info(`Caption generated for: ${capture.url}`, {
        tokensUsed: result.tokensUsed,
        pageType: result.pageType,
        provider: this.provider.name,
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to generate caption for: ${capture.url}`, {
        error: error instanceof Error ? error.message : String(error),
        provider: this.provider.name,
      });
      throw error;
    }
  }

  /**
   * Summarize HTML for context (keeping it concise)
   */
  private summarizeHtml(capture: PageCapture): string {
    const lines: string[] = [];

    lines.push(`Title: ${capture.html.title}`);

    if (capture.html.description) {
      lines.push(`Meta Description: ${capture.html.description}`);
    }

    // Extract key structural elements
    const html = capture.html.html;

    // Count key elements
    const headerCount = (html.match(/<header/gi) || []).length;
    const navCount = (html.match(/<nav/gi) || []).length;
    const mainCount = (html.match(/<main/gi) || []).length;
    const articleCount = (html.match(/<article/gi) || []).length;
    const sectionCount = (html.match(/<section/gi) || []).length;
    const formCount = (html.match(/<form/gi) || []).length;
    const buttonCount = (html.match(/<button/gi) || []).length;
    const imgCount = (html.match(/<img/gi) || []).length;
    const linkCount = capture.html.links.length;

    lines.push(`\nStructural Elements:`);
    lines.push(`- Headers: ${headerCount}, Navs: ${navCount}, Main: ${mainCount}`);
    lines.push(`- Articles: ${articleCount}, Sections: ${sectionCount}`);
    lines.push(`- Forms: ${formCount}, Buttons: ${buttonCount}`);
    lines.push(`- Images: ${imgCount}, Links: ${linkCount}`);

    // Add text excerpt
    const textExcerpt = capture.html.textContent.slice(0, 500);
    lines.push(`\nContent Excerpt:\n${textExcerpt}...`);

    return lines.join('\n');
  }

  /**
   * Summarize CSS for context
   */
  private summarizeCss(capture: PageCapture): string {
    const lines: string[] = [];

    lines.push(`Stylesheets processed: ${capture.css.stylesheetCount}`);
    lines.push(`Original CSS size: ${capture.css.originalSize} bytes`);

    // Extract some key CSS patterns
    const css = capture.css.css;

    // Look for color definitions
    const colorMatches = css.match(/#[0-9a-fA-F]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)/g);
    if (colorMatches) {
      const uniqueColors = [...new Set(colorMatches)].slice(0, 10);
      lines.push(`\nKey Colors: ${uniqueColors.join(', ')}`);
    }

    // Look for font families
    const fontMatches = css.match(/font-family:\s*([^;}]+)/gi);
    if (fontMatches) {
      const uniqueFonts = [...new Set(fontMatches)].slice(0, 5);
      lines.push(`\nFonts: ${uniqueFonts.join(', ')}`);
    }

    // Check for common frameworks
    if (css.includes('bootstrap') || css.includes('btn-')) {
      lines.push('\nFramework detected: Bootstrap-like');
    }
    if (css.includes('tailwind') || css.match(/\.(p|m)-(x|y|t|b|l|r)-\d/)) {
      lines.push('\nFramework detected: Tailwind-like');
    }

    return lines.join('\n');
  }

  /**
   * Batch caption multiple captures
   */
  async captionBatch(
    captures: PageCapture[],
    concurrency: number = 2,
    delayMs: number = 1000
  ): Promise<Map<string, CaptionResult>> {
    const results = new Map<string, CaptionResult>();

    for (let i = 0; i < captures.length; i += concurrency) {
      const batch = captures.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(capture => this.caption(capture))
      );

      batch.forEach((capture, index) => {
        const result = batchResults[index];
        if (result && result.status === 'fulfilled') {
          results.set(capture.id, result.value);
        } else if (result && result.status === 'rejected') {
          this.logger.error(`Failed to caption: ${capture.url}`, {
            error: result.reason,
          });
        }
      });

      // Rate limiting delay
      if (i + concurrency < captures.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}
