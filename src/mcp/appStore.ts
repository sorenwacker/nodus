/**
 * The adapter between the application's stores and the MCP store interface.
 *
 * This is composition, not logic: it maps what the app holds onto what the
 * message handler needs. It lived inline in App.vue, which is over the
 * project's file size limit, and a boundary of this size is easier to read,
 * and to check against the interface, with a name of its own.
 *
 * Everything it needs is passed in. Reaching for the stores here would give
 * the boundary a hidden dependency that no caller could substitute.
 */
import type { McpStoreInterface } from './messageHandler'
import type { Edge } from '../types'

type NodesStore = ReturnType<typeof import('../stores/nodes').useNodesStore>
type EdgesStore = ReturnType<typeof import('../stores/edges').useEdgesStore>
type StorylinesStore = ReturnType<typeof import('../stores/storylines').useStorylinesStore>

export interface AppMcpStoreDeps {
  store: NodesStore
  edgesStore: EdgesStore
  storylinesStore: StorylinesStore
  /** The Tauri bridge, so this module performs no imports of its own for it */
  invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>
}

export function appMcpStore(deps: AppMcpStoreDeps): McpStoreInterface {
  const { store, edgesStore, storylinesStore, invoke } = deps

  return {
    getFilteredNodes: () => store.filteredNodes,
    getFilteredEdges: () => store.graphEdges,
    getNode: store.getNode,
    // Workspace scoping: lets each MCP connection target its own workspace
    getAllNodes: () => store.nodes,
    getAllFrames: () => store.frames,
    getWorkspaces: () => {
      const current = store.currentWorkspaceId ?? 'default'
      return [
        { id: 'default', name: 'Default', current: current === 'default' },
        ...store.workspaces.map(w => ({ id: w.id, name: w.name, current: w.id === current })),
      ]
    },
    loadWorkspaceEdges: workspaceId => invoke<Edge[]>('get_edges', { workspaceId }),
    createEdgeRaw: data => invoke<Edge>('create_edge', { input: data }),
    deleteEdgeRaw: id => invoke('delete_edge', { id }).then(() => undefined),
    createNode: store.createNode,
    updateNodeContent: store.updateNodeContent,
    updateNodeTags: async (id: string, tags: string[]) => {
      await invoke('update_node_tags', { id, tags })
      const node = store.getNode(id)
      if (node) node.tags = JSON.stringify(tags)
    },
    updateNodeTitle: store.updateNodeTitle,
    updateNodePosition: store.updateNodePosition,
    updateNodeSize: store.updateNodeSize,
    updateNodeColor: store.updateNodeColor,
    deleteNode: store.deleteNode,
    createEdge: store.createEdge,
    deleteEdge: store.deleteEdge,
    updateEdgeDirected: edgesStore.updateEdgeDirected,
    updateEdgeLabel: edgesStore.updateEdgeLabel,
    updateEdgeColor: edgesStore.updateEdgeColor,
    // Frame operations
    getFilteredFrames: () => store.filteredFrames,
    getFrame: (id: string) => store.filteredFrames.find(f => f.id === id),
    createFrame: store.createFrame,
    updateFramePosition: store.updateFramePosition,
    updateFrameSize: store.updateFrameSize,
    updateFrameTitle: store.updateFrameTitle,
    updateFrameColor: store.updateFrameColor,
    deleteFrame: store.deleteFrame,
    assignNodesToFrame: store.assignNodesToFrame,
    // Storyline operations
    // All of them, so a scoped connection can filter to its own workspace the
    // way it already does for nodes and frames
    getAllStorylines: () => storylinesStore.storylines,
    getFilteredStorylines: () => storylinesStore.filteredStorylines,
    getStoryline: (id: string) => storylinesStore.filteredStorylines.find(s => s.id === id),
    getStorylineNodes: storylinesStore.getStorylineNodes,
    createStoryline: storylinesStore.createStoryline,
    updateStoryline: storylinesStore.updateStoryline,
    deleteStoryline: storylinesStore.deleteStoryline,
    addNodeToStoryline: storylinesStore.addNodeToStoryline,
    removeNodeFromStoryline: storylinesStore.removeNodeFromStoryline,
    reorderStorylineNodes: storylinesStore.reorderStorylineNodes,
  }
}
