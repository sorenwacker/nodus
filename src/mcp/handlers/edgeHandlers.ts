/**
 * Edge Handlers
 *
 * Handles edge creation, update, deletion, and related operations.
 */

import type { Edge } from '../../types'
import { normalizeColor } from './nodeHandlers'
import type { McpEdge } from '../types'
import { JsonRpcErrorCodes } from '../types'
import type { McpStoreInterface } from '../messageHandler'
import { edgeToMcp, McpError } from './nodeHandlers'

/** An edge with no label, or a blank one */
function isUnlabelled(edge: Edge): boolean {
  return !edge.label || edge.label.trim() === ''
}

/**
 * Edges, filtered by node, by exact label, or to unlabelled ones, with the
 * endpoint titles on request (PRODUCT_DESIGN.md > Reading edges by label).
 */
export function handleGetEdges(
  store: McpStoreInterface,
  params: {
    node_id?: string
    label?: string
    unlabelled_only?: boolean
    include_titles?: boolean
    limit?: number
    offset?: number
  }
): McpEdge[] {
  const limit = params.limit ?? 100
  const offset = params.offset ?? 0

  let edges = store.getFilteredEdges()

  if (params.node_id) {
    edges = edges.filter(
      (e) => e.source_node_id === params.node_id || e.target_node_id === params.node_id
    )
  }

  if (params.label !== undefined) {
    const wanted = params.label.trim()
    edges = edges.filter((e) => (e.label ?? '').trim() === wanted)
  }

  if (params.unlabelled_only) {
    edges = edges.filter(isUnlabelled)
  }

  const page = edges.slice(offset, offset + limit).map(edgeToMcp)
  if (!params.include_titles) return page

  return page.map((edge) => ({
    ...edge,
    source_title: store.getNode(edge.source_node_id)?.title,
    target_title: store.getNode(edge.target_node_id)?.title,
  }))
}

/**
 * The labels in use and how many edges carry each, most frequent first, with
 * the number of unlabelled edges. Labels are told apart exactly, so a
 * differently cased duplicate shows as its own entry
 * (PRODUCT_DESIGN.md > Reading edges by label).
 */
export function handleGetEdgeLabels(
  store: McpStoreInterface
): { labels: Array<{ label: string; count: number }>; unlabelled: number } {
  const counts = new Map<string, number>()
  let unlabelled = 0
  for (const edge of store.getFilteredEdges()) {
    if (isUnlabelled(edge)) {
      unlabelled++
      continue
    }
    const label = edge.label!.trim()
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const labels = [...counts].map(([label, count]) => ({ label, count }))
  // Stable, so labels with equal counts keep their order of first appearance
  labels.sort((a, b) => b.count - a.count)
  return { labels, unlabelled }
}

/**
 * The id of an edge end given by id or by title.
 *
 * A title names a node only when it names exactly one; several sharing it are
 * listed so the client can choose
 * (PRODUCT_DESIGN.md > Creating an edge by node titles).
 */
function resolveEndpoint(
  store: McpStoreInterface,
  role: 'source' | 'target',
  id: string | undefined,
  title: string | undefined
): string {
  if (id !== undefined) {
    if (!store.getNode(id)) {
      throw new McpError(JsonRpcErrorCodes.INVALID_PARAMS, `${role === 'source' ? 'Source' : 'Target'} node not found: ${id}`)
    }
    return id
  }

  if (title === undefined || !title.trim()) {
    throw new McpError(JsonRpcErrorCodes.INVALID_PARAMS, `${role}_node_id or ${role}_title required`)
  }

  const wanted = title.trim().toLowerCase()
  const matches = store.getFilteredNodes().filter((n) => n.title.trim().toLowerCase() === wanted)
  if (matches.length === 0) {
    throw new McpError(JsonRpcErrorCodes.INVALID_PARAMS, `No node titled "${title.trim()}" for ${role}_title`)
  }
  if (matches.length > 1) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `${role}_title "${title.trim()}" names ${matches.length} nodes (${matches.map((n) => n.id).join(', ')}); use ${role}_node_id`
    )
  }
  return matches[0].id
}

export async function handleCreateEdge(
  store: McpStoreInterface,
  params: {
    source_node_id?: string
    target_node_id?: string
    source_title?: string
    target_title?: string
    label?: string
    link_type?: string
    directed?: boolean
    color?: string
  }
): Promise<{ id: string }> {
  const sourceId = resolveEndpoint(store, 'source', params.source_node_id, params.source_title)
  const targetId = resolveEndpoint(store, 'target', params.target_node_id, params.target_title)

  const edge = await store.createEdge({
    source_node_id: sourceId,
    target_node_id: targetId,
    label: params.label,
    link_type: params.link_type || 'related',
    directed: params.directed ?? true,
    // Colour names are accepted here as they are for nodes
    color: normalizeColor(params.color ?? null) ?? undefined,
  })

  return { id: edge.id }
}

export async function handleUpdateEdge(
  store: McpStoreInterface,
  params: {
    id: string
    label?: string
    directed?: boolean
    color?: string
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

  // label and color were advertised by the schema but never applied: the call
  // reported success while changing nothing
  if (params.label !== undefined) {
    await store.updateEdgeLabel(params.id, params.label || null)
  }

  if (params.color !== undefined) {
    await store.updateEdgeColor(params.id, normalizeColor(params.color || null))
  }

  return { success: true }
}

/**
 * Update the label, direction, or color of many edges in one request.
 *
 * Every item is attempted, and each failure is reported with its edge id, as
 * batch_update_nodes does; edges could be created and deleted in batches but
 * only updated one at a time (PRODUCT_DESIGN.md > Updating edges in batches).
 */
export async function handleBatchUpdateEdges(
  store: McpStoreInterface,
  params: { updates: Array<{ id: string; label?: string; directed?: boolean; color?: string }> }
): Promise<{ success: boolean; updated: number; failed: number; errors?: Array<{ id: string; error: string }> }> {
  let updated = 0
  const errors: Array<{ id: string; error: string }> = []

  for (const update of params.updates) {
    try {
      await handleUpdateEdge(store, update)
      updated++
    } catch (e) {
      errors.push({ id: update.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const result: { success: boolean; updated: number; failed: number; errors?: Array<{ id: string; error: string }> } = {
    success: errors.length === 0,
    updated,
    failed: errors.length,
  }
  if (errors.length > 0) result.errors = errors
  return result
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
