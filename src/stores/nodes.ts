/**
 * Nodes store - orchestrator that combines all node store modules
 *
 * This file maintains the original useNodesStore API while delegating
 * to submodules in src/stores/nodes/ for implementation.
 */

import { defineStore } from 'pinia'
import { invoke } from '../lib/tauri'
import { extractHashtags } from '../lib/contentParser'
import { useFileSync } from '../composables/useFileSync'
import { useImport } from '../composables/useImport'
import { useTagNodes } from '../composables/useTagNodes'
import { useNodeEditLocking } from '../composables/useNodeEditLocking'
import { useNodeLayout } from '../composables/useNodeLayout'
import { useEntityOperations } from '../composables/useEntityOperations'
import { storeLogger } from '../lib/logger'

// Import from submodules
import {
  createState,
  createStoreInstances,
  createComputedProperties,
  createDependencies,
  initializeStore,
  getNode as getNodeFn,
  getNeighborIds as getNeighborIdsFn,
  findNodeByTitle as findNodeByTitleFn,
  selectNode as selectNodeFn,
} from './nodes/state'

import {
  updateNodePosition as updateNodePositionFn,
  triggerLayoutUpdate as triggerLayoutUpdateFn,
  updateNodeSize as updateNodeSizeFn,
  refreshNodeFromFile as refreshNodeFromFileFn,
  updateNodeContent as updateNodeContentFn,
  updateNodeTitle as updateNodeTitleFn,
  updateNodeColor as updateNodeColorFn,
  moveNodesToWorkspace as moveNodesToWorkspaceFn,
  createNode as createNodeFn,
  deleteNode as deleteNodeFn,
  deleteNodes as deleteNodesFn,
  restoreNode as restoreNodeFn,
} from './nodes/crud'

import {
  createEdge as createEdgeFn,
  deleteEdge as deleteEdgeFn,
  restoreEdge as restoreEdgeFn,
  updateEdgeLinkType as updateEdgeLinkTypeFn,
  updateEdgeColor as updateEdgeColorFn,
  updateEdgeDirected as updateEdgeDirectedFn,
  cleanupOrphanEdges as cleanupOrphanEdgesFn,
  deduplicateEdges as deduplicateEdgesFn,
} from './nodes/edges'

import {
  checkFileCollision as checkFileCollisionFn,
  moveNodeFile as moveNodeFileFn,
  updateNodeFilePath as updateNodeFilePathFn,
  getVaultPath as getVaultPathFn,
} from './nodes/files'

import {
  createFrame as createFrameFn,
  updateFramePosition as updateFramePositionFn,
  updateFrameSize as updateFrameSizeFn,
  updateFrameTitle as updateFrameTitleFn,
  updateFrameColor as updateFrameColorFn,
  deleteFrame as deleteFrameFn,
  selectFrame as selectFrameFn,
  assignNodesToFrame as assignNodesToFrameFn,
} from './nodes/frames'

import {
  createWorkspace as createWorkspaceFn,
  switchWorkspace as switchWorkspaceFn,
  deleteWorkspace as deleteWorkspaceFn,
  recoverWorkspace as recoverWorkspaceFn,
  getOrphanedWorkspaceIds as getOrphanedWorkspaceIdsFn,
  renameWorkspace as renameWorkspaceFn,
  clearCanvas as clearCanvasFn,
  resetDefaultWorkspace as resetDefaultWorkspaceFn,
  loadStorylines as loadStorylinesFn,
  createStoryline as createStorylineFn,
  updateStoryline as updateStorylineFn,
  deleteStoryline as deleteStorylineFn,
  addNodeToStoryline as addNodeToStorylineFn,
  removeNodeFromStoryline as removeNodeFromStorylineFn,
  reorderStorylineNodes as reorderStorylineNodesFn,
  getStorylineNodes as getStorylineNodesFn,
  getStorylinesForNode as getStorylinesForNodeFn,
  repairStorylineEdges as repairStorylineEdgesFn,
  updateStorylineEdgeColors as updateStorylineEdgeColorsFn,
  syncAllTagNodes as syncAllTagNodesFn,
  removeAllTagNodes as removeAllTagNodesFn,
  getEntities as getEntitiesFn,
  getEntitiesByType as getEntitiesByTypeFn,
  getLinkedEntities as getLinkedEntitiesFn,
  getNodesReferencingEntity as getNodesReferencingEntityFn,
  createEntityNode as createEntityNodeFn,
  linkToEntity as linkToEntityFn,
} from './nodes/advanced'

import type {
  Node,
  Edge,
  Frame,
  Workspace,
  CreateNodeInput,
  CreateEdgeInput,
  FileChangeEvent,
  Storyline,
  StorylineNode,
  EntityNodeType,
} from '../types'

// Re-export types for consumers
export type { Node, Edge, Frame, Workspace, CreateNodeInput, CreateEdgeInput, FileChangeEvent, Storyline, StorylineNode }

export const useNodesStore = defineStore('nodes', () => {
  // Create core state
  const state = createState()
  const { nodes, selectedNodeIds, loading, error, nodeLayoutVersion, hiddenLinkTypes } = state

  // Create store instances
  const stores = createStoreInstances()
  const { storylinesStore, edgesStore, framesStore, workspaceStore } = stores

  // Create computed properties
  const computed = createComputedProperties(state, stores)
  const {
    edges, frames, selectedFrameId, workspaces, currentWorkspaceId,
    selectedNodeId, selectedNode, filteredNodes, filteredEdges, filteredFrames,
    storylines, storylineNodes, storylineNodesVersion, filteredStorylines,
  } = computed

  // Create dependencies for submodules
  const deps = createDependencies(state, computed, stores)

  // File sync composable
  const fileSync = useFileSync({
    getNodes: () => nodes.value,
    updateNodeInPlace: (id: string, updates: Partial<Node>) => {
      const node = nodes.value.find((n) => n.id === id)
      if (node) {
        Object.assign(node, updates)
      }
    },
    addNode: (node: Node) => {
      nodes.value.push(node)
    },
    removeNode: (id: string) => {
      // Remove connected edges first
      const connectedEdges = edgesStore.edges.filter(
        (e) => e.source_node_id === id || e.target_node_id === id
      )
      for (const edge of connectedEdges) {
        edgesStore.deleteEdge(edge.id)
      }
      // Remove from local state
      nodes.value = nodes.value.filter((n) => n.id !== id)
      // Delete from database
      invoke('delete_node', { id }).catch((e) => {
        storeLogger.error('Failed to delete node:', e)
      })
    },
    getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
    reloadEdges: () => edgesStore.loadEdges(workspaceStore.currentWorkspaceId),
    // Frame sync dependencies for folder-frame sync
    getFrames: () => framesStore.frames,
    assignNodeToFrame: (nodeId: string, frameId: string | null) => {
      const node = nodes.value.find((n) => n.id === nodeId)
      if (node && node.frame_id !== frameId) {
        node.frame_id = frameId
        invoke('assign_node_to_frame', { nodeId, frameId }).catch((e) =>
          storeLogger.error('Failed to assign node to frame:', e)
        )
      }
    },
    getVaultPath: () => workspaceStore.currentVaultPath,
    // Frontmatter sync
    updateNodeTitle: async (id: string, title: string) => {
      const node = nodes.value.find(n => n.id === id)
      if (node) {
        node.title = title
        node.updated_at = Date.now()
        await invoke('update_node_title', { id, title })
      }
    },
    updateNodeTags: async (id: string, tags: string[]) => {
      const node = nodes.value.find(n => n.id === id)
      if (node) {
        node.tags = JSON.stringify(tags)
        node.updated_at = Date.now()
        await invoke('update_node_tags', { id, tags })
      }
    },
  })

  // Forward declarations for composables (initialized after createNode is defined)
  let importComposable: ReturnType<typeof useImport> = undefined!
  let tagNodesComposable: ReturnType<typeof useTagNodes> = undefined!
  let layoutComposable: ReturnType<typeof useNodeLayout> = undefined!
  let entityOpsComposable: ReturnType<typeof useEntityOperations> = undefined!

  // ============================================================================
  // Bound functions (wrapping submodule functions with dependencies)
  // ============================================================================

  async function initialize() {
    await initializeStore(deps, createNode)
  }

  function getNode(id: string): Node | undefined {
    return getNodeFn(nodes.value, id)
  }

  function getNeighborIds(nodeId: string): string[] {
    return getNeighborIdsFn(edgesStore.edges, nodeId)
  }

  function findNodeByTitle(title: string): Node | undefined {
    return findNodeByTitleFn(nodes.value, title)
  }

  function selectNode(id: string | null, addToSelection = false) {
    selectNodeFn(selectedNodeIds, id, addToSelection)
  }

  async function updateNodePosition(
    id: string,
    x: number,
    y: number,
    options?: { enforceFrame?: boolean; skipLayoutTrigger?: boolean }
  ) {
    await updateNodePositionFn(deps, id, x, y, options)
  }

  function triggerLayoutUpdate() {
    triggerLayoutUpdateFn(nodeLayoutVersion)
  }

  async function updateNodeSize(id: string, width: number, height: number, pushOthers = false) {
    await updateNodeSizeFn(deps, id, width, height, pushOthers, layoutComposable)
  }

  async function refreshNodeFromFile(id: string): Promise<boolean> {
    return refreshNodeFromFileFn(nodes, id)
  }

  async function updateNodeContent(id: string, content: string) {
    await updateNodeContentFn(deps, id, content, tagNodesComposable, createEdge)
  }

  async function updateNodeTitle(id: string, title: string) {
    await updateNodeTitleFn(nodes, id, title)
  }

  async function updateNodeColor(id: string, color: string | null) {
    await updateNodeColorFn(nodes, id, color)
  }

  async function moveNodesToWorkspace(nodeIds: string[], workspaceId: string | null) {
    await moveNodesToWorkspaceFn(nodes, nodeIds, workspaceId)
  }

  async function createNode(data: CreateNodeInput): Promise<Node> {
    return createNodeFn(deps, data)
  }

  async function deleteNode(id: string) {
    await deleteNodeFn(deps, id)
  }

  async function deleteNodes(ids: string[]) {
    await deleteNodesFn(deps, ids)
  }

  async function restoreNode(node: Node) {
    await restoreNodeFn(nodes, node)
  }

  // Edge operations
  const createEdge = (data: CreateEdgeInput) => createEdgeFn(edgesStore, data)

  async function deleteEdge(id: string): Promise<void> {
    await deleteEdgeFn(deps, id)
  }

  const restoreEdge = (edge: Edge) => restoreEdgeFn(edgesStore, edge)
  const updateEdgeLinkType = (id: string, linkType: string) => updateEdgeLinkTypeFn(edgesStore, id, linkType)
  const updateEdgeColor = (id: string, color: string | null) => updateEdgeColorFn(edgesStore, id, color)
  const updateEdgeDirected = (id: string, directed: boolean) => updateEdgeDirectedFn(edgesStore, id, directed)
  const cleanupOrphanEdges = () => cleanupOrphanEdgesFn(edgesStore, nodes.value)
  const deduplicateEdges = () => deduplicateEdgesFn(edgesStore)

  // File operations
  const checkFileCollision = (nodeId: string, targetFolder: string) =>
    checkFileCollisionFn(nodeId, targetFolder)

  async function moveNodeFile(nodeId: string, targetFolder: string, collisionResolution?: string): Promise<string> {
    return moveNodeFileFn(deps, nodeId, targetFolder, collisionResolution, updateNodeContent)
  }

  function updateNodeFilePath(nodeId: string, filePath: string) {
    updateNodeFilePathFn(nodes.value, nodeId, filePath)
  }

  function getVaultPath(): string | null {
    return getVaultPathFn(workspaceStore)
  }

  // Frame operations
  function createFrame(x: number, y: number, width = 400, height = 300, title = 'Frame') {
    return createFrameFn(deps, x, y, width, height, title)
  }

  const updateFramePosition = (id: string, x: number, y: number) => updateFramePositionFn(framesStore, id, x, y)
  const updateFrameSize = (id: string, width: number, height: number) => updateFrameSizeFn(framesStore, id, width, height)
  const updateFrameTitle = (id: string, title: string) => updateFrameTitleFn(framesStore, id, title)
  const updateFrameColor = (id: string, color: string | null) => updateFrameColorFn(framesStore, id, color)

  function deleteFrame(id: string) {
    deleteFrameFn(deps, id)
  }

  function selectFrame(id: string | null) {
    selectFrameFn(deps, id)
  }

  function assignNodesToFrame(nodeIds: string[], frameId: string | null) {
    assignNodesToFrameFn(nodes.value, nodeIds, frameId)
  }

  // Workspace operations
  const createWorkspace = (name: string) => createWorkspaceFn(workspaceStore, name)

  async function switchWorkspace(workspaceId: string | null) {
    await switchWorkspaceFn(deps, fileSync, workspaceId)
  }

  const deleteWorkspace = (id: string, deleteFiles?: boolean) => deleteWorkspaceFn(workspaceStore, id, deleteFiles)
  const recoverWorkspace = (id: string) => recoverWorkspaceFn(workspaceStore, id)
  const getOrphanedWorkspaceIds = () => getOrphanedWorkspaceIdsFn(workspaceStore, nodes.value)
  const renameWorkspace = (id: string, newName: string) => renameWorkspaceFn(workspaceStore, id, newName)

  function clearCanvas() {
    clearCanvasFn(deps)
  }

  async function resetDefaultWorkspace(): Promise<void> {
    await resetDefaultWorkspaceFn(deps, createNode, createEdge)
  }

  // Storyline operations
  const loadStorylines = () => loadStorylinesFn(storylinesStore)
  const createStoryline = (title: string, description?: string, color?: string) =>
    createStorylineFn(storylinesStore, title, description, color)
  const updateStoryline = (id: string, title: string, description?: string, color?: string) =>
    updateStorylineFn(storylinesStore, id, title, description, color)
  const deleteStoryline = (id: string) => deleteStorylineFn(storylinesStore, id)
  const addNodeToStoryline = (storylineId: string, nodeId: string, position?: number) =>
    addNodeToStorylineFn(storylinesStore, storylineId, nodeId, position)
  const removeNodeFromStoryline = (storylineId: string, nodeId: string) =>
    removeNodeFromStorylineFn(storylinesStore, storylineId, nodeId)
  const reorderStorylineNodes = (storylineId: string, nodeIds: string[]) =>
    reorderStorylineNodesFn(storylinesStore, storylineId, nodeIds)
  const getStorylineNodes = (storylineId: string) => getStorylineNodesFn(storylinesStore, storylineId)
  const getStorylinesForNode = (nodeId: string) => getStorylinesForNodeFn(storylinesStore, nodeId)
  const repairStorylineEdges = (storylineId: string) => repairStorylineEdgesFn(storylinesStore, storylineId)
  const updateStorylineEdgeColors = (storylineId: string, color: string | null) =>
    updateStorylineEdgeColorsFn(storylinesStore, storylineId, color)

  // Tag operations
  async function syncAllTagNodes() {
    if (!tagNodesComposable) return
    await syncAllTagNodesFn(nodes.value, tagNodesComposable)
  }

  async function removeAllTagNodes() {
    await removeAllTagNodesFn(deps, deleteNode)
  }

  // Initialize composables that depend on functions defined above
  importComposable = useImport({
    getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
    getNodes: () => nodes.value,
    setNodes: (n) => { nodes.value = n },
    addNodes: (n) => { nodes.value.push(...n) },
    setEdges: (e) => { edgesStore.edges.splice(0, edgesStore.edges.length, ...e) },
    reloadFrames: () => framesStore.initialize(),
    createNode,
    watchVault: (path) => fileSync.watchVault(path),
    // Frame-folder sync: create frames from folder structure during import
    createFrame: (x, y, width, height, title, wsId, folderPath, parentFrameId) =>
      framesStore.createFrame(x, y, width, height, title, wsId, folderPath, parentFrameId),
    createFrameAsync: (x, y, width, height, title, wsId, folderPath, parentFrameId) =>
      framesStore.createFrameAsync(x, y, width, height, title, wsId, folderPath, parentFrameId),
    assignNodesToFrame: (nodeIds, frameId) => {
      for (const node of nodes.value) {
        if (nodeIds.includes(node.id) && node.frame_id !== frameId) {
          node.frame_id = frameId
          // Persist to backend
          invoke('assign_node_to_frame', { nodeId: node.id, frameId }).catch((e) =>
            storeLogger.error('Failed to assign node to frame:', e)
          )
        }
      }
    },
    updateNodePosition: (id, x, y) => {
      const node = nodes.value.find((n) => n.id === id)
      if (node) {
        node.canvas_x = x
        node.canvas_y = y
        // Persist to database
        invoke('update_node_position', { id, x, y }).catch((e) =>
          storeLogger.error('Failed to update node position:', e)
        )
      }
    },
    getFrames: () => framesStore.frames,
    getVaultPath: () => workspaceStore.currentVaultPath,
  })

  tagNodesComposable = useTagNodes({
    getNodes: () => nodes.value,
    getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
    createNode,
    getEdges: () => edgesStore.edges,
    createEdge,
  })

  // Initialize layout composable
  layoutComposable = useNodeLayout({
    getNodes: () => nodes.value,
    getFilteredNodes: () => filteredNodes.value,
    getFilteredEdges: () => filteredEdges.value,
    getFilteredFrames: () => filteredFrames.value,
    updateNodePosition,
    updateNodeSize: async (id, width, height) => {
      // Update without push to avoid infinite recursion
      await updateNodeSizeFn(deps, id, width, height, false, undefined)
    },
    incrementLayoutVersion: () => { nodeLayoutVersion.value++ },
  })

  // Initialize entity operations composable
  entityOpsComposable = useEntityOperations({
    getNodes: () => nodes.value,
    getFilteredNodes: () => filteredNodes.value,
    getNode,
    createNode,
    createEdge,
    getEntityEdgesForNode: (nodeId, direction) => edgesStore.getEntityEdgesForNode(nodeId, direction),
  })

  // Tag node forwarding
  const getOrCreateTagNode = (tagName: string, nearNodeId?: string) =>
    tagNodesComposable.getOrCreateTagNode(tagName, nearNodeId)
  const createTagEdges = (nodeId: string, tagNames: string[]) =>
    tagNodesComposable.createTagEdges(nodeId, tagNames)
  const getTagNodes = () => tagNodesComposable.getTagNodes()

  // Listen for tag nodes setting change
  const handleTagNodesChange = async (e: Event) => {
    const enabled = (e as CustomEvent).detail
    if (enabled) {
      await syncAllTagNodes()
    } else {
      await removeAllTagNodes()
    }
  }
  window.addEventListener('nodus-tag-nodes-change', handleTagNodesChange)

  // Entity forwarding
  const getEntities = () => getEntitiesFn(entityOpsComposable)
  const getEntitiesByType = (entityType: EntityNodeType) => getEntitiesByTypeFn(entityOpsComposable, entityType)
  const getLinkedEntities = (nodeId: string) => getLinkedEntitiesFn(entityOpsComposable, nodeId)
  const getNodesReferencingEntity = (entityId: string) => getNodesReferencingEntityFn(entityOpsComposable, entityId)
  const createEntityNode = (
    entityType: EntityNodeType,
    title: string,
    options?: { canvas_x?: number; canvas_y?: number; markdown_content?: string; color_theme?: string | null }
  ) => createEntityNodeFn(entityOpsComposable, entityType, title, options)
  const linkToEntity = (sourceNodeId: string, entityNodeId: string, linkType?: string) =>
    linkToEntityFn(entityOpsComposable, sourceNodeId, entityNodeId, linkType)

  // Import forwarding
  const importVault = (path: string, deleteOriginals?: boolean, targetWorkspaceId?: string) =>
    importComposable.importVault(path, deleteOriginals, targetWorkspaceId)
  const importCitations = (filePath: string) => importComposable.importCitations(filePath)
  const importOntology = (
    filePath: string,
    options?: { createClassNodes?: boolean; createIndividualNodes?: boolean; workspaceId?: string; layout?: 'grid' | 'hierarchical' }
  ) => importComposable.importOntology(filePath, options)
  const refreshWorkspace = () => importComposable.refreshWorkspace()
  const syncFramesFromFolders = () => importComposable.syncFramesFromFolders()

  // File sync forwarding
  const watchVault = (path: string) => fileSync.watchVault(path)
  const stopWatching = () => fileSync.stopWatching()

  // Layout forwarding
  const layoutNodes = (
    nodeIds?: string[],
    options?: {
      centerX?: number
      centerY?: number
      chargeStrength?: number
      linkDistance?: number
      frameId?: string
      fitToFrame?: boolean
    }
  ) => layoutComposable.layoutNodes(nodeIds, options)

  // Edit locking composable
  const editLocking = useNodeEditLocking({
    getNode: (id: string) => nodes.value.find(n => n.id === id),
  })
  const { isNodeEditable, startEditing, stopEditing, hasEditLock } = editLocking

  return {
    // State
    nodes,
    edges,
    frames,
    filteredNodes,
    filteredEdges,
    filteredFrames,
    nodeLayoutVersion,
    selectedNodeIds,
    selectedNodeId,
    selectedNode,
    selectedFrameId,
    loading,
    error,
    // Edge type visibility filter
    hiddenLinkTypes,
    toggleLinkTypeVisibility: (linkType: string) => {
      if (hiddenLinkTypes.value.has(linkType)) {
        hiddenLinkTypes.value.delete(linkType)
      } else {
        hiddenLinkTypes.value.add(linkType)
      }
      // Trigger reactivity by creating a new Set
      hiddenLinkTypes.value = new Set(hiddenLinkTypes.value)
    },
    isLinkTypeVisible: (linkType: string) => !hiddenLinkTypes.value.has(linkType),
    workspaces,
    currentWorkspaceId,
    storylines,
    filteredStorylines,
    storylineNodes,
    storylineNodesVersion,
    // Initialization
    initialize,
    // Node operations
    getNode,
    getNeighborIds,
    findNodeByTitle,
    updateNodePosition,
    triggerLayoutUpdate,
    updateNodeSize,
    updateNodeContent,
    updateNodeTitle,
    updateNodeColor,
    moveNodesToWorkspace,
    selectNode,
    refreshNodeFromFile,
    createNode,
    deleteNode,
    deleteNodes,
    restoreNode,
    // Edge operations
    createEdge,
    deleteEdge,
    restoreEdge,
    updateEdgeLinkType,
    updateEdgeColor,
    updateEdgeDirected,
    updateStorylineEdgeColors,
    // Frame operations
    createFrame,
    updateFramePosition,
    updateFrameSize,
    updateFrameTitle,
    updateFrameColor,
    deleteFrame,
    selectFrame,
    assignNodesToFrame,
    // Import operations
    importVault,
    importCitations,
    importOntology,
    refreshWorkspace,
    syncFramesFromFolders,
    watchVault,
    stopWatching,
    // Workspace operations
    createWorkspace,
    switchWorkspace,
    deleteWorkspace,
    recoverWorkspace,
    getOrphanedWorkspaceIds,
    renameWorkspace,
    clearCanvas,
    resetDefaultWorkspace,
    // Edge cleanup
    cleanupOrphanEdges,
    deduplicateEdges,
    loadEdges: () => edgesStore.loadEdges(workspaceStore.currentWorkspaceId),
    loadNodes: async () => {
      const fetchedNodes = await invoke<Node[]>('get_nodes')
      nodes.value = fetchedNodes
    },
    // Layout
    layoutNodes,
    // Edit locking
    isNodeEditable,
    startEditing,
    stopEditing,
    hasEditLock,
    // Storylines
    loadStorylines,
    createStoryline,
    updateStoryline,
    deleteStoryline,
    addNodeToStoryline,
    removeNodeFromStoryline,
    reorderStorylineNodes,
    getStorylineNodes,
    getStorylinesForNode,
    repairStorylineEdges,
    // Tag management
    extractHashtags,
    getOrCreateTagNode,
    createTagEdges,
    getTagNodes,
    syncAllTagNodes,
    removeAllTagNodes,
    // Entity management
    getEntities,
    getEntitiesByType,
    getLinkedEntities,
    getNodesReferencingEntity,
    createEntityNode,
    linkToEntity,
    // File-folder sync
    checkFileCollision,
    moveNodeFile,
    updateNodeFilePath,
    getVaultPath,
    markProgrammaticMove: fileSync.markProgrammaticMove,
  }
})
