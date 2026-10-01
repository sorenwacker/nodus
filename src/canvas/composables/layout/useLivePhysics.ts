/**
 * Physics mode: a force simulation that keeps running on the canvas
 * (PRODUCT_DESIGN.md > Physics Mode).
 *
 * A layout command computes positions once. Here the simulation runs frame by
 * frame over the nodes on screen, so dragging a node drags its connections and
 * the rest makes room. Positions change in memory while it runs and are stored
 * once when it rests or the mode is switched off.
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'
import { NODE_DEFAULTS } from '../../constants'

/** The most nodes the simulation runs on; more is too slow to run every frame. */
export const PHYSICS_MAX_NODES = 800

/** Link length, repulsion and the heat a drag adds */
const LINK_DISTANCE = 260
const CHARGE_STRENGTH = -400
/** Repulsion reaches this far; unbounded, distant nodes nudged each other and the graph drifted */
const CHARGE_RANGE = 1200
const DRAG_ALPHA_TARGET = 0.3

export interface PhysicsNode {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

export interface LivePhysicsDeps {
  /** The nodes on screen; the simulation takes them when the mode starts */
  getVisibleNodes: () => PhysicsNode[]
  /** Every node in the workspace, for off-screen anchors */
  getNodes: () => PhysicsNode[]
  getEdges: () => Array<{ source_node_id: string; target_node_id: string }>
  /** The node the user is dragging, which follows the pointer, not the forces */
  getDraggingNodeId: () => string | null
  /** True where the mode is unavailable (neighbourhood mode) */
  isBlocked: () => boolean
  updateNodePosition: (id: string, x: number, y: number, options?: { skipPersist?: boolean }) => void
  /** Snap-to-grid for stored positions; identity when it is off */
  snap: (value: number) => number
  pushUndo: () => void
  requestFrame: (callback: () => void) => unknown
  cancelFrame: (handle: unknown) => void
}

interface SimNode extends SimulationNodeDatum {
  id: string
  width: number
  height: number
  /** Top-left corner when the session started, to find what moved */
  startX: number
  startY: number
  anchor: boolean
}

export interface LivePhysics {
  active: Ref<boolean>
  /** The simulation is moving nodes (active and not at rest) */
  running: Ref<boolean>
  available: ComputedRef<boolean>
  start: () => Promise<void>
  stop: () => void
  toggle: () => Promise<void>
  /** Wake a resting simulation, e.g. when a drag begins */
  reheat: () => void
}

export function useLivePhysics(deps: LivePhysicsDeps): LivePhysics {
  const active = ref(false)
  const running = ref(false)
  const available = computed(() => !deps.isBlocked() && deps.getVisibleNodes().length <= PHYSICS_MAX_NODES)

  let simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> | null = null
  let simNodes: SimNode[] = []
  let frame: unknown = null

  const size = (n: PhysicsNode) => ({
    width: n.width || NODE_DEFAULTS.WIDTH,
    height: n.height || NODE_DEFAULTS.HEIGHT,
  })

  function toSimNode(n: PhysicsNode, anchor: boolean): SimNode {
    const { width, height } = size(n)
    const x = n.canvas_x + width / 2
    const y = n.canvas_y + height / 2
    return {
      id: n.id,
      width,
      height,
      startX: n.canvas_x,
      startY: n.canvas_y,
      anchor,
      x,
      y,
      // Anchors never move: they hold the visible part in its place in the graph
      ...(anchor ? { fx: x, fy: y } : {}),
    }
  }

  async function start(): Promise<void> {
    if (active.value || !available.value) return
    const d3 = await import('d3-force')

    const visible = deps.getVisibleNodes()
    const visibleIds = new Set(visible.map(n => n.id))
    const edges = deps.getEdges().filter(e => visibleIds.has(e.source_node_id) || visibleIds.has(e.target_node_id))
    const anchorIds = new Set(
      edges.flatMap(e => [e.source_node_id, e.target_node_id]).filter(id => !visibleIds.has(id))
    )
    const anchors = deps.getNodes().filter(n => anchorIds.has(n.id))

    simNodes = [...visible.map(n => toSimNode(n, false)), ...anchors.map(n => toSimNode(n, true))]
    const present = new Set(simNodes.map(n => n.id))
    const links = edges
      .filter(e => present.has(e.source_node_id) && present.has(e.target_node_id) && e.source_node_id !== e.target_node_id)
      .map(e => ({ source: e.source_node_id, target: e.target_node_id }))

    deps.pushUndo()
    simulation = d3
      .forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id(n => n.id).distance(LINK_DISTANCE))
      .force('charge', d3.forceManyBody<SimNode>().strength(CHARGE_STRENGTH).distanceMax(CHARGE_RANGE))
      .force('collide', d3.forceCollide<SimNode>(n => Math.hypot(n.width, n.height) / 2))
      // Driven frame by frame below, not by d3's own timer
      .stop()

    active.value = true
    schedule()
  }

  function schedule() {
    running.value = true
    if (frame === null) frame = deps.requestFrame(tick)
  }

  function tick() {
    frame = null
    if (!simulation || !active.value) return

    const dragging = deps.getDraggingNodeId()
    for (const n of simNodes) {
      if (n.anchor) continue
      if (n.id === dragging) {
        // The pointer owns this node: pin it where the drag put it
        const current = deps.getNodes().find(node => node.id === n.id)
        if (current) {
          n.fx = current.canvas_x + n.width / 2
          n.fy = current.canvas_y + n.height / 2
        }
      } else if (n.fx !== undefined && n.fx !== null) {
        n.fx = null
        n.fy = null
      }
    }
    simulation.alphaTarget(dragging ? DRAG_ALPHA_TARGET : 0)
    simulation.tick()

    for (const n of simNodes) {
      if (n.anchor || n.id === dragging) continue
      deps.updateNodePosition(n.id, n.x! - n.width / 2, n.y! - n.height / 2, { skipPersist: true })
    }

    if (dragging || simulation.alpha() >= simulation.alphaMin()) {
      schedule()
    } else {
      running.value = false
      storeMoved()
    }
  }

  /** Store, once, every simulated node that moved since the session began */
  function storeMoved() {
    for (const n of simNodes) {
      if (n.anchor || n.x === undefined || n.y === undefined) continue
      const x = n.x - n.width / 2
      const y = n.y - n.height / 2
      if (x === n.startX && y === n.startY) continue
      const sx = deps.snap(x)
      const sy = deps.snap(y)
      deps.updateNodePosition(n.id, sx, sy)
      n.startX = sx
      n.startY = sy
    }
  }

  function reheat() {
    if (!simulation || !active.value) return
    simulation.alpha(Math.max(simulation.alpha(), DRAG_ALPHA_TARGET))
    schedule()
  }

  function stop() {
    if (!active.value) return
    if (frame !== null) {
      deps.cancelFrame(frame)
      frame = null
    }
    storeMoved()
    running.value = false
    active.value = false
    simulation = null
    simNodes = []
  }

  async function toggle() {
    if (active.value) stop()
    else await start()
  }

  return { active, running, available, start, stop, toggle, reheat }
}
