/**
 * Internal types and dependencies for the nodes store module
 */

import type { Ref, ComputedRef } from 'vue'
import type {
  Node,
  Edge,
  Frame,
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
  Frame,
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
  showLinkedNodes: Ref<boolean>
  showNodusNodes: Ref<boolean>
  showCommentNodes: Ref<boolean>
}

/**
 * Computed properties derived from state
 */
export interface NodeStoreComputed {
  edges: ComputedRef<Edge[]>
  frames: ComputedRef<Frame[]>
  selectedFrameId: ComputedRef<string | null>
  workspaces: ComputedRef<Workspace[]>
  currentWorkspaceId: ComputedRef<string | null>
  selectedNodeId: ComputedRef<string | null>
  selectedNode: ComputedRef<Node | undefined>
  filteredNodes: ComputedRef<Node[]>
  filteredEdges: ComputedRef<Edge[]>
  filteredFrames: ComputedRef<Frame[]>
  storylines: ComputedRef<Storyline[]>
  storylineNodes: ComputedRef<Map<string, StorylineNode[]>>
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
  framesStore: ReturnType<typeof import('../frames').useFramesStore>
  workspaceStore: ReturnType<typeof import('../workspaces').useWorkspaceStore>
  storylinesStore: ReturnType<typeof import('../storylines').useStorylinesStore>
}

/**
 * File sync composable interface (subset needed by modules)
 */
export interface FileSyncInterface {
  watchVault: (path: string) => Promise<void>
  stopWatching: () => Promise<void>
  markProgrammaticMove: (paths: string[]) => void
}
