/**
 * Job queue management for crawl jobs
 */

import PQueue from 'p-queue';
import { randomUUID } from 'crypto';
import type {
  CrawlJob,
  JobPriority,
  CaptureStatus,
  Logger,
} from '../types.js';
import { VenomDatabase } from '../storage/database.js';

/**
 * Job queue manager for handling crawl jobs
 */
export class JobQueue {
  private queue: PQueue;
  private db: VenomDatabase;
  private logger: Logger;
  private maxRetries: number;
  private isProcessing: boolean = false;

  constructor(
    db: VenomDatabase,
    logger: Logger,
    concurrency: number = 3,
    maxRetries: number = 3
  ) {
    this.db = db;
    this.logger = logger;
    this.maxRetries = maxRetries;

    this.queue = new PQueue({
      concurrency,
      autoStart: false,
    });

    // Handle queue events
    this.queue.on('active', () => {
      this.logger.debug(`Queue active, size: ${this.queue.size}, pending: ${this.queue.pending}`);
    });

    this.queue.on('idle', () => {
      this.logger.info('Queue is idle');
    });

    this.queue.on('error', (error) => {
      this.logger.error('Queue error', { error: error.message });
    });
  }

  /**
   * Add a URL to the queue
   */
  addUrl(
    url: string,
    depth: number = 0,
    parentUrl?: string,
    priority: JobPriority = 'normal'
  ): CrawlJob | null {
    // Check if URL already exists
    if (this.db.urlExists(url)) {
      this.logger.debug(`URL already exists, skipping: ${url}`);
      return null;
    }

    const job: CrawlJob = {
      id: randomUUID(),
      url,
      depth,
      parentUrl,
      priority,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.db.addJob(job);
    this.logger.info(`Added job to queue: ${url}`, { depth, priority });

    return job;
  }

  /**
   * Add multiple URLs to the queue
   */
  addUrls(
    urls: string[],
    depth: number = 0,
    parentUrl?: string,
    priority: JobPriority = 'normal'
  ): CrawlJob[] {
    const jobs: CrawlJob[] = [];

    for (const url of urls) {
      const job = this.addUrl(url, depth, parentUrl, priority);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs;
  }

  /**
   * Process jobs using a handler function
   */
  async process(
    handler: (job: CrawlJob) => Promise<void>,
    onComplete?: (job: CrawlJob) => void
  ): Promise<void> {
    this.isProcessing = true;
    this.queue.start();

    while (this.isProcessing) {
      // Get batch of pending jobs
      const jobs = this.db.getPendingJobs(10);

      if (jobs.length === 0) {
        // No more jobs, wait and check again
        await this.delay(1000);

        // Check if still processing and no new jobs
        const remainingJobs = this.db.getPendingJobs(1);
        if (remainingJobs.length === 0 && this.queue.size === 0 && this.queue.pending === 0) {
          this.logger.info('No more jobs to process');
          break;
        }
        continue;
      }

      // Add jobs to the processing queue
      for (const job of jobs) {
        // Mark as crawling
        this.db.updateJobStatus(job.id, 'crawling');

        this.queue.add(async () => {
          try {
            await handler(job);
            this.db.updateJobStatus(job.id, 'completed');
            this.logger.info(`Completed job: ${job.url}`);

            if (onComplete) {
              onComplete(job);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.db.incrementJobRetry(job.id);

            if (job.retryCount < this.maxRetries) {
              // Requeue for retry
              this.db.updateJobStatus(job.id, 'pending', errorMessage);
              this.logger.warn(`Job failed, will retry: ${job.url}`, {
                error: errorMessage,
                retryCount: job.retryCount + 1,
              });
            } else {
              // Max retries exceeded
              this.db.updateJobStatus(job.id, 'failed', errorMessage);
              this.logger.error(`Job failed permanently: ${job.url}`, {
                error: errorMessage,
              });
            }
          }
        });
      }

      // Wait for current batch to have some progress
      await this.delay(100);
    }

    // Wait for remaining jobs to complete
    await this.queue.onIdle();
    this.isProcessing = false;
  }

  /**
   * Stop processing
   */
  stop(): void {
    this.isProcessing = false;
    this.queue.pause();
    this.logger.info('Job queue stopped');
  }

  /**
   * Clear all pending jobs
   */
  clear(): void {
    this.queue.clear();
    this.logger.info('Job queue cleared');
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    pending: number;
    completed: number;
    failed: number;
    queueSize: number;
    queuePending: number;
  } {
    const dbStats = this.db.getJobStats();
    return {
      ...dbStats,
      queueSize: this.queue.size,
      queuePending: this.queue.pending,
    };
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    const stats = this.getStats();
    return stats.pending === 0 && stats.queueSize === 0 && stats.queuePending === 0;
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
