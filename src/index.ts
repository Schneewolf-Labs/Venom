#!/usr/bin/env node

/**
 * Venom Web Crawler CLI
 *
 * A web crawler that screenshots websites and generates captions using VLMs.
 */

import { Command } from 'commander';
import { loadConfig, validateConfig, SEED_URLS } from './config.js';
import { createLogger } from './logger.js';
import { Venom } from './venom.js';
import { Captioner } from './captioning/index.js';

const VERSION = '1.0.0';

const program = new Command();

program
  .name('venom')
  .description('🕷️ Venom - A web crawler that screenshots websites and generates captions using VLMs')
  .version(VERSION);

// Crawl command
program
  .command('crawl')
  .description('Crawl websites and capture screenshots')
  .option('-u, --urls <urls...>', 'URLs to crawl (comma-separated or multiple -u flags)')
  .option('-d, --depth <depth>', 'Maximum crawl depth', '2')
  .option('-c, --concurrency <n>', 'Number of concurrent pages', '3')
  .option('-r, --rate-limit <ms>', 'Delay between requests in milliseconds', '1000')
  .option('--no-caption', 'Disable automatic captioning')
  .option('--no-robots', 'Ignore robots.txt')
  .option('-m, --max-urls <n>', 'Maximum URLs to crawl')
  .option('-p, --provider <provider>', 'VLM provider (anthropic, openai, ollama)', 'anthropic')
  .option('--model <model>', 'Model to use for captioning')
  .option('--config <path>', 'Path to config file')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose ? 'debug' : 'info');

    logger.info('🕷️ Venom Web Crawler starting...');

    try {
      // Load configuration
      const config = loadConfig(options.config);

      // Override with CLI options
      if (options.depth) {
        config.crawler.maxDepth = parseInt(options.depth, 10);
      }
      if (options.concurrency) {
        config.crawler.concurrency = parseInt(options.concurrency, 10);
      }
      if (options.rateLimit) {
        config.crawler.rateLimit = parseInt(options.rateLimit, 10);
      }
      if (options.robots === false) {
        config.crawler.respectRobotsTxt = false;
      }
      if (options.provider) {
        config.captioning.provider = options.provider;
      }
      if (options.model) {
        config.captioning.model = options.model;
      }

      // Validate configuration
      const errors = validateConfig(config);
      if (errors.length > 0) {
        logger.error('Invalid configuration:', { errors });
        process.exit(1);
      }

      // Determine URLs to crawl
      const urls = options.urls?.length ? options.urls : SEED_URLS;

      logger.info(`Crawling ${urls.length} seed URLs`, {
        depth: config.crawler.maxDepth,
        concurrency: config.crawler.concurrency,
        provider: config.captioning.provider,
      });

      // Initialize Venom
      const venom = new Venom(config, logger);
      await venom.init();

      // Handle graceful shutdown
      const shutdown = async () => {
        logger.info('Shutting down...');
        await venom.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Add seed URLs
      venom.addSeeds(urls);

      // Start crawling
      const stats = await venom.crawl({
        captionOnCrawl: options.caption !== false,
        maxUrls: options.maxUrls ? parseInt(options.maxUrls, 10) : undefined,
      });

      // Print summary
      logger.info('Crawl completed!', {
        urlsCrawled: stats.urlsCrawled,
        urlsFailed: stats.urlsFailed,
        screenshotsTaken: stats.screenshotsTaken,
        captionsGenerated: stats.captionsGenerated,
        duration: stats.endTime
          ? `${Math.round((stats.endTime.getTime() - stats.startTime.getTime()) / 1000)}s`
          : 'N/A',
      });

      await venom.close();
    } catch (error) {
      logger.error('Crawl failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// Caption command
program
  .command('caption')
  .description('Generate captions for existing captures')
  .option('-l, --limit <n>', 'Maximum captures to caption', '100')
  .option('-c, --concurrency <n>', 'Number of concurrent caption requests', '2')
  .option('-p, --provider <provider>', 'VLM provider (anthropic, openai, ollama)', 'anthropic')
  .option('--model <model>', 'Model to use for captioning')
  .option('--config <path>', 'Path to config file')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose ? 'debug' : 'info');

    logger.info('🕷️ Generating captions for existing captures...');

    try {
      const config = loadConfig(options.config);

      if (options.provider) {
        config.captioning.provider = options.provider;
      }
      if (options.model) {
        config.captioning.model = options.model;
      }

      const venom = new Venom(config, logger);
      await venom.init();

      const count = await venom.generateCaptions({
        limit: parseInt(options.limit, 10),
        concurrency: parseInt(options.concurrency, 10),
      });

      logger.info(`Generated ${count} captions`);
      await venom.close();
    } catch (error) {
      logger.error('Captioning failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// Single URL command
program
  .command('single <url>')
  .description('Crawl a single URL')
  .option('--no-caption', 'Disable captioning')
  .option('-p, --provider <provider>', 'VLM provider (anthropic, openai, ollama)', 'anthropic')
  .option('--model <model>', 'Model to use for captioning')
  .option('--config <path>', 'Path to config file')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (url, options) => {
    const logger = createLogger(options.verbose ? 'debug' : 'info');

    logger.info(`🕷️ Crawling single URL: ${url}`);

    try {
      const config = loadConfig(options.config);

      if (options.provider) {
        config.captioning.provider = options.provider;
      }
      if (options.model) {
        config.captioning.model = options.model;
      }

      const venom = new Venom(config, logger);
      await venom.init();

      const capture = await venom.crawlSingle(url, options.caption !== false);

      if (capture) {
        console.log('\n📸 Capture Summary:');
        console.log(`   URL: ${capture.url}`);
        console.log(`   Title: ${capture.html.title}`);
        console.log(`   Screenshot: ${capture.screenshotPath}`);
        console.log(`   Load Time: ${capture.loadTime}ms`);
        console.log(`   Links Found: ${capture.html.links.length}`);

        if (capture.caption) {
          console.log('\n📝 Caption:');
          console.log(`   ${capture.caption.caption}`);
          console.log(`   Page Type: ${capture.caption.pageType}`);
          console.log(`   Visual Elements: ${capture.caption.visualElements.join(', ')}`);
        }
      } else {
        logger.warn('No capture generated (possibly blocked by robots.txt)');
      }

      await venom.close();
    } catch (error) {
      logger.error('Crawl failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats')
  .description('Show capture statistics')
  .option('--config <path>', 'Path to config file')
  .action(async (options) => {
    const logger = createLogger('info');

    try {
      const config = loadConfig(options.config);
      const venom = new Venom(config, logger);
      await venom.init();

      const queueStats = venom.getQueueStats();

      console.log('\n🕷️ Venom Statistics:');
      console.log(`   Pending Jobs: ${queueStats.pending}`);
      console.log(`   Completed Jobs: ${queueStats.completed}`);
      console.log(`   Failed Jobs: ${queueStats.failed}`);

      await venom.close();
    } catch (error) {
      logger.error('Failed to get stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// List providers command
program
  .command('providers')
  .description('List available VLM providers')
  .action(() => {
    console.log('\n🕷️ Available VLM Providers:');
    console.log('');
    console.log('   anthropic (aliases: claude)');
    console.log('     - Models: claude-sonnet-4-20250514, claude-3-5-sonnet, claude-3-opus, etc.');
    console.log('     - Env: ANTHROPIC_API_KEY');
    console.log('');
    console.log('   openai (aliases: gpt4, gpt-4)');
    console.log('     - Models: gpt-4o, gpt-4-vision-preview, etc.');
    console.log('     - Env: OPENAI_API_KEY');
    console.log('');
    console.log('   ollama (aliases: llava, local)');
    console.log('     - Models: llava, bakllava, or any local vision model');
    console.log('     - No API key required (local)');
    console.log('');
    const providers = Captioner.listProviders();
    console.log(`   Registered: ${providers.join(', ')}`);
  });

// Parse and run
program.parse();

// Show help if no command specified
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
