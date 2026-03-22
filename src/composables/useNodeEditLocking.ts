import { ref } from 'vue'
import {
  acquireEditLock,
  releaseEditLock,
  checkFileAvailable,
} from '../lib/tauri'
import { storeLogger } from '../lib/logger'
import { notifications$ } from './useNotifications'

export interface NodeEditLockingDeps {
  getNode: (id: string) => { file_path: string | null; title: string } | undefined
}

/**
 * Composable for managing node edit locks
 * Handles file locking to prevent concurrent edits
 */
export function useNodeEditLocking(deps: NodeEditLockingDeps) {
  // Track which nodes have edit locks held by this session
  const lockedNodeIds = ref<Set<string>>(new Set())

  /**
   * Check if a node's file is available for editing
   * Returns true if available, false if locked by another process
   */
  async function isNodeEditable(nodeId: string): Promise<boolean> {
    const node = deps.getNode(nodeId)
    if (!node?.file_path) return true // No file = always editable

    try {
      return await checkFileAvailable(node.file_path)
    } catch (e) {
      storeLogger.error('Failed to check file availability:', e)
      return true // Assume editable on error
    }
  }

  /**
   * Acquire an edit lock for a node before editing
   * Shows notification if the file is locked by another application
   * Returns false if lock could not be acquired
   */
  async function startEditing(nodeId: string): Promise<boolean> {
    const node = deps.getNode(nodeId)
    if (!node?.file_path) return true // No file to lock

    try {
      await acquireEditLock(nodeId)
      lockedNodeIds.value.add(nodeId)
      storeLogger.debug(`Acquired edit lock for node: ${node.title}`)
      return true
    } catch (e) {
      const errorMsg = String(e)
      if (errorMsg.includes('being edited')) {
        notifications$.error(
          `Cannot edit "${node.title}"`,
          'File is open in another application'
        )
        return false
      }
      notifications$.error('Failed to acquire edit lock', String(e))
      return false
    }
  }

  /**
   * Release an edit lock after editing is complete
   */
  async function stopEditing(nodeId: string): Promise<void> {
    if (!lockedNodeIds.value.has(nodeId)) return

    try {
      await releaseEditLock(nodeId)
      lockedNodeIds.value.delete(nodeId)
      storeLogger.debug(`Released edit lock for node: ${nodeId}`)
    } catch (e) {
      storeLogger.error('Failed to release edit lock:', e)
    }
  }

  /**
   * Check if we currently hold an edit lock for a node
   */
  function hasEditLock(nodeId: string): boolean {
    return lockedNodeIds.value.has(nodeId)
  }

  return {
    lockedNodeIds,
    isNodeEditable,
    startEditing,
    stopEditing,
    hasEditLock,
  }
}
