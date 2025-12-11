/**
 * HTML extraction and cleaning processor
 */

import type { Page } from 'playwright';
import type { ExtractedHtml, ExtractedLink } from '../types.js';

/**
 * Attributes to remove from HTML elements
 */
const ATTRIBUTES_TO_REMOVE = [
  // Event handlers
  'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
  'onmousemove', 'onmouseout', 'onmouseenter', 'onmouseleave',
  'onkeydown', 'onkeypress', 'onkeyup',
  'onfocus', 'onblur', 'onchange', 'oninput', 'onsubmit', 'onreset',
  'onload', 'onunload', 'onerror', 'onresize', 'onscroll',
  'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover',
  'ondragstart', 'ondrop',
  'oncopy', 'oncut', 'onpaste',
  'onabort', 'oncanplay', 'oncanplaythrough', 'ondurationchange',
  'onemptied', 'onended', 'onloadeddata', 'onloadedmetadata',
  'onloadstart', 'onpause', 'onplay', 'onplaying', 'onprogress',
  'onratechange', 'onseeked', 'onseeking', 'onstalled', 'onsuspend',
  'ontimeupdate', 'onvolumechange', 'onwaiting',
  'ontouchstart', 'ontouchmove', 'ontouchend', 'ontouchcancel',
  'onpointerdown', 'onpointermove', 'onpointerup', 'onpointercancel',
  'onpointerenter', 'onpointerleave', 'onpointerover', 'onpointerout',
  'onwheel', 'oncontextmenu',

  // Data attributes (noise for captioning)
  'data-reactid', 'data-reactroot', 'data-react-checksum',
  'data-v-', 'data-testid', 'data-test', 'data-qa',
  'data-track', 'data-tracking', 'data-analytics',
  'data-gtm', 'data-ga', 'data-pixel',

  // Framework-specific
  'ng-', 'v-', '_ngcontent', '_nghost',

  // Other noisy attributes
  'jsaction', 'jscontroller', 'jsmodel', 'jsname', 'jsdata',
];

/**
 * Tags to completely remove from the HTML
 */
const TAGS_TO_REMOVE = [
  'script',
  'noscript',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'meta[http-equiv]',
  'link[rel="preload"]',
  'link[rel="prefetch"]',
  'link[rel="dns-prefetch"]',
  'link[rel="preconnect"]',
];

/**
 * Clean HTML content by removing scripts, event handlers, and data attributes
 */
export async function cleanHtml(page: Page): Promise<string> {
  return page.evaluate((tagsToRemove: string[]) => {
    // Clone the document to avoid modifying the live page
    const doc = document.documentElement.cloneNode(true) as HTMLElement;

    // Remove unwanted tags
    tagsToRemove.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Remove unwanted attributes from all elements
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      // Get all attribute names
      const attrs = Array.from(el.attributes);
      attrs.forEach(attr => {
        const name = attr.name.toLowerCase();

        // Remove event handlers (on*)
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          return;
        }

        // Remove data-* attributes (except meaningful ones)
        if (name.startsWith('data-') && !['data-src', 'data-srcset', 'data-href'].includes(name)) {
          el.removeAttribute(attr.name);
          return;
        }

        // Remove Angular/Vue/React specific attributes
        if (name.startsWith('ng-') || name.startsWith('v-') ||
            name.startsWith('_ng') || name.startsWith('js')) {
          el.removeAttribute(attr.name);
          return;
        }
      });

      // Remove empty class and style attributes
      if (el.getAttribute('class') === '') {
        el.removeAttribute('class');
      }
      if (el.getAttribute('style') === '') {
        el.removeAttribute('style');
      }
    });

    // Remove comments
    const walker = document.createTreeWalker(
      doc,
      NodeFilter.SHOW_COMMENT,
      null
    );
    const comments: Comment[] = [];
    while (walker.nextNode()) {
      comments.push(walker.currentNode as Comment);
    }
    comments.forEach(comment => comment.remove());

    return doc.outerHTML;
  }, TAGS_TO_REMOVE);
}

/**
 * Extract the page title
 */
export async function extractTitle(page: Page): Promise<string> {
  return page.evaluate(() => {
    return document.title || '';
  });
}

/**
 * Extract meta description
 */
export async function extractDescription(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const meta = document.querySelector('meta[name="description"]');
    return meta?.getAttribute('content') || undefined;
  });
}

/**
 * Extract visible text content from the page
 */
export async function extractTextContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Get the body text, excluding script and style content
    const body = document.body;
    if (!body) return '';

    // Clone and clean
    const clone = body.cloneNode(true) as HTMLElement;

    // Remove script and style elements
    clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());

    // Get text content and normalize whitespace
    const text = clone.textContent || '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  });
}

/**
 * Extract all links from the page
 */
export async function extractLinks(page: Page, baseUrl: string): Promise<ExtractedLink[]> {
  const baseUrlObj = new URL(baseUrl);
  const baseDomain = baseUrlObj.hostname;

  return page.evaluate((domain: string) => {
    const links: Array<{ href: string; text: string; isInternal: boolean }> = [];
    const seen = new Set<string>();

    document.querySelectorAll('a[href]').forEach(anchor => {
      const href = (anchor as HTMLAnchorElement).href;
      const text = (anchor.textContent || '').trim().slice(0, 200);

      // Skip empty, javascript:, or mailto: links
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') ||
          href.startsWith('tel:') || href.startsWith('#')) {
        return;
      }

      // Deduplicate
      if (seen.has(href)) return;
      seen.add(href);

      try {
        const urlObj = new URL(href);
        const isInternal = urlObj.hostname === domain ||
                          urlObj.hostname.endsWith('.' + domain);

        links.push({ href, text, isInternal });
      } catch {
        // Invalid URL, skip
      }
    });

    return links;
  }, baseDomain);
}

/**
 * Main HTML extraction function
 */
export async function extractHtml(
  page: Page,
  _rawHtml: string,
  url: string
): Promise<ExtractedHtml> {
  const [cleanedHtml, title, description, textContent, links] = await Promise.all([
    cleanHtml(page),
    extractTitle(page),
    extractDescription(page),
    extractTextContent(page),
    extractLinks(page, url),
  ]);

  return {
    html: cleanedHtml,
    title,
    description,
    links,
    textContent: textContent.slice(0, 50000), // Limit text content size
  };
}
