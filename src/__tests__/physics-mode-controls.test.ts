/**
 * Physics mode is reachable from the canvas controls and from the keyboard
 * (PRODUCT_DESIGN.md > Physics Mode).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import CanvasControls from '../canvas/components/CanvasControls.vue'
import { useCanvasKeyboardShortcuts } from '../canvas/composables/util/useCanvasKeyboardShortcuts'
import { ref, defineComponent } from 'vue'

function mountControls(physicsActive: boolean, physicsAvailable: boolean) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(CanvasControls, {
    props: {
      scale: 1,
      gridLockEnabled: false,
      isLargeGraph: false,
      globalEdgeStyle: 'orthogonal',
      neighborhoodMode: false,
      neighborhoodDepth: 1,
      highlightAllEdges: false,
      bubbleModeActive: false,
      physicsActive,
      physicsAvailable,
    },
    global: { plugins: [i18n] },
  })
}

describe('the physics mode control', () => {
  it('toggles physics mode', async () => {
    const controls = mountControls(false, true)
    await controls.find('.physics-toggle').trigger('click')
    expect(controls.emitted('togglePhysics')).toHaveLength(1)
  })

  it('shows when the mode is running', () => {
    expect(mountControls(true, true).find('.physics-toggle').classes()).toContain('active')
  })

  it('is disabled, and says why, where the mode cannot start', () => {
    const button = mountControls(false, false).find('.physics-toggle')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('data-tooltip')).toBe(en.canvas.controls.physicsUnavailable)
  })

  it('stays usable to switch the mode off even when it could not start now', () => {
    expect(mountControls(true, false).find('.physics-toggle').attributes('disabled')).toBeUndefined()
  })
})

describe('the P shortcut', () => {
  it('toggles physics mode', () => {
    const togglePhysics = vi.fn()
    const noop = () => {}
    // The listener is registered on mount, as in the canvas
    const Host = defineComponent({ setup() { useCanvasKeyboardShortcuts({
      selectedNodeIds: ref([]),
      selectedEdge: ref(null),
      deleteSelectedNodes: noop,
      deleteSelectedEdge: noop,
      selectAllNodes: noop,
      copySelectedNodes: noop,
      pasteNodes: noop,
      resetAllNodeSizes: noop,
      layoutNodes: noop,
      fitToContent: noop,
      toggleNeighborhoodMode: noop,
      togglePhysics,
      fontScale: ref(1),
      increaseFontScale: noop,
      decreaseFontScale: noop,
      refreshFromFiles: noop,
      exportGraphAsYaml: noop,
      showHelp: noop,
    }); return () => null } })
    mount(Host, { attachTo: document.body })
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))
    expect(togglePhysics).toHaveBeenCalledTimes(1)
  })
})
