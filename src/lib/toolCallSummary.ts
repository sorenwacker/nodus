/**
 * One readable line for a tool call in the agent log.
 *
 * Arguments are summarised rather than dumped: a run of fifty calls has to stay
 * readable, and a node's full markdown in the log hides everything around it
 * (PRODUCT_DESIGN.md > Agent log contents).
 */

const MAX_VALUE = 40
const MAX_ARGS = 3

function summariseValue(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (Array.isArray(value)) return `[${value.length}]`
  if (typeof value === 'object') return '{...}'
  const text = String(value).replace(/\s+/g, ' ')
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text
}

export function describeToolCall(name: string, args: Record<string, unknown>): string {
  const entries = Object.entries(args ?? {})
  const shown = entries
    .slice(0, MAX_ARGS)
    .map(([key, value]) => `${key}=${summariseValue(value)}`)
  const omitted = entries.length - shown.length
  if (omitted > 0) shown.push(`+${omitted} more`)
  return `${name}(${shown.join(', ')})`
}
