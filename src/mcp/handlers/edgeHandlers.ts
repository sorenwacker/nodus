/**
 * Edge Handlers
 *
 * Handles edge creation, update, deletion, and related operations.
 */

import type { Edge } from '../../types'
import type { McpEdge } from '../types'
import { JsonRpcErrorCodes } from '../types'
import type { McpStoreInterface } from '../messageHandler'
import { edgeToMcp, McpError } from './nodeHandlers'

export function handleGetEdges(
  store: McpStoreInterface,
  params: { node_id?: string; limit?: number; offset?: number }
): McpEdge[] {
  const limit = params.limit ?? 100
  const offset = params.offset ?? 0

  let edges = store.getFilteredEdges()

  // Filter by node if specified
  if (params.node_id) {
    edges = edges.filter(
      (e) => e.source_node_id === params.node_id || e.target_node_id === params.node_id
    )
  }

  return edges.slice(offset, offset + limit).map(edgeToMcp)
}

export async function handleCreateEdge(
  store: McpStoreInterface,
  params: {
    source_node_id: string
    target_node_id: string
    label?: string
    link_type?: string
    directed?: boolean
  }
): Promise<{ id: string }> {
  // Validate nodes exist
  if (!store.getNode(params.source_node_id)) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Source node not found: ${params.source_node_id}`
    )
  }
  if (!store.getNode(params.target_node_id)) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Target node not found: ${params.target_node_id}`
    )
  }

  const edge = await store.createEdge({
    source_node_id: params.source_node_id,
    target_node_id: params.target_node_id,
    label: params.label,
    link_type: params.link_type || 'related',
    directed: params.directed ?? true,
  })

  return { id: edge.id }
}

export async function handleUpdateEdge(
  store: McpStoreInterface,
  params: {
    id: string
    label?: string
    directed?: boolean
  }
): Promise<{ success: boolean }> {
  const edge = store.getFilteredEdges().find((e) => e.id === params.id)
  if (!edge) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Edge not found: ${params.id}`
    )
  }

  if (params.directed !== undefined) {
    await store.updateEdgeDirected(params.id, params.directed)
  }

  return { success: true }
}

export async function handleDeleteEdge(
  store: McpStoreInterface,
  params: { id: string }
): Promise<{ success: boolean }> {
  const edge = store.getFilteredEdges().find((e) => e.id === params.id)
  if (!edge) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Edge not found: ${params.id}`
    )
  }

  await store.deleteEdge(params.id)
  return { success: true }
}

export async function handleBatchCreateEdges(
  store: McpStoreInterface,
  params: { edges: Array<{ source_node_id: string; target_node_id: string; label?: string; link_type?: string }> }
): Promise<{ success: boolean; count: number; ids: string[] }> {
  const ids: string[] = []
  for (const edgeData of params.edges) {
    // Validate nodes exist
    if (!store.getNode(edgeData.source_node_id) || !store.getNode(edgeData.target_node_id)) {
      continue
    }
    const edge = await store.createEdge({
      source_node_id: edgeData.source_node_id,
      target_node_id: edgeData.target_node_id,
      label: edgeData.label,
      link_type: edgeData.link_type || 'related',
      directed: true,
    })
    ids.push(edge.id)
  }
  return { success: true, count: ids.length, ids }
}

export async function handleBatchDeleteEdges(
  store: McpStoreInterface,
  params: { edge_ids: string[] }
): Promise<{ success: boolean; count: number }> {
  let count = 0
  for (const id of params.edge_ids) {
    const edge = store.getFilteredEdges().find((e) => e.id === id)
    if (edge) {
      await store.deleteEdge(id)
      count++
    }
  }
  return { success: true, count }
}

export async function handleDeleteEdgesForNode(
  store: McpStoreInterface,
  params: { node_id: string; direction?: 'incoming' | 'outgoing' | 'both' }
): Promise<{ success: boolean; count: number }> {
  const direction = params.direction || 'both'
  const edges = store.getFilteredEdges().filter((e) => {
    if (direction === 'outgoing') return e.source_node_id === params.node_id
    if (direction === 'incoming') return e.target_node_id === params.node_id
    return e.source_node_id === params.node_id || e.target_node_id === params.node_id
  })

  for (const edge of edges) {
    await store.deleteEdge(edge.id)
  }

  return { success: true, count: edges.length }
}

export function handleGetDuplicateEdges(store: McpStoreInterface): {
  duplicates_found: number
  duplicate_groups: Array<{
    source_node_id: string
    target_node_id: string
    edge_ids: string[]
    count: number
  }>
} {
  const edges = store.getFilteredEdges()

  // Group edges by source+target pair
  const edgeGroups = new Map<string, Edge[]>()
  for (const edge of edges) {
    // Create a normalized key (sorted to treat A->B and B->A as same for undirected)
    const key = `${edge.source_node_id}|${edge.target_node_id}`
    const existing = edgeGroups.get(key) || []
    existing.push(edge)
    edgeGroups.set(key, existing)
  }

  // Find groups with more than one edge
  const duplicateGroups: Array<{
    source_node_id: string
    target_node_id: string
    edge_ids: string[]
    count: number
  }> = []

  for (const [, group] of edgeGroups) {
    if (group.length > 1) {
      duplicateGroups.push({
        source_node_id: group[0].source_node_id,
        target_node_id: group[0].target_node_id,
        edge_ids: group.map((e) => e.id),
        count: group.length,
      })
    }
  }

  return {
    duplicates_found: duplicateGroups.reduce((sum, g) => sum + g.count - 1, 0),
    duplicate_groups: duplicateGroups,
  }
}

export async function handleCleanupDuplicateEdges(store: McpStoreInterface): Promise<{
  success: boolean
  duplicates_found: number
  duplicates_removed: number
  edges_kept: string[]
}> {
  const edges = store.getFilteredEdges()

  // Group edges by source+target pair
  const edgeGroups = new Map<string, Edge[]>()
  for (const edge of edges) {
    const key = `${edge.source_node_id}|${edge.target_node_id}`
    const existing = edgeGroups.get(key) || []
    existing.push(edge)
    edgeGroups.set(key, existing)
  }

  const edgesKept: string[] = []
  let duplicatesRemoved = 0
  let duplicatesFound = 0

  for (const [, group] of edgeGroups) {
    if (group.length > 1) {
      duplicatesFound += group.length - 1
      // Keep the first edge (oldest), delete the rest
      edgesKept.push(group[0].id)
      for (let i = 1; i < group.length; i++) {
        await store.deleteEdge(group[i].id)
        duplicatesRemoved++
      }
    }
  }

  return {
    success: true,
    duplicates_found: duplicatesFound,
    duplicates_removed: duplicatesRemoved,
    edges_kept: edgesKept,
  }
}

export async function handleArrangeRadial(
  store: McpStoreInterface,
  params: { center_node_id: string; node_ids?: string[]; radius?: number }
): Promise<{ success: boolean; count: number }> {
  const centerNode = store.getNode(params.center_node_id)
  if (!centerNode) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Center node not found: ${params.center_node_id}`
    )
  }

  const radius = params.radius || 300
  let nodeIds = params.node_ids

  // If no node_ids provided, use connected nodes
  if (!nodeIds || nodeIds.length === 0) {
    const edges = store.getFilteredEdges().filter(
      (e) => e.source_node_id === params.center_node_id || e.target_node_id === params.center_node_id
    )
    nodeIds = [...new Set(edges.map((e) =>
      e.source_node_id === params.center_node_id ? e.target_node_id : e.source_node_id
    ))]
  }

  const angleStep = (2 * Math.PI) / nodeIds.length
  let count = 0

  for (let i = 0; i < nodeIds.length; i++) {
    const node = store.getNode(nodeIds[i])
    if (node) {
      const angle = i * angleStep - Math.PI / 2 // Start from top
      const x = centerNode.canvas_x + radius * Math.cos(angle)
      const y = centerNode.canvas_y + radius * Math.sin(angle)
      await store.updateNodePosition(nodeIds[i], x, y)
      count++
    }
  }

  return { success: true, count }
}
