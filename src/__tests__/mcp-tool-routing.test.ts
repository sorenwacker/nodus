/**
 * A name the router accepts is a tool the server advertises, and the reverse.
 *
 * Three names were routed and advertised nowhere: batch_update_nodes,
 * get_duplicate_edges and cleanup_duplicate_edges. No client can send a request
 * for a tool it is never offered, so those handlers answered nothing
 * (PRODUCT_DESIGN.md > A routed tool is an advertised tool).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NODUS_TOOLS } from '../../packages/nodus-mcp-server/src/tools'

const HANDLER = resolve(__dirname, '../mcp/messageHandler.ts')

/** The tool names the request router handles. */
function routedNames(): string[] {
  const source = readFileSync(HANDLER, 'utf-8')
  // From routeRequest, not dispatchRequest: the workspace tools are handled in
  // the outer function, and slicing below it made them look unrouted
  const dispatch = source.slice(source.indexOf('function routeRequest'))
  return [...new Set([...dispatch.matchAll(/case '([a-z_0-9]+)'/g)].map(m => m[1]))]
}

function advertisedNames(): string[] {
  return [...new Set(NODUS_TOOLS.map(t => t.name))]
}

describe('the MCP tool surface', () => {
  it('finds both lists', () => {
    expect(routedNames().length).toBeGreaterThan(20)
    expect(advertisedNames().length).toBeGreaterThan(20)
  })

  it('advertises every tool it routes', () => {
    const advertised = new Set(advertisedNames())
    const unreachable = routedNames().filter(name => !advertised.has(name))

    expect(unreachable, 'routed, but no client is offered them').toEqual([])
  })

  it('routes every tool it advertises', () => {
    const routed = new Set(routedNames())
    const unrouted = advertisedNames().filter(name => !routed.has(name))

    expect(unrouted, 'advertised, but the router would refuse them').toEqual([])
  })
})
