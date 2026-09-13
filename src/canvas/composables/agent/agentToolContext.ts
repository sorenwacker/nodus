/**
 * The tool context a registry tool receives for one call.
 *
 * Built per call, so every value it carries is read when the tool runs rather
 * than when the canvas was composed (PRODUCT_DESIGN.md > Reads that stay live).
 *
 * The selection it carries is the run's capture. Selection tools read their
 * targets from here and from nowhere else, so a context built from the live
 * selection let a click made while the model was still thinking redirect the
 * change to a node the user never named
 * (PRODUCT_DESIGN.md > What the agent acts on).
 */
import { applyForceLayout } from '../../layout'
import type { ToolContext } from '../../../llm/registry'
import type { useNodesStore } from '../../../stores/nodes'

type NodesStore = ReturnType<typeof useNodesStore>

export interface AgentToolContextDeps {
  store: NodesStore
  log: (msg: string) => void
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  snapToGrid: (value: number) => number
  getOllamaModel: () => string
  getOllamaContextLength: () => number
  pushContentUndo: ToolContext['pushContentUndo']
  pushContentsUndo: ToolContext['pushContentsUndo']
  service?: ToolContext['service']
  /** The selection captured when the run started, or null between runs. */
  getRunSelection: () => string[] | null
  getEditingNodeId: () => string | null
}

export function buildAgentToolContext(deps: AgentToolContextDeps): ToolContext {
  const { store } = deps
  return {
    store: {
      filteredNodes: store.filteredNodes,
      filteredEdges: store.filteredEdges,
      createNode: store.createNode,
      createEdge: store.createEdge,
      deleteNode: store.deleteNode,
      deleteEdge: store.deleteEdge,
      updateNodePosition: store.updateNodePosition,
      updateNodeContent: store.updateNodeContent,
      updateNodeTitle: store.updateNodeTitle,
      updateNodeTags: store.updateNodeTags,
      updateEdgeLabel: store.updateEdgeLabel,
      updateEdgeColor: store.updateEdgeColor,
      getFrames: () => store.filteredFrames,
      assignNodesToFrame: store.assignNodesToFrame,
      getStorylines: () => store.filteredStorylines,
      createFrame: (x: number, y: number, width: number, height: number, title: string) =>
        store.createFrame(x, y, width, height, title),
      createStoryline: (title: string, description?: string) =>
        store.createStoryline(title, description),
      addNodeToStoryline: (storylineId: string, nodeId: string) =>
        store.addNodeToStoryline(storylineId, nodeId),
    },
    log: deps.log,
    screenToCanvas: deps.screenToCanvas,
    snapToGrid: deps.snapToGrid,
    ollamaModel: deps.getOllamaModel(),
    ollamaContextLength: deps.getOllamaContextLength(),
    pushContentUndo: deps.pushContentUndo,
    pushContentsUndo: deps.pushContentsUndo,
    service: deps.service,
    // The canvas owns its layout and supplies it; the tool does not reach for it
    applyForceLayout,
    selectedNodeIds: deps.getRunSelection() ?? store.selectedNodeIds,
    editingNodeId: deps.getEditingNodeId(),
  }
}
