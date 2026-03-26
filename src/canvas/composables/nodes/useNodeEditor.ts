/**
 * Node editor composable
 * Manages inline editing of node content and titles with autosave
 */
import { ref, watch, nextTick } from 'vue'
import type { Node } from '../../../types'

export interface NodeEditorStore {
  getNode: (id: string) => Node | undefined
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
}

export interface UseNodeEditorOptions {
  store: NodeEditorStore
  onAfterSave?: (nodeId: string) => void
  onSaveComplete?: () => void
  autosaveDelay?: number
  pushContentUndo?: (nodeId: string, oldContent: string | null, oldTitle: string) => void
}

export function useNodeEditor(options: UseNodeEditorOptions) {
  const { store, onAfterSave, onSaveComplete, autosaveDelay = 1000, pushContentUndo } = options

  // Content editing state
  const editingNodeId = ref<string | null>(null)
  const editContent = ref('')

  // Title editing state
  const editingTitleId = ref<string | null>(null)
  const editTitle = ref('')

  // In-node search state
  const showNodeSearch = ref(false)
  const nodeSearchQuery = ref('')
  const nodeSearchIndex = ref(0)
  const nodeSearchMatches = ref<number[]>([]) // Start positions of matches

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

    // Capture undo state before editing starts
    if (pushContentUndo) {
      pushContentUndo(nodeId, node.markdown_content, node.title)
    }

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

    // Capture undo state before editing starts
    if (pushContentUndo) {
      pushContentUndo(nodeId, node.markdown_content, node.title)
    }

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
    // Don't close if focus moved to LLM inputs, buttons, color bar, or search bar
    if (e?.relatedTarget) {
      const related = e.relatedTarget as HTMLElement
      if (
        related.closest('.node-llm-bar-floating') ||
        related.closest('.node-color-bar') ||
        related.closest('.graph-llm-bar') ||
        related.closest('.node-search-bar')
      ) {
        return
      }
    }

    const nodeId = editingNodeId.value
    if (nodeId) {
      store.updateNodeContent(nodeId, editContent.value)
      onAfterSave?.(nodeId)
    }
    editingNodeId.value = null
    editContent.value = ''
    onSaveComplete?.()
  }

  function onEditorKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl+F to open in-node search
    if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault()
      openNodeSearch()
      return
    }
    if (e.key === 'Escape') {
      if (showNodeSearch.value) {
        closeNodeSearch()
      } else {
        saveEditing()
      }
      return
    }
    // Cmd/Ctrl+Enter to save and exit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      saveEditing()
    }
    // Don't propagate to prevent canvas shortcuts
    e.stopPropagation()
  }

  function openNodeSearch() {
    showNodeSearch.value = true
    nodeSearchQuery.value = ''
    nodeSearchMatches.value = []
    nodeSearchIndex.value = 0
    // Focus the search input after Vue renders
    nextTick(() => {
      // Additional delay to ensure DOM is fully ready
      requestAnimationFrame(() => {
        const input = document.querySelector('.node-search-input') as HTMLInputElement
        if (input) {
          input.focus()
        }
      })
    })
  }

  function closeNodeSearch() {
    showNodeSearch.value = false
    nodeSearchQuery.value = ''
    nodeSearchMatches.value = []
    nodeSearchIndex.value = 0
    // Refocus the textarea
    setTimeout(() => {
      const textarea = document.querySelector('.inline-editor') as HTMLTextAreaElement
      if (textarea) textarea.focus()
    }, 10)
  }

  function updateNodeSearch(query: string) {
    nodeSearchQuery.value = query
    if (!query) {
      nodeSearchMatches.value = []
      nodeSearchIndex.value = 0
      return
    }
    // Find all matches (case-insensitive)
    const content = editContent.value.toLowerCase()
    const searchLower = query.toLowerCase()
    const matches: number[] = []
    let pos = 0
    while ((pos = content.indexOf(searchLower, pos)) !== -1) {
      matches.push(pos)
      pos += 1
    }
    nodeSearchMatches.value = matches
    nodeSearchIndex.value = matches.length > 0 ? 0 : -1
    // Select first match but keep focus in search input
    if (matches.length > 0) {
      selectMatch(0, true)
    }
  }

  function selectMatch(index: number, refocusSearch = false) {
    const matches = nodeSearchMatches.value
    if (matches.length === 0 || index < 0 || index >= matches.length) return
    const pos = matches[index]
    const len = nodeSearchQuery.value.length
    const textarea = document.querySelector('.inline-editor') as HTMLTextAreaElement
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(pos, pos + len)
      // Scroll to selection
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20
      const linesBefore = editContent.value.substring(0, pos).split('\n').length - 1
      textarea.scrollTop = linesBefore * lineHeight - textarea.clientHeight / 2
    }
    // Refocus search input if requested (during typing)
    if (refocusSearch) {
      requestAnimationFrame(() => {
        const input = document.querySelector('.node-search-input') as HTMLInputElement
        if (input) input.focus()
      })
    }
  }

  function findNextMatch() {
    const matches = nodeSearchMatches.value
    if (matches.length === 0) return
    nodeSearchIndex.value = (nodeSearchIndex.value + 1) % matches.length
    selectMatch(nodeSearchIndex.value)
  }

  function findPrevMatch() {
    const matches = nodeSearchMatches.value
    if (matches.length === 0) return
    nodeSearchIndex.value = (nodeSearchIndex.value - 1 + matches.length) % matches.length
    selectMatch(nodeSearchIndex.value)
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

    // In-node search state
    showNodeSearch,
    nodeSearchQuery,
    nodeSearchIndex,
    nodeSearchMatches,

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

    // In-node search methods
    openNodeSearch,
    closeNodeSearch,
    updateNodeSearch,
    findNextMatch,
    findPrevMatch,
  }
}
