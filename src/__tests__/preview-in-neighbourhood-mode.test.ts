/**
 * Selecting a node opens its preview wherever the card does not show the
 * content, in neighbourhood mode as elsewhere
 * (PRODUCT_DESIGN.md > Neighborhood Mode > Reading a node).
 *
 * The condition handed to the preview panel excluded neighbourhood mode, so in
 * a zoomed-out neighbourhood a click selected a node and showed nothing of it.
 */
import { describe, it, expect } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { readFileSync } from 'fs'
import { join } from 'path'
import { usePreviewPanel, contentUnreadableOnCanvas } from '../canvas/composables/viewport/usePreviewPanel'
import type { Node } from '../types'

describe('when the preview stands in for the card', () => {
  it('is whenever cards are collapsed or nodes are bubbles', () => {
    expect(contentUnreadableOnCanvas(true, false)).toBe(true)
    expect(contentUnreadableOnCanvas(false, true)).toBe(true)
    expect(contentUnreadableOnCanvas(false, false)).toBe(false)
  })

  it('is decided by that rule alone on the canvas, not by neighbourhood mode', () => {
    const source = readFileSync(join(__dirname, '..', 'canvas', 'GraphCanvas.vue'), 'utf8')
    const start = source.indexOf('usePreviewPanel({')
    const call = source.slice(start, source.indexOf('})', start))

    expect(start).toBeGreaterThan(-1)
    expect(call).toContain('contentUnreadableOnCanvas(')
    expect(call).not.toMatch(/neighborhood/i)
  })
})

describe('the preview panel', () => {
  it('opens for a single selected node whose content the canvas does not show', async () => {
    const selected = ref<string[]>([])
    const unreadable = ref(true)
    const panel = usePreviewPanel({
      selectedNodeIds: selected,
      isSemanticZoomCollapsed: computed(() => unreadable.value),
      contextMenuVisible: ref(false),
      getNode: id => ({ id, title: id }) as Node,
      zoomToNode: () => {},
    })

    selected.value = ['a']
    await nextTick()

    expect(panel.showPreviewPanel.value).toBe(true)
    expect(panel.previewNode.value?.id).toBe('a')
  })
})
