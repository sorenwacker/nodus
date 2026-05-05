/**
 * Retry utilities for LLM operations
 *
 * Provides exponential backoff retry logic for handling transient failures.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number
  /** Initial delay in milliseconds */
  initialDelayMs: number
  /** Maximum delay in milliseconds */
  maxDelayMs: number
  /** Multiplier for exponential backoff */
  backoffMultiplier: number
  /** Error types that should trigger a retry */
  retryableErrors?: string[]
  /** Callback for logging retry attempts */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate_limit',
    'timeout',
    'overloaded',
    '503',
    '502',
    '429',
  ],
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error, retryablePatterns: string[]): boolean {
  const errorStr = error.message.toLowerCase()
  return retryablePatterns.some(pattern =>
    errorStr.includes(pattern.toLowerCase())
  )
}

/**
 * Calculate delay for exponential backoff with jitter
 */
export function calculateBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  multiplier: number
): number {
  const exponentialDelay = initialDelayMs * Math.pow(multiplier, attempt)
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs)
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = cappedDelay * Math.random() * 0.25
  return Math.floor(cappedDelay + jitter)
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      lastError = error

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxRetries) {
        break
      }

      // Don't retry non-retryable errors
      if (opts.retryableErrors && !isRetryableError(error, opts.retryableErrors)) {
        break
      }

      // Calculate backoff delay
      const delayMs = calculateBackoff(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier
      )

      // Notify about retry
      opts.onRetry?.(attempt + 1, error, delayMs)

      // Wait before retrying
      await sleep(delayMs)
    }
  }

  throw lastError
}

/**
 * Create a retry wrapper for a class of operations
 */
export function createRetryWrapper(defaultOptions: Partial<RetryOptions> = {}) {
  return function retry<T>(
    fn: () => Promise<T>,
    overrideOptions: Partial<RetryOptions> = {}
  ): Promise<T> {
    return withRetry(fn, { ...defaultOptions, ...overrideOptions })
  }
}

/**
 * Retry wrapper specifically for LLM calls
 */
export const llmRetry = createRetryWrapper({
  maxRetries: 2,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryableErrors: [
    'rate_limit',
    'overloaded',
    '429',
    '503',
    'timeout',
    'ECONNRESET',
  ],
})
