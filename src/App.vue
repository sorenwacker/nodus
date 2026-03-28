<script setup lang="ts">
import { onMounted, ref, computed, provide } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from './stores/nodes'
import { useThemesStore } from './stores/themes'
import { useAppSearch } from './composables/useAppSearch'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import PixiCanvas from './canvas/PixiCanvas.vue'
import SettingsModal from './components/SettingsModal.vue'
import NotificationToast from './components/NotificationToast.vue'
import OnboardingFlow from './components/OnboardingFlow.vue'
import StorylinePanel from './components/StorylinePanel.vue'
import StorylineReader from './components/StorylineReader.vue'

const { t } = useI18n()
const store = useNodesStore()
const themesStore = useThemesStore()
const showImportDialog = ref(false)
const showWorkspaceDialog = ref(false)
const showWorkspaceEditor = ref(false)
const vaultPath = ref('')
const importTarget = ref<'current' | 'new'>('new')
const importWorkspaceName = ref('')
const keepOriginalFiles = ref(true) // Keep original files by default (safe option)
const showSettings = ref(false)
const showDeleteWorkspaceDialog = ref(false)
const deleteWorkspaceKeepFiles = ref(true)

// Search composable
const search = useAppSearch({
  getFilteredNodes: () => store.filteredNodes,
  selectNode: store.selectNode,
})
const { searchQuery, showSearch, searchResults, toggleSearch, closeSearch, selectResult: selectSearchResult } = search
const currentTheme = computed(() => themesStore.currentThemeName)
const showStorylinePanel = ref(false)
const readerStorylineId = ref<string | null>(null)
const newWorkspaceName = ref('')
const editingWorkspace = ref<{ id: string; name: string; description: string; vault_path: string | null; sync_enabled: boolean } | null>(null)

// Tauri workspace functions
import { getWorkspace, setWorkspaceSync, setWorkspaceVaultPath, syncMissingFiles, syncAllWikilinks } from './lib/tauri'

const syncingFiles = ref(false)

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

// Undo/Redo composable
import { useUndoRedo } from './composables/useUndoRedo'

const undoRedo = useUndoRedo({
  store: {
    getNode: store.getNode,
    getFilteredNodes: () => store.filteredNodes,
    updateNodePosition: store.updateNodePosition,
    updateNodeSize: store.updateNodeSize,
    updateNodeContent: store.updateNodeContent,
    updateNodeTitle: store.updateNodeTitle,
    updateNodeColor: store.updateNodeColor,
    restoreNode: store.restoreNode,
    restoreEdge: store.restoreEdge,
    deleteNode: store.deleteNode,
  },
  showToast,
})

const { undoStack, redoStack, pushUndo, pushContentUndo, pushDeletionUndo, pushCreationUndo, pushColorUndo, pushSizeUndo, undo, redo } = undoRedo

// Expose undo functions to child components
provide('pushUndo', pushUndo)
provide('pushContentUndo', pushContentUndo)
provide('pushDeletionUndo', pushDeletionUndo)
provide('pushCreationUndo', pushCreationUndo)
provide('pushColorUndo', pushColorUndo)
provide('pushSizeUndo', pushSizeUndo)

// Reset all nodes to default size
async function resetAllNodeSizes() {
  const count = store.filteredNodes.length

  // Batch update - don't await each one
  const updates = store.filteredNodes.map(node =>
    store.updateNodeSize(node.id, 200, 120)
  )
  await Promise.all(updates)

  store.nodeLayoutVersion++
  showToast(t('toasts.resetNodeSizes', { count }), 'info')
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
    showToast(t('toasts.workspaceCreateFailed') + ': ' + e, 'error')
  }
}

async function openWorkspaceEditor() {
  const current = store.workspaces.find(w => w.id === store.currentWorkspaceId)
  if (current) {
    // Load vault settings from database
    const wsSettings = await getWorkspace(current.id)
    editingWorkspace.value = {
      id: current.id,
      name: current.name,
      description: '',
      vault_path: wsSettings?.vault_path ?? null,
      sync_enabled: wsSettings?.sync_enabled ?? false,
    }
  } else {
    editingWorkspace.value = { id: null, name: 'Default', description: '', vault_path: null, sync_enabled: false }
  }
  showWorkspaceEditor.value = true
}

async function saveWorkspaceChanges() {
  if (!editingWorkspace.value) return
  if (editingWorkspace.value.id) {
    store.renameWorkspace(editingWorkspace.value.id, editingWorkspace.value.name)

    // Save vault settings
    await setWorkspaceVaultPath(editingWorkspace.value.id, editingWorkspace.value.vault_path)
    await setWorkspaceSync(editingWorkspace.value.id, editingWorkspace.value.sync_enabled)

    // Start/stop watcher based on sync setting
    if (editingWorkspace.value.sync_enabled && editingWorkspace.value.vault_path) {
      await store.watchVault(editingWorkspace.value.vault_path)
    } else {
      await store.stopWatching()
    }
  }
  showWorkspaceEditor.value = false
  showToast(t('toasts.workspaceUpdated'), 'success')
}

async function selectVaultFolder() {
  if (!editingWorkspace.value) return
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('settings.selectVaultFolder'),
    })
    if (selected && typeof selected === 'string') {
      editingWorkspace.value.vault_path = selected
    }
  } catch (e) {
    console.error('Failed to select folder:', e)
  }
}

function clearVaultPath() {
  if (!editingWorkspace.value) return
  editingWorkspace.value.vault_path = null
  editingWorkspace.value.sync_enabled = false
}

async function syncVaultFiles() {
  if (!editingWorkspace.value?.id || !editingWorkspace.value?.vault_path) return
  syncingFiles.value = true
  try {
    // Sync missing files
    const newNodes = await syncMissingFiles(editingWorkspace.value.id, editingWorkspace.value.vault_path) as unknown[]
    if (newNodes.length > 0) {
      await store.loadNodes()
    }

    // Sync all wikilinks to create edges
    const edgesCreated = await syncAllWikilinks(editingWorkspace.value.id)

    if (newNodes.length > 0 || edgesCreated > 0) {
      await store.loadEdges()
      showToast(t('toasts.syncedFiles', { count: newNodes.length }) + (edgesCreated > 0 ? `, ${edgesCreated} links` : ''), 'success')
    } else {
      showToast(t('toasts.noMissingFiles'), 'info')
    }
  } catch (e) {
    console.error('[App] Failed to sync files:', e)
    showToast(String(e), 'error')
  } finally {
    syncingFiles.value = false
  }
}

function deleteCurrentWorkspace() {
  if (!editingWorkspace.value?.id) {
    showToast(t('toasts.cannotDeleteDefault'), 'error')
    return
  }
  // Show confirmation dialog
  deleteWorkspaceKeepFiles.value = true
  showDeleteWorkspaceDialog.value = true
}

async function confirmDeleteWorkspace() {
  if (!editingWorkspace.value?.id) return

  const id = editingWorkspace.value.id
  const name = editingWorkspace.value.name
  const keepFiles = deleteWorkspaceKeepFiles.value

  await store.deleteWorkspace(id, !keepFiles)
  showDeleteWorkspaceDialog.value = false
  showWorkspaceEditor.value = false
  showToast(t('toasts.workspaceDeleted', { name }), 'info')
}

async function resetDefaultWorkspace() {
  if (!confirm(t('settings.resetDefaultWorkspaceConfirm'))) {
    return
  }
  await store.resetDefaultWorkspace()
  showWorkspaceEditor.value = false
  showToast(t('toasts.workspaceReset'), 'success')
}

function cycleTheme() {
  themesStore.cycleTheme()
}

// Keyboard shortcuts handlers
function handleEscape() {
  if (showSettings.value) {
    showSettings.value = false
  } else if (showSearch.value) {
    closeSearch()
  } else if (store.selectedNodeId) {
    store.selectNode(null)
  }
}

function handleDelete() {
  if (store.selectedNodeIds.length > 0) {
    for (const id of [...store.selectedNodeIds]) {
      const node = store.getNode(id)
      if (node) {
        const connectedEdges = store.filteredEdges.filter(
          e => e.source_node_id === id || e.target_node_id === id
        )
        pushDeletionUndo(node, connectedEdges)
      }
      store.deleteNode(id)
    }
  } else if (store.selectedFrameId) {
    store.deleteFrame(store.selectedFrameId)
    store.selectFrame(null)
  }
}

// Register keyboard shortcuts using composable
useKeyboardShortcuts({
  onUndo: undo,
  onRedo: redo,
  onSearch: toggleSearch,
  onSettings: () => { showSettings.value = !showSettings.value },
  onEscape: handleEscape,
  onResetSizes: resetAllNodeSizes,
  onDelete: handleDelete,
})

onMounted(async () => {
  // Initialize themes first to apply visual styling
  await themesStore.initialize()
  // Then initialize data
  await store.initialize()

  // Start file watcher if current workspace has sync enabled
  if (store.currentWorkspaceId) {
    try {
      const workspace = await import('./lib/tauri').then(m => m.getWorkspace(store.currentWorkspaceId!))
      console.log('[App] Workspace settings:', {
        id: store.currentWorkspaceId,
        sync_enabled: workspace?.sync_enabled,
        vault_path: workspace?.vault_path
      })
      if (workspace?.sync_enabled && workspace?.vault_path) {
        console.log('[App] Starting file watcher for workspace:', store.currentWorkspaceId)
        // First sync any missing files (added while Nodus was closed)
        try {
          const newNodes = await syncMissingFiles(store.currentWorkspaceId!, workspace.vault_path)
          if (newNodes.length > 0) {
            console.log('[App] Synced', newNodes.length, 'missing files')
            await store.loadNodes()
          }
          // Sync wikilinks to create edges
          const edgesCreated = await syncAllWikilinks(store.currentWorkspaceId!)
          if (edgesCreated > 0) {
            console.log('[App] Created', edgesCreated, 'wikilink edges')
            await store.loadEdges()
          }
        } catch (e) {
          console.error('[App] Failed to sync:', e)
        }
        // Then start watching for future changes
        await store.watchVault(workspace.vault_path)
      } else {
        console.log('[App] File watcher NOT started - sync_enabled:', workspace?.sync_enabled, 'vault_path:', workspace?.vault_path)
      }
    } catch (e) {
      console.error('[App] Failed to start file watcher:', e)
    }
  }
})

async function importVault() {
  if (!vaultPath.value.trim()) return
  if (importTarget.value === 'new' && !importWorkspaceName.value.trim()) return

  try {
    // Create new workspace if requested
    let targetWorkspaceId: string | undefined
    if (importTarget.value === 'new') {
      const ws = await store.createWorkspace(importWorkspaceName.value.trim())
      targetWorkspaceId = ws.id
      await store.switchWorkspace(ws.id)
    }

    const imported = await store.importVault(vaultPath.value.trim(), !keepOriginalFiles.value, targetWorkspaceId)

    // Force refresh to ensure frames and edges are visible
    await store.switchWorkspace(store.currentWorkspaceId)
    showImportDialog.value = false
    vaultPath.value = ''
    importWorkspaceName.value = ''
    importTarget.value = 'new'
    keepOriginalFiles.value = true // Reset to safe default
    showToast(t('toasts.importSuccess', { count: imported.length }), 'success')
  } catch (e) {
    console.error('Import failed:', e)
    showToast(t('toasts.importFailed') + ': ' + e, 'error')
  }
}

async function onOnboardingComplete() {
  // Create starter nodes only if Default workspace is empty
  // Don't create starter content in custom workspaces
  const isDefaultWorkspace = !store.currentWorkspaceId || store.currentWorkspaceId === 'default'
  const defaultNodes = store.nodes.filter(n => !n.workspace_id)
  if (isDefaultWorkspace && defaultNodes.length === 0) {
    await store.resetDefaultWorkspace()
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
            <option value="">Default</option>
            <option v-for="ws in store.workspaces" :key="ws.id" :value="ws.id">
              {{ ws.name }}
            </option>
          </select>
          <button class="icon-btn" :data-tooltip="t('toolbar.editWorkspace')" @click="openWorkspaceEditor">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn" :data-tooltip="t('toolbar.newWorkspace')" @click="showWorkspaceDialog = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div class="toolbar-divider"></div>
        <button class="icon-btn" :disabled="undoStack.length === 0" :data-tooltip="`${t('toolbar.undo')} (Cmd+Z)`" @click="undo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        </button>
        <button class="icon-btn" :disabled="redoStack.length === 0" :data-tooltip="`${t('toolbar.redo')} (Cmd+Shift+Z)`" @click="redo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
        </button>
      </div>
      <div class="toolbar-center">
        <button class="search-trigger" @click="showSearch = true">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span class="search-placeholder">{{ t('search.placeholder') }}</span>
          <span class="search-shortcut">Cmd+K</span>
        </button>
      </div>
      <div class="toolbar-actions">
        <button
          class="icon-btn"
          :class="{ active: showStorylinePanel }"
          :data-tooltip="t('toolbar.storylines')"
          @click="showStorylinePanel = !showStorylinePanel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </button>
        <button class="icon-btn" :data-tooltip="t('toolbar.importVault')" @click="showImportDialog = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </button>
        <button class="icon-btn theme-btn" :data-tooltip="`${t('toolbar.theme')}: ${currentTheme}`" @click="cycleTheme">
          <svg v-if="currentTheme === 'light'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <svg v-else-if="currentTheme === 'dark'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <svg v-else-if="currentTheme === 'pitch-black'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20 10 10 0 0 0 0-20"/></svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </button>
        <button class="icon-btn settings-btn" :data-tooltip="`${t('toolbar.settings')} (Cmd+,)`" @click="showSettings = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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
          :placeholder="t('search.inputPlaceholder')"
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
            {{ t('search.noResults') }}
          </div>
        </div>
      </div>
    </div>

    <main class="main-content">
      <StorylinePanel
        v-if="showStorylinePanel"
        @open-reader="(id) => readerStorylineId = id"
      />
      <PixiCanvas />
    </main>

    <!-- Storyline Reader (fullscreen) -->
    <StorylineReader
      v-if="readerStorylineId"
      :storyline-id="readerStorylineId"
      @close="readerStorylineId = null"
    />

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
                :placeholder="t('workspace.pathPlaceholder')"
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
              :placeholder="t('workspace.namePlaceholder')"
              class="path-input workspace-name-input"
            />

            <label class="radio-label">
              <input v-model="importTarget" type="radio" value="current" />
              <span>Import into current workspace</span>
            </label>
          </div>

          <div class="import-options-section">
            <label class="checkbox-label">
              <input v-model="keepOriginalFiles" type="checkbox" />
              <span>Keep original files (recommended for Obsidian vaults)</span>
            </label>
            <p v-if="!keepOriginalFiles" class="warning-text">
              Warning: Original files will be deleted after import
            </p>
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
        <h2>{{ t('workspace.new') }}</h2>
        <div class="dialog-content">
          <label>
            {{ t('workspace.workspaceName') }}:
            <input
              v-model="newWorkspaceName"
              type="text"
              :placeholder="t('workspace.defaultName')"
              class="path-input"
              @keydown.enter="createNewWorkspace"
            />
          </label>
        </div>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="showWorkspaceDialog = false">{{ t('common.cancel') }}</button>
          <button class="import-btn" :disabled="!newWorkspaceName.trim()" @click="createNewWorkspace">{{ t('workspace.create') }}</button>
        </div>
      </div>
    </div>

    <!-- Workspace Editor Dialog -->
    <div v-if="showWorkspaceEditor && editingWorkspace" class="dialog-overlay" @click.self="showWorkspaceEditor = false">
      <div class="dialog workspace-editor">
        <h2>{{ t('workspace.edit') }}</h2>
        <div class="dialog-content">
          <label>
            {{ t('workspace.name') }}:
            <input
              v-model="editingWorkspace.name"
              type="text"
              :placeholder="t('workspace.namePlaceholder')"
              class="path-input"
              :disabled="!store.currentWorkspaceId"
            />
          </label>
          <label>
            {{ t('workspace.description') }}:
            <textarea
              v-model="editingWorkspace.description"
              :placeholder="t('workspace.descriptionPlaceholder')"
              class="description-input"
              rows="3"
            ></textarea>
          </label>

          <!-- Vault Sync Settings -->
          <div v-if="editingWorkspace.id" class="vault-settings">
            <label>{{ t('settings.vaultSync') }}:</label>
            <div class="vault-path-row">
              <div v-if="editingWorkspace.vault_path" class="vault-path">
                <code>{{ editingWorkspace.vault_path }}</code>
                <button class="clear-btn" type="button" :title="t('common.clear')" @click="clearVaultPath">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <button class="select-folder-btn" type="button" @click="selectVaultFolder">
                {{ editingWorkspace.vault_path ? t('settings.changeFolder') : t('settings.selectFolder') }}
              </button>
            </div>
            <label v-if="editingWorkspace.vault_path" class="checkbox-label sync-toggle">
              <input
                v-model="editingWorkspace.sync_enabled"
                type="checkbox"
              />
              {{ t('settings.syncEnabled') }}
            </label>
            <button
              v-if="editingWorkspace.vault_path"
              class="sync-files-btn"
              type="button"
              :disabled="syncingFiles"
              @click="syncVaultFiles"
            >
              {{ syncingFiles ? t('settings.syncing') : t('settings.syncMissingFiles') }}
            </button>
            <span class="hint">{{ t('settings.vaultSyncHint') }}</span>
          </div>

          <div class="workspace-stats">
            <span>{{ store.filteredNodes.length }} {{ t('canvas.status.nodes') }}</span>
            <span class="stat-sep">|</span>
            <span>{{ store.filteredEdges.length }} {{ t('canvas.status.edges') }}</span>
          </div>
        </div>
        <div class="dialog-actions">
          <button
            v-if="editingWorkspace?.id"
            class="delete-btn"
            @click="deleteCurrentWorkspace"
          >
            {{ t('common.delete') }} {{ t('settings.workspace') }}
          </button>
          <button
            v-if="!editingWorkspace?.id"
            class="reset-btn"
            @click="resetDefaultWorkspace"
          >
            {{ t('settings.resetDefaultWorkspaceBtn') }}
          </button>
          <div class="actions-right">
            <button class="cancel-btn" @click="showWorkspaceEditor = false">{{ t('common.cancel') }}</button>
            <button class="import-btn" @click="saveWorkspaceChanges">{{ t('common.save') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Workspace Confirmation -->
    <div v-if="showDeleteWorkspaceDialog" class="dialog-overlay" @click.self="showDeleteWorkspaceDialog = false">
      <div class="dialog delete-confirm-dialog">
        <h2>{{ t('workspace.deleteConfirmTitle') }}</h2>
        <div class="dialog-content">
          <p>{{ t('workspace.deleteConfirmText', { name: editingWorkspace?.name }) }}</p>

          <div class="delete-options">
            <label class="checkbox-label">
              <input v-model="deleteWorkspaceKeepFiles" type="checkbox" />
              <span>{{ t('workspace.keepFiles') }}</span>
            </label>
            <p v-if="!deleteWorkspaceKeepFiles" class="warning-text">
              {{ t('workspace.keepFilesWarning') }}
            </p>
            <p v-else class="info-text">
              {{ t('workspace.keepFilesInfo') }}
            </p>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="showDeleteWorkspaceDialog = false">{{ t('common.cancel') }}</button>
          <button class="delete-btn" @click="confirmDeleteWorkspace">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <SettingsModal v-if="showSettings" @close="showSettings = false" />

    <!-- Onboarding Flow -->
    <OnboardingFlow @complete="onOnboardingComplete" />

    <!-- Global notifications (for critical errors) -->
    <NotificationToast />

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

<style src="./App.css" scoped></style>
