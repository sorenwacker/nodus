/**
 * LLM utility functions
 */

/**
 * Clean LLM-generated content: fix escape sequences
 */
export function cleanContent(text: string): string {
  return (text || '')
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\\\t/g, '\t')
    .replace(/\\t/g, '\t')
    .replace(/direct\s*\.end/gi, '')
    .replace(/;\s*$/gm, '')
    .trim()
}

/**
 * Parse tool arguments from LLM response
 * Handles both JSON and stringified JSON
 */
export function parseToolArgs(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args)
    } catch {
      // LLM sometimes sends single quotes (Python-style) - convert to valid JSON
      try {
        const fixed = args
          .replace(/'/g, '"')
          .replace(/(\w+):/g, '"$1":')
        return JSON.parse(fixed)
      } catch {
        return {}
      }
    }
  }
  return (args as Record<string, unknown>) || {}
}

/**
 * Simple math expression evaluator
 * Supports n, +, -, *, /, ^, parentheses
 */
export function evalMathExpr(expr: string, n: number): string {
  try {
    // Replace n with the number, ^ with **
    const safe = expr.replace(/\bn\b/g, String(n)).replace(/\^/g, '**')
    // Only allow safe math characters
    if (!/^[\d\s+\-*/().]+$/.test(safe)) return expr
    return String(Math.round(Function(`"use strict"; return (${safe})`)() * 1000) / 1000)
  } catch {
    return expr
  }
}

/**
 * Extract number from string (e.g., "Node 42" -> 42)
 */
export function extractNumber(str: string): number {
  const match = str.match(/\d+/)
  return match ? parseInt(match[0], 10) : 0
}

/**
 * Prune messages to keep context window manageable
 */
export function pruneMessages(messages: unknown[], keepRecent: number = 6): unknown[] {
  if (messages.length <= keepRecent + 1) return messages

  // Keep system message (if any) + last N messages
  const systemMessages = messages.filter((m: unknown) => (m as { role?: string }).role === 'system')
  const nonSystemMessages = messages.filter((m: unknown) => (m as { role?: string }).role !== 'system')

  return [...systemMessages, ...nonSystemMessages.slice(-keepRecent)]
}
