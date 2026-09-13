/**
 * Async error handling utilities for import operations
 */
import { storeLogger } from './logger'
import type { Ref } from 'vue'

export interface AsyncErrorOptions {
  /** Context label for logging (e.g., 'Import', 'Citation import') */
  context: string
  /** Ref to store error message */
  error: Ref<string | null>
  /** Notification callback */
  notify: (title: string, message: string) => void
  /** Whether to rethrow the error (default: true) */
  rethrow?: boolean
}

/**
 * Creates an error handler for async operations
 * Standardizes logging, error state, and user notifications
 *
 * The handler rethrows unless asked not to, and its type says so: a caller
 * that reports and rethrows needs no fallback value afterwards, and one
 * written anyway would be unreachable code
 * (PRODUCT_DESIGN.md > Lookups that cannot be made).
 */
export function handleAsyncError(options: AsyncErrorOptions & { rethrow?: true }): (e: unknown) => never
export function handleAsyncError(options: AsyncErrorOptions & { rethrow: false }): (e: unknown) => void
export function handleAsyncError(options: AsyncErrorOptions): (e: unknown) => void {
  return (e: unknown): void => {
    const message = e instanceof Error ? e.message : String(e)
    options.error.value = message
    storeLogger.error(`${options.context}:`, e)
    options.notify(`${options.context} failed`, message)
    if (options.rethrow !== false) {
      throw e
    }
  }
}
