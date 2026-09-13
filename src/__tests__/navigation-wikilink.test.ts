/**
 * Canvas navigation follows a wikilink to the same node the link rendering does
 * (PRODUCT_DESIGN.md > Syncing wikilink edges).
 *
 * Navigation carried its own matching: titles only, with a hyphen-insensitive
 * fallback. The shared resolver also matches a note by its file path and by
 * its frame, so `[[concepts/beta]]` opened from the canvas led nowhere while
 * the same link in the reader opened the note.
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useNodeNavigation } from '../canvas/composables/nodes/useNodeNavigation'
import type { Node } from '../types'

function note(id: string, title: string, filePath: string | null): Node {
  return {
    id,
    title,
    file_path: filePath,
    markdown_content: '',
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    frame_id: null,
  } as Node
}

function navigation(nodes: Node[]) {
  const selectNode = vi.fn()
  const canvas = document.createElement('div')
  const nav = useNodeNavigation({
    getFilteredNodes: () => nodes,
    getNode: (id: string) => nodes.find(n => n.id === id),
    getVisualNode: (id: string) => nodes.find(n => n.id === id),
    getFrames: () => [],
    selectNode,
    canvasRef: ref(canvas),
    scale: ref(1),
    offsetX: ref(0),
    offsetY: ref(0),
    neighborhoodMode: ref(false),
  } as never)
  return { nav, selectNode }
}

describe('following a wikilink on the canvas', () => {
  it('finds a note by its file path, as the link rendering does', () => {
    const nodes = [note('n1', 'Beta Note', '/v/concepts/beta.md')]
    const { nav, selectNode } = navigation(nodes)

    nav.navigateToNode('concepts/beta')

    expect(selectNode).toHaveBeenCalledWith('n1')
  })

  it('still finds a note whose title is spelled with spaces, not hyphens', () => {
    const nodes = [note('n2', 'FAIR Digital Objects', null)]
    const { nav, selectNode } = navigation(nodes)

    nav.navigateToNode('FAIR-Digital-Objects')

    expect(selectNode).toHaveBeenCalledWith('n2')
  })

  it('selects nothing when no note matches', () => {
    const nodes = [note('n3', 'Something else', null)]
    const { nav, selectNode } = navigation(nodes)

    nav.navigateToNode('nothing/here')

    expect(selectNode).not.toHaveBeenCalled()
  })
})
