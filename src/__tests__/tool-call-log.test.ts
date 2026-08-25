/**
 * The log shows which tools ran (PRODUCT_DESIGN.md > Agent log contents).
 *
 * Tool calls were recorded only in the chat transcript, so the log showed
 * prompts and warnings but never the actions between them.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describeToolCall } from '../lib/toolCallSummary'

describe('tool call summary', () => {
  it('names the tool and its arguments', () => {
    expect(describeToolCall('create_node', { title: 'Snellius', node_type: 'note' }))
      .toBe('create_node(title=Snellius, node_type=note)')
  })

  it('shortens a long value instead of dumping it', () => {
    const line = describeToolCall('update_node', { content: 'x'.repeat(500) })
    expect(line.length).toBeLessThan(80)
    expect(line).toContain('…')
  })

  it('summarises arrays and objects by shape', () => {
    expect(describeToolCall('batch', { ids: ['a', 'b', 'c'], opts: { deep: true } }))
      .toBe('batch(ids=[3], opts={...})')
  })

  it('counts the arguments it leaves out', () => {
    const line = describeToolCall('t', { a: 1, b: 2, c: 3, d: 4, e: 5 })
    expect(line).toContain('+2 more')
  })

  it('handles a call with no arguments', () => {
    expect(describeToolCall('read_graph', {})).toBe('read_graph()')
  })
})

describe('the runner writes those lines', () => {
  const runner = readFileSync(
    resolve(__dirname, '../canvas/composables/agent/useAgentRunner.ts'),
    'utf-8'
  )

  it('logs every tool call, not only mutations', () => {
    expect(runner).toContain('describeToolCall(tc.function.name, parsedArgs)')
  })

  it('marks a failed call as failed', () => {
    // A silent line reads as success
    expect(runner).toContain('failed:')
  })
})
