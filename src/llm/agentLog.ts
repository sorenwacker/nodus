/**
 * Markers for genuine failures in the agent activity log.
 *
 * The agent log panel auto-opens only for lines that carry ERROR_MARKER. Tool
 * results are logged without it, so a result that merely contains the word
 * "Error" or "ERROR" (for example the validation hint returned by the
 * complete-plan tool) never surfaces the panel.
 */

/** Prefix identifying a log line as a genuine agent or tool failure. */
export const ERROR_MARKER = '✗ ERROR:'

/** Build a failure log line carrying the error marker. */
export function errorLog(message: string): string {
  return `${ERROR_MARKER} ${message}`
}

/** Report whether a log line represents a genuine failure. */
export function isErrorLog(line: string): boolean {
  return line.startsWith(ERROR_MARKER)
}

/** "62 s" or "4 min 50 s" */
function describeElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

/**
 * The failure of a request, with how many attempts were made and how long
 * they took, so a stall of a minute per attempt does not read like a refusal
 * that came at once (PRODUCT_DESIGN.md > Reporting a provider failure). A
 * stop is not a failure and is returned as it came.
 */
export function describeRequestFailure(error: unknown, attempts: number, elapsedMs: number): Error {
  const original = error instanceof Error ? error : new Error(String(error))
  if (original.name === 'AbortError' || original.message === 'Cancelled') return original
  const detail =
    attempts > 1
      ? `after ${attempts} attempts over ${describeElapsed(elapsedMs)}`
      : `on the first attempt, after ${describeElapsed(elapsedMs)}`
  const described = new Error(`${original.message} (${detail})`)
  described.name = original.name
  return described
}
