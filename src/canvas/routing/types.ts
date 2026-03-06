/**
 * Type definitions for edge routing
 */

export interface Point {
  x: number
  y: number
}

export interface NodeRect {
  id?: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

export interface EdgeDef {
  id: string
  source_node_id: string
  target_node_id: string
}

export interface RoutedEdge {
  id: string
  path: Point[]
  svgPath: string
  debugInfo?: {
    srcOffset: number
    tgtOffset: number
    srcSide: Side
    tgtSide: Side
  }
}

export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface PortAssignment {
  edgeId: string
  node: NodeRect
  side: Side
  index: number
  total: number
}
