/**
 * Safe parsing utilities
 *
 * Provides consistent JSON parsing and argument extraction
 * to eliminate duplicate try-catch blocks across the codebase.
 */

/**
 * Parse tool arguments that may be a string or object
 * Handles the common pattern where LLM tools receive args as string or object
 *
 * @param args - Arguments (string JSON or object)
 * @returns Parsed object
 */
export function parseToolArgs(args: unknown): Record<string, unknown> {
  if (!args) return {}
  if (typeof args === 'object' && args !== null) {
    return args as Record<string, unknown>
  }
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Get a string argument with optional default
 */
export function getStringArg(
  args: unknown,
  key: string,
  defaultValue = ''
): string {
  const parsed = parseToolArgs(args)
  const value = parsed[key]
  return typeof value === 'string' ? value : defaultValue
}

/**
 * Get a number argument with optional default
 */
export function getNumberArg(
  args: unknown,
  key: string,
  defaultValue = 0
): number {
  const parsed = parseToolArgs(args)
  const value = parsed[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const num = parseFloat(value)
    return isNaN(num) ? defaultValue : num
  }
  return defaultValue
}

/**
 * Get an array argument with optional default
 */
export function getArrayArg<T = unknown>(
  args: unknown,
  key: string,
  defaultValue: T[] = []
): T[] {
  const parsed = parseToolArgs(args)
  const value = parsed[key]
  return Array.isArray(value) ? value : defaultValue
}

/**
 * Extract JSON array from a string that may contain markdown or other text
 * Useful for parsing LLM responses that embed JSON in markdown code blocks
 *
 * @param text - Text potentially containing JSON array
 * @returns Parsed array or null if not found
 */
export function extractJSONArray<T = unknown>(text: string): T[] | null {
  if (!text) return null

  // Try to find array pattern
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0])
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Clean YAML content from LLM response
 * Removes markdown code fences if present
 */
export function cleanYAMLResponse(content: string): string {
  let cleaned = content.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(yaml|yml)?\n?/, '').replace(/\n?```$/, '')
  }
  return cleaned.trim()
}
