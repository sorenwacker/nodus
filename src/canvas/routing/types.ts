/**
 * Type definitions for edge routing
 */
import type { Point } from '../../types'

export type { Point }

/**
 * NodeRect for routing - relaxed version with optional fields
 * Use when exact dimensions aren't always available
 */
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

export type EdgeStyle = 'diagonal' | 'orthogonal' | 'curved'

export interface EdgeRouteParams {
  startPort: Point
  startStandoff: Point
  endPort: Point
  endStandoff: Point
  sourceSide: Side
  targetSide: Side
  excludeIds: Set<string>
  arrowOffset?: number
}

export interface EdgeRouteResult {
  path: Point[]
  svgPath: string
  usedDetour?: boolean
}
