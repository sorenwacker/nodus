/**
 * Backlink updater composable
 * Updates wikilinks in other nodes when a node's path/title changes
 */
import { storeLogger } from '../lib/logger'
import type { Node } from '../types'

export interface BacklinkUpdateResult {
  updatedNodes: string[]
  errors: string[]
}

export interface BacklinkUpdaterDeps {
  getNodes: () => Node[]
  updateNodeContent: (id: string, content: string) => Promise<void>
}

/**
 * Extract wikilinks from markdown content
 * Returns array of { target, display, fullMatch, startIndex, endIndex }
 */
export function parseWikilinks(content: string): Array<{
  target: string
  display: string | null
  fullMatch: string
  startIndex: number
  endIndex: number
}> {
  const links: Array<{
    target: string
    display: string | null
    fullMatch: string
    startIndex: number
    endIndex: number
  }> = []

  // Match [[target]] or [[target|display]]
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  let match

  while ((match = regex.exec(content)) !== null) {
    links.push({
      target: match[1],
      display: match[2] || null,
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    })
  }

  return links
}

/**
 * Check if a wikilink target matches a node
 */
function wikilinkMatchesNode(
  target: string,
  node: Node,
  oldPath: string | null
): boolean {
  const targetLower = target.toLowerCase()

  // Match by exact title
  if (node.title.toLowerCase() === targetLower) {
    return true
  }

  // Match by path (e.g., [[folder/note]])
  if (oldPath) {
    const pathParts = oldPath.replace(/\\/g, '/').split('/')
    const filename = pathParts[pathParts.length - 1].replace(/\.md$/, '')

    // Check if target ends with the filename
    if (targetLower === filename.toLowerCase()) {
      return true
    }

    // Check if target contains folder/filename pattern
    if (pathParts.length >= 2) {
      const folderAndFile = pathParts.slice(-2).join('/').replace(/\.md$/, '')
      if (targetLower === folderAndFile.toLowerCase()) {
        return true
      }
    }
  }

  return false
}

/**
 * Calculate the new wikilink target based on the node's new location
 */
function calculateNewWikilinkTarget(
  node: Node,
  newPath: string | null,
  vaultPath: string | null
): string {
  // If no path, just use the title
  if (!newPath || !vaultPath) {
    return node.title
  }

  // Calculate relative path from vault root
  const normalizedNewPath = newPath.replace(/\\/g, '/')
  const normalizedVault = vaultPath.replace(/\\/g, '/').replace(/\/$/, '')

  if (!normalizedNewPath.startsWith(normalizedVault)) {
    return node.title
  }

  const relativePath = normalizedNewPath.slice(normalizedVault.length + 1)
  const withoutExtension = relativePath.replace(/\.md$/, '')

  // If the file is at vault root, just use the filename
  if (!withoutExtension.includes('/')) {
    return withoutExtension
  }

  // Otherwise use the full relative path
  return withoutExtension
}

export function useBacklinkUpdater(deps: BacklinkUpdaterDeps) {
  /**
   * Update all wikilinks pointing to a node that has moved
   * @param movedNodeId The ID of the node that moved
   * @param oldPath The node's previous file_path
   * @param newPath The node's new file_path
   * @param vaultPath The vault root path
   */
  async function updateBacklinks(
    movedNodeId: string,
    oldPath: string | null,
    newPath: string | null,
    vaultPath: string | null
  ): Promise<BacklinkUpdateResult> {
    const result: BacklinkUpdateResult = {
      updatedNodes: [],
      errors: [],
    }

    const nodes = deps.getNodes()
    const movedNode = nodes.find((n) => n.id === movedNodeId)

    if (!movedNode) {
      result.errors.push(`Node ${movedNodeId} not found`)
      return result
    }

    // Calculate the new wikilink target
    const newTarget = calculateNewWikilinkTarget(movedNode, newPath, vaultPath)

    // Find all nodes that might have wikilinks to the moved node
    for (const node of nodes) {
      if (node.id === movedNodeId) continue
      if (!node.markdown_content) continue

      const links = parseWikilinks(node.markdown_content)
      let updatedContent = node.markdown_content
      let hasChanges = false

      // Process links in reverse order to maintain correct indices
      const matchingLinks = links.filter((link) =>
        wikilinkMatchesNode(link.target, movedNode, oldPath)
      )

      // Sort by startIndex descending so replacements don't shift indices
      matchingLinks.sort((a, b) => b.startIndex - a.startIndex)

      for (const link of matchingLinks) {
        // Construct the new wikilink
        const newWikilink = link.display
          ? `[[${newTarget}|${link.display}]]`
          : `[[${newTarget}]]`

        // Only update if the target actually changed
        if (link.target !== newTarget) {
          updatedContent =
            updatedContent.slice(0, link.startIndex) +
            newWikilink +
            updatedContent.slice(link.endIndex)
          hasChanges = true
        }
      }

      if (hasChanges) {
        try {
          await deps.updateNodeContent(node.id, updatedContent)
          result.updatedNodes.push(node.id)
          storeLogger.info(`Updated backlinks in node: ${node.title}`)
        } catch (e) {
          result.errors.push(`Failed to update ${node.title}: ${e}`)
          storeLogger.error(`Failed to update backlinks in node ${node.id}:`, e)
        }
      }
    }

    return result
  }

  /**
   * Scan workspace for all backlinks to a specific node
   * Useful for showing backlink count/preview without modifying anything
   */
  function findBacklinks(nodeId: string): Array<{ nodeId: string; nodeTitle: string; count: number }> {
    const nodes = deps.getNodes()
    const targetNode = nodes.find((n) => n.id === nodeId)
    if (!targetNode) return []

    const backlinks: Array<{ nodeId: string; nodeTitle: string; count: number }> = []

    for (const node of nodes) {
      if (node.id === nodeId) continue
      if (!node.markdown_content) continue

      const links = parseWikilinks(node.markdown_content)
      const matchingCount = links.filter((link) =>
        wikilinkMatchesNode(link.target, targetNode, targetNode.file_path)
      ).length

      if (matchingCount > 0) {
        backlinks.push({
          nodeId: node.id,
          nodeTitle: node.title,
          count: matchingCount,
        })
      }
    }

    return backlinks
  }

  return {
    updateBacklinks,
    findBacklinks,
    parseWikilinks,
  }
}
