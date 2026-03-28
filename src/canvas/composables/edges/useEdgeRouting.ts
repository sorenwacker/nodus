/**
 * Edge routing composable
 *
 * Computes edge paths with routing, port assignments, and optimization for large graphs
 */

import { computed, ref, watch, type Ref, type ComputedRef } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import {
  routeAllEdges,
  assignPorts,
  calculatePortOffset,
  getSide,
  getPortPoint,
  getStandoff,
  getAngledStandoff,
  SpatialIndex,
  setRoutingSpatialIndex,
  type NodeRect,
  type EdgeStyle,
} from '../../routing'
import type { Node, Edge } from '../../../types'

export interface EdgeLine {
  id: string
  source_node_id: string
  target_node_id: string
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
  path: string
  style: string
  strokeWidth: number
  hitX1: number
  hitY1: number
  hitX2: number
  hitY2: number
  link_type: string | null
  color?: string | null
  label: string | null
  isBidirectional: boolean
  isShortEdge: boolean
  debugInfo?: unknown
}

export interface UseEdgeRoutingContext {
  store: {
    nodeLayoutVersion: number
    nodes: Node[]
    edges: Edge[]
    filteredEdges: Edge[]
  }
  displayNodes: ComputedRef<Node[]>
  neighborhoodMode: Ref<boolean>
  focusNodeId: Ref<string | null>
  isMassiveGraph: ComputedRef<boolean>
  isHugeGraph: ComputedRef<boolean>
  globalEdgeStyle: Ref<string>
  edgeStyleMap: Ref<Record<string, string>>
  getNodeHeight: (
    node: { height?: number; markdown_content: string | null },
    respectCollapse?: boolean
  ) => number
  /** When true, skip complex routing and use cached edges (for drag performance) */
  isDragging?: Ref<boolean>
  /** When true, skip complex routing and use cached edges (for zoom performance) */
  isZooming?: Ref<boolean>
}

export interface UseEdgeRoutingReturn {
  edgeLines: ComputedRef<EdgeLine[]>
}

export function useEdgeRouting(ctx: UseEdgeRoutingContext): UseEdgeRoutingReturn {
  const {
    store,
    displayNodes,
    neighborhoodMode,
    focusNodeId,
    isMassiveGraph,
    isHugeGraph,
    globalEdgeStyle,
    edgeStyleMap,
    getNodeHeight,
    isDragging,
    isZooming,
  } = ctx

  // Combined flag for deferring expensive routing
  const isDeferringRouting = () => isDragging?.value || isZooming?.value

  // Cache for routed edges - only recalculate when not dragging
  const cachedRoutedEdges = ref<Map<
    string,
    {
      svgPath: string
      strokeWidth?: number
      path?: Array<{ x: number; y: number }>
      debugInfo?: unknown
    }
  > | null>(null)
  const lastRoutingKey = ref('')

  // Recalculate routing when drag ends
  watch(
    () => isDragging?.value,
    (dragging, wasDragging) => {
      if (wasDragging && !dragging) {
        // Drag ended - invalidate cache to trigger re-routing
        lastRoutingKey.value = ''
      }
    }
  )

  const edgeLines = computed((): EdgeLine[] => {
    // Only track edge count and layout version for routing triggers (not every position)
    const _layoutVersion = store.nodeLayoutVersion
    const _edgeCount = store.edges.length
    void _layoutVersion
    void _edgeCount

    let edges = store.filteredEdges

    // Deduplicate only exact duplicate edges
    const seenEdgeIds = new Set<string>()
    edges = edges.filter(e => {
      if (seenEdgeIds.has(e.id)) return false
      seenEdgeIds.add(e.id)
      return true
    })

    // Filter edges for neighborhood mode
    if (neighborhoodMode.value && focusNodeId.value) {
      const focusId = focusNodeId.value
      edges = edges.filter(e => e.source_node_id === focusId || e.target_node_id === focusId)
    }

    // MASSIVE GRAPH OPTIMIZATION: Simple center-to-center lines
    if (isMassiveGraph.value) {
      const nodeMap = new Map(displayNodes.value.map(n => [n.id, n]))

      return edges
        .map(edge => {
          const source = nodeMap.get(edge.source_node_id)
          const target = nodeMap.get(edge.target_node_id)
          if (!source || !target) return null

          const sw = source.width || NODE_DEFAULTS.WIDTH
          const sh = source.height || NODE_DEFAULTS.HEIGHT
          const tw = target.width || NODE_DEFAULTS.WIDTH
          const th = target.height || NODE_DEFAULTS.HEIGHT

          const x1 = source.canvas_x + sw / 2
          const y1 = source.canvas_y + sh / 2
          const x2 = target.canvas_x + tw / 2
          const y2 = target.canvas_y + th / 2

          const path = `M${x1},${y1} L${x2},${y2}`

          return {
            id: edge.id,
            source_node_id: edge.source_node_id,
            target_node_id: edge.target_node_id,
            x1,
            y1,
            x2,
            y2,
            labelX: (x1 + x2) / 2,
            labelY: (y1 + y2) / 2,
            path,
            style: 'straight',
            strokeWidth: 1,
            hitX1: x1,
            hitY1: y1,
            hitX2: x2,
            hitY2: y2,
            link_type: edge.link_type,
            color: edge.color,
            label: edge.label,
            isBidirectional: false,
            isShortEdge: Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) < 50,
            debugInfo: undefined,
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null) as EdgeLine[]
    }

    // Build node map for efficient lookup
    const nodeMap = new Map<string, NodeRect>()
    for (const node of displayNodes.value) {
      nodeMap.set(node.id, {
        id: node.id,
        canvas_x: node.canvas_x,
        canvas_y: node.canvas_y,
        width: node.width || NODE_DEFAULTS.WIDTH,
        height: getNodeHeight(node, false),
      })
    }

    // Filter edges to only those with valid source and target nodes
    edges = edges.filter(e => nodeMap.has(e.source_node_id) && nodeMap.has(e.target_node_id))

    // Deduplicate edges by source-target pair
    const seenPairs = new Set<string>()
    edges = edges.filter(e => {
      if (e.storyline_id) return true
      const ids = [e.source_node_id, e.target_node_id].sort()
      const key = `${ids[0]}:${ids[1]}`
      if (seenPairs.has(key)) return false
      seenPairs.add(key)
      return true
    })

    // Pre-compute bidirectional edge set for O(1) lookup (instead of O(m) per edge)
    const bidirectionalEdges = new Set<string>()
    for (const e of edges) {
      const reverseKey = `${e.target_node_id}:${e.source_node_id}`
      if (seenPairs.has(reverseKey) || bidirectionalEdges.has(reverseKey)) {
        bidirectionalEdges.add(`${e.source_node_id}:${e.target_node_id}`)
        bidirectionalEdges.add(reverseKey)
      }
    }

    const style = globalEdgeStyle.value

    // Convert edges to EdgeDef format for routing
    const edgeDefs = edges.map(e => ({
      id: e.id,
      source_node_id: e.source_node_id,
      target_node_id: e.target_node_id,
    }))

    const nodeRects = displayNodes.value.map(n => ({
      id: n.id,
      canvas_x: n.canvas_x,
      canvas_y: n.canvas_y,
      width: n.width || NODE_DEFAULTS.WIDTH,
      height: getNodeHeight(n, false),
    }))

    // Compute port assignments
    const edgeInfos: Array<{
      edge: { id: string; source_node_id: string; target_node_id: string }
      source: NodeRect
      target: NodeRect
      sourceSide: 'left' | 'right' | 'top' | 'bottom'
      targetSide: 'left' | 'right' | 'top' | 'bottom'
    }> = []

    for (const edge of edgeDefs) {
      const source = nodeMap.get(edge.source_node_id)!
      const target = nodeMap.get(edge.target_node_id)!
      const targetCx = target.canvas_x + (target.width || NODE_DEFAULTS.WIDTH) / 2
      const targetCy = target.canvas_y + (target.height || NODE_DEFAULTS.HEIGHT) / 2
      const sourceCx = source.canvas_x + (source.width || NODE_DEFAULTS.WIDTH) / 2
      const sourceCy = source.canvas_y + (source.height || NODE_DEFAULTS.HEIGHT) / 2

      const sourceSide = getSide(source, targetCx, targetCy)
      const targetSide = getSide(target, sourceCx, sourceCy)

      edgeInfos.push({ edge, source, target, sourceSide, targetSide })
    }

    const { sourceAssignments, targetAssignments } = assignPorts(edgeInfos)

    // Build spatial index and route edges
    // Skip complex routing during drag for performance - use cached or simple lines
    const effectiveStyle: EdgeStyle = style as EdgeStyle
    let routedEdges: Map<
      string,
      {
        svgPath: string
        strokeWidth?: number
        path?: Array<{ x: number; y: number }>
        debugInfo?: unknown
      }
    > | null = null

    // Create a key to detect when routing needs recalculation
    const routingKey = `${edges.length}-${style}-${store.nodeLayoutVersion}`

    if (!isDeferringRouting() && routingKey !== lastRoutingKey.value) {
      // Not dragging/zooming and cache is stale - recalculate routing
      const spatialIndex = new SpatialIndex()
      spatialIndex.build(nodeMap)
      setRoutingSpatialIndex(spatialIndex)

      try {
        routedEdges = routeAllEdges(edgeDefs, nodeRects, nodeMap, effectiveStyle)
        cachedRoutedEdges.value = routedEdges
        lastRoutingKey.value = routingKey
      } finally {
        setRoutingSpatialIndex(null)
      }
    } else {
      // During drag OR cache is valid - use cached routing
      // This keeps edges stable during drag instead of falling back to simple lines
      routedEdges = cachedRoutedEdges.value
    }

    // Sort edges to minimize crossings
    const sortedEdges = [...edges].sort((a, b) => {
      const sourceA = nodeMap.get(a.source_node_id)
      const targetA = nodeMap.get(a.target_node_id)
      const sourceB = nodeMap.get(b.source_node_id)
      const targetB = nodeMap.get(b.target_node_id)
      if (!sourceA || !targetA || !sourceB || !targetB) return 0

      const midAx = (sourceA.canvas_x + targetA.canvas_x) / 2
      const midAy = (sourceA.canvas_y + targetA.canvas_y) / 2
      const midBx = (sourceB.canvas_x + targetB.canvas_x) / 2
      const midBy = (sourceB.canvas_y + targetB.canvas_y) / 2

      if (Math.abs(midAy - midBy) > 50) return midAy - midBy
      return midAx - midBx
    })

    return sortedEdges
      .map(edge => {
        const source = nodeMap.get(edge.source_node_id)
        const target = nodeMap.get(edge.target_node_id)
        if (!source || !target) return null

        const sw = source.width || NODE_DEFAULTS.WIDTH
        const sh = source.height || NODE_DEFAULTS.HEIGHT
        const tw = target.width || NODE_DEFAULTS.WIDTH
        const th = target.height || NODE_DEFAULTS.HEIGHT

        const sourceCx = source.canvas_x + sw / 2
        const sourceCy = source.canvas_y + sh / 2
        const targetCx = target.canvas_x + tw / 2
        const targetCy = target.canvas_y + th / 2

        const srcAssign = sourceAssignments.get(edge.id)
        const tgtAssign = targetAssignments.get(edge.id)
        const srcOffset = srcAssign ? calculatePortOffset(srcAssign.index, srcAssign.total) : 0
        const tgtOffset = tgtAssign ? calculatePortOffset(tgtAssign.index, tgtAssign.total) : 0

        const sourceRect = nodeMap.get(edge.source_node_id)
        const targetRect = nodeMap.get(edge.target_node_id)
        const sourceSide = sourceRect ? getSide(sourceRect, targetCx, targetCy) : 'right'
        const targetSide = targetRect ? getSide(targetRect, sourceCx, sourceCy) : 'left'

        const startPort = sourceRect
          ? getPortPoint(sourceRect, sourceSide, srcOffset)
          : { x: sourceCx, y: sourceCy }
        const endPort = targetRect
          ? getPortPoint(targetRect, targetSide, tgtOffset)
          : { x: targetCx, y: targetCy }

        const STANDOFF_DIST = 120
        const ANGLE_OFFSET = 12
        const rawStartStandoff = getStandoff(startPort, sourceSide, STANDOFF_DIST)
        const rawEndStandoff = getStandoff(endPort, targetSide, STANDOFF_DIST)

        const startStandoff = getAngledStandoff(
          startPort,
          rawStartStandoff,
          sourceSide,
          rawEndStandoff,
          ANGLE_OFFSET
        )
        const endStandoff = getAngledStandoff(
          endPort,
          rawEndStandoff,
          targetSide,
          rawStartStandoff,
          ANGLE_OFFSET
        )

        // O(1) lookup using pre-computed set (was O(m) per edge)
        const isBidirectional = bidirectionalEdges.has(
          `${edge.source_node_id}:${edge.target_node_id}`
        )

        const arrowOffset = isBidirectional ? 0 : 6

        const endEdge = { ...endPort }
        if (arrowOffset > 0) {
          if (targetSide === 'left') endEdge.x += arrowOffset
          else if (targetSide === 'right') endEdge.x -= arrowOffset
          else if (targetSide === 'top') endEdge.y += arrowOffset
          else if (targetSide === 'bottom') endEdge.y -= arrowOffset
        }

        const x1 = startPort.x
        const y1 = startPort.y
        const x2 = endPort.x
        const y2 = endPort.y

        const edgeLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        const isShortEdge = edgeLength < 50

        const edgeStyle = edgeStyleMap.value[edge.id] || style

        let path = ''
        const routed = routedEdges?.get(edge.id)

        if (isHugeGraph.value) {
          path = `M${startPort.x},${startPort.y} L${endEdge.x},${endEdge.y}`
        } else if (routed?.svgPath) {
          // Prefer cached routed paths - this handles both normal rendering and zoom/drag with cache
          path = routed.svgPath
        } else if (isDeferringRouting()) {
          // During drag/zoom without cache, use simple paths that match the edge style
          if (edgeStyle === 'straight') {
            path = `M${startPort.x},${startPort.y} L${endEdge.x},${endEdge.y}`
          } else if (edgeStyle === 'orthogonal') {
            // Simple orthogonal: horizontal then vertical (or vice versa based on direction)
            const midX = (startPort.x + endEdge.x) / 2
            path = `M${startPort.x},${startPort.y} L${midX},${startPort.y} L${midX},${endEdge.y} L${endEdge.x},${endEdge.y}`
          } else if (edgeStyle === 'curved') {
            // Bezier curve
            const cx1 = startStandoff.x
            const cy1 = startPort.y
            const cx2 = endStandoff.x
            const cy2 = endEdge.y
            path = `M${startPort.x},${startPort.y} C${cx1},${cy1} ${cx2},${cy2} ${endEdge.x},${endEdge.y}`
          } else {
            // diagonal/hyperbolic - use standoff points
            path = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
          }
        } else {
          path = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
        }

        const strokeWidth = routed?.strokeWidth || 1.5

        let labelX: number
        let labelY: number

        // Helper: compute cubic Bezier point at t=0.5
        const bezierMidpoint = (
          p0: { x: number; y: number },
          p1: { x: number; y: number },
          p2: { x: number; y: number },
          p3: { x: number; y: number }
        ) => {
          // B(0.5) = 0.125*P0 + 0.375*P1 + 0.375*P2 + 0.125*P3
          return {
            x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
            y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y,
          }
        }

        if (routed?.path && routed.path.length >= 2) {
          // For curved/hyperbolic with 4 control points, compute actual Bezier midpoint
          if ((edgeStyle === 'curved' || edgeStyle === 'hyperbolic') && routed.path.length === 4) {
            const mid = bezierMidpoint(
              routed.path[0],
              routed.path[1],
              routed.path[2],
              routed.path[3]
            )
            labelX = mid.x
            labelY = mid.y
          } else {
            // For orthogonal/straight/diagonal paths, find point at half total path length
            const pts = routed.path
            let totalLen = 0
            const segLens: number[] = []
            for (let i = 1; i < pts.length; i++) {
              const segLen = Math.sqrt(
                (pts[i].x - pts[i - 1].x) ** 2 + (pts[i].y - pts[i - 1].y) ** 2
              )
              segLens.push(segLen)
              totalLen += segLen
            }
            const halfLen = totalLen / 2
            let accumulated = 0
            for (let i = 0; i < segLens.length; i++) {
              if (accumulated + segLens[i] >= halfLen) {
                // Midpoint is on this segment
                const remaining = halfLen - accumulated
                const t = segLens[i] > 0 ? remaining / segLens[i] : 0
                labelX = pts[i].x + t * (pts[i + 1].x - pts[i].x)
                labelY = pts[i].y + t * (pts[i + 1].y - pts[i].y)
                break
              }
              accumulated += segLens[i]
            }
            // Fallback if loop didn't set values
            if (labelX === undefined) {
              labelX = (pts[0].x + pts[pts.length - 1].x) / 2
              labelY = (pts[0].y + pts[pts.length - 1].y) / 2
            }
          }
        } else if (isDeferringRouting() || !routed) {
          // Calculate label position based on edge style to match visual path
          if (edgeStyle === 'straight' || isHugeGraph.value) {
            labelX = (startPort.x + endEdge.x) / 2
            labelY = (startPort.y + endEdge.y) / 2
          } else if (edgeStyle === 'orthogonal') {
            // Midpoint of orthogonal path (middle of the vertical segment)
            const midX = (startPort.x + endEdge.x) / 2
            labelX = midX
            labelY = (startPort.y + endEdge.y) / 2
          } else if (edgeStyle === 'curved' || edgeStyle === 'hyperbolic') {
            // Cubic Bezier midpoint at t=0.5
            const cx1 = startStandoff.x
            const cy1 = startPort.y
            const cx2 = endStandoff.x
            const cy2 = endEdge.y
            const mid = bezierMidpoint(startPort, { x: cx1, y: cy1 }, { x: cx2, y: cy2 }, endEdge)
            labelX = mid.x
            labelY = mid.y
          } else {
            // diagonal - midpoint of standoff segment
            labelX = (startStandoff.x + endStandoff.x) / 2
            labelY = (startStandoff.y + endStandoff.y) / 2
          }
        } else {
          labelX = (x1 + x2) / 2
          labelY = (y1 + y2) / 2
        }

        // Offset label perpendicular to edge direction (beside the path, not on top)
        const LABEL_OFFSET = 12
        const dx = x2 - x1
        const dy = y2 - y1
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        // Perpendicular vector (normalized), offset to the "left" of the edge direction
        const perpX = -dy / len
        const perpY = dx / len
        labelX += perpX * LABEL_OFFSET
        labelY += perpY * LABEL_OFFSET

        return {
          id: edge.id,
          source_node_id: edge.source_node_id,
          target_node_id: edge.target_node_id,
          x1,
          y1,
          x2,
          y2,
          labelX,
          labelY,
          path,
          style: edgeStyle,
          strokeWidth,
          hitX1: startPort.x,
          hitY1: startPort.y,
          hitX2: endPort.x,
          hitY2: endPort.y,
          link_type: edge.link_type,
          color: edge.color,
          label: edge.label,
          isBidirectional,
          isShortEdge,
          debugInfo: routed?.debugInfo,
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null) as EdgeLine[]
  })

  return {
    edgeLines,
  }
}
