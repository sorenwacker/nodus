/**
 * The physics simulation rearranges the graph and does not carry it off
 * (PRODUCT_DESIGN.md > Physics Mode).
 *
 * d3's edge force moves the end with fewer edges further, and its collision
 * force the smaller bubble further, so neither cancels out over the graph: the
 * remainder pushed every simulated node the same way on each reheat.
 */
import { describe, it, expect } from 'vitest'
import { createInProcessEngine, type PhysicsEngine, type PhysicsInit } from '../canvas/composables/layout/physicsEngine'

interface Graph {
  xy: number[]
  radius: number[]
  anchor: number[]
  links: number[]
}

/**
 * A hub with a fan of leaves on one side and a chain on the other: the ends of
 * most edges differ in how many edges they have, and the bubbles differ in size.
 */
function lopsidedGraph(originX = 0, originY = 0): Graph {
  const graph: Graph = { xy: [], radius: [], anchor: [], links: [] }
  const add = (x: number, y: number, radius: number) => {
    graph.xy.push(originX + x, originY + y)
    graph.radius.push(radius)
    graph.anchor.push(0)
    return graph.radius.length - 1
  }
  const hub = add(0, 0, 60)
  for (let i = 0; i < 14; i++) graph.links.push(hub, add(300 + 40 * i, -260 + 40 * i, 20))
  let previous = hub
  for (let i = 0; i < 8; i++) {
    const next = add(-200 - 150 * i, 80 * (i % 2), 30 + 5 * i)
    graph.links.push(previous, next)
    if (i % 2 === 0) graph.links.push(next, add(-200 - 150 * i, 300, 20))
    previous = next
  }
  return graph
}

function merge(a: Graph, b: Graph): Graph {
  const offset = a.radius.length
  return {
    xy: [...a.xy, ...b.xy],
    radius: [...a.radius, ...b.radius],
    anchor: [...a.anchor, ...b.anchor],
    links: [...a.links, ...b.links.map(i => i + offset)],
  }
}

const toInit = (graph: Graph): PhysicsInit => ({
  xy: Float64Array.from(graph.xy),
  radius: Float64Array.from(graph.radius),
  anchor: Uint8Array.from(graph.anchor),
  links: Int32Array.from(graph.links),
})

async function runToRest(engine: PhysicsEngine): Promise<Float64Array> {
  for (let i = 0; i < 2000; i++) {
    const result = await engine.step({ pinned: null })
    if (result.resting) return result.xy
  }
  throw new Error('the simulation did not come to rest')
}

/** Reheat as switching the mode on or a change to the graph does: a new simulation from where the last one rested */
async function reheat(graph: Graph, times: number): Promise<number[]> {
  let xy = graph.xy
  for (let i = 0; i < times; i++) {
    const engine = await createInProcessEngine(toInit({ ...graph, xy }))
    xy = Array.from(await runToRest(engine))
  }
  return xy
}

function centre(xy: number[], from = 0, to = xy.length / 2): { x: number; y: number } {
  let x = 0
  let y = 0
  for (let i = from; i < to; i++) {
    x += xy[2 * i]
    y += xy[2 * i + 1]
  }
  return { x: x / (to - from), y: y / (to - from) }
}

const shift = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('physics mode drift', () => {
  it('keeps the centre of a graph nothing holds, however often it reheats', async () => {
    const graph = lopsidedGraph()
    const rested = await reheat(graph, 6)
    expect(shift(centre(rested), centre(graph.xy))).toBeLessThan(1)
  })

  it('still rearranges the graph it does not carry off', async () => {
    const graph = lopsidedGraph()
    const rested = await reheat(graph, 1)
    const moved = graph.radius.filter((_, i) => Math.hypot(rested[2 * i] - graph.xy[2 * i], rested[2 * i + 1] - graph.xy[2 * i + 1]) > 10)
    expect(moved.length).toBeGreaterThan(graph.radius.length / 2)
  })

  it('does not let the edges of a group no anchor holds move it, while another group is anchored', async () => {
    const free = lopsidedGraph()
    // Bubbles of one size collide by equal shares, which leaves the edges as the only uneven force
    free.radius.fill(20)
    // Out of reach of the free group's repulsion and collision
    const held: Graph = { xy: [50000, 0, 50400, 0], radius: [20, 20], anchor: [0, 1], links: [0, 1] }
    const graph = merge(free, held)
    const rested = await reheat(graph, 6)
    const count = free.radius.length
    expect(shift(centre(rested, 0, count), centre(graph.xy, 0, count))).toBeLessThan(5)
  })

  it('keeps the pull of an anchor on the group it is connected to', async () => {
    const graph = lopsidedGraph()
    const count = graph.radius.length
    // An anchor far to the right, connected to the hub
    graph.xy.push(4000, 0)
    graph.radius.push(20)
    graph.anchor.push(1)
    graph.links.push(0, count)
    const engine = await createInProcessEngine(toInit(graph))
    // Drag the hub away from the anchor, its group with it, then let go
    let dragged: Float64Array = new Float64Array()
    for (let i = 0; i < 300; i++) dragged = (await engine.step({ pinned: { index: 0, x: -3000, y: 0 } })).xy
    const rested = Array.from(await runToRest(engine))
    expect(centre(Array.from(dragged), 0, count).x).toBeLessThan(-2000)
    expect(centre(rested, 0, count).x - centre(Array.from(dragged), 0, count).x).toBeGreaterThan(300)
    expect([rested[2 * count], rested[2 * count + 1]]).toEqual([4000, 0])
  })

  it('lets a held node take its group along', async () => {
    const graph = lopsidedGraph()
    const engine = await createInProcessEngine(toInit(graph))
    let xy: Float64Array = new Float64Array()
    for (let i = 0; i < 300; i++) xy = (await engine.step({ pinned: { index: 0, x: 3000, y: 0 } })).xy
    expect(centre(Array.from(xy)).x - centre(graph.xy).x).toBeGreaterThan(1000)
  })
})

describe('physics mode anchors', () => {
  /** One simulated node at the origin, joined to an anchor at the given distance */
  const tethered = (distance: number): Graph => ({ xy: [0, 0, distance, 0], radius: [20, 20], anchor: [0, 1], links: [0, 1] })

  it('does not reel a node in toward a distant anchor', async () => {
    const graph = tethered(5000)
    const rested = await reheat(graph, 3)
    expect(Math.hypot(rested[0], rested[1])).toBeLessThan(1)
    expect([rested[2], rested[3]]).toEqual([5000, 0])
  })

  it('keeps a node the common edge length away from an anchor that is nearer', async () => {
    const rested = await reheat(tethered(100), 1)
    expect(100 - rested[0]).toBeGreaterThan(200)
  })

  it('pulls a node back to the length of its tether when it was dragged away', async () => {
    const engine = await createInProcessEngine(toInit(tethered(5000)))
    for (let i = 0; i < 100; i++) await engine.step({ pinned: { index: 0, x: -2000, y: 0 } })
    const rested = await runToRest(engine)
    expect(Math.abs(Math.hypot(5000 - rested[0], rested[1]) - 5000)).toBeLessThan(250)
  })
})
