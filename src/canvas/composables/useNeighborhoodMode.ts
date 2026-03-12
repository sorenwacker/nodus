/**
 * Neighborhood mode composable
 * Handles focus node view with hierarchical layout of connected nodes
 */
import { ref, computed, type Ref } from 'vue'
import { NODE_DEFAULTS, LAYOUT_GAPS } from '../constants'

interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

interface Store {
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getNode: (id: string) => Node | undefined
  getSelectedNodeIds: () => string[]
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
    const targetId = nodeId || store.getSelectedNodeIds()[0] || focusNodeId.value

    // If already in neighborhood mode and clicking the same node (or no node specified), exit
    if (neighborhoodMode.value && (!nodeId || focusNodeId.value === targetId)) {
      neighborhoodMode.value = false
      focusNodeId.value = null
      neighborhoodPositions.value = new Map()
    } else if (targetId) {
      // Enter or navigate to new focus
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
  function layout(focusId: string): boolean {
    const rect = viewState.canvasRect()
    if (!rect) return false

    const focusNode = store.getNode(focusId)
    if (!focusNode) return false

    // Calculate center of viewport in canvas coordinates
    const viewCenterX = (rect.width / 2 - viewState.offsetX.value) / viewState.scale.value
    const viewCenterY = (rect.height / 2 - viewState.offsetY.value) / viewState.scale.value

    // Layout setup
    const positions = new Map<string, { x: number; y: number }>()
    const focusWidth = focusNode.width || NODE_DEFAULTS.WIDTH
    const focusHeight = focusNode.height || NODE_DEFAULTS.HEIGHT

    // Focus node at center
    positions.set(focusId, {
      x: viewCenterX - focusWidth / 2,
      y: viewCenterY - focusHeight / 2,
    })

    // Get nodes organized by depth
    const nodesByDepth = computeNodesByDepth(focusId)

    // Layout each depth level in concentric rings
    const ringSpacing = 250 // Distance between rings

    for (let depth = 1; depth <= neighborhoodDepth.value; depth++) {
      const nodesAtDepth = nodesByDepth.get(depth)
      if (!nodesAtDepth || nodesAtDepth.length === 0) continue

      const radius = depth * ringSpacing
      const angleStep = (2 * Math.PI) / nodesAtDepth.length
      const startAngle = -Math.PI / 2 // Start from top

      nodesAtDepth.forEach((nodeId, index) => {
        const n = store.getNode(nodeId)
        const nodeWidth = n?.width || NODE_DEFAULTS.WIDTH
        const nodeHeight = n?.height || NODE_DEFAULTS.HEIGHT
        const angle = startAngle + index * angleStep

        positions.set(nodeId, {
          x: viewCenterX + radius * Math.cos(angle) - nodeWidth / 2,
          y: viewCenterY + radius * Math.sin(angle) - nodeHeight / 2,
        })
      })
    }

    // Store positions
    neighborhoodPositions.value = positions

    // Center view on focus node
    const focusPos = positions.get(focusId)
    if (focusPos) {
      const nodeCenterX = focusPos.x + focusWidth / 2
      const nodeCenterY = focusPos.y + focusHeight / 2
      viewState.offsetX.value = rect.width / 2 - nodeCenterX * viewState.scale.value
      viewState.offsetY.value = rect.height / 2 - nodeCenterY * viewState.scale.value
    }

    return true
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
