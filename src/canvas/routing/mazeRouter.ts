/**
 * Maze router: PCB-style edge routing on a lane grid.
 *
 * The canvas is covered by a grid of lanes one LANE_WIDTH apart. Cards block
 * the cells they cover (plus a small keep-out margin); the cells next to a
 * card carry a soft penalty so traces keep their distance when there is
 * room. Each edge is then found by A* over (cell, direction) states, paying
 * for distance, for every bend, for crossing another trace, and heavily for
 * running on top of one. Edges are routed shortest first, and every routed
 * edge marks the lanes it uses so the next one steers clear of them.
 *
 * This is how board autorouters work (a Lee/A* maze router on a routing
 * grid), and it is what the "PCB-style" edge styles promised: traces that
 * stay in the corridors between cards, run parallel at a fixed pitch, and
 * bend only where they must (PRODUCT_DESIGN.md > Edge Routing (PCB-Style)).
 *
 * Exits and entries are always perpendicular to the card side: the search
 * starts one lane outside the source port heading away from the card, and
 * may only finish on the lane outside the target port while heading into it.
 * With `diagonal` the search also moves at 45°, which gives the angled
 * motherboard-trace look; turns sharper than 90° are never taken.
 */

import type { Point, NodeRect, Side, EdgeStyle } from './types'

/** Lane pitch in canvas px. Equal to the lane tracker's LANE_WIDTH. */
export const MAZE_CELL = 12

/** Above this many edges the per-edge routers take over (PRODUCT_DESIGN.md > Routing cost). */
export const MAZE_MAX_EDGES = 400

/**
 * The lane pitch ports must sit on for a style and graph size, or undefined
 * when the style is not routed on the lane grid. The canvas and the router
 * both place ports through this, so the drawn line starts where the hit
 * area does.
 */
export function portLanePitch(style: EdgeStyle, edgeCount: number): number | undefined {
  return (style === 'orthogonal' || style === 'diagonal') && edgeCount <= MAZE_MAX_EDGES ? MAZE_CELL : undefined
}

/**
 * A* weight on the heuristic. Plain A* on a lane grid expands every cell
 * whose Manhattan distance ties with the best path, a diamond that grows
 * with the edge length; weighting the estimate trades a little optimality
 * for an order of magnitude fewer expansions.
 */
const HEURISTIC_WEIGHT = 2

/** Cells around the start–goal box searched first; the whole grid only if that fails. */
const WINDOW_CELLS = 16

/**
 * Expansions one search may make before giving up. A port walled in by an
 * overlapping card has no route, and without a cap the search would visit
 * the whole grid to learn that; the per-edge router takes such edges.
 */
const MAX_EXPANSIONS = 40_000

/**
 * Expansions one routing pass may make in total, so a pathological graph
 * costs a bounded amount per frame; the edges left over go to the per-edge
 * router (PRODUCT_DESIGN.md > Routing cost).
 */
const PASS_BUDGET = 600_000

/**
 * Lane pitch by canvas extent. A canvas wider than a few thousand pixels is
 * only ever looked at zoomed out, where a 24 px pitch is as fine as the eye
 * can tell, and the grid has a quarter of the cells.
 */
function pitchForExtent(extent: number): number {
  if (extent <= 4000) return MAZE_CELL
  if (extent <= 12000) return MAZE_CELL * 2
  return MAZE_CELL * 4
}

/** The grid is coarsened until it has at most this many cells. */
const MAX_CELLS = 400_000

/** Cells of free space kept around the graph so traces can go round the outside. */
const PADDING_CELLS = 6

/** Keep-out around a card, in px: a lane centre closer than this to a card is blocked. */
export const NODE_MARGIN = MAZE_CELL / 2

// Costs, in units of one orthogonal step
const BEND_90 = 3
const BEND_45 = 1.5
const SIDEWAYS_ENTRY = 6  // reaching the target lane from the side instead of straight on
const OVERLAP = 14      // running along a lane another trace already uses
const KEEP_OUT = 6      // a lane inside a card's keep-out margin, when nothing else is left
const CROSS = 1.5       // crossing another trace
const HALO = 1.5        // the lane right next to a card
/**
 * A diagonal step costs 1.5, not √2: every cost is then a multiple of one
 * half, so the open set can be a bucket queue indexed by f-score instead of
 * a heap (Dial's algorithm), and pushes and pops are O(1).
 */
const DIAG_STEP = 1.5

// Occupancy bits per cell
const OCC_H = 1
const OCC_V = 2
const OCC_D1 = 4   // ↘ / ↖
const OCC_D2 = 8   // ↗ / ↙

// Directions: even indices are orthogonal, odd are diagonal.
// 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE
const DX = [1, 1, 0, -1, -1, -1, 0, 1]
const DY = [0, 1, 1, 1, 0, -1, -1, -1]
const DIR_OCC = [OCC_H, OCC_D1, OCC_V, OCC_D2, OCC_H, OCC_D1, OCC_V, OCC_D2]
const NDIR = 8

/** Direction an edge travels when it leaves a card through the given side. */
function outwardDir(side: Side): number {
  switch (side) {
    case 'right': return 0
    case 'bottom': return 2
    case 'left': return 4
    case 'top': return 6
  }
}

/** Direction an edge travels when it enters a card through the given side. */
function inwardDir(side: Side): number {
  return (outwardDir(side) + 4) % NDIR
}

export interface MazeEdgeRequest {
  id: string
  sourceId: string
  targetId: string
  /** Port on the source card's border, as placed by port assignment. */
  sourcePort: Point
  sourceSide: Side
  targetPort: Point
  targetSide: Side
}

export interface MazeOptions {
  /** Allow 45° moves (the `diagonal` style). */
  diagonal: boolean
}

export interface MazeRoute {
  /** Port to port, corners only; the first and last legs are perpendicular to the cards. */
  path: Point[]
}

/** Why the maze router left an edge to the per-edge router */
export type MazeFailure = 'walled-in' | 'no-path' | 'budget'

/**
 * Bucket queue over half-unit f-scores. Keys only ever grow by small
 * amounts, so the cursor walks forward through the buckets; a push below
 * the cursor (the weighted heuristic is not consistent) moves it back.
 */
class BucketQueue {
  private buckets: number[][] = []
  private cursor = 0
  private count = 0
  get size(): number { return this.count }
  push(item: number, f: number): void {
    const key = Math.round(f * 2)
    let bucket = this.buckets[key]
    if (!bucket) bucket = this.buckets[key] = []
    bucket.push(item)
    this.count++
    if (key < this.cursor) this.cursor = key
  }
  pop(): number {
    const buckets = this.buckets
    while (!buckets[this.cursor] || buckets[this.cursor].length === 0) this.cursor++
    this.count--
    return buckets[this.cursor].pop()!
  }
  clear(): void { this.buckets = []; this.cursor = 0; this.count = 0 }
}

export class MazeRouter {
  readonly cell: number
  private readonly ox: number
  private readonly oy: number
  private readonly cols: number
  private readonly rows: number
  /** 0 free, 1 inside a card's keep-out margin, 2 inside a card */
  private readonly blocked: Uint8Array
  private readonly halo: Uint8Array
  private readonly occ: Uint8Array
  private readonly diagonal: boolean

  // A* working memory over (cell, dir) states, reused across edges via stamps
  private readonly g: Float64Array
  private readonly parent: Int32Array
  private readonly stamp: Int32Array
  private readonly closed: Int32Array
  private generation = 0
  private readonly heap = new BucketQueue()
  /** Expansions spent so far in this pass */
  private spent = 0

  constructor(nodes: NodeRect[], options: MazeOptions) {
    this.diagonal = options.diagonal

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      const w = n.width || 200, h = n.height || 120
      if (n.canvas_x < minX) minX = n.canvas_x
      if (n.canvas_y < minY) minY = n.canvas_y
      if (n.canvas_x + w > maxX) maxX = n.canvas_x + w
      if (n.canvas_y + h > maxY) maxY = n.canvas_y + h
    }
    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 1 }

    // Coarsen the lane pitch with the canvas extent, and further until the grid fits the cell budget
    let cell = pitchForExtent(Math.max(maxX - minX, maxY - minY))
    for (;;) {
      const cols = Math.ceil((maxX - minX) / cell) + 2 * PADDING_CELLS
      const rows = Math.ceil((maxY - minY) / cell) + 2 * PADDING_CELLS
      if (cols * rows <= MAX_CELLS) break
      cell *= 2
    }
    this.cell = cell
    this.ox = Math.floor(minX / cell) * cell - PADDING_CELLS * cell
    this.oy = Math.floor(minY / cell) * cell - PADDING_CELLS * cell
    this.cols = Math.ceil((maxX - this.ox) / cell) + PADDING_CELLS
    this.rows = Math.ceil((maxY - this.oy) / cell) + PADDING_CELLS

    const cells = this.cols * this.rows
    this.blocked = new Uint8Array(cells)
    this.halo = new Uint8Array(cells)
    this.occ = new Uint8Array(cells)
    this.g = new Float64Array(cells * NDIR)
    this.parent = new Int32Array(cells * NDIR)
    this.stamp = new Int32Array(cells * NDIR)
    this.closed = new Int32Array(cells * NDIR)

    // Cells whose lane centre lies inside a card are blocked; those inside its
    // keep-out margin are passable at a price, so a card squeezed against a
    // neighbour still gets its traces out; the ring beyond is the halo
    const margin = NODE_MARGIN * (cell / MAZE_CELL)
    for (const n of nodes) {
      const w = n.width || 200, h = n.height || 120
      const c0 = this.colOf(n.canvas_x - margin), c1 = this.colOf(n.canvas_x + w + margin)
      const r0 = this.rowOf(n.canvas_y - margin), r1 = this.rowOf(n.canvas_y + h + margin)
      for (let r = Math.max(0, r0 - 1); r <= Math.min(this.rows - 1, r1 + 1); r++) {
        for (let c = Math.max(0, c0 - 1); c <= Math.min(this.cols - 1, c1 + 1); c++) {
          const idx = r * this.cols + c
          const cx = this.xOf(c), cy = this.yOf(r)
          const inCard = cx > n.canvas_x && cx < n.canvas_x + w && cy > n.canvas_y && cy < n.canvas_y + h
          const inMargin = cx > n.canvas_x - margin && cx < n.canvas_x + w + margin &&
                           cy > n.canvas_y - margin && cy < n.canvas_y + h + margin
          if (inCard) this.blocked[idx] = 2
          else if (inMargin) { if (this.blocked[idx] < 1) this.blocked[idx] = 1 }
          else this.halo[idx] = 1
        }
      }
    }
  }

  // ---- grid helpers -------------------------------------------------------

  private colOf(x: number): number { return Math.floor((x - this.ox) / this.cell) }
  private rowOf(y: number): number { return Math.floor((y - this.oy) / this.cell) }
  /** Centre x of a column */
  private xOf(c: number): number { return this.ox + (c + 0.5) * this.cell }
  /** Centre y of a row */
  private yOf(r: number): number { return this.oy + (r + 0.5) * this.cell }
  private inGrid(c: number, r: number): boolean { return c >= 0 && r >= 0 && c < this.cols && r < this.rows }

  /**
   * The first free lane outside a card border, beyond the keep-out, in the
   * side's direction. Null when another card sits right in front of the port.
   */
  private stubCell(port: Point, side: Side): { c: number; r: number } | null {
    const margin = NODE_MARGIN * (this.cell / MAZE_CELL)
    const dir = outwardDir(side)
    // The first lane whose centre clears the keep-out: in a 24 px gutter that
    // is the only lane there is, so it must not be skipped
    let c = this.colOf(port.x), r = this.rowOf(port.y)
    switch (side) {
      case 'right': c = this.colOf(port.x + margin); if (this.xOf(c) < port.x + margin) c++; break
      case 'left': c = this.colOf(port.x - margin); if (this.xOf(c) > port.x - margin) c--; break
      case 'bottom': r = this.rowOf(port.y + margin); if (this.yOf(r) < port.y + margin) r++; break
      case 'top': r = this.rowOf(port.y - margin); if (this.yOf(r) > port.y - margin) r--; break
    }
    for (let i = 0; i < 3; i++) {
      if (!this.inGrid(c, r)) return null
      if (this.blocked[r * this.cols + c] < 2) return { c, r }
      c += DX[dir]; r += DY[dir]
    }
    return null
  }

  /** Cost of travelling into `idx` heading `dir`, having arrived at the previous cell heading `prevDir`. */
  private stepCost(idx: number, dir: number, prevDir: number): number {
    let cost = dir & 1 ? DIAG_STEP : 1
    if (dir !== prevDir) {
      const turn = Math.abs(dir - prevDir)
      cost += turn === 1 || turn === NDIR - 1 ? BEND_45 : BEND_90
    }
    const occ = this.occ[idx]
    if (occ) cost += occ & DIR_OCC[dir] ? OVERLAP : CROSS
    if (this.blocked[idx]) cost += KEEP_OUT
    else if (this.halo[idx]) cost += HALO
    return cost
  }

  /**
   * Route one edge. Ports are used as given; callers place them with
   * getPortPoint(..., MAZE_CELL) so they sit on lane centres. Returns null
   * when the target cannot be reached.
   */
  route(req: MazeEdgeRequest): MazeRoute | MazeFailure {
    if (this.spent >= PASS_BUDGET) return 'budget'
    const { sourcePort, targetPort } = req
    const start = this.stubCell(sourcePort, req.sourceSide)
    const goal = this.stubCell(targetPort, req.targetSide)
    if (!start || !goal) return 'walled-in'

    // A straight run or a single bend on free lanes needs no search at all
    const direct = this.directCells(start, goal, outwardDir(req.sourceSide), inwardDir(req.targetSide))
    // Otherwise a local search first: nearly every edge stays near its endpoints
    const w = WINDOW_CELLS
    const windowed = direct ?? this.search(start, goal, req,
      Math.min(start.c, goal.c) - w, Math.min(start.r, goal.r) - w,
      Math.max(start.c, goal.c) + w, Math.max(start.r, goal.r) + w)
    const cells = windowed ?? this.search(start, goal, req, 0, 0, this.cols - 1, this.rows - 1)
    if (!cells) return 'no-path'

    // Cell centres, then the ports on both ends; collinear points fold away
    const cols = this.cols
    const points: Point[] = [sourcePort]
    for (const idx of cells) {
      const c = idx % cols, r = (idx - c) / cols
      points.push({ x: this.xOf(c), y: this.yOf(r) })
    }
    points.push(targetPort)
    return { path: simplify(points) }
  }

  /**
   * Reserve the lanes under an existing path, so edges routed afterwards
   * steer clear of it. Used while a node is dragged: the edges that do not
   * move keep their paths and only the moving ones are searched.
   */
  markPath(path: Point[]): void {
    const cols = this.cols
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]
      const c0 = this.colOf(a.x), r0 = this.rowOf(a.y), c1 = this.colOf(b.x), r1 = this.rowOf(b.y)
      const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0)
      if (dc === 0 && dr === 0) continue
      const bit = dc === 0 ? OCC_V : dr === 0 ? OCC_H : dc === dr ? OCC_D1 : OCC_D2
      let c = c0, r = r0
      const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0))
      for (let k = 0; k <= steps; k++) {
        if (this.inGrid(c, r)) this.occ[r * cols + c] |= bit
        c += dc; r += dr
      }
    }
  }

  /**
   * The cells of a straight or L-shaped run from start to goal over free,
   * unused lanes that leaves and arrives straight on, marked as used; null
   * when no such run exists.
   */
  private directCells(
    start: { c: number; r: number },
    goal: { c: number; r: number },
    startDir: number,
    goalDir: number
  ): number[] | null {
    const cols = this.cols
    const horizontalFirst = startDir === 0 || startDir === 4
    const legs: Array<Array<{ c: number; r: number }>> = []
    if (start.c === goal.c || start.r === goal.r) legs.push([start, goal])
    legs.push(horizontalFirst ? [start, { c: goal.c, r: start.r }, goal] : [start, { c: start.c, r: goal.r }, goal])
    for (const pts of legs) {
      const cells: number[] = []
      const bits: number[] = []
      let ok = true
      for (let i = 1; i < pts.length && ok; i++) {
        const a = pts[i - 1], b = pts[i]
        const dc = Math.sign(b.c - a.c), dr = Math.sign(b.r - a.r)
        if (dc === 0 && dr === 0) continue
        const dir = dc === 1 ? 0 : dc === -1 ? 4 : dr === 1 ? 2 : 6
        if (i === 1 && dir !== startDir) { ok = false; break }
        if (i === pts.length - 1 && dir !== goalDir) { ok = false; break }
        let c = a.c, r = a.r
        if (i === 1) { cells.push(r * cols + c); bits.push(DIR_OCC[dir]) }
        while (c !== b.c || r !== b.r) {
          c += dc; r += dr
          const idx = r * cols + c
          if (this.blocked[idx] || this.occ[idx]) { ok = false; break }
          cells.push(idx); bits.push(DIR_OCC[dir])
        }
      }
      if (!ok || cells.length === 0) continue
      for (let i = 0; i < cells.length; i++) this.occ[cells[i]] |= bits[i]
      return cells
    }
    return null
  }

  /** A* from the start stub to the goal stub inside a window of cells; the cells of the path, or null. */
  private search(
    start: { c: number; r: number },
    goal: { c: number; r: number },
    req: MazeEdgeRequest,
    minC: number, minR: number, maxC: number, maxR: number
  ): number[] | null {
    minC = Math.max(0, minC); minR = Math.max(0, minR)
    maxC = Math.min(this.cols - 1, maxC); maxR = Math.min(this.rows - 1, maxR)

    const startDir = outwardDir(req.sourceSide)
    const goalDir = inwardDir(req.targetSide)
    const startIdx = start.r * this.cols + start.c
    const goalIdx = goal.r * this.cols + goal.c
    const cols = this.cols
    const dirStep = this.diagonal ? 1 : 2

    const gen = ++this.generation
    const { g, parent, stamp, closed, heap } = this
    heap.clear()

    const h = (c: number, r: number): number => {
      const dx = Math.abs(c - goal.c), dy = Math.abs(r - goal.r)
      return this.diagonal ? Math.max(dx, dy) + (DIAG_STEP - 1) * Math.min(dx, dy) : dx + dy
    }

    const startState = startIdx * NDIR + startDir
    stamp[startState] = gen
    g[startState] = 0
    parent[startState] = -1
    heap.push(startState, HEURISTIC_WEIGHT * h(start.c, start.r))

    let found = -1
    let expansions = 0
    while (heap.size > 0) {
      const state = heap.pop()
      if (closed[state] === gen) continue
      closed[state] = gen
      this.spent++
      if (++expansions > MAX_EXPANSIONS) return null
      const idx = (state / NDIR) | 0
      const dir = state - idx * NDIR
      // The goal is the lane outside the target port; nothing continues past it into the card
      if (idx === goalIdx) { found = state; break }

      const c = idx % cols, r = (idx - c) / cols
      const gHere = g[state]
      for (let nd = 0; nd < NDIR; nd += dirStep) {
        // No reversing, and no turns sharper than 90°
        const turn = Math.abs(nd - dir)
        if (turn > 2 && turn < NDIR - 2) continue
        const nc = c + DX[nd], nr = r + DY[nd]
        if (nc < minC || nr < minR || nc > maxC || nr > maxR) continue
        const nIdx = nr * cols + nc
        if (this.blocked[nIdx] === 2 && nIdx !== goalIdx) continue
        // A diagonal step may not cut the corner of a card
        if (nd & 1) {
          const sideA = r * cols + nc, sideB = nr * cols + c
          if (this.blocked[sideA] === 2 || this.blocked[sideB] === 2) continue
        }
        const nState = nIdx * NDIR + nd
        if (closed[nState] === gen) continue
        let tentative = gHere + this.stepCost(nIdx, nd, dir)
        // Arriving straight on is the clean entry; from the side is allowed when
        // a neighbouring card leaves no room, at a price
        if (nIdx === goalIdx && nd !== goalDir) tentative += SIDEWAYS_ENTRY
        if (stamp[nState] === gen && tentative >= g[nState]) continue
        stamp[nState] = gen
        g[nState] = tentative
        parent[nState] = state
        heap.push(nState, tentative + HEURISTIC_WEIGHT * h(nc, nr))
      }
    }
    if (found < 0) return null

    // Walk back to the start, collecting cells and marking the lanes used
    const cells: number[] = []
    for (let s = found; s >= 0; s = parent[s]) {
      const idx = (s / NDIR) | 0
      const dir = s - idx * NDIR
      cells.push(idx)
      this.occ[idx] |= DIR_OCC[dir]
    }
    cells.reverse()
    return cells
  }
}

/** Drop points that continue the previous direction, and zero-length steps. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const n = out.length
    if (n > 0 && Math.abs(out[n - 1].x - p.x) < 0.01 && Math.abs(out[n - 1].y - p.y) < 0.01) continue
    if (n >= 2) {
      const a = out[n - 2], b = out[n - 1]
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)
      const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y)
      if (Math.abs(cross) < 0.01 && dot > 0) { out[n - 1] = p; continue }
    }
    out.push(p)
  }
  return out
}

/**
 * Route a set of edges together on one lane grid, shortest first so the long
 * traces bend around the short ones rather than the other way round.
 * Edges the router cannot reach are left out of the result.
 */
export function routeEdgesMaze(
  requests: MazeEdgeRequest[],
  nodes: NodeRect[],
  options: MazeOptions,
  /** Paths of edges that keep their route; their lanes are reserved first */
  reserved?: Iterable<Point[]>
): { routes: Map<string, MazeRoute>; failures: Map<string, MazeFailure> } {
  const router = new MazeRouter(nodes, options)
  if (reserved) for (const path of reserved) router.markPath(path)
  const ordered = [...requests].sort((a, b) => {
    const da = Math.abs(a.targetPort.x - a.sourcePort.x) + Math.abs(a.targetPort.y - a.sourcePort.y)
    const db = Math.abs(b.targetPort.x - b.sourcePort.x) + Math.abs(b.targetPort.y - b.sourcePort.y)
    return da - db || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  })
  const routes = new Map<string, MazeRoute>()
  const failures = new Map<string, MazeFailure>()
  for (const req of ordered) {
    const route = router.route(req)
    if (typeof route === 'string') failures.set(req.id, route)
    else routes.set(req.id, route)
  }
  return { routes, failures }
}
