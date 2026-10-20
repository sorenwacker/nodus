/**
 * The hover tooltip stands in for content a collapsed card does not show, so
 * it follows the same collapse state as the cards rather than a zoom limit of
 * its own (PRODUCT_DESIGN.md > Hover tooltip visibility).
 */
import { describe, it, expect } from 'vitest'
import { computed, ref } from 'vue'
import { useNodeHover } from '../canvas/composables/nodes/useNodeHover'

function setup(collapsed: boolean, lod = false) {
  const hover = useNodeHover({
    isCollapsed: ref(collapsed),
    isLODMode: computed(() => lod),
    selectedNodeIds: ref([]),
    filteredEdges: ref([]),
    getNode: () => undefined,
  })
  hover.hoveredNodeId.value = 'n1'
  return hover
}

describe('hover tooltip visibility', () => {
  it('shows while cards are collapsed, at any zoom', () => {
    // A threshold of 100% collapses cards at 80% zoom, above the old 50% limit
    expect(setup(true).showHoverTooltip.value).toBe(true)
  })

  it('stays hidden while cards show their content', () => {
    expect(setup(false).showHoverTooltip.value).toBe(false)
  })

  it('shows in dense mode', () => {
    expect(setup(false, true).showHoverTooltip.value).toBe(true)
  })
})
