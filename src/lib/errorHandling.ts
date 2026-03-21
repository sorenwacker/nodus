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
 */
export function handleAsyncError(options: AsyncErrorOptions) {
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
