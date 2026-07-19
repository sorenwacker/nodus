/**
 * Node CRUD operations for the nodes store
 */

import type { Ref } from 'vue'
import { invoke } from '../../lib/tauri'
import { storeLogger } from '../../lib/logger'
import { generateShortId } from '../../lib/ids'
import { extractHashtags, extractWikilinks } from '../../lib/contentParser'
import { tagStorage } from '../../lib/storage'
import { clampCoord, clampNodeSize } from '../../lib/geometry'
import type {
  Node,
  Edge,
  CreateNodeInput,
  CreateEdgeInput,
  NodeStoreDependencies,
} from './types'
import { findNodeByTitle } from './state'

/**
 * Update node position with optional frame containment
 */
export async function updateNodePosition(
  deps: NodeStoreDependencies,
  id: string,
  x: number,
  y: number,
  options?: { enforceFrame?: boolean; skipLayoutTrigger?: boolean; skipPersist?: boolean }
): Promise<void> {
  const { state, framesStore } = deps
  const node = state.nodes.value.find(n => n.id === id)
  if (node) {
    let finalX = clampCoord(x)
    let finalY = clampCoord(y)

    // Enforce frame containment if requested and node is in a frame
    if (options?.enforceFrame && node.frame_id) {
      const frame = framesStore.frames.find(f => f.id === node.frame_id)
      if (frame) {
        const padding = 20
        const titleHeight = 50
        const nodeWidth = node.width || 200
        const nodeHeight = node.height || 120
        // Clamp to frame bounds
        finalX = Math.max(
          frame.canvas_x + padding,
          Math.min(frame.canvas_x + frame.width - nodeWidth - padding, finalX)
        )
        finalY = Math.max(
          frame.canvas_y + padding + titleHeight,
          Math.min(frame.canvas_y + frame.height - nodeHeight - padding, finalY)
        )
      }
    }

    node.canvas_x = finalX
    node.canvas_y = finalY
    node.updated_at = Date.now()
    // Skip layout trigger during drag for performance - caller should trigger once at drag end
    if (!options?.skipLayoutTrigger) {
      state.nodeLayoutVersion.value++
    }
    // Skip the backend write during a live drag (one IPC + DB write per
    // pointermove per node otherwise). The caller flushes final positions with
    // persistNodePosition on pointerup.
    if (options?.skipPersist) return
    try {
      await invoke('update_node_position', { id, x: finalX, y: finalY })
    } catch (e) {
      console.error('Failed to update position:', e)
    }
  }
}

/**
 * Persist a node's current in-memory position to the backend. Used to flush
 * positions after a drag that ran with skipPersist.
 */
export async function persistNodePosition(
  deps: NodeStoreDependencies,
  id: string
): Promise<void> {
  const { state } = deps
  const node = state.nodes.value.find(n => n.id === id)
  if (!node) return
  try {
    await invoke('update_node_position', { id, x: node.canvas_x, y: node.canvas_y })
  } catch (e) {
    console.error('Failed to persist position:', e)
  }
}

/**
 * Manually trigger layout version update (call after drag ends)
 */
export function triggerLayoutUpdate(nodeLayoutVersion: Ref<number>): void {
  nodeLayoutVersion.value++
}

/**
 * Update node size with optional push of overlapping nodes
 */
export async function updateNodeSize(
  deps: NodeStoreDependencies,
  id: string,
  width: number,
  height: number,
  pushOthers: boolean,
  layoutComposable?: { pushOverlappingNodes: (node: Node) => void }
): Promise<void> {
  const { state } = deps
  const node = state.nodes.value.find(n => n.id === id)
  if (node) {
    const clampedWidth = clampNodeSize(width)
    const clampedHeight = clampNodeSize(height)
    node.width = clampedWidth
    node.height = clampedHeight
    node.updated_at = Date.now()
    state.nodeLayoutVersion.value++ // Trigger edge re-routing

    // Push overlapping nodes away using layout composable
    if (pushOthers && layoutComposable) {
      layoutComposable.pushOverlappingNodes(node)
    }

    try {
      console.log(`[Nodes] Saving size for ${id}: ${clampedWidth}x${clampedHeight}`)
      await invoke('update_node_size', { id, width: clampedWidth, height: clampedHeight })
      console.log(`[Nodes] Size saved successfully for ${id}`)
    } catch (e) {
      console.error('Failed to update size:', e)
    }
  }
}

/**
 * Check if node's file has changed and refresh content if needed
 */
export async function refreshNodeFromFile(
  nodes: Ref<Node[]>,
  id: string
): Promise<boolean> {
  const node = nodes.value.find(n => n.id === id)
  if (!node || !node.file_path) return false

  try {
    const content = await invoke<string>('read_file_content', { path: node.file_path })
    if (content !== node.markdown_content) {
      node.markdown_content = content
      node.updated_at = Date.now()
      const newChecksum = await invoke<string | null>('update_node_content', { id, content })
      if (newChecksum) node.checksum = newChecksum
      return true
    }
  } catch (e) {
    const errorMsg = String(e)
    if (errorMsg.includes('No such file') || errorMsg.includes('not found')) {
      node.file_path = null
      node.checksum = null
      node.updated_at = Date.now()
      try { await invoke('update_node_file_path', { id, filePath: '' }) } catch { /* ignore */ }
    } else {
      storeLogger.error('Failed to read file:', e)
    }
  }
  return false
}

/**
 * Update node content with tag extraction and wikilink sync
 */
export async function updateNodeContent(
  deps: NodeStoreDependencies,
  id: string,
  content: string,
  tagNodesComposable?: { createTagEdges: (nodeId: string, tags: string[]) => Promise<void> },
  createEdgeFn?: (data: CreateEdgeInput) => Promise<Edge>
): Promise<void> {
  const { state, edgesStore, computed } = deps

  // Remove trailing whitespace from each line, then trim the whole content
  const trimmedContent = content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()
  const node = state.nodes.value.find(n => n.id === id)
  if (node) {
    node.markdown_content = trimmedContent
    node.updated_at = Date.now()
    try {
      const newChecksum = await invoke<string | null>('update_node_content', { id, content: trimmedContent })
      // Update checksum if file was written (prevents watcher reload loop)
      if (newChecksum) {
        node.checksum = newChecksum
      }
    } catch (e) {
      console.error('Failed to update content:', e)
    }

    // Extract hashtags and update tags
    const extractedTags = extractHashtags(trimmedContent)
    if (extractedTags.length > 0) {
      // Merge with existing tags (deduplicate)
      let existingTags: string[] = []
      if (node.tags) {
        try {
          const parsed = JSON.parse(node.tags)
          existingTags = Array.isArray(parsed) ? parsed : []
        } catch {
          // Malformed JSON in tags field - reset to empty array
          storeLogger.warn(`Invalid JSON in tags for node ${id}, resetting`)
          existingTags = []
        }
      }
      const mergedTags = Array.from(new Set([...existingTags, ...extractedTags]))
      node.tags = JSON.stringify(mergedTags)
      try {
        await invoke('update_node_tags', { id, tags: mergedTags })
      } catch (e) {
        console.error('Failed to update tags:', e)
      }

      // Create tag nodes if setting is enabled
      if (tagStorage.getShowTagNodes() && tagNodesComposable) {
        try {
          await tagNodesComposable.createTagEdges(id, extractedTags)
        } catch (e) {
          console.error('Failed to create tag edges:', e)
        }
      }
    }

    // Extract wikilinks and sync edges
    const links = extractWikilinks(trimmedContent)

    // Build set of target node IDs from current wikilinks
    const currentTargetIds = new Set<string>()
    for (const linkTitle of links) {
      const targetNode = findNodeByTitle(state.nodes.value, linkTitle)
      if (targetNode && targetNode.id !== id) {
        currentTargetIds.add(targetNode.id)
      }
    }

    // Find existing wikilink edges from this node
    const existingWikilinkEdges = computed.edges.value.filter(e =>
      e.source_node_id === id && e.link_type === 'wikilink'
    )

    // Delete edges that no longer have corresponding wikilinks
    for (const edge of existingWikilinkEdges) {
      if (!currentTargetIds.has(edge.target_node_id)) {
        await edgesStore.deleteEdge(edge.id)
      }
    }

    // Create edges for new wikilinks (or make existing reverse edges non-directional)
    for (const targetId of currentTargetIds) {
      // Check if edge already exists in this direction
      const existsForward = computed.edges.value.some(e =>
        e.source_node_id === id &&
        e.target_node_id === targetId &&
        e.link_type === 'wikilink'
      )
      if (existsForward) continue

      // Check if reverse edge exists (target→source)
      const reverseEdge = computed.edges.value.find(e =>
        e.source_node_id === targetId &&
        e.target_node_id === id &&
        e.link_type === 'wikilink'
      )

      if (reverseEdge) {
        // Reverse edge exists - make it non-directional instead of creating duplicate
        if (reverseEdge.directed !== false) {
          await edgesStore.updateEdgeDirected(reverseEdge.id, false)
        }
      } else if (createEdgeFn) {
        // No edge in either direction - create new one
        await createEdgeFn({
          source_node_id: id,
          target_node_id: targetId,
          link_type: 'wikilink',
        })
      }
    }
  }
}

/**
 * Update node title
 */
export async function updateNodeTitle(
  nodes: Ref<Node[]>,
  id: string,
  title: string
): Promise<void> {
  const trimmedTitle = title.trim()
  const node = nodes.value.find(n => n.id === id)
  if (node) {
    node.title = trimmedTitle
    node.updated_at = Date.now()
    try {
      await invoke('update_node_title', { id, title: trimmedTitle })
    } catch (e) {
      console.error('Failed to update title:', e)
    }
  }
}

/**
 * Update node color
 */
export async function updateNodeColor(
  nodes: Ref<Node[]>,
  id: string,
  color: string | null
): Promise<void> {
  const node = nodes.value.find(n => n.id === id)
  if (node) {
    node.color_theme = color
    node.updated_at = Date.now()
    try {
      await invoke('update_node_color', { id, color })
    } catch (e) {
      console.error('Failed to update color:', e)
    }
  }
}

/**
 * Move nodes to a different workspace
 */
export async function moveNodesToWorkspace(
  nodes: Ref<Node[]>,
  nodeIds: string[],
  workspaceId: string | null
): Promise<void> {
  for (const id of nodeIds) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.workspace_id = workspaceId
      node.updated_at = Date.now()
      try {
        await invoke('update_node_workspace', { id, workspaceId })
      } catch (e) {
        console.error('Failed to move node to workspace:', e)
      }
    }
  }
}

/**
 * Create a new node
 */
export async function createNode(
  deps: NodeStoreDependencies,
  data: CreateNodeInput
): Promise<Node> {
  const { state, computed } = deps

  // Determine workspace_id for the new node
  // "default" maps to null (the default workspace uses null in the database)
  let validWorkspaceId: string | null = data.workspace_id ?? null
  if (data.workspace_id === undefined) {
    // Use current workspace, but convert "default" to null
    if (computed.currentWorkspaceId.value === 'default') {
      validWorkspaceId = null
    } else if (computed.currentWorkspaceId.value && computed.workspaces.value.some(w => w.id === computed.currentWorkspaceId.value)) {
      validWorkspaceId = computed.currentWorkspaceId.value
    } else {
      validWorkspaceId = null
    }
  } else if (data.workspace_id === 'default') {
    validWorkspaceId = null
  }

  const inputWithWorkspace = {
    ...data,
    title: data.title.trim(),
    markdown_content: data.markdown_content?.trim() || null,
    workspace_id: validWorkspaceId,
  }

  try {
    const node = await invoke<Node>('create_node', { input: inputWithWorkspace })
    state.nodes.value.push(node)
    state.nodeLayoutVersion.value++ // Trigger reactivity for displayNodes/visibleNodes
    return node
  } catch (e) {
    console.error('Failed to create node:', e)
    // Fallback for development
    const node: Node = {
      id: generateShortId(),
      title: data.title.trim(),
      file_path: data.file_path || null,
      markdown_content: data.markdown_content?.trim() || null,
      node_type: data.node_type || 'note',
      canvas_x: data.canvas_x,
      canvas_y: data.canvas_y,
      width: data.width || 200,
      height: data.height || 120,
      z_index: 0,
      frame_id: null,
      color_theme: data.color_theme ?? null,
      is_collapsed: false,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      workspace_id: validWorkspaceId,
      checksum: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
    }
    state.nodes.value.push(node)
    state.nodeLayoutVersion.value++ // Trigger reactivity for displayNodes/visibleNodes
    return node
  }
}

/**
 * Delete a single node
 */
export async function deleteNode(
  deps: NodeStoreDependencies,
  id: string
): Promise<void> {
  const { state, edgesStore } = deps
  try {
    await invoke('delete_node', { id })
  } catch (e) {
    console.error('Failed to delete node:', e)
  }
  state.nodes.value = state.nodes.value.filter(n => n.id !== id)
  // Clear selection if deleted node was selected
  state.selectedNodeIds.value = state.selectedNodeIds.value.filter(nid => nid !== id)
  // Remove edges connected to deleted node
  edgesStore.cleanupOrphanEdges(new Set(state.nodes.value.map(n => n.id)))
}

/**
 * Delete multiple nodes
 */
export async function deleteNodes(
  deps: NodeStoreDependencies,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return
  const { state, edgesStore } = deps
  try {
    await invoke('delete_nodes', { ids })
  } catch (e) {
    console.error('Failed to delete nodes:', e)
  }
  const idSet = new Set(ids)
  state.nodes.value = state.nodes.value.filter(n => !idSet.has(n.id))
  // Clear selection for deleted nodes
  state.selectedNodeIds.value = state.selectedNodeIds.value.filter(nid => !idSet.has(nid))
  // Remove edges connected to deleted nodes
  edgesStore.cleanupOrphanEdges(new Set(state.nodes.value.map(n => n.id)))
}

/**
 * Restore a deleted node (for undo)
 */
export async function restoreNode(
  nodes: Ref<Node[]>,
  node: Node
): Promise<void> {
  try {
    await invoke('restore_node', { node })
  } catch (e) {
    console.error('Failed to restore node:', e)
  }
  // Add back to local state if not already present
  if (!nodes.value.find(n => n.id === node.id)) {
    nodes.value.push(node)
  }
}
