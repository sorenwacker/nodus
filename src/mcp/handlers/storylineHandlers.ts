/**
 * Storyline Handlers
 *
 * Handles storyline creation, update, deletion, and node ordering operations.
 */

import type { Storyline } from '../../types'
import type { McpStoryline } from '../types'
import { JsonRpcErrorCodes } from '../types'
import type { McpStoreInterface } from '../messageHandler'
import { normalizeColor, McpError } from './nodeHandlers'

/**
 * Convert internal Storyline to MCP format
 */
export function storylineToMcp(storyline: Storyline): McpStoryline {
  return {
    id: storyline.id,
    title: storyline.title,
    description: storyline.description,
    color: storyline.color,
  }
}

export function handleListStorylines(store: McpStoreInterface): McpStoryline[] {
  return store.getFilteredStorylines().map(storylineToMcp)
}

export function handleGetStoryline(store: McpStoreInterface, params: { id: string }): McpStoryline {
  const storyline = store.getStoryline(params.id)
  if (!storyline) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Storyline not found: ${params.id}`
    )
  }
  return storylineToMcp(storyline)
}

export async function handleGetStorylineNodes(
  store: McpStoreInterface,
  params: { storyline_id: string }
): Promise<Array<{ id: string; title: string; position: number }>> {
  const storyline = store.getStoryline(params.storyline_id)
  if (!storyline) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Storyline not found: ${params.storyline_id}`
    )
  }

  const nodes = await store.getStorylineNodes(params.storyline_id)
  return nodes.map((node, index) => ({
    id: node.id,
    title: node.title,
    position: index,
  }))
}

export async function handleCreateStoryline(
  store: McpStoreInterface,
  params: { title: string; description?: string; color?: string }
): Promise<{ id: string }> {
  const color = normalizeColor(params.color || null)
  const storyline = await store.createStoryline(params.title, params.description, color || undefined)
  return { id: storyline.id }
}

export async function handleUpdateStoryline(
  store: McpStoreInterface,
  params: { id: string; title?: string; description?: string; color?: string }
): Promise<{ success: boolean }> {
  const storyline = store.getStoryline(params.id)
  if (!storyline) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Storyline not found: ${params.id}`
    )
  }

  const color = params.color !== undefined ? normalizeColor(params.color) : storyline.color
  await store.updateStoryline(
    params.id,
    params.title ?? storyline.title,
    params.description ?? storyline.description ?? undefined,
    color ?? undefined
  )
  return { success: true }
}

export async function handleDeleteStoryline(
  store: McpStoreInterface,
  params: { id: string }
): Promise<{ success: boolean }> {
  const storyline = store.getStoryline(params.id)
  if (!storyline) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Storyline not found: ${params.id}`
    )
  }

  await store.deleteStoryline(params.id)
  return { success: true }
}

export async function handleAddNodeToStoryline(
  store: McpStoreInterface,
  params: { storyline_id: string; node_id: string; position?: number }
): Promise<{ success: boolean }> {
  const storyline = store.getStoryline(params.storyline_id)
  if (!storyline) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Storyline not found: ${params.storyline_id}`
    )
  }

  const node = store.getNode(params.node_id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.node_id}`
    )
  }

  await store.addNodeToStoryline(params.storyline_id, params.node_id, params.position)
  return { success: true }
}

export async function handleRemoveNodeFromStoryline(
  store: McpStoreInterface,
  params: { storyline_id: string; node_id: string }
): Promise<{ success: boolean }> {
  const storyline = store.getStoryline(params.storyline_id)
  if (!storyline) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Storyline not found: ${params.storyline_id}`
    )
  }

  await store.removeNodeFromStoryline(params.storyline_id, params.node_id)
  return { success: true }
}

export async function handleReorderStorylineNodes(
  store: McpStoreInterface,
  params: { storyline_id: string; node_ids: string[] }
): Promise<{ success: boolean }> {
  const storyline = store.getStoryline(params.storyline_id)
  if (!storyline) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Storyline not found: ${params.storyline_id}`
    )
  }

  await store.reorderStorylineNodes(params.storyline_id, params.node_ids)
  return { success: true }
}
