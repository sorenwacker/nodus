/**
 * The physics mode simulation, as plain arrays in and out
 * (PRODUCT_DESIGN.md > Physics Mode).
 *
 * Node centres travel as one Float64Array (x, y per node) so a step can run in
 * a Web Worker and hand its result back without copying, and the bubble canvas
 * can paint from it without touching the store.
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'

/** Link length, repulsion, its reach, and the heat a held node keeps up */
const LINK_DISTANCE = 260
const CHARGE_STRENGTH = -400
/** Repulsion reaches this far; unbounded, distant nodes nudged each other and the graph drifted */
const CHARGE_RANGE = 1200
const GRAB_ALPHA_TARGET = 0.3
/** Space kept between two bubbles beyond their radii */
const COLLIDE_PADDING = 4

export interface PhysicsInit {
  /** Centres, x and y per node */
  xy: Float64Array
  radius: Float64Array
  /** 1 where the node is an off-screen anchor that never moves */
  anchor: Uint8Array
  /** Node index pairs, source then target */
  links: Int32Array
}

export interface StepInput {
  /** The node the pointer holds, and where */
  pinned: { index: number; x: number; y: number } | null
}

export interface StepResult {
  xy: Float64Array
  resting: boolean
}

export interface PhysicsEngine {
  step: (input: StepInput) => Promise<StepResult>
  dispose: () => void
}

export type CreatePhysicsEngine = (init: PhysicsInit) => Promise<PhysicsEngine>

interface SimNode extends SimulationNodeDatum {
  r: number
}

/** One simulation, stepped on request */
function createSimulationCore(init: PhysicsInit) {
  const count = init.radius.length
  const nodes: SimNode[] = []
  for (let i = 0; i < count; i++) {
    const x = init.xy[2 * i]
    const y = init.xy[2 * i + 1]
    nodes.push({ index: i, x, y, r: init.radius[i], ...(init.anchor[i] ? { fx: x, fy: y } : {}) })
  }
  const links: SimulationLinkDatum<SimNode>[] = []
  for (let i = 0; i < init.links.length; i += 2) links.push({ source: init.links[i], target: init.links[i + 1] })

  const simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> = forceSimulation(nodes)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).distance(LINK_DISTANCE))
    .force('charge', forceManyBody<SimNode>().strength(CHARGE_STRENGTH).distanceMax(CHARGE_RANGE))
    .force('collide', forceCollide<SimNode>(n => n.r + COLLIDE_PADDING))
    // Stepped on request below, not by d3's own timer
    .stop()

  let pinnedIndex: number | null = null

  function step(input: StepInput): StepResult {
    const pinned = input.pinned
    if (pinnedIndex !== null && pinnedIndex !== pinned?.index && !init.anchor[pinnedIndex]) {
      nodes[pinnedIndex].fx = null
      nodes[pinnedIndex].fy = null
    }
    if (pinned) {
      // A new grab wakes a resting simulation
      if (pinnedIndex !== pinned.index) simulation.alpha(Math.max(simulation.alpha(), GRAB_ALPHA_TARGET))
      nodes[pinned.index].fx = pinned.x
      nodes[pinned.index].fy = pinned.y
    }
    pinnedIndex = pinned?.index ?? null
    simulation.alphaTarget(pinned ? GRAB_ALPHA_TARGET : 0)
    simulation.tick()

    const xy = new Float64Array(2 * count)
    for (let i = 0; i < count; i++) {
      xy[2 * i] = nodes[i].x!
      xy[2 * i + 1] = nodes[i].y!
    }
    return { xy, resting: !pinned && simulation.alpha() < simulation.alphaMin() }
  }

  return { step }
}

export type PhysicsMessage = { type: 'init'; init: PhysicsInit } | { type: 'step'; input: StepInput }

let workerCore: ReturnType<typeof createSimulationCore> | null = null

/** The worker side of the protocol: returns the reply to post, if any */
export function handlePhysicsMessage(message: unknown): StepResult | null {
  const m = message as PhysicsMessage
  if (m.type === 'init') {
    workerCore = createSimulationCore(m.init)
    return null
  }
  return workerCore ? workerCore.step(m.input) : null
}

/** Runs the simulation on the calling thread; used where no worker exists */
export async function createInProcessEngine(init: PhysicsInit): Promise<PhysicsEngine> {
  const core = createSimulationCore(init)
  return { step: async input => core.step(input), dispose: () => {} }
}

/** The part of a Worker the engine uses */
export interface PhysicsWorkerLike {
  postMessage: (message: unknown) => void
  onmessage: ((event: MessageEvent) => void) | null
  terminate: () => void
}

function spawnPhysicsWorker(): PhysicsWorkerLike {
  return new Worker(new URL('../../workers/physicsWorker.ts', import.meta.url), { type: 'module' })
}

/** Runs the simulation in a Web Worker, one step in flight at a time */
export async function createWorkerEngine(
  init: PhysicsInit,
  spawn: () => PhysicsWorkerLike = spawnPhysicsWorker
): Promise<PhysicsEngine> {
  const worker = spawn()
  let pending: ((result: StepResult) => void) | null = null
  worker.onmessage = event => {
    const resolve = pending
    pending = null
    resolve?.(event.data as StepResult)
  }
  worker.postMessage({ type: 'init', init } satisfies PhysicsMessage)
  return {
    step: input =>
      new Promise(resolve => {
        pending = resolve
        worker.postMessage({ type: 'step', input } satisfies PhysicsMessage)
      }),
    dispose: () => worker.terminate(),
  }
}
