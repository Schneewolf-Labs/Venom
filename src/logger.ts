/**
 * Logger configuration using Winston
 */

import winston from 'winston';
import type { Logger } from './types.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

/**
 * Custom log format
 */
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

/**
 * Create a Winston logger instance
 */
export function createLogger(level: string = 'info'): Logger {
  const logger = winston.createLogger({
    level,
    format: combine(
      errors({ stack: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      logFormat
    ),
    transports: [
      new winston.transports.Console({
        format: combine(
          colorize(),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          logFormat
        ),
      }),
    ],
  });

  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(message, meta);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(message, meta);
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(message, meta);
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(message, meta);
    },
  };
}
