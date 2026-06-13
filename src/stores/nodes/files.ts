/**
 * File/folder sync operations for the nodes store
 */

import { invoke } from '../../lib/tauri'
import { storeLogger } from '../../lib/logger'
import type { Node, NodeStoreDependencies } from './types'

/**
 * Check if moving a node's file would cause a collision
 * Returns the conflicting filename if collision exists, null otherwise
 */
export async function checkFileCollision(
  nodeId: string,
  targetFolder: string
): Promise<string | null> {
  const result = await invoke<string | null>('check_file_collision', { nodeId, targetFolder })
  return result
}

/**
 * Move a node's file to a different folder
 * Used for folder-frame sync when nodes are dragged between frames
 * @param collisionResolution - 'auto' (auto-rename), 'replace' (overwrite), or a custom filename
 */
export async function moveNodeFile(
  deps: NodeStoreDependencies,
  nodeId: string,
  targetFolder: string,
  collisionResolution?: string,
  updateContentFn?: (id: string, content: string) => Promise<void>
): Promise<string> {
  const { state, workspaceStore } = deps
  const node = state.nodes.value.find((n) => n.id === nodeId)
  const oldPath = node?.file_path

  const newPath = await invoke<string>('move_node_file', {
    nodeId,
    targetFolder,
    collisionResolution: collisionResolution ?? 'auto',
  })

  // Update local node state
  if (node) {
    node.file_path = newPath
  }

  // Update backlinks in other nodes that reference this node
  if (oldPath && newPath !== oldPath && updateContentFn) {
    const vaultPath = workspaceStore.currentVaultPath
    await updateBacklinksForMovedNode(deps, nodeId, oldPath, newPath, vaultPath, updateContentFn)
  }

  return newPath
}

/**
 * Update wikilinks in other nodes when a node moves
 */
async function updateBacklinksForMovedNode(
  deps: NodeStoreDependencies,
  nodeId: string,
  oldPath: string,
  newPath: string,
  vaultPath: string | null,
  updateContentFn: (id: string, content: string) => Promise<void>
): Promise<void> {
  const { state } = deps
  const movedNode = state.nodes.value.find((n) => n.id === nodeId)
  if (!movedNode) return

  // Calculate new wikilink target
  let newTarget = movedNode.title
  if (newPath && vaultPath) {
    const normalizedNewPath = newPath.replace(/\\/g, '/')
    const normalizedVault = vaultPath.replace(/\\/g, '/').replace(/\/$/, '')
    if (normalizedNewPath.startsWith(normalizedVault)) {
      const relativePath = normalizedNewPath.slice(normalizedVault.length + 1)
      newTarget = relativePath.replace(/\.md$/, '')
    }
  }

  // Find and update nodes with wikilinks to the moved node
  for (const node of state.nodes.value) {
    if (node.id === nodeId || !node.markdown_content) continue

    // Check if this node has wikilinks that might reference the moved node
    const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
    let match
    let updatedContent = node.markdown_content
    let hasChanges = false

    // Collect all matches first to avoid issues with index shifting
    const matches: Array<{ target: string; display: string | null; fullMatch: string; index: number }> = []
    while ((match = wikilinkRegex.exec(node.markdown_content)) !== null) {
      matches.push({
        target: match[1],
        display: match[2] || null,
        fullMatch: match[0],
        index: match.index,
      })
    }

    // Process matches in reverse order to preserve indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i]
      const targetLower = m.target.toLowerCase()

      // Check if this wikilink matches the moved node
      let isMatch = false

      // Match by title
      if (movedNode.title.toLowerCase() === targetLower) {
        isMatch = true
      }

      // Match by old path
      if (!isMatch && oldPath) {
        const pathParts = oldPath.replace(/\\/g, '/').split('/')
        const filename = pathParts[pathParts.length - 1].replace(/\.md$/, '')
        if (targetLower === filename.toLowerCase()) {
          isMatch = true
        }
        // Check folder/filename pattern
        if (!isMatch && pathParts.length >= 2) {
          const folderAndFile = pathParts.slice(-2).join('/').replace(/\.md$/, '')
          if (targetLower === folderAndFile.toLowerCase()) {
            isMatch = true
          }
        }
      }

      if (isMatch && m.target !== newTarget) {
        const newWikilink = m.display ? `[[${newTarget}|${m.display}]]` : `[[${newTarget}]]`
        updatedContent =
          updatedContent.slice(0, m.index) +
          newWikilink +
          updatedContent.slice(m.index + m.fullMatch.length)
        hasChanges = true
      }
    }

    if (hasChanges) {
      try {
        await updateContentFn(node.id, updatedContent)
        storeLogger.info(`Updated backlinks in node: ${node.title}`)
      } catch (e) {
        storeLogger.error(`Failed to update backlinks in node ${node.id}:`, e)
      }
    }
  }
}

/**
 * Update a node's file path in local state (for use by node dragging)
 */
export function updateNodeFilePath(
  nodes: Node[],
  nodeId: string,
  filePath: string
): void {
  const node = nodes.find((n) => n.id === nodeId)
  if (node) {
    node.file_path = filePath
  }
}

/**
 * Get the current workspace vault path
 */
export function getVaultPath(
  workspaceStore: NodeStoreDependencies['workspaceStore']
): string | null {
  return workspaceStore.currentVaultPath
}
