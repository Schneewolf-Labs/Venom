/**
 * SQLite database for storing capture metadata and job queue
 */

import Database from 'better-sqlite3';
import type {
  PageCapture,
  CrawlJob,
  CaptureRow,
  JobRow,
  LinkRow,
  CaptionResult,
  Logger,
} from '../types.js';

/**
 * Database manager for Venom
 */
export class VenomDatabase {
  private db: Database.Database;
  private logger: Logger;

  constructor(dbPath: string, logger: Logger) {
    this.logger = logger;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    this.db.exec(`
      -- Captures table: stores page capture metadata
      CREATE TABLE IF NOT EXISTS captures (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        normalized_url TEXT NOT NULL UNIQUE,
        domain TEXT NOT NULL,
        depth INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        screenshot_path TEXT NOT NULL,
        html_content TEXT NOT NULL,
        html_title TEXT NOT NULL,
        html_description TEXT,
        html_text_content TEXT NOT NULL,
        css_content TEXT NOT NULL,
        css_stylesheet_count INTEGER NOT NULL,
        status_code INTEGER NOT NULL,
        final_url TEXT NOT NULL,
        load_time INTEGER NOT NULL,
        caption TEXT,
        caption_visual_elements TEXT,
        caption_page_type TEXT,
        caption_confidence REAL,
        caption_model TEXT,
        caption_timestamp TEXT,
        caption_tokens_used INTEGER
      );

      -- Links table: stores extracted links for each capture
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id TEXT NOT NULL,
        href TEXT NOT NULL,
        text TEXT NOT NULL,
        is_internal INTEGER NOT NULL,
        FOREIGN KEY (capture_id) REFERENCES captures(id)
      );

      -- Jobs table: stores crawl job queue
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        depth INTEGER NOT NULL,
        parent_url TEXT,
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Stats table: stores crawl session statistics
      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        urls_discovered INTEGER NOT NULL DEFAULT 0,
        urls_crawled INTEGER NOT NULL DEFAULT 0,
        urls_failed INTEGER NOT NULL DEFAULT 0,
        urls_skipped INTEGER NOT NULL DEFAULT 0,
        screenshots_taken INTEGER NOT NULL DEFAULT 0,
        captions_generated INTEGER NOT NULL DEFAULT 0,
        start_time TEXT NOT NULL,
        end_time TEXT,
        bytes_downloaded INTEGER NOT NULL DEFAULT 0
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_captures_domain ON captures(domain);
      CREATE INDEX IF NOT EXISTS idx_captures_timestamp ON captures(timestamp);
      CREATE INDEX IF NOT EXISTS idx_links_capture_id ON links(capture_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
    `);

    this.logger.info('Database schema initialized');
  }

  /**
   * Save a page capture to the database
   */
  saveCapture(capture: PageCapture): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO captures (
        id, url, normalized_url, domain, depth, timestamp,
        screenshot_path, html_content, html_title, html_description,
        html_text_content, css_content, css_stylesheet_count,
        status_code, final_url, load_time,
        caption, caption_visual_elements, caption_page_type,
        caption_confidence, caption_model, caption_timestamp, caption_tokens_used
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      capture.id,
      capture.url,
      capture.normalizedUrl,
      capture.domain,
      capture.depth,
      capture.timestamp.toISOString(),
      capture.screenshotPath,
      capture.html.html,
      capture.html.title,
      capture.html.description || null,
      capture.html.textContent,
      capture.css.css,
      capture.css.stylesheetCount,
      capture.statusCode,
      capture.finalUrl,
      capture.loadTime,
      capture.caption?.caption || null,
      capture.caption?.visualElements ? JSON.stringify(capture.caption.visualElements) : null,
      capture.caption?.pageType || null,
      capture.caption?.confidence || null,
      capture.caption?.model || null,
      capture.caption?.timestamp?.toISOString() || null,
      capture.caption?.tokensUsed || null
    );

    // Save links
    const linkStmt = this.db.prepare(`
      INSERT INTO links (capture_id, href, text, is_internal)
      VALUES (?, ?, ?, ?)
    `);

    const deleteLinksStmt = this.db.prepare(`
      DELETE FROM links WHERE capture_id = ?
    `);

    deleteLinksStmt.run(capture.id);

    for (const link of capture.html.links) {
      linkStmt.run(capture.id, link.href, link.text, link.isInternal ? 1 : 0);
    }

    this.logger.debug(`Saved capture: ${capture.url}`);
  }

  /**
   * Get a capture by its ID
   */
  getCapture(id: string): PageCapture | null {
    const stmt = this.db.prepare(`
      SELECT * FROM captures WHERE id = ?
    `);

    const row = stmt.get(id) as CaptureRow | undefined;
    if (!row) return null;

    return this.rowToCapture(row);
  }

  /**
   * Get a capture by URL
   */
  getCaptureByUrl(url: string): PageCapture | null {
    const stmt = this.db.prepare(`
      SELECT * FROM captures WHERE normalized_url = ?
    `);

    const row = stmt.get(url) as CaptureRow | undefined;
    if (!row) return null;

    return this.rowToCapture(row);
  }

  /**
   * Get all captures for a domain
   */
  getCapturesByDomain(domain: string): PageCapture[] {
    const stmt = this.db.prepare(`
      SELECT * FROM captures WHERE domain = ? ORDER BY timestamp DESC
    `);

    const rows = stmt.all(domain) as CaptureRow[];
    return rows.map(row => this.rowToCapture(row));
  }

  /**
   * Get captures without captions
   */
  getCapturesWithoutCaptions(limit: number = 100): PageCapture[] {
    const stmt = this.db.prepare(`
      SELECT * FROM captures WHERE caption IS NULL LIMIT ?
    `);

    const rows = stmt.all(limit) as CaptureRow[];
    return rows.map(row => this.rowToCapture(row));
  }

  /**
   * Update caption for a capture
   */
  updateCaption(captureId: string, caption: CaptionResult): void {
    const stmt = this.db.prepare(`
      UPDATE captures SET
        caption = ?,
        caption_visual_elements = ?,
        caption_page_type = ?,
        caption_confidence = ?,
        caption_model = ?,
        caption_timestamp = ?,
        caption_tokens_used = ?
      WHERE id = ?
    `);

    stmt.run(
      caption.caption,
      JSON.stringify(caption.visualElements),
      caption.pageType,
      caption.confidence,
      caption.model,
      caption.timestamp.toISOString(),
      caption.tokensUsed,
      captureId
    );

    this.logger.debug(`Updated caption for capture: ${captureId}`);
  }

  /**
   * Convert a database row to a PageCapture object
   */
  private rowToCapture(row: CaptureRow): PageCapture {
    // Get links for this capture
    const linksStmt = this.db.prepare(`
      SELECT * FROM links WHERE capture_id = ?
    `);
    const linkRows = linksStmt.all(row.id) as LinkRow[];

    const capture: PageCapture = {
      id: row.id,
      url: row.url,
      normalizedUrl: row.normalized_url,
      domain: row.domain,
      depth: row.depth,
      timestamp: new Date(row.timestamp),
      screenshotPath: row.screenshot_path,
      html: {
        html: row.html_content,
        title: row.html_title,
        description: row.html_description || undefined,
        textContent: row.html_text_content,
        links: linkRows.map(l => ({
          href: l.href,
          text: l.text,
          isInternal: l.is_internal === 1,
        })),
      },
      css: {
        css: row.css_content,
        stylesheetCount: row.css_stylesheet_count,
        originalSize: row.css_content.length, // Approximation
      },
      statusCode: row.status_code,
      finalUrl: row.final_url,
      loadTime: row.load_time,
    };

    // Add caption if present
    if (row.caption) {
      capture.caption = {
        caption: row.caption,
        visualElements: row.caption_visual_elements
          ? JSON.parse(row.caption_visual_elements)
          : [],
        pageType: row.caption_page_type || '',
        confidence: row.caption_confidence || 0,
        model: row.caption_model || '',
        timestamp: row.caption_timestamp ? new Date(row.caption_timestamp) : new Date(),
        tokensUsed: row.caption_tokens_used || 0,
      };
    }

    return capture;
  }

  // ============ Job Queue Methods ============

  /**
   * Add a job to the queue
   */
  addJob(job: CrawlJob): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO jobs (
        id, url, depth, parent_url, priority, status,
        retry_count, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      job.id,
      job.url,
      job.depth,
      job.parentUrl || null,
      job.priority,
      job.status,
      job.retryCount,
      job.errorMessage || null,
      job.createdAt.toISOString(),
      job.updatedAt.toISOString()
    );
  }

  /**
   * Get the next pending job
   */
  getNextJob(): CrawlJob | null {
    const stmt = this.db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'pending'
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT 1
    `);

    const row = stmt.get() as JobRow | undefined;
    if (!row) return null;

    return this.rowToJob(row);
  }

  /**
   * Get pending jobs up to a limit
   */
  getPendingJobs(limit: number): CrawlJob[] {
    const stmt = this.db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'pending'
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as JobRow[];
    return rows.map(row => this.rowToJob(row));
  }

  /**
   * Update job status
   */
  updateJobStatus(
    jobId: string,
    status: string,
    errorMessage?: string
  ): void {
    const stmt = this.db.prepare(`
      UPDATE jobs SET
        status = ?,
        error_message = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(status, errorMessage || null, new Date().toISOString(), jobId);
  }

  /**
   * Increment job retry count
   */
  incrementJobRetry(jobId: string): void {
    const stmt = this.db.prepare(`
      UPDATE jobs SET
        retry_count = retry_count + 1,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(new Date().toISOString(), jobId);
  }

  /**
   * Check if a URL is already in the queue or captured
   */
  urlExists(url: string): boolean {
    const jobStmt = this.db.prepare(`
      SELECT 1 FROM jobs WHERE url = ? LIMIT 1
    `);
    const captureStmt = this.db.prepare(`
      SELECT 1 FROM captures WHERE normalized_url = ? LIMIT 1
    `);

    return !!(jobStmt.get(url) || captureStmt.get(url));
  }

  /**
   * Get job queue statistics
   */
  getJobStats(): { pending: number; completed: number; failed: number } {
    const stmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM jobs
    `);

    const result = stmt.get() as { pending: number; completed: number; failed: number };
    return {
      pending: result.pending || 0,
      completed: result.completed || 0,
      failed: result.failed || 0,
    };
  }

  /**
   * Convert a database row to a CrawlJob object
   */
  private rowToJob(row: JobRow): CrawlJob {
    return {
      id: row.id,
      url: row.url,
      depth: row.depth,
      parentUrl: row.parent_url || undefined,
      priority: row.priority as CrawlJob['priority'],
      status: row.status as CrawlJob['status'],
      retryCount: row.retry_count,
      errorMessage: row.error_message || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get total capture count
   */
  getCaptureCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM captures`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Get total caption count
   */
  getCaptionCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM captures WHERE caption IS NOT NULL
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    this.logger.info('Database connection closed');
  }
}
