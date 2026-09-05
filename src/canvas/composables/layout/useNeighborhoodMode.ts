/**
 * Neighborhood mode composable
 * Handles focus node view, arranging the subgraph with the canvas layouts
 */
import { ref, computed, type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { computeRadialLayout } from './useRadialLayout'
import type { LayoutOverlay } from './useLayout'
import type { Node } from '../../../types'

interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
  directed?: boolean
}

interface Store {
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getNode: (id: string) => Node | undefined
  getSelectedNodeIds: () => string[]
  /** Version counter that increments when node list or positions change */
  nodeLayoutVersion?: Ref<number> | { value: number }
}

interface ViewState {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  canvasRect: () => DOMRect | null
}

export interface UseNeighborhoodModeOptions {
  store: Store
  viewState: ViewState
}

export function useNeighborhoodMode(options: UseNeighborhoodModeOptions) {
  const { store, viewState } = options

  // State
  const neighborhoodMode = ref(false)
  const focusNodeId = ref<string | null>(null)
  const neighborhoodPositions = ref<Map<string, { x: number; y: number }>>(new Map())
  const neighborhoodDepth = ref(1) // Number of edges away to include

  // Get IDs of nodes within N hops of focus node
  const neighborhoodNodeIds = computed(() => {
    if (!neighborhoodMode.value || !focusNodeId.value) return null

    const edges = store.getFilteredEdges()
    const neighbors = new Set<string>([focusNodeId.value])
    let frontier = new Set<string>([focusNodeId.value])

    // BFS to find nodes up to N hops away
    for (let depth = 0; depth < neighborhoodDepth.value; depth++) {
      const nextFrontier = new Set<string>()
      for (const nodeId of frontier) {
        for (const edge of edges) {
          if (edge.source_node_id === nodeId && !neighbors.has(edge.target_node_id)) {
            neighbors.add(edge.target_node_id)
            nextFrontier.add(edge.target_node_id)
          }
          if (edge.target_node_id === nodeId && !neighbors.has(edge.source_node_id)) {
            neighbors.add(edge.source_node_id)
            nextFrontier.add(edge.source_node_id)
          }
        }
      }
      frontier = nextFrontier
      if (frontier.size === 0) break
    }

    return neighbors
  })

  // Nodes to display (filtered by neighborhood if active, with local positions)
  const displayNodes = computed(() => {
    // Track nodeLayoutVersion for reactivity when nodes are added/removed
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    store.nodeLayoutVersion?.value
    const nodes = store.getFilteredNodes()
    if (neighborhoodNodeIds.value) {
      const positions = neighborhoodPositions.value
      return nodes
        .filter(n => neighborhoodNodeIds.value!.has(n.id))
        .map(n => {
          const pos = positions.get(n.id)
          if (pos) {
            return { ...n, canvas_x: pos.x, canvas_y: pos.y }
          }
          return n
        })
    }
    return nodes
  })

  // Get visual node (with correct position accounting for neighborhood mode)
  function getVisualNode(nodeId: string) {
    return displayNodes.value.find(n => n.id === nodeId)
  }

  // Toggle neighborhood mode for a node
  function toggle(nodeId?: string) {
    // If already in neighborhood mode, pressing toggle again exits (regardless of selection)
    if (neighborhoodMode.value) {
      neighborhoodMode.value = false
      focusNodeId.value = null
      neighborhoodPositions.value = new Map()
      return
    }

    // Enter neighborhood mode on selected or specified node
    const targetId = nodeId || store.getSelectedNodeIds()[0]
    if (targetId) {
      focusNodeId.value = targetId
      layout(targetId)
      neighborhoodMode.value = true
    }
  }

  // Compute nodes organized by depth level from focus
  function computeNodesByDepth(focusId: string): Map<number, string[]> {
    const edges = store.getFilteredEdges()
    const nodesByDepth = new Map<number, string[]>()
    const visited = new Set<string>([focusId])

    nodesByDepth.set(0, [focusId])
    let frontier = new Set<string>([focusId])

    for (let depth = 1; depth <= neighborhoodDepth.value; depth++) {
      const nodesAtDepth: string[] = []
      const nextFrontier = new Set<string>()

      for (const nodeId of frontier) {
        for (const edge of edges) {
          let neighborId: string | null = null
          if (edge.source_node_id === nodeId && !visited.has(edge.target_node_id)) {
            neighborId = edge.target_node_id
          } else if (edge.target_node_id === nodeId && !visited.has(edge.source_node_id)) {
            neighborId = edge.source_node_id
          }
          if (neighborId) {
            visited.add(neighborId)
            nodesAtDepth.push(neighborId)
            nextFrontier.add(neighborId)
          }
        }
      }

      if (nodesAtDepth.length > 0) {
        nodesByDepth.set(depth, nodesAtDepth)
      }
      frontier = nextFrontier
      if (frontier.size === 0) break
    }

    return nodesByDepth
  }

  // Layout neighborhood nodes with focus node centered
  /**
   * Arrange the neighbourhood with the canvas radial layout.
   *
   * The subgraph used to be placed by a family tree of its own - parents in a
   * row above, children in a row below, siblings in two columns split by list
   * parity - so every neighbour of a hub landed in one row: measured at 13,650px
   * across for forty neighbours, where a ring stays bounded. Depth 2+ already
   * used rings, leaving the immediate neighbours as the only ones without them.
   * The canvas layout algorithms are pure and return the same position map this
   * mode overlays, so it calls one instead of keeping a placement of its own
   * (PRODUCT_DESIGN.md > Neighborhood Mode).
   */
  function layout(focusId: string): boolean {
    const rect = viewState.canvasRect()
    if (!rect) return false

    const focusNode = store.getNode(focusId)
    if (!focusNode) return false

    const ids = new Set<string>([focusId])
    for (const atDepth of computeNodesByDepth(focusId).values()) {
      for (const id of atDepth) ids.add(id)
    }

    const nodes = store.getFilteredNodes().filter(n => ids.has(n.id))
    const edges = store
      .getFilteredEdges()
      .filter(e => ids.has(e.source_node_id) && ids.has(e.target_node_id))

    const result = computeRadialLayout({
      getSelectedNodeIds: () => [focusId],
      getNode: store.getNode,
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => edges,
      // The mode is an overlay and draws no frames, so nothing in it may be
      // constrained to one.
      getFilteredFrames: () => [],
      applyFrameConstraints: positions => positions,
    })
    if (!result) return false

    neighborhoodPositions.value = result.targets

    // Center view on focus node
    const focusPos = result.targets.get(focusId) ?? {
      x: focusNode.canvas_x,
      y: focusNode.canvas_y,
    }
    const nodeCenterX = focusPos.x + (focusNode.width || NODE_DEFAULTS.WIDTH) / 2
    const nodeCenterY = focusPos.y + (focusNode.height || NODE_DEFAULTS.HEIGHT) / 2
    viewState.offsetX.value = rect.width / 2 - nodeCenterX * viewState.scale.value
    viewState.offsetY.value = rect.height / 2 - nodeCenterY * viewState.scale.value

    return true
  }

  /**
   * The overlay a layout run should target while this mode is open, or null.
   *
   * Handing this to useLayout is what makes the layout controls act on what is
   * on screen instead of the whole canvas, without either side reaching into the
   * other (PRODUCT_DESIGN.md > Neighborhood Mode).
   */
  function getLayoutOverlay(): LayoutOverlay | null {
    const ids = neighborhoodNodeIds.value
    if (!neighborhoodMode.value || !ids) return null
    return {
      nodeIds: ids,
      centerId: focusNodeId.value,
      apply: positions => {
        neighborhoodPositions.value = positions
      },
    }
  }

  // Navigate to a different node in neighborhood mode
  function navigateTo(nodeId: string) {
    if (neighborhoodMode.value && nodeId !== focusNodeId.value) {
      focusNodeId.value = nodeId
      layout(nodeId)
    }
  }

  // Exit neighborhood mode (e.g., when workspace changes)
  function exit() {
    neighborhoodMode.value = false
    focusNodeId.value = null
  }

  // Set depth and relayout if in neighborhood mode
  function setDepth(depth: number) {
    neighborhoodDepth.value = Math.max(1, Math.min(5, depth)) // Clamp 1-5
    if (neighborhoodMode.value && focusNodeId.value) {
      layout(focusNodeId.value)
    }
  }

  return {
    // State
    neighborhoodMode,
    focusNodeId,
    neighborhoodPositions,
    neighborhoodNodeIds,
    getLayoutOverlay,
    neighborhoodDepth,
    displayNodes,

    // Functions
    toggle,
    layout,
    navigateTo,
    getVisualNode,
    setDepth,
    exit,
  }
}
