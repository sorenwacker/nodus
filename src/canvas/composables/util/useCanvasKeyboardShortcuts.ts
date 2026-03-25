/**
 * Keyboard shortcuts composable
 *
 * Handles global keyboard shortcuts for the canvas
 */

import { onMounted, onUnmounted, type Ref } from 'vue'
import { uiStorage } from '../../../lib/storage'

export interface UseCanvasKeyboardShortcutsContext {
  // Frame operations
  pendingFramePlacement: Ref<boolean>
  cancelFramePlacement: () => void

  // Node operations
  selectedNodeIds: Ref<string[]>
  selectedEdge: Ref<string | null>
  selectedFrameId: Ref<string | null>
  deleteSelectedNodes: () => void
  deleteSelectedEdge: () => void
  deleteSelectedFrame: () => void
  selectAllNodes: () => void
  copySelectedNodes: () => void
  pasteNodes: () => void
  resetAllNodeSizes: () => void

  // Layout
  layoutNodes: () => void
  fitToContent: () => void

  // Neighborhood mode
  toggleNeighborhoodMode: (nodeId?: string) => void

  // Font scale
  fontScale: Ref<number>
  increaseFontScale: () => void
  decreaseFontScale: () => void

  // Workspace
  refreshFromFiles: () => void
  exportGraphAsYaml: () => void
}

export interface UseCanvasKeyboardShortcutsReturn {
  // No exposed state needed - all event-based
}

export function useCanvasKeyboardShortcuts(ctx: UseCanvasKeyboardShortcutsContext): UseCanvasKeyboardShortcutsReturn {
  const {
    pendingFramePlacement,
    cancelFramePlacement,
    selectedNodeIds,
    selectedEdge,
    selectedFrameId,
    deleteSelectedNodes,
    deleteSelectedEdge,
    deleteSelectedFrame,
    selectAllNodes,
    copySelectedNodes,
    pasteNodes,
    resetAllNodeSizes,
    layoutNodes,
    fitToContent,
    toggleNeighborhoodMode,
    fontScale,
    increaseFontScale,
    decreaseFontScale,
    refreshFromFiles,
    exportGraphAsYaml,
  } = ctx

  function handleKeydown(e: KeyboardEvent) {
    // Escape cancels frame placement mode
    if (e.key === 'Escape' && pendingFramePlacement.value) {
      e.preventDefault()
      cancelFramePlacement()
      return
    }

    // Cmd+E exports graph as YAML (works even in inputs)
    if ((e.key === 'e' || e.key === 'E') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault()
      exportGraphAsYaml()
      return
    }

    // Skip other shortcuts if user is typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      // Delete selected nodes
      if (selectedNodeIds.value.length > 0) {
        deleteSelectedNodes()
      }
      // Delete selected edge
      else if (selectedEdge.value) {
        deleteSelectedEdge()
      }
      // Delete selected frame
      else if (selectedFrameId.value) {
        deleteSelectedFrame()
      }
    }

    // L key triggers force layout
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault()
      layoutNodes()
    }

    // N key toggles neighborhood view
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault()
      toggleNeighborhoodMode(selectedNodeIds.value[0])
    }

    // Shift+R resets all node sizes to default
    if ((e.key === 'R' || e.key === 'r') && e.shiftKey) {
      e.preventDefault()
      resetAllNodeSizes()
    }

    // F key fits to content (without Cmd/Ctrl - allow Cmd+F for browser search)
    if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      fitToContent()
    }

    // Cmd+A / Ctrl+A selects all nodes
    if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      selectAllNodes()
    }

    // Cmd+C / Ctrl+C copies selected nodes as JSON
    if ((e.key === 'c' || e.key === 'C') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      console.log('[KEYDOWN] Cmd+C detected, selected nodes:', selectedNodeIds.value.length)
      if (selectedNodeIds.value.length > 0) {
        e.preventDefault()
        copySelectedNodes()
      }
    }

    // Cmd+V / Ctrl+V pastes nodes from clipboard
    if ((e.key === 'v' || e.key === 'V') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      pasteNodes()
    }

    // Ctrl+Shift+R refreshes workspace from files
    if ((e.key === 'R' || e.key === 'r') && e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      refreshFromFiles()
    }

    // Cmd+Plus / Cmd+= increases font scale
    if ((e.key === '+' || e.key === '=') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      increaseFontScale()
    }

    // Cmd+Minus decreases font scale
    if (e.key === '-' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      decreaseFontScale()
    }

    // Cmd+0 resets font scale
    if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      fontScale.value = 1.0
      uiStorage.setFontScale(1.0)
      document.documentElement.style.setProperty('--font-scale', '1')
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return {}
}
