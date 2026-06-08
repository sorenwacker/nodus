import { ref, onMounted, onUnmounted } from 'vue'
import { canvasStorage } from '../../../lib/storage'

/**
 * Manages canvas settings state.
 * Provides reactive state for grid lock, edge highlighting, and modal visibility.
 */
export function useCanvasSettings(workspaceId?: string) {
  // Grid snap settings
  const gridLockEnabled = ref(false)
  const gridSize = 20

  // Edge display settings
  const highlightAllEdges = ref(false)
  const edgeHideThreshold = ref(canvasStorage.getEdgeHideThreshold(workspaceId))
  const edgeLabelSize = ref(canvasStorage.getEdgeLabelSize(workspaceId))
  const hideWikilinkEdges = ref(canvasStorage.getHideWikilinkEdges(workspaceId))
  const hideStorylineEdges = ref(canvasStorage.getHideStorylineEdges(workspaceId))

  // Help modal visibility
  const showHelpModal = ref(false)

  function toggleGridLock() {
    gridLockEnabled.value = !gridLockEnabled.value
  }

  function toggleHighlightAllEdges() {
    highlightAllEdges.value = !highlightAllEdges.value
  }

  function showHelp() {
    showHelpModal.value = true
  }

  function hideHelp() {
    showHelpModal.value = false
  }

  function snapToGrid(value: number): number {
    if (!gridLockEnabled.value) return value
    return Math.round(value / gridSize) * gridSize
  }

  // Listen for edge hide threshold changes from settings panel
  function onEdgeHideThresholdChange(e: Event) {
    const customEvent = e as CustomEvent<number>
    edgeHideThreshold.value = customEvent.detail
  }

  // Listen for edge label size changes from settings panel
  function onEdgeLabelSizeChange(e: Event) {
    const customEvent = e as CustomEvent<number>
    edgeLabelSize.value = customEvent.detail
  }

  // Listen for hide wikilink edges changes from settings panel
  function onHideWikilinkEdgesChange(e: Event) {
    const customEvent = e as CustomEvent<boolean>
    hideWikilinkEdges.value = customEvent.detail
  }

  // Listen for hide storyline edges changes from settings panel
  function onHideStorylineEdgesChange(e: Event) {
    const customEvent = e as CustomEvent<boolean>
    hideStorylineEdges.value = customEvent.detail
  }

  onMounted(() => {
    window.addEventListener('nodus-edge-hide-threshold-change', onEdgeHideThresholdChange)
    window.addEventListener('nodus-edge-label-size-change', onEdgeLabelSizeChange)
    window.addEventListener('nodus-hide-wikilink-edges-change', onHideWikilinkEdgesChange)
    window.addEventListener('nodus-hide-storyline-edges-change', onHideStorylineEdgesChange)
  })

  onUnmounted(() => {
    window.removeEventListener('nodus-edge-hide-threshold-change', onEdgeHideThresholdChange)
    window.removeEventListener('nodus-edge-label-size-change', onEdgeLabelSizeChange)
    window.removeEventListener('nodus-hide-wikilink-edges-change', onHideWikilinkEdgesChange)
    window.removeEventListener('nodus-hide-storyline-edges-change', onHideStorylineEdgesChange)
  })

  return {
    // Settings refs
    gridLockEnabled,
    gridSize,
    highlightAllEdges,
    edgeHideThreshold,
    edgeLabelSize,
    hideWikilinkEdges,
    hideStorylineEdges,
    showHelpModal,

    // Toggles
    toggleGridLock,
    toggleHighlightAllEdges,
    showHelp,
    hideHelp,

    // Grid helpers
    snapToGrid,
  }
}
