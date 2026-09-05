/**
 * Node CRUD operations for the nodes store
 */

import type { Ref } from 'vue'
import { syncWikilinks } from './wikilinkSync'
import { invoke } from '../../lib/tauri'
import { storeLogger } from '../../lib/logger'
import { recordContentBefore } from './undoRecorder'
import { generateShortId } from '../../lib/ids'
import { planTagChange } from '../../lib/tagSync'

/**
 * Removes the edges of tags a node has withdrawn, and any tag node left with
 * nothing pointing at it.
 */
export type TagCleanup = (nodeId: string, removedTags: string[]) => Promise<void>
import { extractWikilinks } from '../../lib/contentParser'
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
    // Measurement paths call this with the size the node already has. Writing
    // it anyway bumped nodeLayoutVersion, and that version is the signal every
    // edge-routing cache keys on - so a no-op "resize" re-routed ~1,000 edges
    // and re-saved the node for a change of nothing.
    if (
      Math.abs((node.width ?? 0) - clampedWidth) < 0.5 &&
      Math.abs((node.height ?? 0) - clampedHeight) < 0.5
    ) {
      return
    }
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
  createEdgeFn?: (data: CreateEdgeInput) => Promise<Edge>,
  options?: {
    /** Set only by undo and redo, which must not record their own replay */
    skipUndo?: boolean
  },
  tagCleanup?: TagCleanup
): Promise<void> {
  const { state, edgesStore } = deps

  // Remove trailing whitespace from each line, then trim the whole content
  const trimmedContent = content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()
  const node = state.nodes.value.find(n => n.id === id)
  if (node) {
    // Recorded here, not by the caller. Every write reaches this function, so a
    // writer cannot forget (PRODUCT_DESIGN.md > Recording an undo step)
    if (!options?.skipUndo && node.markdown_content !== trimmedContent) {
      recordContentBefore({
        nodeId: node.id,
        content: node.markdown_content,
        title: node.title,
      })
    }

    // Read before the write below overwrites it: the tags a body withdraws can
    // only be known by comparing it with the body it replaces
    const previousContent = node.markdown_content

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

    await extractAndPersistHashtags(node, trimmedContent, tagNodesComposable, previousContent, tagCleanup)

    // Sync wikilink edges through the backend engine, whose resolver also
    // handles folder/note path links and #section anchors. A backend that
    // fails leaves the edges alone; only the absence of a backend falls back
    // to the title-only resolver (PRODUCT_DESIGN.md > Syncing wikilink edges)
    await syncWikilinks(id, trimmedContent, {
      reloadEdges: () => edgesStore.loadEdges(deps.workspaceStore.currentWorkspaceId),
      localFallback: () => syncWikilinkEdgesLocal(deps, id, trimmedContent, createEdgeFn),
    })
  }
}

/**
 * Extract hashtags from content, merge them into the node's tags, persist the
 * result, and create tag nodes when the setting is enabled. Shared by content
 * updates and node creation so both paths produce the same tags.
 */
async function extractAndPersistHashtags(
  node: Node,
  content: string,
  tagNodesComposable?: { createTagEdges: (nodeId: string, tags: string[]) => Promise<void> },
  previousContent?: string | null,
  tagCleanup?: TagCleanup
): Promise<void> {
  let existingTags: string[] = []
  if (node.tags) {
    try {
      const parsed = JSON.parse(node.tags)
      existingTags = Array.isArray(parsed) ? parsed : []
    } catch {
      // Malformed JSON in tags field - reset to empty array
      storeLogger.warn(`Invalid JSON in tags for node ${node.id}, resetting`)
      existingTags = []
    }
  }

  // What the body gives it takes away: a tag the previous body carried and the
  // new one does not is withdrawn, while a tag added from a card's chips was
  // never in the body and survives (docs/content/features.md > Tags).
  const change = planTagChange(previousContent, content, existingTags)
  const unchanged =
    change.added.length === 0 &&
    change.removed.length === 0 &&
    change.tags.length === existingTags.length
  if (unchanged) return

  node.tags = JSON.stringify(change.tags)
  try {
    await invoke('update_node_tags', { id: node.id, tags: change.tags })
  } catch (e) {
    console.error('Failed to update tags:', e)
  }

  // A #tag in the text always gets its tag node and edge. Whether those are
  // drawn is a view question, answered by the tag filter, and a view control
  // must not decide whether data exists (docs/content/features.md > Tags).
  if (tagNodesComposable && change.added.length > 0) {
    try {
      await tagNodesComposable.createTagEdges(node.id, change.added)
    } catch (e) {
      console.error('Failed to create tag edges:', e)
    }
  }

  if (tagCleanup && change.removed.length > 0) {
    try {
      await tagCleanup(node.id, change.removed)
    } catch (e) {
      console.error('Failed to remove tag edges:', e)
    }
  }
}

/**
 * Local wikilink edge diff used when no backend is available.
 * Resolves links by exact title only.
 */
async function syncWikilinkEdgesLocal(
  deps: NodeStoreDependencies,
  id: string,
  content: string,
  createEdgeFn?: (data: CreateEdgeInput) => Promise<Edge>
): Promise<void> {
  const { state, edgesStore, computed } = deps
  const links = extractWikilinks(content)

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

/**
 * Replace a node's tags (used by the tag editors and MCP)
 */
export async function updateNodeTags(
  nodes: Ref<Node[]>,
  id: string,
  tags: string[]
): Promise<void> {
  const node = nodes.value.find(n => n.id === id)
  if (!node) return
  node.tags = JSON.stringify(tags)
  node.updated_at = Date.now()
  try {
    await invoke('update_node_tags', { id, tags })
  } catch (e) {
    console.error('Failed to update tags:', e)
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
  data: CreateNodeInput,
  tagNodesComposable?: { createTagEdges: (nodeId: string, tags: string[]) => Promise<void> }
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
    // Initial content must produce the same side effects as a content edit
    if (node.markdown_content) {
      await extractAndPersistHashtags(node, node.markdown_content, tagNodesComposable)
    }
    // The backend creates wikilink edges from initial content; pull them in
    // so they render without waiting for a content edit
    if (inputWithWorkspace.markdown_content && extractWikilinks(inputWithWorkspace.markdown_content).size > 0) {
      try {
        await deps.edgesStore.loadEdges(deps.workspaceStore.currentWorkspaceId)
      } catch (e) {
        storeLogger.error('Failed to load wikilink edges for new node:', e)
      }
    }
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

  // Remove from the view only what the backend deleted. Clearing the view on a
  // failure hid nodes that are still in the database, and they returned on the
  // next load (PRODUCT_DESIGN.md > Deleting nodes with files)
  let deleted: string[]
  try {
    deleted = (await invoke<string[]>('delete_nodes', { ids })) ?? []
  } catch (e) {
    storeLogger.error(`Failed to delete nodes: ${e}`)
    throw e
  }

  const idSet = new Set(deleted)
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
