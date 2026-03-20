/**
 * Keyboard shortcuts composable
 * Centralizes keyboard event handling for the app
 */
import { onMounted, onUnmounted } from 'vue'

export interface KeyboardShortcutHandlers {
  onUndo?: () => void
  onRedo?: () => void
  onSearch?: () => void
  onSettings?: () => void
  onEscape?: () => void
  onResetSizes?: () => void
  onDelete?: () => void
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    // Cmd/Ctrl + Z: Undo (not in input)
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isInput) {
      e.preventDefault()
      handlers.onUndo?.()
      return
    }

    // Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y: Redo (not in input)
    if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y') && !isInput) {
      e.preventDefault()
      handlers.onRedo?.()
      return
    }

    // Cmd/Ctrl + R: Reload app
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
      e.preventDefault()
      window.location.reload()
    }

    // Cmd/Ctrl + K: Open search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      handlers.onSearch?.()
    }

    // Cmd/Ctrl + ,: Open settings
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      handlers.onSettings?.()
    }

    // Escape: Close dialogs or deselect
    if (e.key === 'Escape') {
      handlers.onEscape?.()
    }

    // Shift+R: Reset all node sizes to default
    if ((e.key === 'R' || e.key === 'r') && e.shiftKey && !isInput) {
      e.preventDefault()
      handlers.onResetSizes?.()
    }

    // Delete/Backspace: Delete selected nodes or frames (when not in input)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
      e.preventDefault()
      handlers.onDelete?.()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
  })

  return {
    onKeydown,
  }
}
