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
