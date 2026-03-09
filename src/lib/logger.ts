/**
 * Simple logger utility
 * Provides structured logging with level control
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Default to 'info' in production, 'debug' in development
const currentLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'info'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function formatMessage(prefix: string, message: string): string {
  return `[${prefix}] ${message}`
}

/**
 * Create a namespaced logger
 */
export function createLogger(namespace: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      if (shouldLog('debug')) {
        console.debug(formatMessage(namespace, message), ...args)
      }
    },
    info(message: string, ...args: unknown[]) {
      if (shouldLog('info')) {
        console.info(formatMessage(namespace, message), ...args)
      }
    },
    warn(message: string, ...args: unknown[]) {
      if (shouldLog('warn')) {
        console.warn(formatMessage(namespace, message), ...args)
      }
    },
    error(message: string, ...args: unknown[]) {
      if (shouldLog('error')) {
        console.error(formatMessage(namespace, message), ...args)
      }
    },
  }
}

// Pre-configured loggers for common namespaces
export const appLogger = createLogger('Nodus')
export const storeLogger = createLogger('Store')
export const canvasLogger = createLogger('Canvas')
export const agentLogger = createLogger('Agent')
