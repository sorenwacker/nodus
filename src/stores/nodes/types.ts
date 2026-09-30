/**
 * Internal types and dependencies for the nodes store module
 */

import type { Ref, ComputedRef } from 'vue'
import type {
  Node,
  Edge,
  Workspace,
  CreateNodeInput,
  CreateEdgeInput,
  Storyline,
  StorylineNode,
  EntityNodeType,
} from '../../types'

// Re-export types for consumers
export type {
  Node,
  Edge,
  Workspace,
  CreateNodeInput,
  CreateEdgeInput,
  Storyline,
  StorylineNode,
  EntityNodeType,
}

/**
 * Core state refs used across the store modules
 */
export interface NodeStoreState {
  nodes: Ref<Node[]>
  selectedNodeIds: Ref<string[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  nodeLayoutVersion: Ref<number>
  showManualEdges: Ref<boolean>
  showStorylineEdges: Ref<boolean>
  showWikilinkEdges: Ref<boolean>
  showTagEdges: Ref<boolean>
  hoverHighlightNodeId: Ref<string | null>
  /** Node an AI task is currently writing into; drives the working pulse. */
  aiWorkingNodeId: Ref<string | null>
}

/**
 * Computed properties derived from state
 */
export interface NodeStoreComputed {
  edges: ComputedRef<Edge[]>
  workspaces: ComputedRef<Workspace[]>
  currentWorkspaceId: ComputedRef<string | null>
  selectedNodeId: ComputedRef<string | null>
  selectedNode: ComputedRef<Node | undefined>
  filteredNodes: ComputedRef<Node[]>
  filteredEdges: ComputedRef<Edge[]>
  graphEdges: ComputedRef<Edge[]>
  storylines: ComputedRef<Storyline[]>
  storylineNodes: ComputedRef<Map<string, string[]>>
  storylineNodesVersion: ComputedRef<number>
  filteredStorylines: ComputedRef<Storyline[]>
}

/**
 * Store dependencies injected into modules
 */
export interface NodeStoreDependencies {
  state: NodeStoreState
  computed: NodeStoreComputed
  edgesStore: ReturnType<typeof import('../edges').useEdgesStore>
  workspaceStore: ReturnType<typeof import('../workspaces').useWorkspaceStore>
  storylinesStore: ReturnType<typeof import('../storylines').useStorylinesStore>
}

/**
 * File sync composable interface (subset needed by modules)
 */
export interface FileSyncInterface {
  watchVault: (path: string) => Promise<void>
  stopWatching: () => Promise<void>
}
