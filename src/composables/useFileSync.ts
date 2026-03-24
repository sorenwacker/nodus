/**
 * File sync composable
 * Manages vault file watching and synchronization
 */
import { ref } from 'vue'
import {
  invoke,
  listen,
  readTextFile,
  createNodeFromFile,
  syncNodeWikilinks,
  getWorkspace,
} from '../lib/tauri'
import { storeLogger } from '../lib/logger'
import type { Node, FileChangeEvent } from '../types'

export interface FileSyncDeps {
  getNodes: () => Node[]
  updateNodeInPlace: (id: string, updates: Partial<Node>) => void
  addNode: (node: Node) => void
  removeNode: (id: string) => void
  getCurrentWorkspaceId: () => string | null
}

export function useFileSync(deps: FileSyncDeps) {
  let watcherUnlisten: (() => void) | null = null
  const isWatching = ref(false)

  async function watchVault(path: string): Promise<void> {
    console.log('[FileSync] Starting vault watcher for:', path)
    await stopWatching()
    watcherUnlisten = await listen<FileChangeEvent>('vault-file-changed', (event) => {
      console.log('[FileSync] Raw event received:', event)
      handleFileChange(event.payload)
    })
    await invoke('watch_vault', { path })
    isWatching.value = true
    console.log('[FileSync] Watcher started successfully')
  }

  async function stopWatching(): Promise<void> {
    if (watcherUnlisten) {
      watcherUnlisten()
      watcherUnlisten = null
    }
    try {
      await invoke('stop_watching')
    } catch {
      // Ignore errors if not watching
    }
    isWatching.value = false
  }

  async function isSyncEnabled(): Promise<boolean> {
    const workspaceId = deps.getCurrentWorkspaceId()
    if (!workspaceId) return false
    try {
      const workspace = await getWorkspace(workspaceId)
      return workspace?.sync_enabled ?? false
    } catch {
      return false
    }
  }

  async function handleFileChange(event: FileChangeEvent) {
    const filePath = event.path
    const nodes = deps.getNodes()

    console.log('[FileSync] Received file change event:', event.change_type, filePath)

    switch (event.change_type) {
      case 'Created': {
        console.log('[FileSync] New file detected:', filePath)
        const syncEnabled = await isSyncEnabled()
        console.log('[FileSync] Sync enabled:', syncEnabled)
        // Create node if sync is enabled
        if (syncEnabled) {
          const workspaceId = deps.getCurrentWorkspaceId()
          console.log('[FileSync] Creating node for workspace:', workspaceId)
          try {
            const node = (await createNodeFromFile(filePath, workspaceId)) as Node
            console.log('[FileSync] Node created:', node.id, node.title)
            deps.addNode(node)
            storeLogger.info(`Created node from new file: ${filePath}`)
          } catch (e) {
            console.error('[FileSync] Failed to create node from file:', e)
            storeLogger.error('Failed to create node from file:', e)
          }
        } else {
          console.log('[FileSync] Sync not enabled, skipping node creation')
        }
        break
      }
      case 'Modified': {
        const node = nodes.find((n) => n.file_path === filePath)
        if (node && event.new_checksum && node.checksum !== event.new_checksum) {
          storeLogger.debug(`File modified externally: ${filePath}`)
          try {
            const content = await readTextFile(filePath)
            deps.updateNodeInPlace(node.id, {
              markdown_content: content,
              checksum: event.new_checksum,
              updated_at: Date.now(),
            })
            await invoke<string | null>('update_node_content', { id: node.id, content })
            // Sync wikilinks to create edges for new links
            const edgesCreated = await syncNodeWikilinks(node.id)
            if (edgesCreated > 0) {
              storeLogger.info(`Created ${edgesCreated} new edges from wikilinks`)
            }
          } catch (e) {
            storeLogger.error('Failed to reload file content:', e)
            deps.updateNodeInPlace(node.id, {
              checksum: event.new_checksum,
            })
          }
        }
        break
      }
      case 'Deleted': {
        console.log('[FileSync] Looking for node with file_path:', filePath)
        console.log('[FileSync] Available nodes with file_paths:', nodes.filter(n => n.file_path).map(n => ({ id: n.id, title: n.title, file_path: n.file_path })))
        const node = nodes.find((n) => n.file_path === filePath)
        if (node) {
          console.log('[FileSync] Found node to delete:', node.id, node.title)
          // If sync is enabled, delete the node entirely
          // Otherwise just clear the file path
          const syncEnabled = await isSyncEnabled()
          console.log('[FileSync] Sync enabled:', syncEnabled)
          if (syncEnabled) {
            deps.removeNode(node.id)
            console.log('[FileSync] Deleted node for removed file:', filePath)
          } else {
            deps.updateNodeInPlace(node.id, {
              file_path: null,
              updated_at: Date.now(),
            })
            console.log('[FileSync] Cleared file_path for node:', node.id)
          }
        } else {
          console.log('[FileSync] No node found for deleted file:', filePath)
        }
        break
      }
    }
  }

  return {
    isWatching,
    watchVault,
    stopWatching,
    handleFileChange,
  }
}
