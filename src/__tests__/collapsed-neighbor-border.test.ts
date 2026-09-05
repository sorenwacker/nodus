/**
 * A collapsed card dims to the canvas background with a muted border, written as
 * an inline style. An inline style outranks every stylesheet rule, so it also
 * overwrote the neighbour highlight's border - in every theme, whatever the
 * cascade said. The selected node was exempt from the dimming and kept its ring,
 * which is why selecting a node appeared to highlight nothing but itself
 * (docs/content/features.md > Neighbor Highlighting).
 */
import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useCanvasNodeStyle } from '../canvas/composables/nodes/useCanvasNodeStyle'

function styleFor(opts: { collapsed: boolean; selected: string[]; highlighted: string[] }) {
  const { getNodeStyle } = useCanvasNodeStyle({
    fontScale: ref(1),
    resizingNode: ref(null),
    resizePreview: ref({ x: 0, y: 0, width: 0, height: 0 }),
    nodeZOrder: ref(new Map()),
    nodeBorderWidth: computed(() => 2),
    isSemanticZoomCollapsed: computed(() => opts.collapsed),
    selectedNodeIds: computed(() => opts.selected),
    highlightedNodeIds: computed(() => new Set(opts.highlighted)),
    currentTheme: ref('dark'),
  })
  return getNodeStyle({ id: 'a', canvas_x: 0, canvas_y: 0, width: 200, height: 120 })
}

describe('collapsed card border versus the neighbour highlight', () => {
  it('dims an ordinary collapsed card', () => {
    const style = styleFor({ collapsed: true, selected: [], highlighted: [] })
    expect(style.borderColor).toBe('var(--text-muted)')
    expect(style.background).toBe('var(--bg-canvas)')
  })

  it('leaves the border to the stylesheet when the card is a highlighted neighbour', () => {
    const style = styleFor({ collapsed: true, selected: [], highlighted: ['a'] })
    expect(style.borderColor).toBeUndefined()
  })

  it('does not dim a card that is not collapsed', () => {
    const style = styleFor({ collapsed: false, selected: [], highlighted: [] })
    expect(style.borderColor).toBeUndefined()
  })
})
