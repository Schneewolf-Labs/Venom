/**
 * Configuration loading and defaults
 */

import fs from 'fs';
import path from 'path';
import { config as dotenvConfig } from 'dotenv';
import type { VenomConfig, CrawlerConfig, CaptioningConfig, StorageConfig } from './types.js';

// Load environment variables
dotenvConfig();

/**
 * Default crawler configuration
 */
export const DEFAULT_CRAWLER_CONFIG: CrawlerConfig = {
  maxDepth: 2,
  rateLimit: 1000,
  concurrency: 3,
  timeout: 30000,
  respectRobotsTxt: true,
  userAgent: 'Venom/1.0 (+https://github.com/venom-crawler)',
  viewportWidth: 1920,
  viewportHeight: 1080,
  fullPage: true,
  maxUrlsPerDomain: 100,
  allowedDomains: [],
  blockedDomains: [],
};

/**
 * Default captioning configuration
 */
export const DEFAULT_CAPTIONING_CONFIG: CaptioningConfig = {
  provider: 'anthropic',
  apiKey: process.env['ANTHROPIC_API_KEY'] || process.env['OPENAI_API_KEY'] || '',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 1024,
  includeHtml: true,
  includeCss: false,
  baseUrl: undefined,
};

/**
 * Default storage configuration
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  dataDir: path.join(process.cwd(), 'data'),
  dbPath: path.join(process.cwd(), 'data', 'venom.db'),
  maxScreenshotSize: 10 * 1024 * 1024, // 10MB
};

/**
 * Create default configuration
 */
export function createDefaultConfig(): VenomConfig {
  return {
    crawler: { ...DEFAULT_CRAWLER_CONFIG },
    captioning: { ...DEFAULT_CAPTIONING_CONFIG },
    storage: { ...DEFAULT_STORAGE_CONFIG },
  };
}

/**
 * Load configuration from a JSON file
 */
export function loadConfigFromFile(configPath: string): Partial<VenomConfig> {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as Partial<VenomConfig>;
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error}`);
  }
}

/**
 * Get API key based on provider
 */
function getApiKeyForProvider(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      return process.env['ANTHROPIC_API_KEY'] || '';
    case 'openai':
    case 'gpt4':
    case 'gpt-4':
      return process.env['OPENAI_API_KEY'] || '';
    case 'ollama':
    case 'llava':
    case 'local':
      return ''; // Ollama doesn't need an API key
    default:
      return process.env['VLM_API_KEY'] || '';
  }
}

/**
 * Merge configurations with defaults
 */
export function mergeConfig(
  partial: Partial<VenomConfig>,
  defaults: VenomConfig = createDefaultConfig()
): VenomConfig {
  const provider = partial.captioning?.provider || defaults.captioning.provider;

  return {
    crawler: {
      ...defaults.crawler,
      ...partial.crawler,
    },
    captioning: {
      ...defaults.captioning,
      ...partial.captioning,
      // Get appropriate API key based on provider
      apiKey: partial.captioning?.apiKey || getApiKeyForProvider(provider),
    },
    storage: {
      ...defaults.storage,
      ...partial.storage,
    },
  };
}

/**
 * Load and merge configuration
 */
export function loadConfig(configPath?: string): VenomConfig {
  const defaults = createDefaultConfig();

  if (configPath && fs.existsSync(configPath)) {
    const fileConfig = loadConfigFromFile(configPath);
    return mergeConfig(fileConfig, defaults);
  }

  // Try to load from default config location
  const defaultConfigPath = path.join(process.cwd(), 'config', 'venom.json');
  if (fs.existsSync(defaultConfigPath)) {
    const fileConfig = loadConfigFromFile(defaultConfigPath);
    return mergeConfig(fileConfig, defaults);
  }

  return defaults;
}

/**
 * Validate configuration
 */
export function validateConfig(config: VenomConfig): string[] {
  const errors: string[] = [];

  // Crawler validation
  if (config.crawler.maxDepth < 0) {
    errors.push('maxDepth must be non-negative');
  }
  if (config.crawler.rateLimit < 0) {
    errors.push('rateLimit must be non-negative');
  }
  if (config.crawler.concurrency < 1) {
    errors.push('concurrency must be at least 1');
  }
  if (config.crawler.timeout < 1000) {
    errors.push('timeout must be at least 1000ms');
  }
  if (config.crawler.viewportWidth < 320) {
    errors.push('viewportWidth must be at least 320');
  }
  if (config.crawler.viewportHeight < 240) {
    errors.push('viewportHeight must be at least 240');
  }

  // Captioning validation
  if (config.captioning.maxTokens < 100) {
    errors.push('maxTokens must be at least 100');
  }

  // Check API key for non-local providers
  const provider = config.captioning.provider.toLowerCase();
  if (!['ollama', 'llava', 'local'].includes(provider) && !config.captioning.apiKey) {
    errors.push(`API key required for provider: ${config.captioning.provider}`);
  }

  return errors;
}

/**
 * Seed URLs for testing
 */
export const SEED_URLS = [
  'https://en.wikipedia.org/wiki/Web_crawler',
  'https://news.ycombinator.com',
  'https://stripe.com',
  'https://www.amazon.com',
  'https://www.bbc.com/news',
];
