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
  type Force,
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

interface SimLink extends SimulationLinkDatum<SimNode> {
  /** The length the edge is pulled to */
  length: number
}

/** The groups of nodes that edges connect, each as node indices; a node without an edge is in none */
function connectedGroups(count: number, links: Int32Array): number[][] {
  const parent = Array.from({ length: count }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (let i = 0; i < links.length; i += 2) parent[find(links[i])] = find(links[i + 1])
  const byRoot = new Map<number, number[]>()
  for (let i = 0; i < count; i++) {
    const root = find(i)
    const group = byRoot.get(root)
    if (group) group.push(i)
    else byRoot.set(root, [i])
  }
  return [...byRoot.values()].filter(group => group.length > 1)
}

/**
 * A force that rearranges each of the given groups without moving the group as
 * a whole: what it adds to the mean velocity of a group is taken out again.
 * d3's edge and collision forces move the two nodes of a pair by unequal
 * shares, which leaves a remainder that pushes the whole graph one way.
 */
function withoutNetPush(force: Force<SimNode, undefined>, groups: () => number[][]): Force<SimNode, undefined> {
  let nodes: SimNode[] = []
  let before = new Float64Array(0)
  const wrapped = (alpha: number) => {
    const held = groups()
    if (held.length === 0) {
      force(alpha)
      return
    }
    for (let i = 0; i < nodes.length; i++) {
      before[2 * i] = nodes[i].vx!
      before[2 * i + 1] = nodes[i].vy!
    }
    force(alpha)
    for (const group of held) {
      let dx = 0
      let dy = 0
      for (const i of group) {
        dx += nodes[i].vx! - before[2 * i]
        dy += nodes[i].vy! - before[2 * i + 1]
      }
      dx /= group.length
      dy /= group.length
      for (const i of group) {
        nodes[i].vx! -= dx
        nodes[i].vy! -= dy
      }
    }
  }
  wrapped.initialize = (initialNodes: SimNode[], random: () => number) => {
    nodes = initialNodes
    before = new Float64Array(2 * initialNodes.length)
    force.initialize?.(initialNodes, random)
  }
  return wrapped
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
  const links: SimLink[] = []
  for (let i = 0; i < init.links.length; i += 2) {
    const source = init.links[i]
    const target = init.links[i + 1]
    // An edge to an anchor is a tether: it keeps its length, so the anchor
    // holds its neighbour where it is instead of reeling it in
    const tether = init.anchor[source] || init.anchor[target]
    const apart = Math.hypot(nodes[source].x! - nodes[target].x!, nodes[source].y! - nodes[target].y!)
    links.push({ source, target, length: tether ? Math.max(LINK_DISTANCE, apart) : LINK_DISTANCE })
  }

  let pinnedIndex: number | null = null

  // Forces between nodes must not move them as a whole
  // (PRODUCT_DESIGN.md > Physics Mode). An anchor or the held node pulls on
  // its group for real, so the edges of a group that has one keep their net
  // pull. A push between two nodes is equal and opposite whoever they are, so
  // repulsion and collision are balanced over every node, fixed ones included
  const groups = connectedGroups(count, init.links)
  const anchored = groups.map(group => group.some(i => init.anchor[i]))
  const everyNode = [Array.from({ length: count }, (_, i) => i)]
  const groupsNothingHolds = () => groups.filter((group, g) => !anchored[g] && (pinnedIndex === null || !group.includes(pinnedIndex)))

  const simulation: Simulation<SimNode, SimLink> = forceSimulation(nodes)
    .force('link', withoutNetPush(forceLink<SimNode, SimLink>(links).distance(link => link.length), groupsNothingHolds))
    .force('charge', withoutNetPush(forceManyBody<SimNode>().strength(CHARGE_STRENGTH).distanceMax(CHARGE_RANGE), () => everyNode))
    .force('collide', withoutNetPush(forceCollide<SimNode>(n => n.r + COLLIDE_PADDING), () => everyNode))
    // Stepped on request below, not by d3's own timer
    .stop()

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
