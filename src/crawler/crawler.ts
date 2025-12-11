/**
 * Core web crawler using Playwright
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { randomUUID } from 'crypto';
import path from 'path';
import type {
  CrawlerConfig,
  PageCapture,
  ExtractedHtml,
  ExtractedCss,
  ExtractedLink,
  Logger,
} from '../types.js';
import { checkRobotsTxt } from './robots.js';
import { extractHtml } from '../processors/html-processor.js';
import { extractCss } from '../processors/css-processor.js';

/**
 * Web crawler class using Playwright for headless browsing
 */
export class Crawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: CrawlerConfig;
  private logger: Logger;
  private visitedUrls: Set<string> = new Set();

  constructor(config: CrawlerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize the browser
   */
  async init(): Promise<void> {
    this.logger.info('Initializing Playwright browser');

    this.browser = await chromium.launch({
      headless: true,
    });

    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      ignoreHTTPSErrors: true,
    });

    this.logger.info('Browser initialized successfully');
  }

  /**
   * Close the browser and cleanup resources
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.logger.info('Browser closed');
  }

  /**
   * Normalize a URL for deduplication
   */
  normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove trailing slash, fragment, and common tracking params
      urlObj.hash = '';
      urlObj.searchParams.delete('utm_source');
      urlObj.searchParams.delete('utm_medium');
      urlObj.searchParams.delete('utm_campaign');
      urlObj.searchParams.delete('utm_content');
      urlObj.searchParams.delete('utm_term');
      urlObj.searchParams.delete('ref');
      urlObj.searchParams.delete('fbclid');
      urlObj.searchParams.delete('gclid');

      let normalized = urlObj.toString();
      // Remove trailing slash for consistency
      if (normalized.endsWith('/') && urlObj.pathname !== '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }

  /**
   * Extract domain from URL
   */
  getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /**
   * Check if URL should be crawled
   */
  shouldCrawl(url: string): boolean {
    const normalizedUrl = this.normalizeUrl(url);

    // Skip if already visited
    if (this.visitedUrls.has(normalizedUrl)) {
      return false;
    }

    // Check URL scheme
    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }
    } catch {
      return false;
    }

    const domain = this.getDomain(url);

    // Check blocked domains
    if (this.config.blockedDomains.some(d => domain.includes(d))) {
      return false;
    }

    // Check allowed domains (if specified)
    if (
      this.config.allowedDomains.length > 0 &&
      !this.config.allowedDomains.some(d => domain.includes(d))
    ) {
      return false;
    }

    return true;
  }

  /**
   * Check robots.txt for a URL
   */
  async checkRobots(url: string): Promise<boolean> {
    if (!this.config.respectRobotsTxt) {
      return true;
    }

    const result = await checkRobotsTxt(url, this.config.userAgent, this.logger);
    return result.isAllowed;
  }

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot(page: Page, outputDir: string): Promise<string> {
    const screenshotId = randomUUID();
    const screenshotPath = path.join(outputDir, `${screenshotId}.png`);

    await page.screenshot({
      path: screenshotPath,
      fullPage: this.config.fullPage,
      type: 'png',
    });

    return screenshotPath;
  }

  /**
   * Crawl a single URL and capture its content
   */
  async crawlUrl(
    url: string,
    depth: number,
    screenshotDir: string
  ): Promise<PageCapture | null> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    const normalizedUrl = this.normalizeUrl(url);
    const domain = this.getDomain(url);

    // Mark as visited
    this.visitedUrls.add(normalizedUrl);

    // Check robots.txt
    const robotsAllowed = await this.checkRobots(url);
    if (!robotsAllowed) {
      this.logger.info(`URL blocked by robots.txt: ${url}`);
      return null;
    }

    const page = await this.context.newPage();
    const startTime = Date.now();

    try {
      this.logger.info(`Crawling: ${url}`, { depth });

      // Navigate to the URL
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });

      if (!response) {
        throw new Error('No response received');
      }

      const statusCode = response.status();
      const finalUrl = page.url();
      const loadTime = Date.now() - startTime;

      // Wait for any dynamic content to load
      await page.waitForLoadState('domcontentloaded');

      // Take screenshot
      const screenshotPath = await this.takeScreenshot(page, screenshotDir);

      // Extract HTML content
      const htmlContent = await page.content();
      const extractedHtml = await extractHtml(page, htmlContent, url);

      // Extract CSS content
      const extractedCss = await extractCss(page);

      const captureId = randomUUID();

      const capture: PageCapture = {
        id: captureId,
        url,
        normalizedUrl,
        domain,
        depth,
        timestamp: new Date(),
        screenshotPath,
        html: extractedHtml,
        css: extractedCss,
        statusCode,
        finalUrl,
        loadTime,
      };

      this.logger.info(`Successfully captured: ${url}`, {
        statusCode,
        loadTime,
        linksFound: extractedHtml.links.length,
      });

      return capture;
    } catch (error) {
      this.logger.error(`Failed to crawl: ${url}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Extract links from a capture for further crawling
   */
  getLinksToFollow(capture: PageCapture, maxDepth: number): string[] {
    if (capture.depth >= maxDepth) {
      return [];
    }

    return capture.html.links
      .filter(link => link.isInternal && this.shouldCrawl(link.href))
      .map(link => link.href)
      .slice(0, this.config.maxUrlsPerDomain);
  }

  /**
   * Mark a URL as visited (for external management)
   */
  markVisited(url: string): void {
    this.visitedUrls.add(this.normalizeUrl(url));
  }

  /**
   * Check if a URL has been visited
   */
  hasVisited(url: string): boolean {
    return this.visitedUrls.has(this.normalizeUrl(url));
  }

  /**
   * Get count of visited URLs
   */
  getVisitedCount(): number {
    return this.visitedUrls.size;
  }

  /**
   * Clear visited URLs (for fresh crawl)
   */
  clearVisited(): void {
    this.visitedUrls.clear();
  }
}

export default Crawler;
