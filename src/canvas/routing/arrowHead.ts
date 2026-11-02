/**
 * The geometry of an arrowhead and of the line that ends under it
 * (PRODUCT_DESIGN.md > The line under an arrowhead).
 */
import { ARROW_OFFSET } from './index'

/** How much wider a highlighted or selected line is drawn */
export const HIGHLIGHT_WIDTH_FACTOR = 1.3

/** Length and width of a head at normal zoom, in canvas units */
const ARROW_HEAD_MIN = 20
/** A head is at least this many widths of a highlighted line */
const ARROW_HEAD_LINE_WIDTHS = 4
/** The share of the head the line runs into, so no seam shows between the two */
export const ARROW_HEAD_OVERLAP = 0.1

/** Length (and width) of the head on a line of the given base width, in canvas units */
export function arrowHeadLength(strokeWidth: number): number {
  return Math.max(ARROW_HEAD_MIN, ARROW_HEAD_LINE_WIDTHS * HIGHLIGHT_WIDTH_FACTOR * strokeWidth)
}

const NUMBER = '-?\\d*\\.?\\d+(?:e[-+]?\\d+)?'
/** The last coordinate pair of a path */
const LAST_POINT = new RegExp(`(${NUMBER})[\\s,]+(${NUMBER})\\s*$`, 'i')
/** The pair before it: the previous point of a line, the last control point of a curve */
const POINT_BEFORE = new RegExp(`(${NUMBER})[\\s,]+(${NUMBER})[\\s,]*[a-z]?\\s*$`, 'i')
/** What is left of a segment shorter than the cut, so the head keeps its direction */
const STUB = 0.01

/** Move the last point of an SVG path back along its final direction */
export function shortenPathEnd(d: string, by: number): string {
  if (by <= 0) return d
  const last = LAST_POINT.exec(d)
  if (!last) return d
  const before = POINT_BEFORE.exec(d.slice(0, last.index))
  if (!before) return d

  const endX = Number(last[1])
  const endY = Number(last[2])
  const dx = endX - Number(before[1])
  const dy = endY - Number(before[2])
  const length = Math.hypot(dx, dy)
  if (length <= STUB) return d

  const kept = Math.max(length - by, STUB)
  const x = endX - (dx / length) * (length - kept)
  const y = endY - (dy / length) * (length - kept)
  return `${d.slice(0, last.index)}${x},${y}`
}

/**
 * The stroke of an edge that carries a head: the routed path, ending inside
 * the base of the head. The tip then lies the arrow offset beyond the routed
 * end, where the routers left room for it.
 */
export function lineUnderArrowHead(path: string, strokeWidth: number): string {
  return shortenPathEnd(path, arrowHeadLength(strokeWidth) * (1 - ARROW_HEAD_OVERLAP) - ARROW_OFFSET)
}
