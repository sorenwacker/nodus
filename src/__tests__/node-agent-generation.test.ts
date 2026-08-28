/**
 * A superseded agent loop does not write the new run's state.
 *
 * Restarting cancelled the previous request and carried on. When that request
 * rejected, the old loop cleared the NEW run's `isRunning` flag, pushed into
 * the log the new run had just reset, and could still overwrite the new
 * content from an in-flight tool call. The main agent runner already solved
 * this with a generation token (PRODUCT_DESIGN.md > Superseding an agent run).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = resolve(__dirname, '../canvas/composables/agent/useNodeAgent.ts')

describe('the node agent generation token', () => {
  const source = readFileSync(SOURCE, 'utf-8')

  it('exists and advances on each run', () => {
    expect(source).toContain('let runGeneration = 0')
    expect(source).toContain('const generation = ++runGeneration')
  })

  it('guards every write to the running flag', () => {
    const unguarded = [...source.matchAll(/^\s*isRunning\.value = false/gm)]
    // Only stop() writes it directly, and it advances the generation first
    expect(unguarded.length).toBe(1)
    const stopBlock = source.slice(source.indexOf('function stop()'))
    expect(stopBlock.slice(0, 300)).toContain('runGeneration++')
  })

  it('guards the log so a dead loop cannot write into a fresh run', () => {
    const unguarded = [...source.matchAll(/^\s*log\.value\.push\(/gm)]
    // Only stop() writes the log directly
    expect(unguarded.length).toBe(1)
  })

  it('guards the content, so an in-flight tool call cannot overwrite it', () => {
    const inLoop = [...source.matchAll(/if \(isCurrent\(\)\) currentContent\.value =/g)]
    expect(inLoop.length).toBeGreaterThanOrEqual(2)
  })
})
