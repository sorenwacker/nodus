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
  /** Ends a wait between attempts early, rejecting with "Cancelled" */
  signal?: AbortSignal
}

/**
 * Waits of about 5, 15 and 45 seconds. A backend that stalls does so for
 * longer than a second or two, so attempts a second apart all landed in the
 * same stall (PRODUCT_DESIGN.md > Retrying a provider failure).
 */
const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 5000,
  maxDelayMs: 45000,
  backoffMultiplier: 3,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate_limit',
    'timeout',
    'overloaded',
    '503',
    // A gateway that gave up on a slow generation, or could not reach the
    // model at all. This is the most ordinary way a long agent run fails and a
    // single retry usually carries it
    // (PRODUCT_DESIGN.md > Retrying a provider failure)
    '504',
    '502',
    '429',
  ],
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error, retryablePatterns: string[]): boolean {
  const errorStr = error.message.toLowerCase()
  return retryablePatterns.some(pattern =>
    errorStr.includes(pattern.toLowerCase())
  )
}

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateBackoff(
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
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Cancelled'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new Error('Cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
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

      // Wait before retrying; stopping the run ends the wait
      await sleep(delayMs, opts.signal)
    }
  }

  throw lastError
}
