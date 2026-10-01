/**
 * Physics mode keeps a force simulation running on the canvas
 * (PRODUCT_DESIGN.md > Physics Mode).
 */
import { describe, it, expect, vi } from 'vitest'
import { useLivePhysics, PHYSICS_MAX_NODES, type PhysicsNode } from '../canvas/composables/layout/useLivePhysics'

function node(id: string, x: number, y: number): PhysicsNode {
  return { id, canvas_x: x, canvas_y: y, width: 200, height: 120 }
}

function setup(options: {
  visible: PhysicsNode[]
  offscreen?: PhysicsNode[]
  edges?: Array<[string, string]>
  blocked?: boolean
  snap?: (v: number) => number
}) {
  const all = [...options.visible, ...(options.offscreen ?? [])]
  const byId = new Map(all.map(n => [n.id, n]))
  const frames: Array<() => void> = []
  let dragging: string | null = null
  const live: string[] = []
  const stored: string[] = []

  const updateNodePosition = vi.fn((id: string, x: number, y: number, opts?: { skipPersist?: boolean }) => {
    const n = byId.get(id)!
    n.canvas_x = x
    n.canvas_y = y
    ;(opts?.skipPersist ? live : stored).push(id)
  })
  const pushUndo = vi.fn()

  const physics = useLivePhysics({
    getVisibleNodes: () => options.visible,
    getNodes: () => all,
    getEdges: () => (options.edges ?? []).map(([s, t]) => ({ source_node_id: s, target_node_id: t })),
    getDraggingNodeId: () => dragging,
    isBlocked: () => options.blocked ?? false,
    updateNodePosition,
    snap: options.snap ?? (v => v),
    pushUndo,
    requestFrame: cb => frames.push(cb),
    cancelFrame: () => {},
  })

  /** Run up to n scheduled frames */
  function step(n: number) {
    for (let i = 0; i < n && frames.length > 0; i++) frames.shift()!()
  }

  return {
    physics,
    byId,
    step,
    live,
    stored,
    pushUndo,
    updateNodePosition,
    drag: (id: string | null) => {
      dragging = id
    },
    frames,
  }
}

const centre = (n: PhysicsNode) => ({ x: n.canvas_x + 100, y: n.canvas_y + 60 })
const distance = (a: PhysicsNode, b: PhysicsNode) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y)

describe('physics mode', () => {
  it('records one undo step when switched on', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    w.step(20)
    expect(w.pushUndo).toHaveBeenCalledTimes(1)
  })

  it('pulls connected nodes together', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    const before = distance(w.byId.get('a')!, w.byId.get('b')!)
    await w.physics.start()
    w.step(120)
    expect(distance(w.byId.get('a')!, w.byId.get('b')!)).toBeLessThan(before / 2)
  })

  it('pushes overlapping cards apart', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 10, 10)] })
    await w.physics.start()
    w.step(120)
    expect(distance(w.byId.get('a')!, w.byId.get('b')!)).toBeGreaterThan(150)
  })

  it('has no centring force: a lone node stays where it is', async () => {
    const w = setup({ visible: [node('a', 5000, -4000)] })
    await w.physics.start()
    w.step(60)
    expect([w.byId.get('a')!.canvas_x, w.byId.get('a')!.canvas_y]).toEqual([5000, -4000])
  })

  it('keeps an off-screen neighbour fixed as an anchor', async () => {
    const w = setup({
      visible: [node('a', 0, 0)],
      offscreen: [node('far', 4000, 0)],
      edges: [['a', 'far']],
    })
    await w.physics.start()
    w.step(120)
    expect([w.byId.get('far')!.canvas_x, w.byId.get('far')!.canvas_y]).toEqual([4000, 0])
    expect(w.byId.get('a')!.canvas_x).toBeGreaterThan(0)
  })

  it('writes positions to memory only while running', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    w.step(5)
    expect(w.live.length).toBeGreaterThan(0)
    expect(w.stored).toEqual([])
  })

  it('stores each moved node once when switched off', async () => {
    const w = setup({
      visible: [node('a', 0, 0), node('b', 3000, 0), node('still', 9000, 9000)],
      edges: [['a', 'b']],
    })
    await w.physics.start()
    w.step(5)
    w.physics.stop()
    expect([...w.stored].sort()).toEqual(['a', 'b'])
    expect(w.frames.length === 0 || !w.physics.active.value).toBe(true)
  })

  it('stores the positions once the simulation comes to rest', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    w.step(2000)
    expect(w.frames).toHaveLength(0)
    expect([...w.stored].sort()).toEqual(['a', 'b'])
    expect(w.physics.active.value).toBe(true)
  })

  it('snaps stored positions when snap-to-grid is on', async () => {
    const w = setup({
      visible: [node('a', 0, 0), node('b', 3000, 0)],
      edges: [['a', 'b']],
      snap: v => Math.round(v / 20) * 20,
    })
    await w.physics.start()
    w.step(10)
    w.physics.stop()
    for (const id of ['a', 'b']) {
      expect(Math.abs(w.byId.get(id)!.canvas_x % 20)).toBe(0)
      expect(Math.abs(w.byId.get(id)!.canvas_y % 20)).toBe(0)
    }
  })

  it('leaves a dragged node to the pointer and reheats the others', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 600, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    w.step(2000)
    w.stored.length = 0
    w.live.length = 0

    w.drag('a')
    w.byId.get('a')!.canvas_x = -3000 // the drag moves it
    w.physics.reheat()
    w.step(60)

    expect(w.live).not.toContain('a')
    expect(w.byId.get('a')!.canvas_x).toBe(-3000)
    expect(w.byId.get('b')!.canvas_x).toBeLessThan(600)
  })

  it('does not start in neighbourhood mode', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']], blocked: true })
    await w.physics.start()
    expect(w.physics.active.value).toBe(false)
    expect(w.pushUndo).not.toHaveBeenCalled()
  })

  it('does not start above the node limit, and says it is unavailable', async () => {
    const many = Array.from({ length: PHYSICS_MAX_NODES + 1 }, (_, i) => node(`n${i}`, i * 300, 0))
    const w = setup({ visible: many })
    expect(w.physics.available.value).toBe(false)
    await w.physics.start()
    expect(w.physics.active.value).toBe(false)
  })

  it('reports running while it moves nodes, and not at rest or when stopped', async () => {
    // Edges route cheaply while it runs (PRODUCT_DESIGN.md > Routing while a layout or physics moves the nodes)
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    expect(w.physics.running.value).toBe(true)
    w.step(2000)
    expect(w.physics.running.value).toBe(false)
    w.physics.reheat()
    expect(w.physics.running.value).toBe(true)
    w.physics.stop()
    expect(w.physics.running.value).toBe(false)
  })

  it('toggles', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.toggle()
    expect(w.physics.active.value).toBe(true)
    await w.physics.toggle()
    expect(w.physics.active.value).toBe(false)
  })
})
