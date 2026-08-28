/**
 * What a tool reports is what it did.
 *
 * The model reads these strings as ground truth for the action it just took, so
 * a count that is neither nodes nor changes, or a flag that is always true,
 * teaches it something false (PRODUCT_DESIGN.md > Reporting what a batch did).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { handleGetNodesByColor, normalizeColor } from '../mcp/handlers/nodeHandlers'

describe('finding nodes by colour', () => {
  // Writes normalise a name to hex before storing. Comparing the raw input
  // meant a query by name - the names the tool documents - matched nothing.
  const store = {
    getFilteredNodes: () => [
      { id: 'a', title: 'Alpha', color_theme: normalizeColor('red') },
      { id: 'b', title: 'Beta', color_theme: normalizeColor('blue') },
    ],
  } as never

  it('matches a colour given by name', () => {
    const found = handleGetNodesByColor(store, { color: 'red' })

    expect(found.map(n => n.id)).toEqual(['a'])
  })

  it('matches the same colour given as hex', () => {
    const hex = normalizeColor('red')!

    expect(handleGetNodesByColor(store, { color: hex }).map(n => n.id)).toEqual(['a'])
  })

  it('returns nothing for a colour no node has', () => {
    expect(handleGetNodesByColor(store, { color: 'green' })).toEqual([])
  })
})

describe('what batch_update reports', () => {
  const source = readFileSync(resolve(__dirname, '../llm/tools/updateTools.ts'), 'utf-8')

  it('counts nodes rather than changes', () => {
    // A node renamed AND moved is one node, not two
    expect(source).toContain('updatedTitles.size')
    expect(source).not.toMatch(/Updated \$\{results\.length\} nodes/)
  })

  it('says which titles were not found instead of counting them as updated', () => {
    expect(source).toContain('Not found:')
  })
})

describe('what fit_frame_to_contents reports', () => {
  it('reports resized only when the size changed', () => {
    const source = readFileSync(resolve(__dirname, '../mcp/handlers/frameHandlers.ts'), 'utf-8')

    expect(source).not.toContain('return { success: true, resized: true }')
    expect(source).toContain('after.width !== before.width')
  })
})

describe('what batch_move_nodes promises', () => {
  it('does not offer relative offsets it cannot accept', () => {
    const tools = readFileSync(
      resolve(__dirname, '../../packages/nodus-mcp-server/src/tools.ts'),
      'utf-8'
    )
    const start = tools.indexOf("name: 'batch_move_nodes'")
    const block = tools.slice(start, tools.indexOf('},', tools.indexOf('inputSchema', start)))

    expect(block).not.toMatch(/relative offsets/)
    expect(block).toContain('absolute')
  })
})
