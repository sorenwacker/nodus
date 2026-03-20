/**
 * Node editor composable
 * Manages inline editing of node content and titles with autosave
 */
import { ref, watch } from 'vue'
import type { Node } from '../../types'

export interface NodeEditorStore {
  getNode: (id: string) => Node | undefined
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
}

export interface UseNodeEditorOptions {
  store: NodeEditorStore
  onAfterSave?: () => void
  autosaveDelay?: number
}

export function useNodeEditor(options: UseNodeEditorOptions) {
  const { store, onAfterSave, autosaveDelay = 1000 } = options

  // Content editing state
  const editingNodeId = ref<string | null>(null)
  const editContent = ref('')

  // Title editing state
  const editingTitleId = ref<string | null>(null)
  const editTitle = ref('')

  // Autosave timers
  let autosaveContentTimer: ReturnType<typeof setTimeout> | null = null
  let autosaveTitleTimer: ReturnType<typeof setTimeout> | null = null

  // Autosave content on change
  watch(editContent, (newContent) => {
    if (!editingNodeId.value) return
    if (autosaveContentTimer) clearTimeout(autosaveContentTimer)
    autosaveContentTimer = setTimeout(() => {
      if (editingNodeId.value) {
        store.updateNodeContent(editingNodeId.value, newContent)
      }
    }, autosaveDelay)
  })

  // Autosave title on change
  watch(editTitle, (newTitle) => {
    if (!editingTitleId.value) return
    if (autosaveTitleTimer) clearTimeout(autosaveTitleTimer)
    autosaveTitleTimer = setTimeout(() => {
      if (editingTitleId.value) {
        store.updateNodeTitle(editingTitleId.value, newTitle)
      }
    }, autosaveDelay)
  })

  function startEditing(nodeId: string) {
    // Already editing this node - don't reset content (preserves unsaved edits)
    if (editingNodeId.value === nodeId) {
      return
    }
    // Save any current editing first
    if (editingNodeId.value) {
      saveEditing()
    }
    const node = store.getNode(nodeId)
    if (!node) return
    editingNodeId.value = nodeId
    editContent.value = node.markdown_content || ''
    // Focus the textarea after Vue updates the DOM
    setTimeout(() => {
      const textarea = document.querySelector('.inline-editor') as HTMLTextAreaElement
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      }
    }, 10)
  }

  function startEditingTitle(nodeId: string) {
    const node = store.getNode(nodeId)
    if (!node) return
    editingTitleId.value = nodeId
    editTitle.value = node.title || ''
    setTimeout(() => {
      const input = document.querySelector('.title-editor') as HTMLInputElement
      if (input) {
        input.focus()
        input.select()
      }
    }, 10)
  }

  function saveTitleEditing() {
    if (editingTitleId.value && editTitle.value.trim()) {
      // Clear any pending autosave timer
      if (autosaveTitleTimer) {
        clearTimeout(autosaveTitleTimer)
        autosaveTitleTimer = null
      }
      // Update local state
      const node = store.getNode(editingTitleId.value)
      if (node) {
        node.title = editTitle.value
      }
      // Persist to database
      store.updateNodeTitle(editingTitleId.value, editTitle.value)
    }
    editingTitleId.value = null
    editTitle.value = ''
  }

  function cancelTitleEditing() {
    editingTitleId.value = null
    editTitle.value = ''
  }

  function saveEditing(e?: FocusEvent) {
    // Don't close if focus moved to LLM inputs, buttons, or color bar
    if (e?.relatedTarget) {
      const related = e.relatedTarget as HTMLElement
      if (
        related.closest('.node-llm-bar-floating') ||
        related.closest('.node-color-bar') ||
        related.closest('.graph-llm-bar')
      ) {
        return
      }
    }

    const nodeId = editingNodeId.value
    if (nodeId) {
      store.updateNodeContent(nodeId, editContent.value)
      onAfterSave?.()
    }
    editingNodeId.value = null
    editContent.value = ''
  }

  function onEditorKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      saveEditing()
    }
    // Cmd/Ctrl+Enter to save and exit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      saveEditing()
    }
    // Don't propagate to prevent canvas shortcuts
    e.stopPropagation()
  }

  function isEditing(nodeId: string): boolean {
    return editingNodeId.value === nodeId
  }

  function isEditingTitle(nodeId: string): boolean {
    return editingTitleId.value === nodeId
  }

  function clearAutosaveTimers() {
    if (autosaveContentTimer) {
      clearTimeout(autosaveContentTimer)
      autosaveContentTimer = null
    }
    if (autosaveTitleTimer) {
      clearTimeout(autosaveTitleTimer)
      autosaveTitleTimer = null
    }
  }

  return {
    // State
    editingNodeId,
    editContent,
    editingTitleId,
    editTitle,

    // Methods
    startEditing,
    startEditingTitle,
    saveEditing,
    saveTitleEditing,
    cancelTitleEditing,
    onEditorKeydown,
    isEditing,
    isEditingTitle,
    clearAutosaveTimers,
  }
}
