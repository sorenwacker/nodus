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
import { notifications$ } from './useNotifications'
import type { Node, FileChangeEvent } from '../types'

export interface FileSyncDeps {
  getNodes: () => Node[]
  updateNodeInPlace: (id: string, updates: Partial<Node>) => void
  addNode: (node: Node) => void
  removeNode: (id: string) => void
  getCurrentWorkspaceId: () => string | null
  reloadEdges?: () => Promise<void>
}

// Extract filename from path
function getFilename(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

// Pending deletion for move detection
interface PendingDeletion {
  filePath: string
  filename: string
  nodeId: string
  timeoutId: ReturnType<typeof setTimeout>
}

export function useFileSync(deps: FileSyncDeps) {
  let watcherUnlisten: (() => void) | null = null
  const isWatching = ref(false)

  // Buffer for detecting file moves (delete + create with same filename)
  const pendingDeletions = new Map<string, PendingDeletion>()
  const MOVE_DETECTION_DELAY = 500 // ms to wait for matching create event

  async function watchVault(path: string): Promise<void> {
    await stopWatching()
    storeLogger.info(`[FileSync] Starting vault watcher for: ${path}`)
    // Note: listen() wrapper already extracts payload, so event IS the FileChangeEvent
    watcherUnlisten = await listen<FileChangeEvent>('vault-file-changed', (event) => {
      storeLogger.info(`[FileSync] File change detected: ${event.change_type} - ${event.path}`)
      handleFileChange(event)
    })
    await invoke('watch_vault', { path })
    isWatching.value = true
    storeLogger.info(`[FileSync] Vault watcher started successfully`)
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

    switch (event.change_type) {
      case 'Created': {
        const filename = getFilename(filePath)

        // Check if this is a move (matching pending deletion by filename)
        const pendingDeletion = pendingDeletions.get(filename)
        if (pendingDeletion) {
          // This is a move! Cancel the deletion and update the path
          clearTimeout(pendingDeletion.timeoutId)
          pendingDeletions.delete(filename)

          deps.updateNodeInPlace(pendingDeletion.nodeId, {
            file_path: filePath,
            updated_at: Date.now(),
          })
          // Update file_path in database
          await invoke('update_node_file_path', { id: pendingDeletion.nodeId, filePath })
          storeLogger.info(`File moved: ${pendingDeletion.filePath} -> ${filePath}`)
          break
        }

        // Not a move - create new node if sync is enabled
        const syncEnabled = await isSyncEnabled()
        if (syncEnabled) {
          const workspaceId = deps.getCurrentWorkspaceId()
          try {
            const node = (await createNodeFromFile(filePath, workspaceId)) as Node
            deps.addNode(node)
            storeLogger.info(`Created node from new file: ${filePath}`)
          } catch (e) {
            storeLogger.error('Failed to create node from file:', e)
          }
        }
        break
      }
      case 'Modified': {
        storeLogger.info(`[FileSync] Processing modified file: ${filePath}`)
        const node = nodes.find((n) => n.file_path === filePath)
        if (!node) {
          storeLogger.info(`[FileSync] No matching node found for file: ${filePath}`)
          break
        }
        storeLogger.info(`[FileSync] Found node: ${node.title} (${node.id})`)
        storeLogger.info(`[FileSync] Checksums - old: ${node.checksum}, new: ${event.new_checksum}`)
        if (node && event.new_checksum && node.checksum !== event.new_checksum) {
          try {
            const content = await readTextFile(filePath)
            storeLogger.info(`[FileSync] Read new content (${content.length} chars)`)
            deps.updateNodeInPlace(node.id, {
              markdown_content: content,
              checksum: event.new_checksum,
              updated_at: Date.now(),
            })
            // Use update_node_content_from_file to avoid writing back to file (infinite loop)
            await invoke('update_node_content_from_file', {
              id: node.id,
              content,
              checksum: event.new_checksum,
            })
            storeLogger.info(`[FileSync] Content updated in DB`)
            // Sync wikilinks to create edges for new links
            const edgesCreated = await syncNodeWikilinks(node.id)
            storeLogger.info(`[FileSync] syncNodeWikilinks returned: ${edgesCreated} new edges`)
            if (edgesCreated > 0) {
              storeLogger.info(`Created ${edgesCreated} new edges from wikilinks`)
              // Reload edges to show the newly created ones
              if (deps.reloadEdges) {
                storeLogger.info(`[FileSync] Reloading edges...`)
                await deps.reloadEdges()
                storeLogger.info(`[FileSync] Edges reloaded`)
              }
              notifications$.info('External change', `${edgesCreated} new link${edgesCreated > 1 ? 's' : ''} detected`)
            }
            storeLogger.info(`Synced external changes: ${node.title}`)
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
        const node = nodes.find((n) => n.file_path === filePath)
        if (node) {
          const filename = getFilename(filePath)

          // Buffer deletion to detect moves (delete + create with same filename)
          const timeoutId = setTimeout(async () => {
            pendingDeletions.delete(filename)

            const syncEnabled = await isSyncEnabled()
            if (syncEnabled) {
              deps.removeNode(node.id)
            } else {
              deps.updateNodeInPlace(node.id, {
                file_path: null,
                updated_at: Date.now(),
              })
            }
          }, MOVE_DETECTION_DELAY)

          pendingDeletions.set(filename, {
            filePath,
            filename,
            nodeId: node.id,
            timeoutId,
          })
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
