/**
 * MCP Handlers Index
 *
 * Re-exports all handler functions for use in the message router.
 */

// Node handlers
export {
  nodeToMcp,
  edgeToMcp,
  COLOR_NAME_MAP,
  normalizeColor,
  clampToFrame,
  McpError,
  handleGetGraphSummary,
  handleListNodes,
  handleGetNode,
  handleGetNodeNeighbors,
  handleGetGraphStructure,
  handleSearchNodes,
  handleGetOrphanNodes,
  handleGetConnectedComponents,
  handleGetLeafNodes,
  handleGetRootNodes,
  handleGetHubNodes,
  handleGetNodesByColor,
  handleCreateNode,
  handleUpdateNode,
  handleBatchUpdateNodes,
  handleDeleteNode,
  handleResizeNode,
  handleBatchResizeNodes,
  handleBatchMoveNodes,
  handleSetNodeColor,
  handleBatchSetNodeColors,
} from './nodeHandlers'

// Edge handlers
export {
  handleGetEdges,
  handleCreateEdge,
  handleUpdateEdge,
  handleDeleteEdge,
  handleBatchCreateEdges,
  handleBatchDeleteEdges,
  handleDeleteEdgesForNode,
  handleGetDuplicateEdges,
  handleCleanupDuplicateEdges,
  handleArrangeRadial,
} from './edgeHandlers'

// Frame handlers
export {
  frameToMcp,
  handleListFrames,
  handleGetFrame,
  handleCreateFrame,
  handleUpdateFrame,
  handleDeleteFrame,
  handleGetNodesInFrame,
  handleAssignNodeToFrame,
  handleRemoveNodeFromFrame,
  handleBatchAssignNodesToFrame,
  handleBatchMoveFrames,
  handleBatchResizeFrames,
  handleFitFrameToContents,
  handleFitAllFrames,
  handleCheckFrameOverlaps,
  handleResolveFrameOverlaps,
} from './frameHandlers'

// Storyline handlers
export {
  storylineToMcp,
  handleListStorylines,
  handleGetStoryline,
  handleGetStorylineNodes,
  handleCreateStoryline,
  handleUpdateStoryline,
  handleDeleteStoryline,
  handleAddNodeToStoryline,
  handleRemoveNodeFromStoryline,
  handleReorderStorylineNodes,
} from './storylineHandlers'
