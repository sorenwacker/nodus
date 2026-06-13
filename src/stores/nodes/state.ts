/**
 * Core state definitions, filters, and computed properties for the nodes store
 */

import { ref, computed } from 'vue'
import { invoke } from '../../lib/tauri'
import { storeLogger } from '../../lib/logger'
import { notifications$ } from '../../composables/useNotifications'
import { useStorylinesStore } from '../storylines'
import { useEdgesStore } from '../edges'
import { useFramesStore } from '../frames'
import { useWorkspaceStore } from '../workspaces'
import { createMockNodes } from '../../lib/mockData'
import type { Node, NodeStoreState, NodeStoreComputed, NodeStoreDependencies } from './types'

/**
 * Create core state refs
 */
export function createState(): NodeStoreState {
  return {
    nodes: ref<Node[]>([]),
    selectedNodeIds: ref<string[]>([]),
    loading: ref(false),
    error: ref<string | null>(null),
    nodeLayoutVersion: ref(0),
    hiddenLinkTypes: ref(new Set<string>()),
  }
}

/**
 * Create store instances
 */
export function createStoreInstances() {
  return {
    storylinesStore: useStorylinesStore(),
    edgesStore: useEdgesStore(),
    framesStore: useFramesStore(),
    workspaceStore: useWorkspaceStore(),
  }
}

/**
 * Create computed properties from state and stores
 */
export function createComputedProperties(
  state: NodeStoreState,
  stores: ReturnType<typeof createStoreInstances>
): NodeStoreComputed {
  const { nodes, hiddenLinkTypes } = state
  const { edgesStore, framesStore, workspaceStore, storylinesStore } = stores

  // Expose edges and frames from their stores for backwards compatibility
  const edges = computed(() => edgesStore.edges)
  const frames = computed(() => framesStore.frames)
  const selectedFrameId = computed(() => framesStore.selectedFrameId)
  const workspaces = computed(() => workspaceStore.workspaces)
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspaceId)

  // For backwards compatibility
  const selectedNodeId = computed(() => state.selectedNodeIds.value[0] || null)
  const selectedNode = computed(() =>
    nodes.value.find(n => n.id === selectedNodeId.value)
  )

  // Filtered nodes/edges for current workspace
  const filteredNodes = computed(() => {
    const wsId = workspaceStore.currentWorkspaceId
    // Treat null, undefined, and "default" as the default workspace
    // Default workspace shows nodes with no workspace_id (null)
    if (!wsId || wsId === 'default') {
      return nodes.value.filter(n => !n.workspace_id)
    }
    return nodes.value.filter(n => n.workspace_id === wsId)
  })

  const filteredFrames = computed(() => {
    const wsId = workspaceStore.currentWorkspaceId
    // Filter frames by workspace, treating null/undefined/"default" as the default workspace
    if (!wsId || wsId === 'default') {
      return framesStore.frames.filter(f => !f.workspace_id || f.workspace_id === 'default')
    }
    return framesStore.frames.filter(f => f.workspace_id === wsId)
  })

  const filteredEdges = computed(() => {
    const nodeIds = new Set(filteredNodes.value.map(n => n.id))
    // Filter edges to only include those connecting nodes in the current workspace
    // and exclude edges with hidden link types
    return edgesStore.edges.filter(
      e => nodeIds.has(e.source_node_id) &&
           nodeIds.has(e.target_node_id) &&
           !hiddenLinkTypes.value.has(e.link_type)
    )
  })

  // Storylines are managed by separate store - expose computed for compatibility
  const storylines = computed(() => storylinesStore.storylines)
  const storylineNodes = computed(() => storylinesStore.storylineNodes)
  const storylineNodesVersion = computed(() => storylinesStore.storylineNodesVersion)
  const filteredStorylines = computed(() => storylinesStore.filteredStorylines)

  return {
    edges,
    frames,
    selectedFrameId,
    workspaces,
    currentWorkspaceId,
    selectedNodeId,
    selectedNode,
    filteredNodes,
    filteredEdges,
    filteredFrames,
    storylines,
    storylineNodes,
    storylineNodesVersion,
    filteredStorylines,
  }
}

/**
 * Create dependencies object for other modules
 */
export function createDependencies(
  state: NodeStoreState,
  computed: NodeStoreComputed,
  stores: ReturnType<typeof createStoreInstances>
): NodeStoreDependencies {
  return {
    state,
    computed,
    ...stores,
  }
}

/**
 * Initialize the store by loading data from backend
 */
export async function initializeStore(
  deps: NodeStoreDependencies,
  _createNode: (data: import('./types').CreateNodeInput) => Promise<Node>
): Promise<void> {
  const { state, edgesStore, framesStore, workspaceStore, storylinesStore, computed } = deps

  state.loading.value = true
  state.error.value = null
  try {
    // Initialize workspace store (syncs localStorage with database)
    await workspaceStore.initialize()

    // Initialize edges and frames stores with current workspace
    // Convert "default" to null for backend compatibility
    const currentWorkspace = workspaceStore.currentWorkspaceId
    const workspaceForBackend = currentWorkspace === 'default' ? null : currentWorkspace
    storeLogger.debug(`[Nodes] Current workspace after init: ${currentWorkspace} (backend: ${workspaceForBackend})`)

    await Promise.all([
      edgesStore.initialize(workspaceForBackend),
      framesStore.initialize(),
    ])

    // Load nodes
    const fetchedNodes = await invoke<Node[]>('get_nodes')
    state.nodes.value = fetchedNodes

    // Debug: log node sizes from database
    console.log('[Nodes] Node sizes from DB:', fetchedNodes.slice(0, 5).map(n => ({ id: n.id.slice(0, 8), title: n.title, width: n.width, height: n.height })))

    storeLogger.debug(`[Nodes] Loaded ${fetchedNodes.length} total nodes`)
    const workspaceIds = [...new Set(fetchedNodes.map(n => n.workspace_id))]
    storeLogger.debug(`[Nodes] Workspace IDs in nodes: ${JSON.stringify(workspaceIds)}`)
    storeLogger.debug(`[Nodes] Filtered nodes count: ${computed.filteredNodes.value.length}`)

    // Set up node existence callback for edge validation
    edgesStore.setNodeExistsCallback((id) => state.nodes.value.some(n => n.id === id))

    // Initialize storylines store with dependencies
    storylinesStore.setDependencies({
      getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
      getEdges: () => edgesStore.edges,
      getNodes: () => state.nodes.value,
      createEdge: (data) => edgesStore.createEdge(data),
      deleteEdge: (id) => edgesStore.deleteEdge(id),
    })

    // Load storylines separately (may fail if migration hasn't run)
    try {
      await storylinesStore.loadStorylines()
    } catch (e) {
      storeLogger.warn('Failed to load storylines (migration may not have run yet):', e)
    }
  } catch (e) {
    state.error.value = String(e)
    storeLogger.error('Failed to load nodes:', e)
    notifications$.error('Failed to load data', 'Using offline mode with sample data')
    state.nodes.value = createMockNodes()
  } finally {
    state.loading.value = false
  }
}

/**
 * Get a node by ID
 */
export function getNode(nodes: Node[], id: string): Node | undefined {
  return nodes.find(n => n.id === id)
}

/**
 * Get IDs of all nodes directly connected to the given node
 */
export function getNeighborIds(edges: import('./types').Edge[], nodeId: string): string[] {
  const neighbors: string[] = []
  for (const edge of edges) {
    if (edge.source_node_id === nodeId) {
      neighbors.push(edge.target_node_id)
    } else if (edge.target_node_id === nodeId) {
      neighbors.push(edge.source_node_id)
    }
  }
  return neighbors
}

/**
 * Find a node by title (case-insensitive)
 */
export function findNodeByTitle(nodes: Node[], title: string): Node | undefined {
  const lowerTitle = title.toLowerCase()
  return nodes.find(n => n.title.toLowerCase() === lowerTitle)
}

/**
 * Select a node, optionally adding to existing selection
 */
export function selectNode(
  selectedNodeIds: import('vue').Ref<string[]>,
  id: string | null,
  addToSelection = false
): void {
  if (id === null) {
    selectedNodeIds.value = []
  } else if (addToSelection) {
    // Toggle selection
    const idx = selectedNodeIds.value.indexOf(id)
    if (idx >= 0) {
      selectedNodeIds.value.splice(idx, 1)
    } else {
      selectedNodeIds.value.push(id)
    }
  } else {
    selectedNodeIds.value = [id]
  }
}
