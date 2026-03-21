/**
 * Workspace store
 * Manages workspace CRUD operations, switching, and recovery
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '../lib/tauri'
import { workspaceStorage } from '../lib/storage'
import { storeLogger } from '../lib/logger'
import type { Workspace } from '../types'

// Maximum workspace name length
const MAX_WORKSPACE_NAME_LENGTH = 100

/**
 * Sanitize workspace name to prevent XSS and ensure valid format
 */
function sanitizeWorkspaceName(name: string): string {
  // Trim whitespace
  let sanitized = name.trim()
  // Remove HTML/script tags
  sanitized = sanitized.replace(/<[^>]*>/g, '')
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '')
  // Truncate to max length
  if (sanitized.length > MAX_WORKSPACE_NAME_LENGTH) {
    sanitized = sanitized.slice(0, MAX_WORKSPACE_NAME_LENGTH)
  }
  // Ensure not empty after sanitization
  if (!sanitized) {
    sanitized = 'Untitled Workspace'
  }
  return sanitized
}

interface DbWorkspace {
  id: string
  name: string
  color: string | null
  vault_path: string | null
  created_at: number
  updated_at: number
}

export const useWorkspaceStore = defineStore('workspaces', () => {
  const workspaces = ref<Workspace[]>(workspaceStorage.getAll())
  const currentWorkspaceId = ref<string | null>(workspaceStorage.getCurrent())
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Get current workspace object
  const currentWorkspace = computed(() =>
    workspaces.value.find((w) => w.id === currentWorkspaceId.value)
  )

  // Persist workspaces to localStorage
  function saveWorkspacesToStorage() {
    workspaceStorage.setAll(workspaces.value)
    workspaceStorage.setCurrent(currentWorkspaceId.value)
  }

  // Sync workspaces between localStorage and database (bidirectional)
  async function syncWorkspacesToDatabase() {
    const dbWorkspaces = await invoke<DbWorkspace[]>('get_workspaces')
    const dbIds = new Set(dbWorkspaces.map((w) => w.id))
    const localIds = new Set(workspaces.value.map((w) => w.id))

    // Create any localStorage workspaces that don't exist in the database
    for (const ws of workspaces.value) {
      if (!dbIds.has(ws.id)) {
        storeLogger.info(`Syncing workspace to database: ${ws.name} (${ws.id})`)
        await invoke('create_workspace', {
          input: {
            id: ws.id,
            name: ws.name,
            color: null,
            vaultPath: null,
          },
        })
      }
    }

    // Load any database workspaces that don't exist in localStorage
    for (const dbWs of dbWorkspaces) {
      if (!localIds.has(dbWs.id)) {
        storeLogger.info(`Loading workspace from database: ${dbWs.name} (${dbWs.id})`)
        workspaces.value.push({
          id: dbWs.id,
          name: dbWs.name,
        })
      }
    }

    // Persist updated workspaces to localStorage
    saveWorkspacesToStorage()
  }

  async function initialize() {
    loading.value = true
    error.value = null
    try {
      await syncWorkspacesToDatabase()
    } catch (e) {
      error.value = String(e)
      storeLogger.error('Failed to sync workspaces:', e)
    } finally {
      loading.value = false
    }
  }

  async function createWorkspace(name: string): Promise<Workspace> {
    const sanitizedName = sanitizeWorkspaceName(name)
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name: sanitizedName,
      created_at: Date.now(),
    }

    // Create workspace in database first (for foreign key constraints)
    await invoke('create_workspace', {
      input: {
        id: workspace.id,
        name: workspace.name,
        color: null,
        vaultPath: null,
      },
    })

    workspaces.value.push(workspace)
    saveWorkspacesToStorage()
    return workspace
  }

  function switchWorkspace(workspaceId: string | null) {
    currentWorkspaceId.value = workspaceId
    saveWorkspacesToStorage()
  }

  async function deleteWorkspace(id: string) {
    // Delete from database first
    try {
      await invoke('delete_workspace', { id })
    } catch (e) {
      storeLogger.error('Failed to delete workspace from database:', e)
      // Continue with local deletion anyway
    }

    // Remove from local state
    workspaces.value = workspaces.value.filter((w) => w.id !== id)
    if (currentWorkspaceId.value === id) {
      currentWorkspaceId.value = null
    }
    saveWorkspacesToStorage()
  }

  function renameWorkspace(id: string, newName: string) {
    const workspace = workspaces.value.find((w) => w.id === id)
    if (workspace) {
      workspace.name = sanitizeWorkspaceName(newName)
      saveWorkspacesToStorage()
    }
  }

  /**
   * Recover a workspace that was deleted from localStorage but still exists in DB.
   * Useful when workspace was accidentally deleted but nodes still reference it.
   */
  async function recoverWorkspace(id: string): Promise<Workspace | null> {
    // Check if already in local list
    if (workspaces.value.some((w) => w.id === id)) {
      storeLogger.debug('[Store] Workspace already exists locally:', id)
      return workspaces.value.find((w) => w.id === id) || null
    }

    // Fetch from database
    const dbWorkspaces = await invoke<DbWorkspace[]>('get_workspaces')
    const dbWorkspace = dbWorkspaces.find((w) => w.id === id)

    if (!dbWorkspace) {
      storeLogger.debug('[Store] Workspace not found in database:', id)
      return null
    }

    // Add to local list
    const workspace: Workspace = {
      id: dbWorkspace.id,
      name: dbWorkspace.name,
      created_at: dbWorkspace.created_at,
    }

    workspaces.value.push(workspace)
    saveWorkspacesToStorage()
    storeLogger.debug('[Store] Recovered workspace:', workspace.name)

    return workspace
  }

  /**
   * Find orphaned workspace IDs (nodes reference workspaces not in local list)
   * Requires node list from nodes store
   */
  function getOrphanedWorkspaceIds(nodes: { workspace_id: string | null }[]): string[] {
    const localIds = new Set(workspaces.value.map((w) => w.id))
    const referencedIds = new Set<string>()

    for (const node of nodes) {
      if (node.workspace_id && !localIds.has(node.workspace_id)) {
        referencedIds.add(node.workspace_id)
      }
    }

    return Array.from(referencedIds)
  }

  return {
    // State
    workspaces,
    currentWorkspaceId,
    currentWorkspace,
    loading,
    error,

    // Methods
    initialize,
    createWorkspace,
    switchWorkspace,
    deleteWorkspace,
    renameWorkspace,
    recoverWorkspace,
    getOrphanedWorkspaceIds,
    saveWorkspacesToStorage,
    syncWorkspacesToDatabase,
  }
})

export type { Workspace }
