/**
 * Parsing helpers for model output that embeds JSON or YAML in prose.
 */

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
