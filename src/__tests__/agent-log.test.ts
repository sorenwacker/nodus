import { describe, it, expect } from 'vitest'
import { errorLog, isErrorLog, ERROR_MARKER } from '../llm/agentLog'

describe('agent log error marker', () => {
  it('marks genuine failures so the log panel auto-opens', () => {
    const line = errorLog('Web search failed')
    expect(line.startsWith(ERROR_MARKER)).toBe(true)
    expect(isErrorLog(line)).toBe(true)
  })

  it('ignores tool results that merely contain the word "Error"', () => {
    // complete-plan validation hint, logged as a plain tool result
    expect(isErrorLog('  → ERROR: Cannot complete. You created 5 nodes but 0 edges.')).toBe(false)
    // mixed-case tool result
    expect(isErrorLog('  → Error: Node "x" not found')).toBe(false)
  })

  it('ignores ordinary progress lines', () => {
    expect(isErrorLog('> create_node({"title":"A"})')).toBe(false)
    expect(isErrorLog('  Searching: quantum computing')).toBe(false)
  })
})
