/**
 * Core type definitions for Venom Web Crawler
 */

/** Capture status enumeration */
export type CaptureStatus = 'pending' | 'crawling' | 'processing' | 'captioning' | 'completed' | 'failed';

/** Job priority levels */
export type JobPriority = 'low' | 'normal' | 'high';

/** Configuration for the crawler */
export interface CrawlerConfig {
  /** Maximum depth to crawl from seed URLs */
  maxDepth: number;
  /** Delay between requests in milliseconds */
  rateLimit: number;
  /** Maximum concurrent browser pages */
  concurrency: number;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Whether to respect robots.txt */
  respectRobotsTxt: boolean;
  /** User agent string */
  userAgent: string;
  /** Viewport width for screenshots */
  viewportWidth: number;
  /** Viewport height for screenshots */
  viewportHeight: number;
  /** Whether to take full page screenshots */
  fullPage: boolean;
  /** Maximum URLs to crawl per domain */
  maxUrlsPerDomain: number;
  /** Allowed domains (empty = all allowed) */
  allowedDomains: string[];
  /** Blocked domains */
  blockedDomains: string[];
}

/** Configuration for the captioning service */
export interface CaptioningConfig {
  /** VLM provider name (anthropic, openai, ollama) */
  provider: string;
  /** API key for the provider */
  apiKey: string;
  /** Model to use for captioning */
  model: string;
  /** Maximum tokens for caption response */
  maxTokens: number;
  /** Whether to include HTML context */
  includeHtml: boolean;
  /** Whether to include CSS context */
  includeCss: boolean;
  /** Custom prompt template */
  promptTemplate?: string;
  /** Optional base URL for the API (for self-hosted or proxy) */
  baseUrl?: string;
}

/** Configuration for storage */
export interface StorageConfig {
  /** Base directory for data storage */
  dataDir: string;
  /** SQLite database path */
  dbPath: string;
  /** Maximum screenshot file size in bytes */
  maxScreenshotSize: number;
}

/** Full application configuration */
export interface VenomConfig {
  crawler: CrawlerConfig;
  captioning: CaptioningConfig;
  storage: StorageConfig;
}

/** Represents a URL to be crawled */
export interface CrawlJob {
  /** Unique job identifier */
  id: string;
  /** URL to crawl */
  url: string;
  /** Current depth from seed URL */
  depth: number;
  /** Parent URL that linked to this one */
  parentUrl?: string;
  /** Job priority */
  priority: JobPriority;
  /** Current status */
  status: CaptureStatus;
  /** Number of retry attempts */
  retryCount: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Timestamp when job was created */
  createdAt: Date;
  /** Timestamp when job was last updated */
  updatedAt: Date;
}

/** Extracted and cleaned HTML content */
export interface ExtractedHtml {
  /** Cleaned HTML content */
  html: string;
  /** Page title */
  title: string;
  /** Meta description */
  description?: string;
  /** Extracted links from the page */
  links: ExtractedLink[];
  /** Text content extracted from the page */
  textContent: string;
}

/** Link extracted from a page */
export interface ExtractedLink {
  /** Link URL */
  href: string;
  /** Link text */
  text: string;
  /** Whether it's an internal link */
  isInternal: boolean;
}

/** Bundled CSS from a page */
export interface ExtractedCss {
  /** Combined CSS content */
  css: string;
  /** Number of stylesheets processed */
  stylesheetCount: number;
  /** Total original size before processing */
  originalSize: number;
}

/** Complete capture of a web page */
export interface PageCapture {
  /** Unique capture identifier */
  id: string;
  /** URL that was captured */
  url: string;
  /** Normalized/canonical URL */
  normalizedUrl: string;
  /** Domain of the URL */
  domain: string;
  /** Crawl depth from seed */
  depth: number;
  /** Timestamp of capture */
  timestamp: Date;
  /** Path to screenshot file */
  screenshotPath: string;
  /** Extracted HTML data */
  html: ExtractedHtml;
  /** Extracted CSS data */
  css: ExtractedCss;
  /** HTTP status code */
  statusCode: number;
  /** Final URL after redirects */
  finalUrl: string;
  /** Page load time in milliseconds */
  loadTime: number;
  /** Generated caption (if available) */
  caption?: CaptionResult;
}

/** Result from VLM captioning */
export interface CaptionResult {
  /** Generated caption/description */
  caption: string;
  /** Key visual elements identified */
  visualElements: string[];
  /** Page type classification */
  pageType: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Model used for captioning */
  model: string;
  /** Timestamp of captioning */
  timestamp: Date;
  /** Tokens used for the request */
  tokensUsed: number;
}

/** Statistics for a crawl session */
export interface CrawlStats {
  /** Total URLs discovered */
  urlsDiscovered: number;
  /** URLs successfully crawled */
  urlsCrawled: number;
  /** URLs that failed */
  urlsFailed: number;
  /** URLs skipped (robots.txt, etc.) */
  urlsSkipped: number;
  /** Total screenshots taken */
  screenshotsTaken: number;
  /** Total captions generated */
  captionsGenerated: number;
  /** Start time of crawl */
  startTime: Date;
  /** End time of crawl (if completed) */
  endTime?: Date;
  /** Bytes downloaded */
  bytesDownloaded: number;
}

/** Robots.txt parsing result */
export interface RobotsTxtResult {
  /** Whether the URL is allowed */
  isAllowed: boolean;
  /** Crawl delay in seconds (if specified) */
  crawlDelay?: number;
  /** Sitemaps found */
  sitemaps: string[];
}

/** Logger interface for dependency injection */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/** Database row types for SQLite */
export interface CaptureRow {
  id: string;
  url: string;
  normalized_url: string;
  domain: string;
  depth: number;
  timestamp: string;
  screenshot_path: string;
  html_content: string;
  html_title: string;
  html_description: string | null;
  html_text_content: string;
  css_content: string;
  css_stylesheet_count: number;
  status_code: number;
  final_url: string;
  load_time: number;
  caption: string | null;
  caption_visual_elements: string | null;
  caption_page_type: string | null;
  caption_confidence: number | null;
  caption_model: string | null;
  caption_timestamp: string | null;
  caption_tokens_used: number | null;
}

export interface JobRow {
  id: string;
  url: string;
  depth: number;
  parent_url: string | null;
  priority: string;
  status: string;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkRow {
  id: number;
  capture_id: string;
  href: string;
  text: string;
  is_internal: number;
}
