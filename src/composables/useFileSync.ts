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
    console.log('[FileSync] Starting vault watcher for:', path)
    await stopWatching()
    // Note: listen() wrapper already extracts payload, so event IS the FileChangeEvent
    watcherUnlisten = await listen<FileChangeEvent>('vault-file-changed', (event) => {
      console.log('[FileSync] Raw event received:', event)
      handleFileChange(event)
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
        const filename = getFilename(filePath)

        // Check if this is a move (matching pending deletion by filename)
        const pendingDeletion = pendingDeletions.get(filename)
        if (pendingDeletion) {
          // This is a move! Cancel the deletion and update the path
          clearTimeout(pendingDeletion.timeoutId)
          pendingDeletions.delete(filename)

          console.log('[FileSync] Detected file move:', pendingDeletion.filePath, '->', filePath)
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
        console.log('[FileSync] Sync enabled:', syncEnabled)
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
        console.log('[FileSync] File modified:', filePath)
        const node = nodes.find((n) => n.file_path === filePath)
        console.log('[FileSync] Found node:', node?.id, node?.title, 'checksum match:', node?.checksum === event.new_checksum)
        if (node && event.new_checksum && node.checksum !== event.new_checksum) {
          console.log('[FileSync] Updating node content for:', node.title)
          try {
            const content = await readTextFile(filePath)
            deps.updateNodeInPlace(node.id, {
              markdown_content: content,
              checksum: event.new_checksum,
              updated_at: Date.now(),
            })
            await invoke<string | null>('update_node_content', { id: node.id, content })
            console.log('[FileSync] Node content updated successfully')
            // Sync wikilinks to create edges for new links
            const edgesCreated = await syncNodeWikilinks(node.id)
            if (edgesCreated > 0) {
              storeLogger.info(`Created ${edgesCreated} new edges from wikilinks`)
            }
          } catch (e) {
            console.error('[FileSync] Failed to reload file content:', e)
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
        const node = nodes.find((n) => n.file_path === filePath)
        if (node) {
          console.log('[FileSync] Found node for deleted file:', node.id, node.title)
          const filename = getFilename(filePath)

          // Buffer deletion to detect moves (delete + create with same filename)
          const timeoutId = setTimeout(async () => {
            pendingDeletions.delete(filename)
            console.log('[FileSync] Processing delayed deletion for:', filePath)

            const syncEnabled = await isSyncEnabled()
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
          }, MOVE_DETECTION_DELAY)

          pendingDeletions.set(filename, {
            filePath,
            filename,
            nodeId: node.id,
            timeoutId,
          })
          console.log('[FileSync] Buffered deletion, waiting for potential move:', filename)
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
