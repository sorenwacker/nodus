/**
 * Physics mode: a force simulation that keeps running in bubble mode
 * (PRODUCT_DESIGN.md > Physics Mode).
 *
 * A layout command computes positions once. Here the simulation steps once per
 * painted frame, in a worker, over the nodes on screen. Its centres are exposed
 * as one array for the bubble canvas to paint from; the store is written once,
 * when the simulation rests or the mode is switched off.
 */
import { ref, shallowRef, computed, type Ref, type ShallowRef, type ComputedRef } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import type { CreatePhysicsEngine, PhysicsEngine, StepInput } from './physicsEngine'

/** The most nodes the simulation runs on; one step takes about a frame at this size */
export const PHYSICS_MAX_NODES = 2000

export interface PhysicsNode {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

/** Node centres from the latest step, x and y per node at index * 2 */
export interface LivePositions {
  index: Map<string, number>
  xy: Float64Array
  /** Counts steps, so a repaint can tell a new frame from the last */
  frame: number
}

export interface LivePhysicsDeps {
  /** The nodes on screen; the simulation takes them when the mode starts */
  getVisibleNodes: () => PhysicsNode[]
  /** Every node in the workspace, for off-screen anchors */
  getNodes: () => PhysicsNode[]
  getEdges: () => Array<{ source_node_id: string; target_node_id: string }>
  /** Bubble radius in canvas units, for collision */
  getRadius: (id: string) => number
  /** True where the mode is unavailable (outside bubble mode, neighbourhood mode) */
  isBlocked: () => boolean
  updateNodePosition: (id: string, x: number, y: number) => void
  /** Snap-to-grid for stored positions; identity when it is off */
  snap: (value: number) => number
  pushUndo: () => void
  requestFrame: (callback: () => void) => unknown
  cancelFrame: (handle: unknown) => void
  createEngine: CreatePhysicsEngine
  /** Screen point to canvas units */
  toCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number }
}

export interface LivePhysics {
  active: Ref<boolean>
  /** The simulation is moving nodes (active and not at rest) */
  running: Ref<boolean>
  available: ComputedRef<boolean>
  live: ShallowRef<LivePositions | null>
  start: () => Promise<void>
  stop: () => void
  toggle: () => Promise<void>
  /** Hold a node at a point in canvas units; the others respond */
  grab: (id: string, at: { x: number; y: number }) => void
  moveGrabbed: (at: { x: number; y: number }) => void
  release: () => void
  /** Hold a node for as long as the pointer that pressed it stays down */
  grabWithPointer: (event: PointerEvent, id: string) => void
}

interface Member {
  id: string
  width: number
  height: number
  /** Top-left corner when last stored, to find what moved */
  storedX: number
  storedY: number
  anchor: boolean
}

export function useLivePhysics(deps: LivePhysicsDeps): LivePhysics {
  const active = ref(false)
  const running = ref(false)
  const live = shallowRef<LivePositions | null>(null)
  const available = computed(() => !deps.isBlocked() && deps.getVisibleNodes().length <= PHYSICS_MAX_NODES)

  let engine: PhysicsEngine | null = null
  let members: Member[] = []
  let frame: unknown = null
  let stepping = false
  let pinned: StepInput['pinned'] = null
  /** Distinguishes a session from the one before, so a late step result is dropped */
  let session = 0

  async function start(): Promise<void> {
    if (active.value || !available.value) return
    const visible = deps.getVisibleNodes()
    const visibleIds = new Set(visible.map(n => n.id))
    const edges = deps.getEdges().filter(e => visibleIds.has(e.source_node_id) || visibleIds.has(e.target_node_id))
    const anchorIds = new Set(
      edges.flatMap(e => [e.source_node_id, e.target_node_id]).filter(id => !visibleIds.has(id))
    )
    const nodes = [...visible, ...deps.getNodes().filter(n => anchorIds.has(n.id))]

    const index = new Map<string, number>()
    const xy = new Float64Array(2 * nodes.length)
    const radius = new Float64Array(nodes.length)
    const anchor = new Uint8Array(nodes.length)
    members = nodes.map((n, i) => {
      const width = n.width || NODE_DEFAULTS.WIDTH
      const height = n.height || NODE_DEFAULTS.HEIGHT
      index.set(n.id, i)
      xy[2 * i] = n.canvas_x + width / 2
      xy[2 * i + 1] = n.canvas_y + height / 2
      radius[i] = deps.getRadius(n.id)
      anchor[i] = visibleIds.has(n.id) ? 0 : 1
      return { id: n.id, width, height, storedX: n.canvas_x, storedY: n.canvas_y, anchor: !visibleIds.has(n.id) }
    })
    const links: number[] = []
    for (const e of edges) {
      const s = index.get(e.source_node_id)
      const t = index.get(e.target_node_id)
      if (s !== undefined && t !== undefined && s !== t) links.push(s, t)
    }

    deps.pushUndo()
    const mine = ++session
    const created = await deps.createEngine({ xy: xy.slice(), radius, anchor, links: Int32Array.from(links) })
    if (mine !== session) {
      created.dispose()
      return
    }
    engine = created
    live.value = { index, xy, frame: 0 }
    active.value = true
    schedule()
  }

  function schedule() {
    running.value = true
    if (frame === null) frame = deps.requestFrame(onFrame)
  }

  /** One step per painted frame, and only once the previous one has returned */
  function onFrame() {
    frame = null
    if (!engine || !active.value || stepping) return
    stepping = true
    const mine = session
    engine.step({ pinned }).then(result => {
      stepping = false
      if (mine !== session || !live.value) return
      live.value = { index: live.value.index, xy: result.xy, frame: live.value.frame + 1 }
      if (result.resting && !pinned) {
        running.value = false
        storeMoved()
      } else {
        schedule()
      }
    })
  }

  /** Store, once, every simulated node that moved since it was last stored */
  function storeMoved() {
    const xy = live.value?.xy
    if (!xy) return
    members.forEach((m, i) => {
      if (m.anchor) return
      const x = deps.snap(xy[2 * i] - m.width / 2)
      const y = deps.snap(xy[2 * i + 1] - m.height / 2)
      if (x === m.storedX && y === m.storedY) return
      deps.updateNodePosition(m.id, x, y)
      m.storedX = x
      m.storedY = y
    })
  }

  function grab(id: string, at: { x: number; y: number }) {
    const index = live.value?.index.get(id)
    if (!active.value || index === undefined || members[index].anchor) return
    pinned = { index, x: at.x, y: at.y }
    schedule()
  }

  function moveGrabbed(at: { x: number; y: number }) {
    if (!pinned) return
    pinned = { index: pinned.index, x: at.x, y: at.y }
    schedule()
  }

  function release() {
    if (!pinned) return
    pinned = null
    schedule()
  }

  function grabWithPointer(event: PointerEvent, id: string) {
    // The press is the simulation's, not a pan or a card drag
    event.stopPropagation()
    const at = (e: PointerEvent) => deps.toCanvasPoint(e.clientX, e.clientY)
    grab(id, at(event))
    const move = (e: PointerEvent) => moveGrabbed(at(e))
    const up = () => {
      release()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  function stop() {
    if (!active.value) return
    if (frame !== null) {
      deps.cancelFrame(frame)
      frame = null
    }
    storeMoved()
    session++
    engine?.dispose()
    engine = null
    stepping = false
    pinned = null
    running.value = false
    active.value = false
    live.value = null
    members = []
  }

  async function toggle() {
    if (active.value) stop()
    else await start()
  }

  return { active, running, available, live, start, stop, toggle, grab, moveGrabbed, release, grabWithPointer }
}
