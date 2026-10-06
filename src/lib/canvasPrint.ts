/**
 * Printing the canvas: the selected nodes, or all of them, as cards and
 * straight edges on one vector page (PRODUCT_DESIGN.md > Printing the canvas).
 *
 * The page is Typst source, compiled by the compiler already loaded for math.
 * Everything a note contains reaches the page as a string literal, so no
 * character of it can be read as Typst markup and fail the compilation.
 */
import type { Node, Edge } from '../types'
import { compileTypstToPdf } from './pdf-export'
import { wikilinkPattern } from './contentParser'

/** Space around the printed nodes, in canvas units */
export const PRINT_MARGIN = 40

const DEFAULT_WIDTH = 200
const DEFAULT_HEIGHT = 120
const TEXT_COLOR = '#18181b'
const CARD_BORDER = '#94a3b8'
const EDGE_COLOR = '#64748b'
const TITLE_SIZE = 14
const BODY_SIZE = 12
const CARD_INSET = 10
const ARROW_LENGTH = 12
const ARROW_HALF_WIDTH = 5
const EDGE_WIDTH = 1.5

type PrintNode = Pick<Node, 'id' | 'title' | 'node_type' | 'markdown_content' | 'canvas_x' | 'canvas_y' | 'width' | 'height' | 'color_theme'>
type PrintEdge = Pick<Edge, 'id' | 'source_node_id' | 'target_node_id' | 'label' | 'color' | 'directed'>
interface Point {
  x: number
  y: number
}

/** The selection, or every node when nothing is selected */
export function nodesToPrint<T extends { id: string }>(nodes: T[], selectedIds: string[]): T[] {
  if (selectedIds.length === 0) return nodes
  const selected = new Set(selectedIds)
  return nodes.filter(n => selected.has(n.id))
}

/** Edges with both ends printed; an edge to an unprinted node would point at nothing */
export function edgesToPrint<T extends { source_node_id: string; target_node_id: string }>(nodes: Array<{ id: string }>, edges: T[]): T[] {
  const ids = new Set(nodes.map(n => n.id))
  return edges.filter(e => e.source_node_id !== e.target_node_id && ids.has(e.source_node_id) && ids.has(e.target_node_id))
}

const widthOf = (n: PrintNode) => n.width || DEFAULT_WIDTH
const heightOf = (n: PrintNode) => n.height || DEFAULT_HEIGHT
const centreOf = (n: PrintNode): Point => ({ x: n.canvas_x + widthOf(n) / 2, y: n.canvas_y + heightOf(n) / 2 })

/** Where the line from a node's centre toward a point leaves the node's rectangle */
export function borderPoint(node: PrintNode, toward: Point): Point {
  const c = centreOf(node)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  const scale = Math.min(
    dx === 0 ? Infinity : widthOf(node) / 2 / Math.abs(dx),
    dy === 0 ? Infinity : heightOf(node) / 2 / Math.abs(dy)
  )
  return { x: c.x + dx * scale, y: c.y + dy * scale }
}

const num = (n: number) => String(Math.round(n * 100) / 100)
const pt = (n: number) => `${num(n)}pt`
/** A Typst string literal */
const str = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ')}"`

interface Rgba {
  r: number
  g: number
  b: number
  /** 0 to 1 */
  a: number
}

/** A CSS colour, or null when it is neither hex nor rgb(a) */
function parseColor(css: string | null | undefined): (Rgba & { hex: string | null }) | null {
  if (!css) return null
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(css.trim())
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1]
    const byte = (i: number) => parseInt(h.slice(i, i + 2), 16)
    return { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? byte(6) / 255 : 1, hex: hex[0] }
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css.trim())
  if (!rgb) return null
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Math.min(1, Number(rgb[4])), hex: null }
}

/** A CSS colour as a Typst colour, or null when it cannot be read */
function typstColor(css: string | null | undefined): string | null {
  const c = parseColor(css)
  if (!c) return null
  return c.hex ? `rgb("${c.hex}")` : `rgb(${c.r}, ${c.g}, ${c.b}, ${Math.round(c.a * 100)}%)`
}

/** Whether text on a card of this colour, laid over white, must be light to be read */
function isDarkFill(css: string | null | undefined): boolean {
  const c = parseColor(css)
  if (!c) return false
  const over = (v: number) => v * c.a + 255 * (1 - c.a)
  return (0.299 * over(c.r) + 0.587 * over(c.g) + 0.114 * over(c.b)) / 255 < 0.5
}

/** One line of Markdown as Typst pieces: bold, italic and code keep their formatting */
function inline(text: string): string {
  const plain = text
    .replace(wikilinkPattern(), (_, target, label) => label || target)
    .replace(/(?<!!)\[([^\]]+)\]\([^)]+\)/g, '$1')
  return plain
    .split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/)
    .filter(Boolean)
    .map(piece => {
      if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) return `#strong(${str(piece.slice(2, -2))})`
      if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 2) return `#raw(${str(piece.slice(1, -1))})`
      if (piece.startsWith('*') && piece.endsWith('*') && piece.length > 2) return `#emph(${str(piece.slice(1, -1))})`
      return `#${str(piece)}`
    })
    .join('')
}

/** The body of a card: as many lines of the note as can show at its height */
function body(content: string | null, height: number): string {
  if (!content) return ''
  const text = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const lines = text.split(/\r?\n/).slice(0, Math.ceil(height / (BODY_SIZE * 0.8)))
  const out: string[] = []
  let blank = true
  for (const raw of lines) {
    // A quote keeps its text; a rule or a table's separator row is no text at all
    const line = raw.trim().replace(/^>\s?/, '')
    if (/^(?:-{3,}|\*{3,}|_{3,}|\|?[\s:|-]*-[\s:|-]*\|?)$/.test(line)) continue
    if (!line) {
      if (!blank) out.push('#parbreak()')
      blank = true
      continue
    }
    if (!blank) out.push('#linebreak()')
    blank = false
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    const item = /^(?:[-*+]|\d+\.)\s+(.+)$/.exec(line)
    if (heading) out.push(`#text(weight: "bold", ${str(heading[1])})`)
    else if (item) out.push(`#"• "${inline(item[1])}`)
    else out.push(inline(line))
  }
  return out.join('')
}

/** The Typst source of the page */
export function canvasToTypst(nodes: PrintNode[], edges: PrintEdge[]): string {
  const left = Math.min(...nodes.map(n => n.canvas_x)) - PRINT_MARGIN
  const top = Math.min(...nodes.map(n => n.canvas_y)) - PRINT_MARGIN
  const right = Math.max(...nodes.map(n => n.canvas_x + widthOf(n))) + PRINT_MARGIN
  const bottom = Math.max(...nodes.map(n => n.canvas_y + heightOf(n))) + PRINT_MARGIN
  const at = (p: Point) => `(${pt(p.x - left)}, ${pt(p.y - top)})`
  const byId = new Map(nodes.map(n => [n.id, n]))

  const out: string[] = [
    `#set page(width: ${pt(right - left)}, height: ${pt(bottom - top)}, margin: 0pt, fill: white)`,
    `#set text(font: ("Inter", "Helvetica Neue", "Arial", "Libertinus Serif"), size: ${pt(BODY_SIZE)}, fill: rgb("${TEXT_COLOR}"))`,
    `#set par(leading: 0.5em, spacing: 0.7em)`,
  ]

  // Edges first: a card covers what runs beneath it
  const labels: string[] = []
  for (const edge of edgesToPrint(nodes, edges)) {
    const source = byId.get(edge.source_node_id)!
    const target = byId.get(edge.target_node_id)!
    const start = borderPoint(source, centreOf(target))
    const tip = borderPoint(target, centreOf(source))
    const length = Math.hypot(tip.x - start.x, tip.y - start.y)
    if (length === 0) continue
    const ux = (tip.x - start.x) / length
    const uy = (tip.y - start.y) / length
    const color = typstColor(edge.color) ?? `rgb("${EDGE_COLOR}")`
    const arrow = edge.directed !== false && length > ARROW_LENGTH * 2
    // The line ends inside the base of the head (PRODUCT_DESIGN.md > The line under an arrowhead)
    const end = arrow ? { x: tip.x - ux * ARROW_LENGTH * 0.9, y: tip.y - uy * ARROW_LENGTH * 0.9 } : tip
    out.push(`#place(top + left, line(start: ${at(start)}, end: ${at(end)}, stroke: (paint: ${color}, thickness: ${pt(EDGE_WIDTH)}, cap: "round")))`)
    if (arrow) {
      const base = { x: tip.x - ux * ARROW_LENGTH, y: tip.y - uy * ARROW_LENGTH }
      const a = { x: base.x - uy * ARROW_HALF_WIDTH, y: base.y + ux * ARROW_HALF_WIDTH }
      const b = { x: base.x + uy * ARROW_HALF_WIDTH, y: base.y - ux * ARROW_HALF_WIDTH }
      out.push(`#place(top + left, polygon(fill: ${color}, ${at(tip)}, ${at(a)}, ${at(b)}))`)
    }
    if (edge.label) {
      const mid = { x: (start.x + tip.x) / 2 - 100, y: (start.y + tip.y) / 2 - 8 }
      labels.push(
        `#place(top + left, dx: ${pt(mid.x - left)}, dy: ${pt(mid.y - top)}, box(width: 200pt, align(center, box(fill: white, inset: 2pt, text(size: 10pt, ${str(edge.label)})))))`
      )
    }
  }
  out.push(...labels)

  for (const node of nodes) {
    const width = widthOf(node)
    const height = heightOf(node)
    const tint = typstColor(node.color_theme) ?? 'white'
    const isTag = node.node_type === 'tag'
    const title = `#text(weight: "bold", size: ${pt(isTag ? BODY_SIZE : TITLE_SIZE)}, ${str(node.title || '')})`
    // Dark text on a dark card cannot be read
    const ink = isDarkFill(node.color_theme) ? '#set text(fill: white);' : ''
    const content = isTag ? '' : body(node.markdown_content, height)
    const inset = isTag ? 3 : CARD_INSET
    out.push(
      `#place(top + left, dx: ${pt(node.canvas_x - left)}, dy: ${pt(node.canvas_y - top)}, block(width: ${pt(width)}, height: ${pt(height)}, fill: white, stroke: 1.5pt + rgb("${CARD_BORDER}"), radius: ${pt(isTag ? height / 2 : 8)}, clip: true, block(width: 100%, height: 100%, fill: ${tint}, inset: ${pt(inset)})[${ink}${title}${content ? `#parbreak()${content}` : ''}]))`
    )
  }
  return out.join('\n') + '\n'
}

/** The page as PDF bytes */
export async function printCanvasToPdf(nodes: PrintNode[], edges: PrintEdge[]): Promise<Uint8Array> {
  if (nodes.length === 0) throw new Error('There are no nodes to print')
  return compileTypstToPdf(canvasToTypst(nodes, edges))
}
