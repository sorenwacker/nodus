/**
 * Nodes store module - re-exports all submodule functions and types
 */

// Re-export types
export type {
  Node,
  Edge,
  Frame,
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
  getNeighborIds,
  findNodeByTitle,
  selectNode,
} from './state'

// Re-export CRUD functions
export {
  updateNodePosition,
  triggerLayoutUpdate,
  updateNodeSize,
  refreshNodeFromFile,
  updateNodeContent,
  updateNodeTitle,
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

// Re-export file functions
export {
  checkFileCollision,
  moveNodeFile,
  updateNodeFilePath,
  getVaultPath,
} from './files'

// Re-export frame functions
export {
  createFrame,
  updateFramePosition,
  updateFrameSize,
  updateFrameTitle,
  updateFrameColor,
  deleteFrame,
  selectFrame,
  assignNodesToFrame,
} from './frames'

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
  removeAllTagNodes,
  getEntities,
  getEntitiesByType,
  getLinkedEntities,
  getNodesReferencingEntity,
  createEntityNode,
  linkToEntity,
} from './advanced'

export type { EntityOperationsComposable } from './advanced'
