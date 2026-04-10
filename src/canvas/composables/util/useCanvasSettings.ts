import { ref } from 'vue'

/**
 * Manages canvas settings state.
 * Provides reactive state for grid lock, edge highlighting, and modal visibility.
 */
export function useCanvasSettings() {
  // Grid snap settings
  const gridLockEnabled = ref(false)
  const gridSize = 20

  // Edge display settings
  const highlightAllEdges = ref(false)

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

  return {
    // Settings refs
    gridLockEnabled,
    gridSize,
    highlightAllEdges,
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
