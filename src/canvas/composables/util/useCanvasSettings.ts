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

  // Node agent mode - always agent (tools enabled)
  const nodeAgentMode = ref<'simple' | 'agent'>('agent')

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

  onMounted(() => {
    window.addEventListener('nodus-edge-hide-threshold-change', onEdgeHideThresholdChange)
  })

  onUnmounted(() => {
    window.removeEventListener('nodus-edge-hide-threshold-change', onEdgeHideThresholdChange)
  })

  return {
    // Settings refs
    gridLockEnabled,
    gridSize,
    highlightAllEdges,
    edgeHideThreshold,
    nodeAgentMode,
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
