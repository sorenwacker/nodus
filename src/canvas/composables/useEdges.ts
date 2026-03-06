/**
 * Edge rendering composable
 * Handles edge path computation, styling, and orthogonal routing
 */
import { computed, ref, type ComputedRef } from 'vue'
import { findOrthogonalPath, pathToSvg } from '../edgeRouting'
import type { Edge } from '../../types'

export type { Edge }

export interface EdgeStyle {
  type: 'straight' | 'curved' | 'orthogonal' | 'smart'
}

export interface ComputedEdge {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  path: string
  style: string
  hitX1: number
  hitY1: number
  hitX2: number
  hitY2: number
  link_type: string
  label: string | null
  isBidirectional: boolean
}

/** Node with rendering info for edge computation */
export interface NodeRect {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  markdown_content: string | null
}

interface UseEdgesOptions {
  nodes: ComputedRef<NodeRect[]>
  edges: ComputedRef<Edge[]>
  getNode: (id: string) => NodeRect | undefined
  isLargeGraph: ComputedRef<boolean>
  visibleNodeIds: ComputedRef<Set<string>>
}

/**
 * Calculate intersection point of line with node rectangle
 */
function getNodeEdgePoint(
  nodeX: number, nodeY: number, nodeW: number, nodeH: number,
  fromX: number, fromY: number
): { x: number; y: number } {
  const cx = nodeX + nodeW / 2
  const cy = nodeY + nodeH / 2
  const dx = fromX - cx
  const dy = fromY - cy

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const halfW = nodeW / 2
  const halfH = nodeH / 2
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  }
}

/**
 * Estimate node height from content if not set
 */
function getNodeHeight(node: { height: number; markdown_content: string | null }): number {
  if (node.height) return node.height
  const content = node.markdown_content || ''
  const lineCount = content.split('\n').length
  const charCount = content.length
  return Math.max(60, Math.min(324, lineCount * 22 + Math.floor(charCount / 40) * 18))
}

/**
 * Generate curved path (quadratic bezier)
 */
function createCurvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  const curveOffset = dist * 0.2
  const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2
  const cx = midX + Math.cos(angle) * curveOffset
  const cy = midY + Math.sin(angle) * curveOffset
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`
}

export function useEdges(options: UseEdgesOptions) {
  const { nodes, edges, getNode, isLargeGraph, visibleNodeIds } = options

  // Global edge style
  const globalStyle = ref<'straight' | 'curved' | 'orthogonal' | 'smart'>('straight')

  // Per-edge style overrides
  const styleOverrides = ref<Record<string, string>>({})

  // Track offsets for parallel edges
  const parallelOffsets = new Map<string, number>()

  const styles: Array<typeof globalStyle.value> = ['straight', 'orthogonal', 'smart']

  function cycleStyle() {
    const idx = styles.indexOf(globalStyle.value)
    globalStyle.value = styles[(idx + 1) % styles.length]
  }

  function setEdgeStyle(edgeId: string, style: string) {
    styleOverrides.value[edgeId] = style
  }

  const computedEdges = computed<ComputedEdge[]>(() => {
    let edgeList = edges.value
    parallelOffsets.clear()

    // Viewport culling for large graphs
    if (isLargeGraph.value) {
      const visIds = visibleNodeIds.value
      edgeList = edgeList.filter(e =>
        visIds.has(e.source_node_id) || visIds.has(e.target_node_id)
      )
    }

    return edgeList.map(edge => {
      const source = getNode(edge.source_node_id)
      const target = getNode(edge.target_node_id)
      if (!source || !target) return null

      const sw = source.width || 200
      const sh = getNodeHeight(source)
      const tw = target.width || 200
      const th = getNodeHeight(target)

      const sourceCx = source.canvas_x + sw / 2
      const sourceCy = source.canvas_y + sh / 2
      const targetCx = target.canvas_x + tw / 2
      const targetCy = target.canvas_y + th / 2

      const startEdge = getNodeEdgePoint(source.canvas_x, source.canvas_y, sw, sh, targetCx, targetCy)
      const endEdge = getNodeEdgePoint(target.canvas_x, target.canvas_y, tw, th, sourceCx, sourceCy)

      const isBidirectional = edgeList.some(
        e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
      )

      const dx = endEdge.x - startEdge.x
      const dy = endEdge.y - startEdge.y
      const len = Math.sqrt(dx * dx + dy * dy)

      const gap = 2
      const arrowOffset = isBidirectional ? 0 : 6

      let x1 = startEdge.x
      let y1 = startEdge.y
      let x2 = endEdge.x
      let y2 = endEdge.y

      if (len > gap * 2 + arrowOffset) {
        x1 = startEdge.x + (dx / len) * gap
        y1 = startEdge.y + (dy / len) * gap
        x2 = endEdge.x - (dx / len) * (gap + arrowOffset)
        y2 = endEdge.y - (dy / len) * (gap + arrowOffset)
      }

      const style = isLargeGraph.value
        ? 'straight'
        : (styleOverrides.value[edge.id] || globalStyle.value)

      let path = ''
      if (style === 'curved' && !isLargeGraph.value) {
        path = createCurvedPath(x1, y1, x2, y2)
      } else if ((style === 'orthogonal' || style === 'smart') && !isLargeGraph.value) {
        const excludeIds = new Set([edge.source_node_id, edge.target_node_id])
        const pairKey = [edge.source_node_id, edge.target_node_id].sort().join('-')
        const existingOffset = parallelOffsets.get(pairKey) || 0
        parallelOffsets.set(pairKey, existingOffset + 15)

        const nodeIds = nodes.value.map(n => n.id)
        const routePath = findOrthogonalPath(source, target, nodes.value, nodeIds, excludeIds, existingOffset)
        path = pathToSvg(routePath)
      } else {
        path = `M${x1},${y1} L${x2},${y2}`
      }

      return {
        id: edge.id,
        x1,
        y1,
        x2,
        y2,
        path,
        style,
        hitX1: startEdge.x,
        hitY1: startEdge.y,
        hitX2: endEdge.x,
        hitY2: endEdge.y,
        link_type: edge.link_type,
        label: edge.label,
        isBidirectional,
      }
    }).filter((e): e is ComputedEdge => e !== null)
  })

  return {
    globalStyle,
    styleOverrides,
    computedEdges,
    cycleStyle,
    setEdgeStyle,
  }
}
