/**
 * Neighborhood View Composable
 * Shows only the focus node and its direct neighbors with independent layout
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'

export interface NeighborhoodNode {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  [key: string]: unknown
}

export interface NeighborhoodEdge {
  id: string
  source_node_id: string
  target_node_id: string
  [key: string]: unknown
}

export interface UseNeighborhoodViewOptions {
  getNode: (id: string) => NeighborhoodNode | undefined
  filteredNodes: ComputedRef<NeighborhoodNode[]>
  filteredEdges: ComputedRef<NeighborhoodEdge[]>
  selectedNodeIds: ComputedRef<string[]>
  getViewportRect: () => DOMRect | null
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
}

export function useNeighborhoodView(options: UseNeighborhoodViewOptions) {
  const {
    getNode,
    filteredNodes,
    filteredEdges,
    selectedNodeIds,
    getViewportRect,
    scale,
    offsetX,
    offsetY,
  } = options

  // State
  const isActive = ref(false)
  const focusNodeId = ref<string | null>(null)
  const positions = ref<Map<string, { x: number; y: number }>>(new Map())

  // Get IDs of nodes in the neighborhood
  const neighborhoodNodeIds = computed<Set<string> | null>(() => {
    if (!isActive.value || !focusNodeId.value) return null

    const neighbors = new Set<string>([focusNodeId.value])
    for (const edge of filteredEdges.value) {
      if (edge.source_node_id === focusNodeId.value) {
        neighbors.add(edge.target_node_id)
      }
      if (edge.target_node_id === focusNodeId.value) {
        neighbors.add(edge.source_node_id)
      }
    }
    return neighbors
  })

  // Nodes with neighborhood positions applied
  const displayNodes = computed(() => {
    if (!neighborhoodNodeIds.value) {
      return filteredNodes.value
    }

    const pos = positions.value
    return filteredNodes.value
      .filter(n => neighborhoodNodeIds.value!.has(n.id))
      .map(n => {
        const p = pos.get(n.id)
        if (p) {
          return { ...n, canvas_x: p.x, canvas_y: p.y }
        }
        return n
      })
  })

  // Layout the neighborhood
  function layoutNeighborhood(focusId: string): boolean {
    const rect = getViewportRect()
    if (!rect) return false

    const focusNode = getNode(focusId)
    if (!focusNode) return false

    // Categorize neighbors
    const incomingFrom = new Set<string>()
    const outgoingTo = new Set<string>()

    for (const edge of filteredEdges.value) {
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

    // Calculate viewport center
    const viewCenterX = (rect.width / 2 - offsetX.value) / scale.value
    const viewCenterY = (rect.height / 2 - offsetY.value) / scale.value

    // Layout parameters
    const newPositions = new Map<string, { x: number; y: number }>()
    const focusWidth = focusNode.width || 200
    const focusHeight = focusNode.height || 120
    const verticalGap = 200
    const horizontalGap = 50

    // Focus node at center
    newPositions.set(focusId, {
      x: viewCenterX - focusWidth / 2,
      y: viewCenterY - focusHeight / 2,
    })

    // Layout parents above
    if (parents.length > 0) {
      const totalWidth = parents.reduce((sum, id) => {
        const n = getNode(id)
        return sum + (n?.width || 200) + horizontalGap
      }, -horizontalGap)
      let xOffset = viewCenterX - totalWidth / 2

      parents.forEach(parentId => {
        const n = getNode(parentId)
        const nodeWidth = n?.width || 200
        const nodeHeight = n?.height || 120
        newPositions.set(parentId, {
          x: xOffset,
          y: viewCenterY - focusHeight / 2 - verticalGap - nodeHeight,
        })
        xOffset += nodeWidth + horizontalGap
      })
    }

    // Layout children below
    if (children.length > 0) {
      const totalWidth = children.reduce((sum, id) => {
        const n = getNode(id)
        return sum + (n?.width || 200) + horizontalGap
      }, -horizontalGap)
      let xOffset = viewCenterX - totalWidth / 2

      children.forEach(childId => {
        const n = getNode(childId)
        const nodeWidth = n?.width || 200
        newPositions.set(childId, {
          x: xOffset,
          y: viewCenterY + focusHeight / 2 + verticalGap,
        })
        xOffset += nodeWidth + horizontalGap
      })
    }

    // Layout siblings on left and right
    if (siblings.length > 0) {
      const horizontalDistance = 350
      const verticalSpacing = 30

      const leftSiblings = siblings.filter((_, i) => i % 2 === 0)
      const rightSiblings = siblings.filter((_, i) => i % 2 === 1)

      // Left
      const leftTotalHeight = leftSiblings.reduce((sum, id) => {
        const n = getNode(id)
        return sum + (n?.height || 120) + verticalSpacing
      }, -verticalSpacing)
      let yOffset = viewCenterY - leftTotalHeight / 2

      leftSiblings.forEach(sibId => {
        const n = getNode(sibId)
        const nodeWidth = n?.width || 200
        const nodeHeight = n?.height || 120
        newPositions.set(sibId, {
          x: viewCenterX - horizontalDistance - nodeWidth / 2,
          y: yOffset,
        })
        yOffset += nodeHeight + verticalSpacing
      })

      // Right
      const rightTotalHeight = rightSiblings.reduce((sum, id) => {
        const n = getNode(id)
        return sum + (n?.height || 120) + verticalSpacing
      }, -verticalSpacing)
      yOffset = viewCenterY - rightTotalHeight / 2

      rightSiblings.forEach(sibId => {
        const n = getNode(sibId)
        const nodeWidth = n?.width || 200
        const nodeHeight = n?.height || 120
        newPositions.set(sibId, {
          x: viewCenterX + horizontalDistance - nodeWidth / 2,
          y: yOffset,
        })
        yOffset += nodeHeight + verticalSpacing
      })
    }

    positions.value = newPositions

    // Center view on focus node
    const focusPos = newPositions.get(focusId)
    if (focusPos) {
      const nodeCenterX = focusPos.x + focusWidth / 2
      const nodeCenterY = focusPos.y + focusHeight / 2
      offsetX.value = rect.width / 2 - nodeCenterX * scale.value
      offsetY.value = rect.height / 2 - nodeCenterY * scale.value
    }

    return true
  }

  // Toggle neighborhood mode
  function toggle(nodeId?: string) {
    const targetId = nodeId || selectedNodeIds.value[0]

    if (isActive.value && focusNodeId.value === targetId) {
      // Exit neighborhood mode
      isActive.value = false
      focusNodeId.value = null
      positions.value = new Map()
    } else if (targetId) {
      // Enter or navigate
      focusNodeId.value = targetId
      layoutNeighborhood(targetId)
      isActive.value = true
    }
  }

  // Navigate to a neighbor
  function navigateTo(nodeId: string) {
    if (isActive.value && nodeId !== focusNodeId.value) {
      focusNodeId.value = nodeId
      layoutNeighborhood(nodeId)
    }
  }

  return {
    isActive,
    focusNodeId,
    neighborhoodNodeIds,
    displayNodes,
    toggle,
    navigateTo,
  }
}
