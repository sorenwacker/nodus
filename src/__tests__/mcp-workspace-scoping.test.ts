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

/** The methods the store interface declares. */
function interfaceMethods(): string[] {
  const start = handler.indexOf('export interface McpStoreInterface {')
  let depth = 0
  let end = start
  for (let i = handler.indexOf('{', start); i < handler.length; i++) {
    if (handler[i] === '{') depth++
    else if (handler[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const block = handler.slice(handler.indexOf('{', start) + 1, end)
  return [...block.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\??:/gm)].map(m => m[1])
}

/** The methods a scoped connection replaces. */
function scopedMethods(): string[] {
  const body = scoped.slice(scoped.indexOf('return {'))
  return [...body.matchAll(/^ {6}([A-Za-z][A-Za-z0-9_]*):/gm)].map(m => m[1])
}

/**
 * Methods that name one entity by its id. The id settles which workspace the
 * entity is in, so there is nothing left for a scope to decide.
 */
const ADDRESSED_BY_ID = [
  'updateNodeContent',
  'updateNodeTags',
  'updateNodeTitle',
  'updateNodePosition',
  'updateNodeSize',
  'updateNodeColor',
  'deleteNode',
  'updateEdgeDirected',
  'updateEdgeLabel',
  'updateEdgeColor',
  'updateFramePosition',
  'updateFrameSize',
  'updateFrameTitle',
  'updateFrameColor',
  'deleteFrame',
  'assignNodesToFrame',
  'getStorylineNodes',
  'updateStoryline',
  'deleteStoryline',
  'addNodeToStoryline',
  'removeNodeFromStoryline',
  'reorderStorylineNodes',
]

/**
 * The scoping machinery itself. Scoping these would remove the very reach a
 * scope is built from: the whole-database getters it filters, the workspace
 * list it resolves a name against, and the raw edge writes that bypass the
 * live store because that store holds only the open workspace's edges.
 */
const BUILDS_THE_SCOPE = [
  'getAllNodes',
  'getAllFrames',
  'getAllStorylines',
  'getWorkspaces',
  'loadWorkspaceEdges',
  'createEdgeRaw',
  'deleteEdgeRaw',
]
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

describe('every method of the store', () => {
  // A store that scopes some methods and inherits the rest cannot be read for
  // what it does: frame creation and every storyline operation were inherited,
  // so a scoped connection wrote into whichever workspace the user had open
  // (PRODUCT_DESIGN.md > Workspace scoping for MCP connections)
  it('is scoped, or recorded as not needing to be', () => {
    const accounted = new Set([...scopedMethods(), ...ADDRESSED_BY_ID, ...BUILDS_THE_SCOPE])
    const unaccounted = interfaceMethods().filter(name => !accounted.has(name))

    expect(unaccounted, 'inherited from the app store without a reason').toEqual([])
  })

  it('appears in one group only', () => {
    const seen = new Map<string, number>()
    for (const name of [...scopedMethods(), ...ADDRESSED_BY_ID, ...BUILDS_THE_SCOPE]) {
      seen.set(name, (seen.get(name) ?? 0) + 1)
    }
    const twice = [...seen].filter(([, count]) => count > 1).map(([name]) => name)

    expect(twice, 'recorded as both scoped and not').toEqual([])
  })

  it('keeps the ledger free of methods the interface no longer has', () => {
    const declared = new Set(interfaceMethods())
    const stale = [...ADDRESSED_BY_ID, ...BUILDS_THE_SCOPE].filter(name => !declared.has(name))

    expect(stale, 'recorded, but no longer on the interface').toEqual([])
  })

  it('scopes the writes, not only the reads', () => {
    const scopedNow = new Set(scopedMethods())
    for (const write of ['createNode', 'createFrame', 'createStoryline']) {
      expect(scopedNow.has(write), `${write} lands in whichever workspace is open`).toBe(true)
    }
  })
})
