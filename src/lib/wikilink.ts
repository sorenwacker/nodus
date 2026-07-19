/**
 * Wikilink resolution utilities
 * Handles finding nodes from wikilink targets like [[folder/note]] or [[note]]
 */
import type { Node, Frame } from '../types'

export interface WikilinkResolveOptions {
  nodes: Node[]
  frames?: Frame[]
}

/**
 * Resolve a wikilink target to a node
 * Priority:
 * 1. Exact title match
 * 2. File path match
 * 3. Frame + node title match (e.g., "folder/note" -> frame "folder" + node "note")
 * 4. Filename-only match (fallback, may be ambiguous)
 */
export function resolveWikilink(
  target: string,
  options: WikilinkResolveOptions
): Node | undefined {
  const { nodes, frames = [] } = options

  // Decode HTML entities
  const decodedTarget = target
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

  // Extract path parts
  const pathParts = decodedTarget.split('/')
  const targetWithoutPath = pathParts[pathParts.length - 1]

  // 1. Exact title match
  let node = nodes.find(
    n => n.title.toLowerCase() === decodedTarget.toLowerCase()
  )
  if (node) return node

  // 2. File path match, anchored to the filename. A loose substring match
  // here would resolve "note" to "another-note.md" and shadow the more
  // precise frame+title resolution below.
  const targetLower = decodedTarget.toLowerCase()
  node = nodes.find(n => {
    const path = n.file_path?.toLowerCase()
    if (!path) return false
    return (
      path === targetLower ||
      path === `${targetLower}.md` ||
      path.endsWith(`/${targetLower}`) ||
      path.endsWith(`/${targetLower}.md`)
    )
  })
  if (node) return node

  // 3. Frame + node title match
  if (pathParts.length >= 2) {
    const framePath = pathParts.slice(0, -1).join('/')
    const frame = frames.find(f =>
      f.title.toLowerCase() === framePath.toLowerCase() ||
      f.folder_path?.toLowerCase().includes(framePath.toLowerCase())
    )
    if (frame) {
      // Find node with matching title inside this frame
      node = nodes.find(n =>
        n.title.toLowerCase() === targetWithoutPath.toLowerCase() &&
        n.frame_id === frame.id
      )
      if (node) return node
    }
  }

  // 4. Filename-only match with disambiguation
  const matches = nodes.filter(
    n => n.title.toLowerCase() === targetWithoutPath.toLowerCase()
  )
  if (matches.length === 1) {
    return matches[0]
  } else if (matches.length > 1) {
    // Multiple matches - prefer the one whose file_path contains the folder from the wikilink
    if (pathParts.length >= 2) {
      const folderPath = pathParts.slice(0, -1).join('/')
      node = matches.find(n => n.file_path?.includes(folderPath))
      if (node) return node
    }
    // Still ambiguous - return first match
    return matches[0]
  }

  return undefined
}

/**
 * Check if a wikilink target can be resolved to an existing node
 */
export function wikilinkExists(
  target: string,
  options: WikilinkResolveOptions
): boolean {
  return resolveWikilink(target, options) !== undefined
}
