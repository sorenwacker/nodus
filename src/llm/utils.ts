/**
 * LLM utility functions
 */

/**
 * LaTeX commands that start with the same characters as the \n and \t escape
 * sequences. Their presence means a literal backslash-n/-t is math notation,
 * not a mangled newline.
 */
const LATEX_ESCAPE_LOOKALIKES =
  /\\(?:nabla|natural|ncong|nearrow|neg|neq|nexists|ni|nmid|not|notin|nparallel|nsim|nsubseteq|nsupseteq|nu|nwarrow|tan|tanh|tau|tbinom|text|textbf|textit|textrm|textsf|texttt|tfrac|theta|therefore|thicksim|tilde|times|to|top|triangle|triangledown|triangleleft|triangleright)\b/

/**
 * Clean LLM-generated content: fix escape sequences without corrupting LaTeX
 */
export function cleanContent(text: string | undefined | null): string {
  let result = (text || '')
    .replace(/\\\\n/g, '\n')
    .replace(/\\\\t/g, '\t')
    .replace(/direct\s*\.end/gi, '')
  // A single-escaped \n or \t is only unescaped when the text has no real
  // newlines (the signature of JSON-escaped output) and contains no LaTeX
  // commands like \nabla or \theta that the replacement would destroy
  if (!result.includes('\n') && !LATEX_ESCAPE_LOOKALIKES.test(result)) {
    result = result.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  }
  return result.trim()
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
