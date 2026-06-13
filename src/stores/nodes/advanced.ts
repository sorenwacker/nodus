/**
 * Advanced operations: Layout, storylines, tags, entities
 */

import { invoke } from '../../lib/tauri'
import { storeLogger } from '../../lib/logger'
import { getWorkspace } from '../../lib/tauri'
import { canvasStorage } from '../../lib/storage'
import { getStarterTemplates, getStarterTitles, getStarterNodeConfigs, getStarterEdgeConfigs, getEdgeLabel } from '../../lib/templates'
import type {
  Node,
  CreateNodeInput,
  CreateEdgeInput,
  EntityNodeType,
  NodeStoreDependencies,
  FileSyncInterface,
} from './types'

// ============================================================================
// Workspace Operations
// ============================================================================

/**
 * Create a workspace - forwarded to workspace store
 */
export function createWorkspace(
  workspaceStore: NodeStoreDependencies['workspaceStore'],
  name: string
): Promise<import('../../types').Workspace> {
  return workspaceStore.createWorkspace(name)
}

/**
 * Switch workspace with file watcher management
 */
export async function switchWorkspace(
  deps: NodeStoreDependencies,
  fileSync: FileSyncInterface,
  workspaceId: string | null
): Promise<void> {
  const { edgesStore, framesStore, workspaceStore } = deps

  // Stop any existing file watcher
  await fileSync.stopWatching()

  workspaceStore.switchWorkspace(workspaceId)
  // Reload edges and frames for the new workspace
  await Promise.all([
    edgesStore.initialize(workspaceId),
    framesStore.initialize(),
  ])

  // Start file watcher if workspace has sync enabled and vault path
  if (workspaceId) {
    try {
      const workspace = await getWorkspace(workspaceId)
      if (workspace?.sync_enabled && workspace?.vault_path) {
        await fileSync.watchVault(workspace.vault_path)
        storeLogger.info(`Started watching vault: ${workspace.vault_path}`)
      }
    } catch (e) {
      storeLogger.error('Failed to start file watcher:', e)
    }
  }
}

/**
 * Delete workspace - forwarded to workspace store
 */
export function deleteWorkspace(
  workspaceStore: NodeStoreDependencies['workspaceStore'],
  id: string,
  deleteFiles?: boolean
): Promise<void> {
  return workspaceStore.deleteWorkspace(id, deleteFiles)
}

/**
 * Recover workspace - forwarded to workspace store
 */
export function recoverWorkspace(
  workspaceStore: NodeStoreDependencies['workspaceStore'],
  id: string
): Promise<void> {
  return workspaceStore.recoverWorkspace(id)
}

/**
 * Get orphaned workspace IDs
 */
export function getOrphanedWorkspaceIds(
  workspaceStore: NodeStoreDependencies['workspaceStore'],
  nodes: Node[]
): string[] {
  return workspaceStore.getOrphanedWorkspaceIds(nodes)
}

/**
 * Rename workspace - forwarded to workspace store
 */
export function renameWorkspace(
  workspaceStore: NodeStoreDependencies['workspaceStore'],
  id: string,
  newName: string
): Promise<void> {
  return workspaceStore.renameWorkspace(id, newName)
}

// ============================================================================
// Canvas Operations
// ============================================================================

/**
 * Clear all canvas content
 */
export function clearCanvas(deps: NodeStoreDependencies): void {
  const { state, edgesStore } = deps
  state.nodes.value = []
  edgesStore.edges.splice(0, edgesStore.edges.length)
  state.selectedNodeIds.value = []
}

/**
 * Reset the default workspace to initial state with starter nodes
 */
export async function resetDefaultWorkspace(
  deps: NodeStoreDependencies,
  createNodeFn: (data: CreateNodeInput) => Promise<Node>,
  createEdgeFn: (data: CreateEdgeInput) => Promise<import('../../types').Edge>
): Promise<void> {
  const { state } = deps
  storeLogger.info('Resetting default workspace to initial state')

  // Delete all nodes in the default workspace (workspace_id = null)
  const defaultNodes = state.nodes.value.filter(n => n.workspace_id === null)
  for (const node of defaultNodes) {
    try {
      await invoke('delete_node', { id: node.id })
    } catch (e) {
      storeLogger.error(`Failed to delete node ${node.id}:`, e)
    }
  }

  // Clear local state for default workspace
  state.nodes.value = state.nodes.value.filter(n => n.workspace_id !== null)
  state.selectedNodeIds.value = []

  // Get localized content and node configurations
  const locale = localStorage.getItem('nodus-locale') || 'en'
  const templates = getStarterTemplates(locale)
  const titles = getStarterTitles(locale)
  const nodeConfigs = getStarterNodeConfigs()
  const edgeConfigs = getStarterEdgeConfigs()

  // Create starter nodes from configurations
  const createdNodes = new Map<string, Node>()
  for (const config of nodeConfigs) {
    const node = await createNodeFn({
      title: titles[config.key],
      markdown_content: templates[config.key],
      canvas_x: config.canvas_x,
      canvas_y: config.canvas_y,
      width: config.width,
      height: config.height,
      color_theme: config.color_theme,
    })
    createdNodes.set(config.key, node)
  }

  // Create demo edges from configurations
  for (const config of edgeConfigs) {
    const source = createdNodes.get(config.sourceKey)
    const target = createdNodes.get(config.targetKey)
    if (source && target) {
      await createEdgeFn({
        source_node_id: source.id,
        target_node_id: target.id,
        link_type: config.linkType,
        label: getEdgeLabel(config.labelKey, locale),
        directed: config.directed,
      })
    }
  }

  // Set hyperbolic edge style for starter content
  canvasStorage.setEdgeStyle('hyperbolic')

  storeLogger.info('Default workspace reset complete')
}

// ============================================================================
// Storyline Operations (forwarded to storylines store)
// ============================================================================

export function loadStorylines(
  storylinesStore: NodeStoreDependencies['storylinesStore']
): Promise<void> {
  return storylinesStore.loadStorylines()
}

export function createStoryline(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  title: string,
  description?: string,
  color?: string
): Promise<import('../../types').Storyline> {
  return storylinesStore.createStoryline(title, description, color)
}

export function updateStoryline(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  id: string,
  title: string,
  description?: string,
  color?: string
): Promise<void> {
  return storylinesStore.updateStoryline(id, title, description, color)
}

export function deleteStoryline(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  id: string
): Promise<void> {
  return storylinesStore.deleteStoryline(id)
}

export function addNodeToStoryline(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  storylineId: string,
  nodeId: string,
  position?: number
): Promise<void> {
  return storylinesStore.addNodeToStoryline(storylineId, nodeId, position)
}

export function removeNodeFromStoryline(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  storylineId: string,
  nodeId: string
): Promise<void> {
  return storylinesStore.removeNodeFromStoryline(storylineId, nodeId)
}

export function reorderStorylineNodes(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  storylineId: string,
  nodeIds: string[]
): Promise<void> {
  return storylinesStore.reorderStorylineNodes(storylineId, nodeIds)
}

export function getStorylineNodes(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  storylineId: string
): import('../../types').StorylineNode[] {
  return storylinesStore.getStorylineNodes(storylineId)
}

export function getStorylinesForNode(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  nodeId: string
): import('../../types').Storyline[] {
  return storylinesStore.getStorylinesForNode(nodeId)
}

export function repairStorylineEdges(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  storylineId: string
): Promise<void> {
  return storylinesStore.repairStorylineEdges(storylineId)
}

export function updateStorylineEdgeColors(
  storylinesStore: NodeStoreDependencies['storylinesStore'],
  storylineId: string,
  color: string | null
): Promise<void> {
  return storylinesStore.updateStorylineEdgeColors(storylineId, color)
}

// ============================================================================
// Tag Operations
// ============================================================================

/**
 * Sync all existing hashtags to tag nodes
 */
export async function syncAllTagNodes(
  nodes: Node[],
  tagNodesComposable: { createTagEdges: (nodeId: string, tags: string[]) => Promise<void> }
): Promise<void> {
  for (const node of nodes) {
    if (node.node_type === 'tag') continue // Skip tag nodes themselves
    if (!node.tags) continue
    try {
      const tags = JSON.parse(node.tags)
      if (Array.isArray(tags) && tags.length > 0) {
        await tagNodesComposable.createTagEdges(node.id, tags)
      }
    } catch {
      // Invalid JSON in tags
    }
  }
}

/**
 * Remove all tag nodes
 */
export async function removeAllTagNodes(
  deps: NodeStoreDependencies,
  deleteNodeFn: (id: string) => Promise<void>
): Promise<void> {
  const tagNodes = deps.state.nodes.value.filter(n => n.node_type === 'tag')
  for (const tagNode of tagNodes) {
    await deleteNodeFn(tagNode.id)
  }
}

// ============================================================================
// Entity Operations (forwarded to entity operations composable)
// ============================================================================

export interface EntityOperationsComposable {
  getEntities: () => Node[]
  getEntitiesByType: (entityType: EntityNodeType) => Node[]
  getLinkedEntities: (nodeId: string) => Node[]
  getNodesReferencingEntity: (entityId: string) => Node[]
  createEntityNode: (
    entityType: EntityNodeType,
    title: string,
    options?: { canvas_x?: number; canvas_y?: number; markdown_content?: string; color_theme?: string | null }
  ) => Promise<Node>
  linkToEntity: (sourceNodeId: string, entityNodeId: string, linkType?: string) => Promise<import('../../types').Edge>
}

export function getEntities(entityOps: EntityOperationsComposable): Node[] {
  return entityOps.getEntities()
}

export function getEntitiesByType(
  entityOps: EntityOperationsComposable,
  entityType: EntityNodeType
): Node[] {
  return entityOps.getEntitiesByType(entityType)
}

export function getLinkedEntities(
  entityOps: EntityOperationsComposable,
  nodeId: string
): Node[] {
  return entityOps.getLinkedEntities(nodeId)
}

export function getNodesReferencingEntity(
  entityOps: EntityOperationsComposable,
  entityId: string
): Node[] {
  return entityOps.getNodesReferencingEntity(entityId)
}

export function createEntityNode(
  entityOps: EntityOperationsComposable,
  entityType: EntityNodeType,
  title: string,
  options?: { canvas_x?: number; canvas_y?: number; markdown_content?: string; color_theme?: string | null }
): Promise<Node> {
  return entityOps.createEntityNode(entityType, title, options)
}

export function linkToEntity(
  entityOps: EntityOperationsComposable,
  sourceNodeId: string,
  entityNodeId: string,
  linkType?: string
): Promise<import('../../types').Edge> {
  return entityOps.linkToEntity(sourceNodeId, entityNodeId, linkType)
}
