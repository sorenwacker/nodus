<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useNodesStore } from './stores/nodes'
import PixiCanvas from './canvas/PixiCanvas.vue'

const store = useNodesStore()
const showImportDialog = ref(false)
const showWorkspaceDialog = ref(false)
const vaultPath = ref('')
const searchQuery = ref('')
const showSearch = ref(false)
const isDark = ref(false)
const newWorkspaceName = ref('')

function createNewWorkspace() {
  if (!newWorkspaceName.value.trim()) return
  const ws = store.createWorkspace(newWorkspaceName.value.trim())
  store.switchWorkspace(ws.id)
  store.clearCanvas()
  newWorkspaceName.value = ''
  showWorkspaceDialog.value = false
}

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  const q = searchQuery.value.toLowerCase()
  return store.nodes.filter(n =>
    n.title.toLowerCase().includes(q) ||
    n.markdown_content?.toLowerCase().includes(q)
  ).slice(0, 8)
})

function selectSearchResult(nodeId: string) {
  store.selectNode(nodeId)
  showSearch.value = false
  searchQuery.value = ''
}

function onKeydown(e: KeyboardEvent) {
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
  // Escape: Close search or deselect
  if (e.key === 'Escape') {
    if (showSearch.value) {
      showSearch.value = false
      searchQuery.value = ''
    } else if (store.selectedNodeId) {
      store.selectNode(null)
    }
  }
  // Delete/Backspace: Delete selected node (when not in input)
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedNodeId) {
    const target = e.target as HTMLElement
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      if (confirm('Delete this node?')) {
        store.deleteNode(store.selectedNodeId)
      }
    }
  }
}

onMounted(() => {
  console.log('Nodus: App mounted, initializing store...')
  store.initialize()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

async function importVault() {
  if (!vaultPath.value.trim()) return
  try {
    await store.importVault(vaultPath.value.trim())
    showImportDialog.value = false
    vaultPath.value = ''
  } catch (e) {
    console.error('Import failed:', e)
    alert('Failed to import vault: ' + e)
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
    console.error('Dialog not available:', e)
  }
}

async function addNewNode() {
  console.log('Creating new node...')
  try {
    const node = await store.createNode({
      title: 'New Node',
      node_type: 'note',
      canvas_x: 100 + Math.random() * 300,
      canvas_y: 100 + Math.random() * 300,
    })
    console.log('Node created:', node)
    console.log('Filtered nodes:', store.filteredNodes.length)
    store.selectNode(node.id)
  } catch (e) {
    console.error('Failed to create node:', e)
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
          <button class="new-ws-btn" @click="showWorkspaceDialog = true" title="New Workspace">+</button>
        </div>
      </div>
      <div class="toolbar-center">
        <button class="search-trigger" @click="showSearch = true">
          <span class="search-icon">S</span>
          <span class="search-placeholder">Search nodes...</span>
          <span class="search-shortcut">Cmd+K</span>
        </button>
      </div>
      <div class="toolbar-actions">
        <button class="toolbar-btn" @click="showImportDialog = true">Import</button>
        <button class="toolbar-btn theme-btn" @click="toggleTheme" :title="isDark ? 'Light mode' : 'Dark mode'">
          {{ isDark ? 'L' : 'D' }}
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
        </div>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="showImportDialog = false">Cancel</button>
          <button class="import-btn" @click="importVault" :disabled="!vaultPath.trim()">Import</button>
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
          <button class="import-btn" @click="createNewWorkspace" :disabled="!newWorkspaceName.trim()">Create</button>
        </div>
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

.new-ws-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  cursor: pointer;
  font-size: 16px;
  color: var(--text-muted);
}

.new-ws-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--text-muted);
}

.toolbar-actions {
  display: flex;
  gap: 10px;
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
</style>
