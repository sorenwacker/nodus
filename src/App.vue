<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, provide } from 'vue'
import { useNodesStore } from './stores/nodes'
import PixiCanvas from './canvas/PixiCanvas.vue'
import SettingsModal from './components/SettingsModal.vue'
import { themeStorage } from './lib/storage'

const store = useNodesStore()
const showImportDialog = ref(false)
const showWorkspaceDialog = ref(false)
const showWorkspaceEditor = ref(false)
const vaultPath = ref('')
const importTarget = ref<'current' | 'new'>('new')
const importWorkspaceName = ref('')
const searchQuery = ref('')
const showSearch = ref(false)
const showSettings = ref(false)
const isDark = ref(themeStorage.isDark())
const newWorkspaceName = ref('')
const editingWorkspace = ref<{ id: string; name: string; description: string } | null>(null)

// Undo/Redo system - supports both position and content changes
interface UndoSnapshot {
  type: 'position' | 'content'
  positions?: Map<string, { x: number; y: number }>
  content?: { nodeId: string; oldContent: string | null; oldTitle: string }
}
const undoStack = ref<UndoSnapshot[]>([])
const redoStack = ref<UndoSnapshot[]>([])
const MAX_UNDO = 50

function capturePositionSnapshot(): UndoSnapshot {
  const positions = new Map<string, { x: number; y: number }>()
  for (const node of store.filteredNodes) {
    positions.set(node.id, { x: node.canvas_x, y: node.canvas_y })
  }
  return { type: 'position', positions }
}

function pushUndo() {
  const snapshot = capturePositionSnapshot()
  if (snapshot.positions?.size === 0) {
    return // Don't push empty snapshots
  }
  undoStack.value.push(snapshot)
  if (undoStack.value.length > MAX_UNDO) {
    undoStack.value.shift()
  }
  redoStack.value = []
}

function pushContentUndo(nodeId: string, oldContent: string | null, oldTitle: string) {
  undoStack.value.push({
    type: 'content',
    content: { nodeId, oldContent, oldTitle }
  })
  if (undoStack.value.length > MAX_UNDO) {
    undoStack.value.shift()
  }
  redoStack.value = []
}

async function undo() {
  if (undoStack.value.length === 0) {
    showToast('Nothing to undo', 'info')
    return
  }
  const snapshot = undoStack.value.pop()!

  if (snapshot.type === 'position' && snapshot.positions) {
    redoStack.value.push(capturePositionSnapshot())
    for (const [id, pos] of snapshot.positions) {
      await store.updateNodePosition(id, pos.x, pos.y)
    }
    showToast('Undo position', 'info')
  } else if (snapshot.type === 'content' && snapshot.content) {
    const node = store.getNode(snapshot.content.nodeId)
    if (node) {
      // Save current state for redo
      redoStack.value.push({
        type: 'content',
        content: {
          nodeId: node.id,
          oldContent: node.markdown_content,
          oldTitle: node.title
        }
      })
      // Restore old content
      await store.updateNodeContent(node.id, snapshot.content.oldContent || '')
      await store.updateNodeTitle(node.id, snapshot.content.oldTitle)
      showToast('Undo content', 'info')
    }
  }
}

async function redo() {
  if (redoStack.value.length === 0) return
  const snapshot = redoStack.value.pop()!

  if (snapshot.type === 'position' && snapshot.positions) {
    undoStack.value.push(capturePositionSnapshot())
    for (const [id, pos] of snapshot.positions) {
      await store.updateNodePosition(id, pos.x, pos.y)
    }
    showToast('Redo position', 'info')
  } else if (snapshot.type === 'content' && snapshot.content) {
    const node = store.getNode(snapshot.content.nodeId)
    if (node) {
      // Save current state for undo
      undoStack.value.push({
        type: 'content',
        content: {
          nodeId: node.id,
          oldContent: node.markdown_content,
          oldTitle: node.title
        }
      })
      // Apply redo content
      await store.updateNodeContent(node.id, snapshot.content.oldContent || '')
      await store.updateNodeTitle(node.id, snapshot.content.oldTitle)
      showToast('Redo content', 'info')
    }
  }
}

// Expose undo functions to child components
provide('pushUndo', pushUndo)
provide('pushContentUndo', pushContentUndo)

// Toast notifications
interface Toast {
  id: number
  message: string
  type: 'error' | 'success' | 'info'
}
const toasts = ref<Toast[]>([])
let toastId = 0

function showToast(message: string, type: 'error' | 'success' | 'info' = 'info') {
  const id = ++toastId
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

// Provide toast function to child components
provide('showToast', showToast)

// Reset all nodes to default size
async function resetAllNodeSizes() {
  const count = store.filteredNodes.length

  // Batch update - don't await each one
  const updates = store.filteredNodes.map(node =>
    store.updateNodeSize(node.id, 200, 120)
  )
  await Promise.all(updates)

  store.nodeLayoutVersion++
  showToast(`Reset ${count} node sizes to default`, 'info')
}

async function createNewWorkspace() {
  if (!newWorkspaceName.value.trim()) return
  try {
    const ws = await store.createWorkspace(newWorkspaceName.value.trim())
    store.switchWorkspace(ws.id)
    store.clearCanvas()
    newWorkspaceName.value = ''
    showWorkspaceDialog.value = false
  } catch (e) {
    console.error('Failed to create workspace:', e)
    showToast('Failed to create workspace: ' + e, 'error')
  }
}

function openWorkspaceEditor() {
  const current = store.workspaces.find(w => w.id === store.currentWorkspaceId)
  if (current) {
    editingWorkspace.value = { id: current.id, name: current.name, description: '' }
  } else {
    editingWorkspace.value = { id: '', name: 'Default Workspace', description: '' }
  }
  showWorkspaceEditor.value = true
}

function saveWorkspaceChanges() {
  if (!editingWorkspace.value) return
  if (editingWorkspace.value.id) {
    store.renameWorkspace(editingWorkspace.value.id, editingWorkspace.value.name)
  }
  showWorkspaceEditor.value = false
  showToast('Workspace updated', 'success')
}

function deleteCurrentWorkspace() {
  if (!editingWorkspace.value?.id) {
    showToast('Cannot delete default workspace', 'error')
    return
  }
  const id = editingWorkspace.value.id
  const name = editingWorkspace.value.name
  store.deleteWorkspace(id)
  showWorkspaceEditor.value = false
  showToast(`Deleted workspace "${name}"`, 'info')
}

function toggleTheme() {
  isDark.value = !isDark.value
  const theme = isDark.value ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  themeStorage.set(theme)
}

// Apply saved theme on load
document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  const q = searchQuery.value.toLowerCase()

  // Search in filtered nodes (current workspace)
  const matches = store.filteredNodes.filter(n =>
    n.title.toLowerCase().includes(q) ||
    n.markdown_content?.toLowerCase().includes(q)
  )

  // Sort by relevance: exact title match > title starts with > title contains > content only
  matches.sort((a, b) => {
    const aTitle = a.title.toLowerCase()
    const bTitle = b.title.toLowerCase()
    const aContent = a.markdown_content?.toLowerCase() || ''
    const bContent = b.markdown_content?.toLowerCase() || ''

    // Exact title match
    if (aTitle === q && bTitle !== q) return -1
    if (bTitle === q && aTitle !== q) return 1

    // Title starts with query
    const aStarts = aTitle.startsWith(q)
    const bStarts = bTitle.startsWith(q)
    if (aStarts && !bStarts) return -1
    if (bStarts && !aStarts) return 1

    // Title contains query
    const aTitleMatch = aTitle.includes(q)
    const bTitleMatch = bTitle.includes(q)
    if (aTitleMatch && !bTitleMatch) return -1
    if (bTitleMatch && !aTitleMatch) return 1

    // Both in content only - sort alphabetically
    return aTitle.localeCompare(bTitle)
  })

  return matches.slice(0, 10)
})

function selectSearchResult(nodeId: string) {
  store.selectNode(nodeId)
  showSearch.value = false
  searchQuery.value = ''
  // Dispatch event for PixiCanvas to zoom to the node
  window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId } }))
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

  // Cmd/Ctrl + Z: Undo (not in input)
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isInput) {
    e.preventDefault()
    undo()
    return
  }
  // Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y: Redo (not in input)
  if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y') && !isInput) {
    e.preventDefault()
    redo()
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
    showSearch.value = !showSearch.value
    if (showSearch.value) {
      setTimeout(() => {
        document.querySelector<HTMLInputElement>('.search-input')?.focus()
      }, 50)
    }
  }
  // Cmd/Ctrl + ,: Open settings
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault()
    showSettings.value = !showSettings.value
  }
  // Escape: Close dialogs or deselect
  if (e.key === 'Escape') {
    if (showSettings.value) {
      showSettings.value = false
    } else if (showSearch.value) {
      showSearch.value = false
      searchQuery.value = ''
    } else if (store.selectedNodeId) {
      store.selectNode(null)
    }
  }
  // Shift+R: Reset all node sizes to default
  if ((e.key === 'R' || e.key === 'r') && e.shiftKey && !isInput) {
    e.preventDefault()
    resetAllNodeSizes()
  }
  // Delete/Backspace: Delete selected nodes or frames (when not in input)
  if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
    if (store.selectedNodeIds.length > 0) {
      e.preventDefault()
      for (const id of [...store.selectedNodeIds]) {
        store.deleteNode(id)
      }
    } else if (store.selectedFrameId) {
      e.preventDefault()
      store.deleteFrame(store.selectedFrameId)
      store.selectFrame(null)
    }
  }
}

onMounted(() => {
  store.initialize()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

async function importVault() {
  if (!vaultPath.value.trim()) return
  if (importTarget.value === 'new' && !importWorkspaceName.value.trim()) return

  try {
    // Create new workspace if requested
    if (importTarget.value === 'new') {
      const ws = await store.createWorkspace(importWorkspaceName.value.trim())
      store.switchWorkspace(ws.id)
    }

    const imported = await store.importVault(vaultPath.value.trim())
    showImportDialog.value = false
    vaultPath.value = ''
    importWorkspaceName.value = ''
    importTarget.value = 'new'
    showToast(`Imported ${imported.length} nodes`, 'success')
  } catch (e) {
    console.error('Import failed:', e)
    showToast('Failed to import vault: ' + e, 'error')
  }
}

async function openFolderDialog() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Obsidian Vault',
    })
    if (selected) {
      vaultPath.value = selected as string
    }
  } catch (e) {
    console.error('Dialog error:', e)
    // Fallback: prompt user to enter path manually
    const path = window.prompt('Enter vault path (dialog not available in browser mode):')
    if (path) {
      vaultPath.value = path
    }
  }
}

</script>

<template>
  <div class="app-container">
    <header class="toolbar">
      <div class="toolbar-left">
        <h1 class="app-title">Nodus</h1>
        <div class="workspace-selector">
          <select
            :value="store.currentWorkspaceId || ''"
            @change="store.switchWorkspace(($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">Default Workspace</option>
            <option v-for="ws in store.workspaces" :key="ws.id" :value="ws.id">
              {{ ws.name }}
            </option>
          </select>
          <button class="icon-btn" title="Edit Workspace" @click="openWorkspaceEditor">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn" title="New Workspace" @click="showWorkspaceDialog = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div class="toolbar-divider"></div>
        <button class="icon-btn" :disabled="undoStack.length === 0" title="Undo (Cmd+Z)" @click="undo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        </button>
        <button class="icon-btn" :disabled="redoStack.length === 0" title="Redo (Cmd+Shift+Z)" @click="redo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
        </button>
      </div>
      <div class="toolbar-center">
        <button class="search-trigger" @click="showSearch = true">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span class="search-placeholder">Search nodes...</span>
          <span class="search-shortcut">Cmd+K</span>
        </button>
      </div>
      <div class="toolbar-actions">
        <button class="icon-btn" title="Import Vault" @click="showImportDialog = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </button>
        <button class="icon-btn theme-btn" :title="isDark ? 'Light mode' : 'Dark mode'" @click="toggleTheme">
          <svg v-if="isDark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <button class="icon-btn settings-btn" title="Settings (Cmd+,)" @click="showSettings = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Search Dialog -->
    <div v-if="showSearch" class="search-overlay" @click.self="showSearch = false">
      <div class="search-dialog">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search nodes by title or content..."
          @keydown.escape="showSearch = false"
        />
        <div class="search-results">
          <div
            v-for="node in searchResults"
            :key="node.id"
            class="search-result"
            @click="selectSearchResult(node.id)"
          >
            <span class="result-icon">{{ node.node_type === 'note' ? 'N' : 'F' }}</span>
            <div class="result-content">
              <div class="result-title">{{ node.title }}</div>
              <div v-if="node.markdown_content" class="result-preview">
                {{ node.markdown_content.slice(0, 60) }}...
              </div>
            </div>
          </div>
          <div v-if="searchQuery && searchResults.length === 0" class="no-results">
            No nodes found
          </div>
        </div>
      </div>
    </div>

    <main class="main-content">
      <PixiCanvas />
    </main>

    <!-- Import Dialog -->
    <div v-if="showImportDialog" class="dialog-overlay" @click.self="showImportDialog = false">
      <div class="dialog">
        <h2>Import Obsidian Vault</h2>
        <div class="dialog-content">
          <label>
            Vault Path:
            <div class="path-input-row">
              <input
                v-model="vaultPath"
                type="text"
                placeholder="/path/to/vault"
                class="path-input"
              />
              <button class="browse-btn" @click="openFolderDialog">Browse</button>
            </div>
          </label>

          <div class="import-target-section">
            <label class="radio-label">
              <input v-model="importTarget" type="radio" value="new" />
              <span>Create new workspace</span>
            </label>
            <input
              v-if="importTarget === 'new'"
              v-model="importWorkspaceName"
              type="text"
              placeholder="Workspace name"
              class="path-input workspace-name-input"
            />

            <label class="radio-label">
              <input v-model="importTarget" type="radio" value="current" />
              <span>Import into current workspace</span>
            </label>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="showImportDialog = false">Cancel</button>
          <button
            class="import-btn"
            :disabled="!vaultPath.trim() || (importTarget === 'new' && !importWorkspaceName.trim())"
            @click="importVault"
          >Import</button>
        </div>
      </div>
    </div>

    <!-- Workspace Dialog -->
    <div v-if="showWorkspaceDialog" class="dialog-overlay" @click.self="showWorkspaceDialog = false">
      <div class="dialog">
        <h2>New Workspace</h2>
        <div class="dialog-content">
          <label>
            Workspace Name:
            <input
              v-model="newWorkspaceName"
              type="text"
              placeholder="My Research Project"
              class="path-input"
              @keydown.enter="createNewWorkspace"
            />
          </label>
        </div>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="showWorkspaceDialog = false">Cancel</button>
          <button class="import-btn" :disabled="!newWorkspaceName.trim()" @click="createNewWorkspace">Create</button>
        </div>
      </div>
    </div>

    <!-- Workspace Editor Dialog -->
    <div v-if="showWorkspaceEditor && editingWorkspace" class="dialog-overlay" @click.self="showWorkspaceEditor = false">
      <div class="dialog workspace-editor">
        <h2>Edit Workspace</h2>
        <div class="dialog-content">
          <label>
            Name:
            <input
              v-model="editingWorkspace.name"
              type="text"
              placeholder="Workspace name"
              class="path-input"
              :disabled="!store.currentWorkspaceId"
            />
          </label>
          <label>
            Description:
            <textarea
              v-model="editingWorkspace.description"
              placeholder="What is this workspace for?"
              class="description-input"
              rows="3"
            ></textarea>
          </label>
          <div class="workspace-stats">
            <span>{{ store.filteredNodes.length }} nodes</span>
            <span class="stat-sep">|</span>
            <span>{{ store.filteredEdges.length }} edges</span>
          </div>
        </div>
        <div class="dialog-actions">
          <button
            v-if="editingWorkspace?.id"
            class="delete-btn"
            @click="deleteCurrentWorkspace"
          >
            Delete Workspace
          </button>
          <div class="actions-right">
            <button class="cancel-btn" @click="showWorkspaceEditor = false">Cancel</button>
            <button class="import-btn" @click="saveWorkspaceChanges">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast notifications -->
    <!-- Settings Modal -->
    <SettingsModal v-if="showSettings" @close="showSettings = false" />

    <div class="toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="toast.type"
      >
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f4f4f5;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
  box-shadow: 0 1px 3px var(--shadow-sm);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-title {
  font-size: 20px;
  font-weight: 700;
  color: #3b82f6;
  margin: 0;
  letter-spacing: -0.5px;
}

.workspace-selector {
  display: flex;
  align-items: center;
  gap: 4px;
}

.workspace-selector select {
  padding: 6px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  cursor: pointer;
  min-width: 140px;
}

.workspace-selector select:hover {
  border-color: var(--text-muted);
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  border-color: var(--text-muted);
  color: var(--text-main);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-btn svg {
  flex-shrink: 0;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border-default);
  margin: 0 4px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px var(--shadow-sm);
}

.toolbar-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--text-muted);
}

.theme-btn {
  width: 36px;
  padding: 8px;
  font-weight: 600;
}

.toolbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 0 20px;
}

.search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-surface-alt);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  cursor: pointer;
  min-width: 280px;
}

.search-trigger:hover {
  background: var(--bg-elevated);
}

.search-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.search-placeholder {
  flex: 1;
  text-align: left;
  color: var(--text-muted);
  font-size: 13px;
}

.search-shortcut {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-default);
}

.search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 300;
}

.search-dialog {
  background: var(--bg-surface);
  border-radius: 12px;
  width: 500px;
  max-width: 90%;
  box-shadow: 0 20px 40px var(--shadow-md);
  overflow: hidden;
}

.search-input {
  width: 100%;
  padding: 16px 20px;
  border: none;
  border-bottom: 1px solid var(--border-default);
  font-size: 16px;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-main);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
}

.search-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
}

.search-result:hover {
  background: var(--bg-elevated);
}

.result-icon {
  width: 32px;
  height: 32px;
  background: var(--primary-color);
  color: white;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-preview {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.main-content {
  flex: 1;
  position: relative;
  overflow: auto;
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dialog {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 24px;
  width: 400px;
  max-width: 90%;
  box-shadow: 0 20px 40px var(--shadow-md);
}

.dialog h2 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: var(--text-main);
}

.dialog-content {
  margin-bottom: 20px;
}

.dialog-content label {
  display: block;
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.path-input-row {
  display: flex;
  gap: 8px;
}

.path-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.path-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.browse-btn {
  padding: 10px 16px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface-alt);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-main);
}

.browse-btn:hover {
  background: var(--bg-elevated);
}

.import-target-section {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-main);
}

.radio-label input[type="radio"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary-color);
}

.workspace-name-input {
  margin-left: 24px;
  margin-top: 4px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.cancel-btn {
  padding: 10px 20px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-main);
}

.import-btn {
  padding: 10px 20px;
  border: none;
  background: var(--primary-color);
  color: #ffffff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.import-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.import-btn:hover:not(:disabled) {
  opacity: 0.9;
}

/* Toast notifications */
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: toast-slide-in 0.3s ease;
  max-width: 350px;
}

@keyframes toast-slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast.error {
  background: #fef2f2;
  color: #991b1b;
  border-left: 4px solid #dc2626;
}

.toast.success {
  background: #f0fdf4;
  color: #166534;
  border-left: 4px solid #22c55e;
}

.toast.info {
  background: #eff6ff;
  color: #1e40af;
  border-left: 4px solid #3b82f6;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .toast.error {
  background: #450a0a;
  color: #fecaca;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .toast.success {
  background: #052e16;
  color: #bbf7d0;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .toast.info {
  background: #172554;
  color: #bfdbfe;
}

/* Workspace Editor */
.workspace-editor .dialog-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.workspace-editor .actions-right {
  display: flex;
  gap: 8px;
}

.description-input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
  resize: vertical;
  font-family: inherit;
}

.description-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.workspace-stats {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: var(--bg-surface-alt);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
}

.stat-sep {
  color: var(--border-default);
}

.delete-btn {
  padding: 8px 16px;
  border: 1px solid var(--danger-border);
  border-radius: 6px;
  background: var(--danger-bg);
  color: var(--danger-color);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.delete-btn:hover {
  background: var(--danger-color);
  color: white;
  border-color: var(--danger-color);
}

.theme-btn {
  width: 32px;
  padding: 0;
}
</style>
