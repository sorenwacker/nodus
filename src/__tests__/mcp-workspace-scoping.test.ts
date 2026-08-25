/**
 * A scoped connection sees one workspace, consistently
 * (PRODUCT_DESIGN.md > Workspace scoping for MCP connections).
 *
 * Scoping only the list getters produced a store that contradicted itself:
 * list_frames returned the target workspace's frames while get_frame on those
 * same ids resolved against whichever workspace the user had open.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const handler = readFileSync(resolve(__dirname, '../mcp/messageHandler.ts'), 'utf-8')
const scoped = handler.slice(
  handler.indexOf('async function scopedStoreFor'),
  handler.indexOf('/** Forget a connection')
)

describe('the scoped store', () => {
  it('scopes single-entity lookups, not only the lists', () => {
    expect(scoped).toContain('getNode:')
    expect(scoped).toContain('getFrame:')
  })

  it('derives those lookups from its own scoped collections', () => {
    // Deriving them from the app's filtered lists is what let the two drift
    expect(scoped).toMatch(/getNode:.*nodesInScope\(\)/)
    expect(scoped).toMatch(/getFrame:.*framesInScope\(\)/)
    expect(scoped).not.toMatch(/getNode:\s*store\.getNode/)
  })

  it('keeps the list getters and the lookups on one definition each', () => {
    expect(scoped).toContain('getFilteredNodes: nodesInScope')
    expect(scoped).toContain('getFilteredFrames: framesInScope')
  })
})
