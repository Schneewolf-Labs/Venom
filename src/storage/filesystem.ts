/**
 * Filesystem utilities for managing screenshots and data storage
 */

import fs from 'fs/promises';
import path from 'path';
import type { Logger } from '../types.js';

/**
 * Filesystem manager for Venom data storage
 */
export class FilesystemManager {
  private dataDir: string;
  private screenshotDir: string;
  private metadataDir: string;
  private logger: Logger;

  constructor(dataDir: string, logger: Logger) {
    this.dataDir = dataDir;
    this.screenshotDir = path.join(dataDir, 'screenshots');
    this.metadataDir = path.join(dataDir, 'metadata');
    this.logger = logger;
  }

  /**
   * Initialize the directory structure
   */
  async init(): Promise<void> {
    await this.ensureDir(this.dataDir);
    await this.ensureDir(this.screenshotDir);
    await this.ensureDir(this.metadataDir);
    this.logger.info(`Initialized filesystem at ${this.dataDir}`);
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Get the screenshot directory path
   */
  getScreenshotDir(): string {
    return this.screenshotDir;
  }

  /**
   * Get the metadata directory path
   */
  getMetadataDir(): string {
    return this.metadataDir;
  }

  /**
   * Read a screenshot file
   */
  async readScreenshot(screenshotPath: string): Promise<Buffer> {
    return fs.readFile(screenshotPath);
  }

  /**
   * Read a screenshot as base64
   */
  async readScreenshotBase64(screenshotPath: string): Promise<string> {
    const buffer = await this.readScreenshot(screenshotPath);
    return buffer.toString('base64');
  }

  /**
   * Delete a screenshot file
   */
  async deleteScreenshot(screenshotPath: string): Promise<void> {
    try {
      await fs.unlink(screenshotPath);
      this.logger.debug(`Deleted screenshot: ${screenshotPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get screenshot file size
   */
  async getScreenshotSize(screenshotPath: string): Promise<number> {
    const stats = await fs.stat(screenshotPath);
    return stats.size;
  }

  /**
   * List all screenshots
   */
  async listScreenshots(): Promise<string[]> {
    const files = await fs.readdir(this.screenshotDir);
    return files
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .map(f => path.join(this.screenshotDir, f));
  }

  /**
   * Save metadata JSON file
   */
  async saveMetadata(filename: string, data: unknown): Promise<string> {
    const filePath = path.join(this.metadataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  /**
   * Read metadata JSON file
   */
  async readMetadata<T>(filename: string): Promise<T> {
    const filePath = path.join(this.metadataDir, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get total storage used by screenshots
   */
  async getStorageUsed(): Promise<number> {
    const files = await this.listScreenshots();
    let totalSize = 0;

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        totalSize += stats.size;
      } catch {
        // Skip files that can't be accessed
      }
    }

    return totalSize;
  }

  /**
   * Clean up old screenshots (older than specified days)
   */
  async cleanupOldScreenshots(daysOld: number): Promise<number> {
    const files = await this.listScreenshots();
    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(file);
          deletedCount++;
        }
      } catch {
        // Skip files that can't be accessed
      }
    }

    this.logger.info(`Cleaned up ${deletedCount} old screenshots`);
    return deletedCount;
  }
}
