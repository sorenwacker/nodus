/**
 * Edges store
 * Manages edge CRUD operations, deduplication, and cleanup
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '../lib/tauri'
import { storeLogger } from '../lib/logger'
import type { Edge, CreateEdgeInput, EntityLinkType } from '../types'
import { ENTITY_LINK_TYPES } from '../types'

export const useEdgesStore = defineStore('edges', () => {
  const edges = ref<Edge[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Node validation callback - set by parent store
  let nodeExistsCallback: ((id: string) => boolean) | null = null

  /**
   * Set the callback for validating node existence
   */
  function setNodeExistsCallback(callback: (id: string) => boolean): void {
    nodeExistsCallback = callback
  }

  /**
   * Initialize edges from database
   * @param workspaceId - Optional workspace ID to filter edges
   */
  async function initialize(workspaceId?: string | null): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const fetchedEdges = await invoke<Edge[]>('get_edges', { workspaceId: workspaceId ?? null })
      storeLogger.debug(`Loaded ${fetchedEdges.length} edges for workspace ${workspaceId}`)
      // Deduplicate edges on load
      edges.value = deduplicateEdgesLocal(fetchedEdges)
    } catch (e) {
      error.value = String(e)
      storeLogger.error('Failed to load edges:', e)
      edges.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Filter edges to only include those where both nodes exist
   */
  function getEdgesForNodes(nodeIds: Set<string>): Edge[] {
    return edges.value.filter(
      (e) => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)
    )
  }

  /**
   * Create a new edge
   * Validates that both source and target nodes exist and prevents self-loops
   */
  async function createEdge(data: CreateEdgeInput): Promise<Edge> {
    // Prevent self-loops
    if (data.source_node_id === data.target_node_id) {
      throw new Error('Cannot create self-referencing edge')
    }

    // Check for existing edge with same source and target
    const existingEdge = edges.value.find(
      e => e.source_node_id === data.source_node_id && e.target_node_id === data.target_node_id
    )
    if (existingEdge) {
      storeLogger.debug(`Edge already exists: ${data.source_node_id} -> ${data.target_node_id}`)
      return existingEdge
    }

    // Validate node existence if callback is set
    if (nodeExistsCallback) {
      if (!nodeExistsCallback(data.source_node_id)) {
        throw new Error(`Source node ${data.source_node_id} does not exist`)
      }
      if (!nodeExistsCallback(data.target_node_id)) {
        throw new Error(`Target node ${data.target_node_id} does not exist`)
      }
    }

    try {
      const edge = await invoke<Edge>('create_edge', { input: data })
      // Create new array to trigger Vue reactivity
      edges.value = [...edges.value, edge]
      storeLogger.debug(`Created edge: ${edge.source_node_id} -> ${edge.target_node_id}`)
      return edge
    } catch (e) {
      storeLogger.error('Failed to create edge:', e)
      // Fallback for development
      const edge: Edge = {
        id: crypto.randomUUID(),
        source_node_id: data.source_node_id,
        target_node_id: data.target_node_id,
        label: data.label || null,
        link_type: data.link_type || 'related',
        weight: 1,
        color: data.color || null,
        storyline_id: data.storyline_id || null,
        created_at: Date.now(),
        directed: data.directed ?? true,
      }
      edges.value = [...edges.value, edge]
      return edge
    }
  }

  /**
   * Update edge directed state (directional vs non-directional)
   */
  async function updateEdgeDirected(id: string, directed: boolean): Promise<void> {
    try {
      await invoke('update_edge_directed', { id, directed })
    } catch (e) {
      storeLogger.error('Failed to update edge directed:', e)
    }
    edges.value = edges.value.map((e) => (e.id === id ? { ...e, directed } : e))
  }

  /**
   * Delete an edge
   */
  async function deleteEdge(id: string): Promise<void> {
    try {
      await invoke('delete_edge', { id })
    } catch (e) {
      storeLogger.error('Failed to delete edge:', e)
    }
    edges.value = edges.value.filter((e) => e.id !== id)
  }

  /**
   * Restore a deleted edge (for undo)
   */
  async function restoreEdge(edge: Edge): Promise<void> {
    try {
      await invoke('restore_edge', { edge })
    } catch (e) {
      storeLogger.error('Failed to restore edge:', e)
    }
    // Add back to local state if not already present
    if (!edges.value.find((e) => e.id === edge.id)) {
      edges.value.push(edge)
    }
  }

  /**
   * Update edge link type
   */
  function updateEdgeLinkType(id: string, linkType: string): void {
    const idx = edges.value.findIndex((e) => e.id === id)
    if (idx !== -1) {
      edges.value = edges.value.map((e) => (e.id === id ? { ...e, link_type: linkType } : e))
    }
  }

  /**
   * Update edge color
   */
  async function updateEdgeColor(id: string, color: string | null): Promise<void> {
    await invoke('update_edge_color', { id, color })
    edges.value = edges.value.map((e) => (e.id === id ? { ...e, color } : e))
  }

  /**
   * Update edge label
   */
  async function updateEdgeLabel(id: string, label: string | null): Promise<void> {
    try {
      await invoke('update_edge_label', { id, label })
    } catch (e) {
      storeLogger.error('Failed to update edge label:', e)
    }
    edges.value = edges.value.map((e) => (e.id === id ? { ...e, label } : e))
  }

  /**
   * Update edge storyline assignment
   */
  async function updateEdgeStoryline(
    id: string,
    storylineId: string | null,
    color?: string | null
  ): Promise<void> {
    await invoke('update_edge_storyline', { id, storylineId, color })
    edges.value = edges.value.map((e) =>
      e.id === id ? { ...e, storyline_id: storylineId, color: color ?? e.color } : e
    )
  }

  /**
   * Remove orphaned edges (edges pointing to non-existent nodes)
   */
  function cleanupOrphanEdges(nodeIds: Set<string>): number {
    const before = edges.value.length
    edges.value = edges.value.filter(
      (e) => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)
    )
    return before - edges.value.length
  }

  /**
   * Local edge deduplication
   * - For directed edges: keep exact duplicates only (same source, target, link_type)
   * - For undirected edges: treat A->B and B->A as same
   */
  function deduplicateEdgesLocal(edgeList: Edge[]): Edge[] {
    const seenKeys = new Set<string>()
    const beforeCount = edgeList.length
    const result = edgeList.filter((e) => {
      // For directed edges, use exact source->target->type key
      // For undirected edges, sort IDs to catch bidirectional duplicates
      let key: string
      if (e.directed !== false) {
        // Directed: exact match including link_type
        key = `${e.source_node_id}:${e.target_node_id}:${e.link_type}`
      } else {
        // Undirected: canonical form (sorted IDs + type)
        const ids = [e.source_node_id, e.target_node_id].sort()
        key = `${ids[0]}:${ids[1]}:${e.link_type}`
      }
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })
    const removed = beforeCount - result.length
    if (removed > 0) {
      storeLogger.info(`Deduplication removed ${removed} edges (${beforeCount} -> ${result.length})`)
    }
    return result
  }

  /**
   * Deduplicate edges both in frontend and backend database
   */
  async function deduplicateEdges(): Promise<number> {
    // Backend deduplication
    let backendRemoved = 0
    try {
      backendRemoved = await invoke<number>('deduplicate_edges')
      storeLogger.info(`Backend deduplication removed ${backendRemoved} edges`)
    } catch (e) {
      storeLogger.error('Backend deduplication failed:', e)
    }

    // Frontend deduplication
    const beforeCount = edges.value.length
    edges.value = deduplicateEdgesLocal(edges.value)
    const frontendRemoved = beforeCount - edges.value.length

    return backendRemoved + frontendRemoved
  }

  /**
   * Clean up orphan edges in the database (edges pointing to non-existent nodes)
   */
  async function cleanupOrphanEdgesDb(): Promise<number> {
    try {
      const removed = await invoke<number>('cleanup_orphan_edges')
      storeLogger.info(`Cleaned up ${removed} orphan edges from database`)
      return removed
    } catch (e) {
      storeLogger.error('Failed to cleanup orphan edges:', e)
      return 0
    }
  }

  /**
   * Debug: get all edges in database (across all workspaces)
   */
  async function debugGetAllEdges(): Promise<Edge[]> {
    try {
      return await invoke<Edge[]>('debug_get_all_edges')
    } catch (e) {
      storeLogger.error('Failed to get all edges:', e)
      return []
    }
  }

  /**
   * Get edge by ID
   */
  function getEdge(id: string): Edge | undefined {
    return edges.value.find((e) => e.id === id)
  }

  /**
   * Find edge between two nodes
   */
  function findEdgeBetween(sourceId: string, targetId: string): Edge | undefined {
    return edges.value.find(
      (e) =>
        (e.source_node_id === sourceId && e.target_node_id === targetId) ||
        (e.source_node_id === targetId && e.target_node_id === sourceId)
    )
  }

  /**
   * Check if edge exists between two nodes
   */
  function edgeExists(sourceId: string, targetId: string): boolean {
    return findEdgeBetween(sourceId, targetId) !== undefined
  }

  /**
   * Get all edges connecting a node to entity nodes
   * @param nodeId - The node to find entity edges for
   * @param direction - 'outgoing' (node -> entity), 'incoming' (entity -> node), or 'both'
   */
  function getEntityEdgesForNode(
    nodeId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Edge[] {
    return edges.value.filter((e) => {
      const isEntityLink = ENTITY_LINK_TYPES.includes(e.link_type as EntityLinkType)
      if (!isEntityLink) return false

      if (direction === 'outgoing') {
        return e.source_node_id === nodeId
      } else if (direction === 'incoming') {
        return e.target_node_id === nodeId
      } else {
        return e.source_node_id === nodeId || e.target_node_id === nodeId
      }
    })
  }

  /**
   * Get edges by link type
   */
  function getEdgesByLinkType(linkType: string): Edge[] {
    return edges.value.filter((e) => e.link_type === linkType)
  }

  return {
    // State
    edges,
    loading,
    error,

    // Methods
    initialize,
    setNodeExistsCallback,
    getEdgesForNodes,
    createEdge,
    deleteEdge,
    restoreEdge,
    updateEdgeLinkType,
    updateEdgeColor,
    updateEdgeLabel,
    updateEdgeStoryline,
    updateEdgeDirected,
    cleanupOrphanEdges,
    deduplicateEdges,
    cleanupOrphanEdgesDb,
    debugGetAllEdges,
    getEdge,
    findEdgeBetween,
    edgeExists,
    getEntityEdgesForNode,
    getEdgesByLinkType,
  }
})

export type { Edge, CreateEdgeInput }
