/**
 * Retry utilities with exponential backoff
 */

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  onRetry?: (waitTime: number, retriesLeft: number) => void
}

/**
 * Retry an async operation with exponential backoff
 * Retries on errors that include '429' (rate limit) in the message
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries exhausted
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3
  const baseDelayMs = options?.baseDelayMs ?? 2000

  let retries = maxRetries
  let lastError: Error | null = null

  while (retries > 0) {
    try {
      return await operation()
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      const errMsg = lastError.message

      // Only retry on rate limit errors
      if (errMsg.includes('429') && retries > 1) {
        const waitTime = (maxRetries + 1 - retries) * baseDelayMs
        options?.onRetry?.(waitTime, retries - 1)
        await sleep(waitTime)
        retries--
      } else {
        throw lastError
      }
    }
  }

  throw lastError ?? new Error('Max retries exceeded')
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
