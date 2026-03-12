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

    // Categorize direct neighbors (depth 1) by relationship
    const edges = store.getFilteredEdges()
    const incomingFrom = new Set<string>()
    const outgoingTo = new Set<string>()

    for (const edge of edges) {
      if (edge.target_node_id === focusId && edge.source_node_id !== focusId) {
        incomingFrom.add(edge.source_node_id)
      }
      if (edge.source_node_id === focusId && edge.target_node_id !== focusId) {
        outgoingTo.add(edge.target_node_id)
      }
    }

    const parents: string[] = []
    const children: string[] = []
    const siblings: string[] = []

    for (const id of incomingFrom) {
      if (outgoingTo.has(id)) {
        siblings.push(id)
      } else {
        parents.push(id)
      }
    }
    for (const id of outgoingTo) {
      if (!incomingFrom.has(id)) {
        children.push(id)
      }
    }

    // Calculate center of viewport in canvas coordinates
    const viewCenterX = (rect.width / 2 - viewState.offsetX.value) / viewState.scale.value
    const viewCenterY = (rect.height / 2 - viewState.offsetY.value) / viewState.scale.value

    // Layout setup
    const positions = new Map<string, { x: number; y: number }>()
    const focusWidth = focusNode.width || NODE_DEFAULTS.WIDTH
    const focusHeight = focusNode.height || NODE_DEFAULTS.HEIGHT
    const verticalGap = LAYOUT_GAPS.VERTICAL
    const horizontalGap = LAYOUT_GAPS.HORIZONTAL

    // Focus node at center
    positions.set(focusId, {
      x: viewCenterX - focusWidth / 2,
      y: viewCenterY - focusHeight / 2,
    })

    // Track positioned depth-1 nodes for ring layout of deeper nodes
    const positionedDepth1 = new Set<string>()

    // Layout parents above
    if (parents.length > 0) {
      const totalWidth = parents.reduce((sum, id) => {
        const n = store.getNode(id)
        return sum + (n?.width || NODE_DEFAULTS.WIDTH) + horizontalGap
      }, -horizontalGap)
      let xOffset = viewCenterX - totalWidth / 2

      parents.forEach(parentId => {
        const n = store.getNode(parentId)
        const nodeWidth = n?.width || NODE_DEFAULTS.WIDTH
        const nodeHeight = n?.height || NODE_DEFAULTS.HEIGHT
        positions.set(parentId, {
          x: xOffset,
          y: viewCenterY - focusHeight / 2 - verticalGap - nodeHeight,
        })
        xOffset += nodeWidth + horizontalGap
        positionedDepth1.add(parentId)
      })
    }

    // Layout children below
    if (children.length > 0) {
      const totalWidth = children.reduce((sum, id) => {
        const n = store.getNode(id)
        return sum + (n?.width || NODE_DEFAULTS.WIDTH) + horizontalGap
      }, -horizontalGap)
      let xOffset = viewCenterX - totalWidth / 2

      children.forEach(childId => {
        const n = store.getNode(childId)
        const nodeWidth = n?.width || NODE_DEFAULTS.WIDTH
        positions.set(childId, {
          x: xOffset,
          y: viewCenterY + focusHeight / 2 + verticalGap,
        })
        xOffset += nodeWidth + horizontalGap
        positionedDepth1.add(childId)
      })
    }

    // Layout siblings on left and right
    if (siblings.length > 0) {
      const siblingGap = LAYOUT_GAPS.SIBLING_GAP
      const verticalSpacing = LAYOUT_GAPS.SIBLING_VERTICAL

      const leftSiblings = siblings.filter((_, i) => i % 2 === 0)
      const rightSiblings = siblings.filter((_, i) => i % 2 === 1)

      // Left siblings
      const leftTotalHeight = leftSiblings.reduce((sum, id) => {
        const n = store.getNode(id)
        return sum + (n?.height || NODE_DEFAULTS.HEIGHT) + verticalSpacing
      }, -verticalSpacing)
      let yOffset = viewCenterY - leftTotalHeight / 2

      leftSiblings.forEach(sibId => {
        const n = store.getNode(sibId)
        const nodeWidth = n?.width || NODE_DEFAULTS.WIDTH
        const nodeHeight = n?.height || NODE_DEFAULTS.HEIGHT
        positions.set(sibId, {
          x: viewCenterX - focusWidth / 2 - siblingGap - nodeWidth,
          y: yOffset,
        })
        yOffset += nodeHeight + verticalSpacing
        positionedDepth1.add(sibId)
      })

      // Right siblings
      const rightTotalHeight = rightSiblings.reduce((sum, id) => {
        const n = store.getNode(id)
        return sum + (n?.height || NODE_DEFAULTS.HEIGHT) + verticalSpacing
      }, -verticalSpacing)
      yOffset = viewCenterY - rightTotalHeight / 2

      rightSiblings.forEach(sibId => {
        const n = store.getNode(sibId)
        const nodeHeight = n?.height || NODE_DEFAULTS.HEIGHT
        positions.set(sibId, {
          x: viewCenterX + focusWidth / 2 + siblingGap,
          y: yOffset,
        })
        yOffset += nodeHeight + verticalSpacing
        positionedDepth1.add(sibId)
      })
    }

    // Layout deeper nodes (depth 2+) in concentric rings
    if (neighborhoodDepth.value > 1) {
      const nodesByDepth = computeNodesByDepth(focusId)
      const ringSpacing = 300

      for (let depth = 2; depth <= neighborhoodDepth.value; depth++) {
        const nodesAtDepth = nodesByDepth.get(depth)
        if (!nodesAtDepth || nodesAtDepth.length === 0) continue

        const radius = (depth - 1) * ringSpacing + 350 // Start beyond depth-1 nodes
        const angleStep = (2 * Math.PI) / nodesAtDepth.length
        const startAngle = -Math.PI / 2

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
