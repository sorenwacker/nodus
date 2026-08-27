/**
 * The slice of the node store the agent's tools reach through.
 *
 * Anything a tool needs must be here: an exposed tool whose store method is
 * missing answers "not available in this context", which is exposure without
 * wiring (PRODUCT_DESIGN.md > Tool reachability).
 *
 * Reads are getters, so they stay live rather than freezing at construction.
 */
import type { useNodesStore } from '../../../stores/nodes'
import type { LLMToolsNodeStore } from './useLLMTools'

type NodesStore = ReturnType<typeof useNodesStore>

export function agentToolStoreAdapter(store: NodesStore): LLMToolsNodeStore {
  return {
    getFilteredNodes: () => store.filteredNodes,
    getFilteredEdges: () => store.filteredEdges,
    get filteredNodes() {
      return store.filteredNodes
    },
    get filteredEdges() {
      return store.filteredEdges
    },
    get selectedNodeIds() {
      return store.selectedNodeIds
    },
    createNode: store.createNode,
    deleteNode: store.deleteNode,
    deleteEdge: store.deleteEdge,
    updateNodeContent: store.updateNodeContent,
    updateNodeTitle: store.updateNodeTitle,
    updateNodePosition: store.updateNodePosition,
    updateNodeColor: store.updateNodeColor,
    updateEdgeColor: store.updateEdgeColor,
    updateEdgeLabel: store.updateEdgeLabel,
    createEdge: store.createEdge,
    // Frames and storylines, for the grouping tools
    getFrames: () => store.filteredFrames,
    createFrame: store.createFrame,
    assignNodesToFrame: store.assignNodesToFrame,
    getStorylines: () => store.filteredStorylines,
    createStoryline: (title: string, description?: string) =>
      store.createStoryline(title, description),
    addNodeToStoryline: (storylineId: string, nodeId: string) =>
      store.addNodeToStoryline(storylineId, nodeId),
    currentWorkspaceId: store.currentWorkspaceId,
  }
}
