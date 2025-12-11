/**
 * Venom - Main orchestrator class
 *
 * Coordinates the crawler, processors, captioner, and storage components.
 */

import type {
  VenomConfig,
  PageCapture,
  CrawlJob,
  CrawlStats,
  Logger,
} from './types.js';
import { Crawler } from './crawler/index.js';
import { Captioner, type CaptionerConfig } from './captioning/index.js';
import { VenomDatabase, FilesystemManager } from './storage/index.js';
import { JobQueue } from './queue/index.js';

/**
 * Main Venom web crawler orchestrator
 */
export class Venom {
  private config: VenomConfig;
  private logger: Logger;
  private crawler: Crawler;
  private captioner: Captioner | null = null;
  private database: VenomDatabase;
  private filesystem: FilesystemManager;
  private queue: JobQueue;
  private stats: CrawlStats;
  private isRunning: boolean = false;

  constructor(config: VenomConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    // Initialize stats
    this.stats = {
      urlsDiscovered: 0,
      urlsCrawled: 0,
      urlsFailed: 0,
      urlsSkipped: 0,
      screenshotsTaken: 0,
      captionsGenerated: 0,
      startTime: new Date(),
      bytesDownloaded: 0,
    };

    // Initialize components
    this.crawler = new Crawler(config.crawler, logger);
    this.database = new VenomDatabase(config.storage.dbPath, logger);
    this.filesystem = new FilesystemManager(config.storage.dataDir, logger);
    this.queue = new JobQueue(
      this.database,
      logger,
      config.crawler.concurrency
    );
  }

  /**
   * Initialize all components
   */
  async init(): Promise<void> {
    this.logger.info('Initializing Venom web crawler');

    // Initialize filesystem
    await this.filesystem.init();

    // Initialize browser
    await this.crawler.init();

    // Initialize captioner if API key is available
    if (this.config.captioning.apiKey || this.config.captioning.provider === 'ollama') {
      const captionerConfig: CaptionerConfig = {
        provider: this.config.captioning.provider,
        providerConfig: {
          apiKey: this.config.captioning.apiKey,
          model: this.config.captioning.model,
          maxTokens: this.config.captioning.maxTokens,
          baseUrl: this.config.captioning.baseUrl,
        },
        includeHtml: this.config.captioning.includeHtml,
        includeCss: this.config.captioning.includeCss,
        promptTemplate: this.config.captioning.promptTemplate,
      };

      this.captioner = new Captioner(captionerConfig, this.filesystem, this.logger);
    } else {
      this.logger.warn('No API key configured - captioning will be disabled');
    }

    this.logger.info('Venom initialized successfully');
  }

  /**
   * Close all components and cleanup
   */
  async close(): Promise<void> {
    this.logger.info('Shutting down Venom');
    this.isRunning = false;

    await this.crawler.close();
    this.database.close();

    this.stats.endTime = new Date();
    this.logger.info('Venom shutdown complete', {
      stats: this.getStats(),
    });
  }

  /**
   * Add seed URLs to the crawl queue
   */
  addSeeds(urls: string[]): void {
    for (const url of urls) {
      const job = this.queue.addUrl(url, 0, undefined, 'high');
      if (job) {
        this.stats.urlsDiscovered++;
      }
    }
    this.logger.info(`Added ${urls.length} seed URLs`);
  }

  /**
   * Run the crawler
   */
  async crawl(options: {
    captionOnCrawl?: boolean;
    maxUrls?: number;
  } = {}): Promise<CrawlStats> {
    const { captionOnCrawl = true, maxUrls } = options;

    this.isRunning = true;
    this.stats.startTime = new Date();

    this.logger.info('Starting crawl', {
      captionOnCrawl,
      maxUrls,
      concurrency: this.config.crawler.concurrency,
    });

    let urlsCrawled = 0;

    await this.queue.process(
      async (job: CrawlJob) => {
        // Check if we've hit the URL limit
        if (maxUrls && urlsCrawled >= maxUrls) {
          this.queue.stop();
          return;
        }

        // Rate limiting delay
        await this.delay(this.config.crawler.rateLimit);

        try {
          // Crawl the URL
          const capture = await this.crawler.crawlUrl(
            job.url,
            job.depth,
            this.filesystem.getScreenshotDir()
          );

          if (!capture) {
            this.stats.urlsSkipped++;
            return;
          }

          urlsCrawled++;
          this.stats.urlsCrawled++;
          this.stats.screenshotsTaken++;

          // Save capture to database
          this.database.saveCapture(capture);

          // Generate caption if enabled
          if (captionOnCrawl && this.captioner) {
            try {
              const caption = await this.captioner.caption(capture);
              capture.caption = caption;
              this.database.updateCaption(capture.id, caption);
              this.stats.captionsGenerated++;
            } catch (error) {
              this.logger.error(`Captioning failed for ${capture.url}`, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Add discovered links to queue
          if (job.depth < this.config.crawler.maxDepth) {
            const links = this.crawler.getLinksToFollow(capture, this.config.crawler.maxDepth);
            for (const link of links) {
              const newJob = this.queue.addUrl(link, job.depth + 1, job.url);
              if (newJob) {
                this.stats.urlsDiscovered++;
              }
            }
          }
        } catch (error) {
          this.stats.urlsFailed++;
          throw error;
        }
      },
      (job: CrawlJob) => {
        this.logger.debug(`Completed job: ${job.url}`);
      }
    );

    this.stats.endTime = new Date();
    this.isRunning = false;

    this.logger.info('Crawl completed', { stats: this.getStats() });
    return this.stats;
  }

  /**
   * Generate captions for captures without them
   */
  async generateCaptions(options: {
    limit?: number;
    concurrency?: number;
  } = {}): Promise<number> {
    const { limit = 100, concurrency = 2 } = options;

    if (!this.captioner) {
      throw new Error('Captioner not initialized - check your API key');
    }

    const captures = this.database.getCapturesWithoutCaptions(limit);
    this.logger.info(`Generating captions for ${captures.length} captures`);

    const results = await this.captioner.captionBatch(captures, concurrency);

    // Update database with captions
    for (const [captureId, caption] of results) {
      this.database.updateCaption(captureId, caption);
      this.stats.captionsGenerated++;
    }

    this.logger.info(`Generated ${results.size} captions`);
    return results.size;
  }

  /**
   * Crawl a single URL
   */
  async crawlSingle(url: string, generateCaption: boolean = true): Promise<PageCapture | null> {
    const capture = await this.crawler.crawlUrl(
      url,
      0,
      this.filesystem.getScreenshotDir()
    );

    if (!capture) {
      return null;
    }

    this.stats.urlsCrawled++;
    this.stats.screenshotsTaken++;

    // Save capture
    this.database.saveCapture(capture);

    // Generate caption if enabled
    if (generateCaption && this.captioner) {
      try {
        const caption = await this.captioner.caption(capture);
        capture.caption = caption;
        this.database.updateCaption(capture.id, caption);
        this.stats.captionsGenerated++;
      } catch (error) {
        this.logger.error(`Captioning failed for ${capture.url}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return capture;
  }

  /**
   * Get crawl statistics
   */
  getStats(): CrawlStats {
    return { ...this.stats };
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): ReturnType<JobQueue['getStats']> {
    return this.queue.getStats();
  }

  /**
   * Check if crawler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get a capture by ID
   */
  getCapture(id: string): PageCapture | null {
    return this.database.getCapture(id);
  }

  /**
   * Get captures by domain
   */
  getCapturesByDomain(domain: string): PageCapture[] {
    return this.database.getCapturesByDomain(domain);
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
