/**
 * CSS extraction and bundling processor
 */

import type { Page } from 'playwright';
import type { ExtractedCss } from '../types.js';

/**
 * Extract inline styles from the document
 */
async function extractInlineStyles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const styles: string[] = [];

    // Get all <style> tags
    document.querySelectorAll('style').forEach(style => {
      const content = style.textContent?.trim();
      if (content) {
        styles.push(content);
      }
    });

    return styles;
  });
}

/**
 * Extract linked stylesheet URLs
 */
async function getStylesheetUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const urls: string[] = [];

    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = (link as HTMLLinkElement).href;
      if (href) {
        urls.push(href);
      }
    });

    return urls;
  });
}

/**
 * Fetch a stylesheet's content
 */
async function fetchStylesheet(page: Page, url: string): Promise<string | null> {
  try {
    const response = await page.evaluate(async (stylesheetUrl: string) => {
      try {
        const res = await fetch(stylesheetUrl);
        if (!res.ok) return null;
        return await res.text();
      } catch {
        return null;
      }
    }, url);

    return response;
  } catch {
    return null;
  }
}

/**
 * Extract computed styles from the page (for critical elements)
 */
async function extractComputedStyles(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Get computed styles for key structural elements
    const selectors = [
      'body',
      'header',
      'nav',
      'main',
      'article',
      'section',
      'footer',
      'h1', 'h2', 'h3',
      'p',
      'a',
      'button',
      '.container',
      '.wrapper',
    ];

    const styles: string[] = [];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) return;

      const el = elements[0];
      if (!el) return;
      const computed = window.getComputedStyle(el);

      // Extract key style properties
      const keyProps = [
        'display', 'position', 'width', 'max-width', 'margin', 'padding',
        'font-family', 'font-size', 'line-height', 'color', 'background-color',
        'border', 'border-radius', 'box-shadow', 'flex', 'grid',
      ];

      const props = keyProps
        .map(prop => {
          const value = computed.getPropertyValue(prop);
          return value ? `${prop}: ${value}` : null;
        })
        .filter(Boolean)
        .join('; ');

      if (props) {
        styles.push(`/* ${selector} */ { ${props} }`);
      }
    });

    return styles.join('\n');
  });
}

/**
 * Clean and minify CSS content
 */
function cleanCss(css: string): string {
  return css
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Clean up around braces
    .replace(/\s*{\s*/g, ' { ')
    .replace(/\s*}\s*/g, ' }\n')
    .replace(/\s*;\s*/g, '; ')
    .trim();
}

/**
 * Main CSS extraction function
 */
export async function extractCss(page: Page): Promise<ExtractedCss> {
  const allCss: string[] = [];
  let totalOriginalSize = 0;
  let stylesheetCount = 0;

  // Extract inline styles
  const inlineStyles = await extractInlineStyles(page);
  inlineStyles.forEach(style => {
    totalOriginalSize += style.length;
    allCss.push(`/* Inline Style */\n${style}`);
    stylesheetCount++;
  });

  // Get linked stylesheet URLs
  const stylesheetUrls = await getStylesheetUrls(page);

  // Fetch each stylesheet
  for (const url of stylesheetUrls) {
    const content = await fetchStylesheet(page, url);
    if (content) {
      totalOriginalSize += content.length;
      allCss.push(`/* Stylesheet: ${url} */\n${content}`);
      stylesheetCount++;
    }
  }

  // Also extract computed styles for key elements
  const computedStyles = await extractComputedStyles(page);
  if (computedStyles) {
    allCss.push(`/* Computed Styles */\n${computedStyles}`);
  }

  // Combine and clean all CSS
  const combinedCss = allCss.join('\n\n');
  const cleanedCss = cleanCss(combinedCss);

  return {
    css: cleanedCss.slice(0, 500000), // Limit CSS size
    stylesheetCount,
    originalSize: totalOriginalSize,
  };
}
