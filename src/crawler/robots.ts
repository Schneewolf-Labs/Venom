/**
 * Robots.txt parser and checker
 */

import robotsParser from 'robots-parser';
import type { RobotsTxtResult, Logger } from '../types.js';

/** Cache for robots.txt content per domain */
const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

/**
 * Fetches and parses robots.txt for a domain
 */
export async function fetchRobotsTxt(
  domain: string,
  userAgent: string,
  logger: Logger
): Promise<ReturnType<typeof robotsParser> | null> {
  // Check cache first
  if (robotsCache.has(domain)) {
    return robotsCache.get(domain)!;
  }

  const robotsUrl = `https://${domain}/robots.txt`;

  try {
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // No robots.txt or error - allow all
      logger.debug(`No robots.txt found for ${domain}`, { status: response.status });
      return null;
    }

    const robotsTxt = await response.text();
    const parser = robotsParser(robotsUrl, robotsTxt);

    // Cache the result
    robotsCache.set(domain, parser);

    logger.debug(`Fetched robots.txt for ${domain}`, { size: robotsTxt.length });
    return parser;
  } catch (error) {
    logger.warn(`Failed to fetch robots.txt for ${domain}`, {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Checks if a URL is allowed according to robots.txt
 */
export async function checkRobotsTxt(
  url: string,
  userAgent: string,
  logger: Logger
): Promise<RobotsTxtResult> {
  const urlObj = new URL(url);
  const domain = urlObj.hostname;

  const parser = await fetchRobotsTxt(domain, userAgent, logger);

  if (!parser) {
    // No robots.txt - allow everything
    return {
      isAllowed: true,
      sitemaps: [],
    };
  }

  const isAllowed = parser.isAllowed(url, userAgent) ?? true;
  const crawlDelay = parser.getCrawlDelay(userAgent);
  const sitemaps = parser.getSitemaps();

  return {
    isAllowed,
    crawlDelay: crawlDelay ? Number(crawlDelay) : undefined,
    sitemaps,
  };
}

/**
 * Clears the robots.txt cache
 */
export function clearRobotsCache(): void {
  robotsCache.clear();
}

/**
 * Gets the cached robots.txt parser for a domain
 */
export function getCachedRobots(domain: string): ReturnType<typeof robotsParser> | undefined {
  return robotsCache.get(domain);
}
