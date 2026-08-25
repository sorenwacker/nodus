/**
 * Namespaced logging with a selectable threshold.
 *
 * The threshold is settable and persisted, because detail nobody can turn on
 * is not logging: 25 `debug` call sites existed while the threshold could never
 * be lower than `info` (PRODUCT_DESIGN.md > Log level).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const STORAGE_KEY = 'nodus.logLevel'

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && value in LOG_LEVELS
}

/** The threshold when the user has not chosen one */
export function defaultLogLevel(): LogLevel {
  return import.meta.env.DEV ? 'info' : 'warn'
}

/** The user's choice from an earlier run, or null when there is none to honor */
export function storedLogLevel(): LogLevel | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLogLevel(stored) ? stored : null
  } catch {
    // Storage can be unavailable; the default threshold still applies
    return null
  }
}

let currentLevel: LogLevel = storedLogLevel() ?? defaultLogLevel()

/** The threshold in effect */
export function logLevel(): LogLevel {
  return currentLevel
}

/**
 * Select the threshold. It applies to subsequent messages at once and is
 * restored on the next start, so a user reproducing a problem does not
 * re-select it after every relaunch.
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level
  try {
    localStorage.setItem(STORAGE_KEY, level)
  } catch {
    // A threshold that cannot be persisted still applies to this session
  }
}

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
