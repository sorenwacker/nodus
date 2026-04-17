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
  const searchNodeId = ref<string | null>(null) // Node being searched (for view mode)

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
    // Focus the textarea after Vue updates the DOM (but not if editing title)
    setTimeout(() => {
      if (editingTitleId.value) return // Don't steal focus from title editor
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

  function openNodeSearch(nodeId?: string) {
    // Store which node we're searching (for view mode)
    if (nodeId) {
      searchNodeId.value = nodeId
    } else if (editingNodeId.value) {
      searchNodeId.value = editingNodeId.value
    }
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
    searchNodeId.value = null
    // Clear any text selection
    window.getSelection()?.removeAllRanges()
    // Refocus the textarea if in edit mode
    if (editingNodeId.value) {
      setTimeout(() => {
        const textarea = document.querySelector('.inline-editor') as HTMLTextAreaElement
        if (textarea) textarea.focus()
      }, 10)
    }
  }

  function updateNodeSearch(query: string) {
    nodeSearchQuery.value = query
    if (!query) {
      nodeSearchMatches.value = []
      nodeSearchIndex.value = 0
      return
    }
    // Get content to search - either from edit buffer or from node
    let content = ''
    if (editingNodeId.value) {
      content = editContent.value.toLowerCase()
    } else if (searchNodeId.value) {
      const node = store.getNode(searchNodeId.value)
      content = (node?.markdown_content || '').toLowerCase()
    }
    if (!content) {
      nodeSearchMatches.value = []
      nodeSearchIndex.value = 0
      return
    }
    // Find all matches (case-insensitive)
    const searchLower = query.toLowerCase()
    const matches: number[] = []
    let pos = 0
    while ((pos = content.indexOf(searchLower, pos)) !== -1) {
      matches.push(pos)
      pos += 1
    }
    nodeSearchMatches.value = matches
    nodeSearchIndex.value = matches.length > 0 ? 0 : -1
    // Select first match in edit mode, or highlight in view mode
    if (matches.length > 0) {
      selectMatch(0, true)
    }
  }

  function selectMatch(index: number, refocusSearch = false) {
    const matches = nodeSearchMatches.value
    if (matches.length === 0 || index < 0 || index >= matches.length) return
    const pos = matches[index]
    const len = nodeSearchQuery.value.length

    if (editingNodeId.value) {
      // Edit mode: select text in textarea
      const textarea = document.querySelector('.inline-editor') as HTMLTextAreaElement
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(pos, pos + len)
        // Scroll to selection
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20
        const linesBefore = editContent.value.substring(0, pos).split('\n').length - 1
        textarea.scrollTop = linesBefore * lineHeight - textarea.clientHeight / 2
      }
    } else if (searchNodeId.value) {
      // View mode: use browser's native find to highlight in rendered content
      const nodeCard = document.querySelector(`[data-node-id="${searchNodeId.value}"]`)
      const content = nodeCard?.querySelector('.node-content')
      if (content) {
        // Scroll content into view
        content.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Try to use CSS highlight API or window.find as fallback
        const selection = window.getSelection()
        if (selection) {
          // Find the text node containing the match
          const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
          let currentPos = 0
          let node: Text | null
          while ((node = walker.nextNode() as Text)) {
            const nodeLen = node.textContent?.length || 0
            if (currentPos + nodeLen > pos) {
              // Found the node containing start of match
              const offsetInNode = pos - currentPos
              try {
                const range = document.createRange()
                range.setStart(node, offsetInNode)
                // Find end position (might be in same or different node)
                let endNode = node
                let endOffset = offsetInNode + len
                let remainingLen = len
                while (endOffset > (endNode.textContent?.length || 0)) {
                  remainingLen -= (endNode.textContent?.length || 0) - (endNode === node ? offsetInNode : 0)
                  const nextNode = walker.nextNode() as Text
                  if (!nextNode) break
                  endNode = nextNode
                  endOffset = remainingLen
                }
                range.setEnd(endNode, Math.min(endOffset, endNode.textContent?.length || 0))
                selection.removeAllRanges()
                selection.addRange(range)
              } catch {
                // Selection failed - at least we scrolled
              }
              break
            }
            currentPos += nodeLen
          }
        }
      }
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
