/**
 * Nodes store module - re-exports all submodule functions and types
 */

// Re-export types
export type {
  Node,
  Edge,
  Workspace,
  CreateNodeInput,
  CreateEdgeInput,
  Storyline,
  StorylineNode,
  EntityNodeType,
  NodeStoreState,
  NodeStoreComputed,
  NodeStoreDependencies,
  FileSyncInterface,
} from './types'

// Re-export state functions
export {
  createState,
  createStoreInstances,
  createComputedProperties,
  createDependencies,
  initializeStore,
  getNode,
  findNodeByTitle,
  selectNode,
} from './state'

// Re-export CRUD functions
export {
  updateNodePosition,
  persistNodePosition,
  triggerLayoutUpdate,
  updateNodeSize,
  refreshNodeFromFile,
  updateNodeContent,
  updateNodeTitle,
  updateNodeTags,
  resetInvalidNodeColors,
  updateNodeColor,
  moveNodesToWorkspace,
  createNode,
  deleteNode,
  deleteNodes,
  restoreNode,
} from './crud'

// Re-export edge functions
export {
  createEdge,
  deleteEdge,
  restoreEdge,
  updateEdgeLinkType,
  updateEdgeColor,
  updateEdgeDirected,
  cleanupOrphanEdges,
  deduplicateEdges,
} from './edges'



// Re-export advanced functions
export {
  createWorkspace,
  switchWorkspace,
  deleteWorkspace,
  recoverWorkspace,
  getOrphanedWorkspaceIds,
  renameWorkspace,
  clearCanvas,
  resetDefaultWorkspace,
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
  updateStorylineEdgeColors,
  syncAllTagNodes,
  getEntities,
  getEntitiesByType,
  getLinkedEntities,
  getNodesReferencingEntity,
  createEntityNode,
  linkToEntity,
} from './advanced'

export type { EntityOperationsComposable } from './advanced'
