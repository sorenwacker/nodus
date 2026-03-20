/**
 * File sync composable
 * Manages vault file watching and synchronization
 */
import { ref } from 'vue'
import { invoke, listen, readTextFile } from '../lib/tauri'
import { storeLogger } from '../lib/logger'
import type { Node, FileChangeEvent } from '../types'

export interface FileSyncDeps {
  getNodes: () => Node[]
  updateNodeInPlace: (id: string, updates: Partial<Node>) => void
}

export function useFileSync(deps: FileSyncDeps) {
  let watcherUnlisten: (() => void) | null = null
  const isWatching = ref(false)

  async function watchVault(path: string): Promise<void> {
    await stopWatching()
    watcherUnlisten = await listen<FileChangeEvent>('vault-file-changed', handleFileChange)
    await invoke('watch_vault', { path })
    isWatching.value = true
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

  async function handleFileChange(event: FileChangeEvent) {
    const filePath = event.path
    const nodes = deps.getNodes()

    switch (event.change_type) {
      case 'Created': {
        storeLogger.debug(`New file detected: ${filePath}`)
        break
      }
      case 'Modified': {
        const node = nodes.find(n => n.file_path === filePath)
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
        const node = nodes.find(n => n.file_path === filePath)
        if (node) {
          storeLogger.debug(`File deleted externally: ${filePath}`)
          deps.updateNodeInPlace(node.id, {
            file_path: null,
            updated_at: Date.now(),
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
