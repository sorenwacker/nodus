/**
 * LLM utility functions
 */

/**
 * Clean LLM-generated content: fix escape sequences
 */
export function cleanContent(text: string | undefined | null): string {
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
 * Safe math expression evaluator using recursive descent parsing
 * Supports n, +, -, *, /, ^, parentheses
 * No use of eval() or Function() - fully parsed
 */
export function evalMathExpr(expr: string, n: number): string {
  try {
    // Replace n with the number
    const normalized = expr.replace(/\bn\b/g, String(n))
    // Only allow safe math characters
    if (!/^[\d\s+\-*/().^]+$/.test(normalized)) return expr
    const result = parseMathExpression(normalized)
    return String(Math.round(result * 1000) / 1000)
  } catch {
    return expr
  }
}

/**
 * Recursive descent parser for safe math evaluation
 */
function parseMathExpression(expr: string): number {
  let pos = 0
  const str = expr.replace(/\s/g, '')

  function parseNumber(): number {
    let numStr = ''
    while (pos < str.length && /[\d.]/.test(str[pos])) {
      numStr += str[pos++]
    }
    if (!numStr) throw new Error('Expected number')
    return parseFloat(numStr)
  }

  function parseFactor(): number {
    if (str[pos] === '(') {
      pos++ // skip '('
      const result = parseAddSub()
      if (str[pos] !== ')') throw new Error('Expected )')
      pos++ // skip ')'
      return result
    }
    // Handle negative numbers
    if (str[pos] === '-') {
      pos++
      return -parseFactor()
    }
    return parseNumber()
  }

  function parsePower(): number {
    let left = parseFactor()
    while (pos < str.length && str[pos] === '^') {
      pos++
      const right = parseFactor()
      left = Math.pow(left, right)
    }
    return left
  }

  function parseMulDiv(): number {
    let left = parsePower()
    while (pos < str.length && (str[pos] === '*' || str[pos] === '/')) {
      const op = str[pos++]
      const right = parsePower()
      left = op === '*' ? left * right : left / right
    }
    return left
  }

  function parseAddSub(): number {
    let left = parseMulDiv()
    while (pos < str.length && (str[pos] === '+' || str[pos] === '-')) {
      const op = str[pos++]
      const right = parseMulDiv()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  const result = parseAddSub()
  if (pos !== str.length) throw new Error('Unexpected character')
  return result
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
