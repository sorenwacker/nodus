/**
 * Physics mode keeps a force simulation running in bubble mode
 * (PRODUCT_DESIGN.md > Physics Mode).
 */
import { describe, it, expect, vi } from 'vitest'
import { useLivePhysics, PHYSICS_MAX_NODES, type PhysicsNode } from '../canvas/composables/layout/useLivePhysics'
import { createInProcessEngine, createWorkerEngine, handlePhysicsMessage, type PhysicsWorkerLike } from '../canvas/composables/layout/physicsEngine'

function node(id: string, x: number, y: number): PhysicsNode {
  return { id, canvas_x: x, canvas_y: y, width: 200, height: 120 }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

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
  const stored: string[] = []
  let steps = 0
  let inFlight = 0
  let maxInFlight = 0

  const updateNodePosition = vi.fn((id: string, x: number, y: number) => {
    const n = byId.get(id)!
    n.canvas_x = x
    n.canvas_y = y
    stored.push(id)
  })
  const pushUndo = vi.fn()

  const physics = useLivePhysics({
    getVisibleNodes: () => options.visible,
    getNodes: () => all,
    getEdges: () => (options.edges ?? []).map(([s, t]) => ({ source_node_id: s, target_node_id: t })),
    getRadius: () => 10,
    isBlocked: () => options.blocked ?? false,
    updateNodePosition,
    snap: options.snap ?? (v => v),
    pushUndo,
    requestFrame: cb => frames.push(cb),
    cancelFrame: () => {},
    toCanvasPoint: (x, y) => ({ x, y }),
    createEngine: async init => {
      const engine = await createInProcessEngine(init)
      return {
        step: async input => {
          steps++
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          const result = await engine.step(input)
          inFlight--
          return result
        },
        dispose: engine.dispose,
      }
    },
  })

  /** Run up to n painted frames, letting each step's result arrive */
  async function step(n: number) {
    for (let i = 0; i < n && frames.length > 0; i++) {
      frames.shift()!()
      await flush()
    }
  }

  /** Where the live frame has a node's centre */
  function live(id: string) {
    const l = physics.live.value!
    const i = l.index.get(id)!
    return { x: l.xy[2 * i], y: l.xy[2 * i + 1] }
  }

  return {
    physics,
    byId,
    step,
    live,
    stored,
    pushUndo,
    updateNodePosition,
    frames,
    steps: () => steps,
    maxInFlight: () => maxInFlight,
  }
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('physics mode', () => {
  it('records one undo step when switched on', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    await w.step(20)
    expect(w.pushUndo).toHaveBeenCalledTimes(1)
  })

  it('pulls connected nodes together', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    const before = distance(w.live('a'), w.live('b'))
    await w.step(120)
    expect(distance(w.live('a'), w.live('b'))).toBeLessThan(before / 2)
  })

  it('pushes overlapping bubbles apart', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 2, 2)] })
    await w.physics.start()
    await w.step(120)
    expect(distance(w.live('a'), w.live('b'))).toBeGreaterThan(20)
  })

  it('has no centring force: a lone node stays where it is', async () => {
    const w = setup({ visible: [node('a', 5000, -4000)] })
    await w.physics.start()
    await w.step(60)
    expect(w.live('a')).toEqual({ x: 5100, y: -3940 })
  })

  it('keeps an off-screen neighbour fixed as an anchor', async () => {
    const w = setup({
      visible: [node('a', 0, 0)],
      offscreen: [node('far', 4000, 0)],
      edges: [['a', 'far']],
    })
    await w.physics.start()
    await w.step(120)
    expect(w.live('far')).toEqual({ x: 4100, y: 60 })
    expect(w.live('a').x).toBeGreaterThan(100)
  })

  it('writes nothing to the store while it runs', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    await w.step(5)
    expect(w.updateNodePosition).not.toHaveBeenCalled()
    expect(w.physics.live.value!.frame).toBeGreaterThanOrEqual(5)
  })

  it('asks for one step per painted frame, never two at once', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    await w.step(10)
    expect(w.steps()).toBe(10)
    expect(w.maxInFlight()).toBe(1)
  })

  it('stores each moved node once, as its top-left corner, when switched off', async () => {
    const w = setup({
      visible: [node('a', 0, 0), node('b', 3000, 0), node('still', 9000, 9000)],
      edges: [['a', 'b']],
    })
    await w.physics.start()
    await w.step(5)
    const a = w.live('a')
    w.physics.stop()
    expect([...w.stored].sort()).toEqual(['a', 'b'])
    expect(w.byId.get('a')!.canvas_x).toBeCloseTo(a.x - 100)
    expect(w.byId.get('a')!.canvas_y).toBeCloseTo(a.y - 60)
    expect(w.physics.active.value).toBe(false)
    expect(w.physics.live.value).toBeNull()
  })

  it('stores the positions once the simulation comes to rest', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    await w.step(2000)
    expect(w.frames).toHaveLength(0)
    expect([...w.stored].sort()).toEqual(['a', 'b'])
    expect(w.physics.active.value).toBe(true)
    expect(w.physics.running.value).toBe(false)
  })

  it('snaps stored positions when snap-to-grid is on', async () => {
    const w = setup({
      visible: [node('a', 0, 0), node('b', 3000, 0)],
      edges: [['a', 'b']],
      snap: v => Math.round(v / 20) * 20,
    })
    await w.physics.start()
    await w.step(10)
    w.physics.stop()
    for (const id of ['a', 'b']) {
      expect(Math.abs(w.byId.get(id)!.canvas_x % 20)).toBe(0)
      expect(Math.abs(w.byId.get(id)!.canvas_y % 20)).toBe(0)
    }
  })

  it('pins a grabbed node to the pointer, wakes the others, and lets go on release', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 600, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    await w.step(2000)
    expect(w.physics.running.value).toBe(false)
    const bBefore = w.live('b').x

    w.physics.grab('a', { x: -3000, y: 60 })
    expect(w.physics.running.value).toBe(true)
    await w.step(60)
    expect(w.live('a')).toEqual({ x: -3000, y: 60 })
    expect(w.live('b').x).toBeLessThan(bBefore)

    w.physics.moveGrabbed({ x: -3500, y: 60 })
    await w.step(1)
    expect(w.live('a')).toEqual({ x: -3500, y: 60 })

    w.physics.release()
    await w.step(2000)
    expect(w.physics.running.value).toBe(false)
    expect(w.live('a').x).toBeGreaterThan(-3500)
  })

  it('holds a pressed node until the pointer is released', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 600, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    const press = new MouseEvent('pointerdown', { clientX: -2000, clientY: 60 }) as PointerEvent
    w.physics.grabWithPointer(press, 'a')
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: -2500, clientY: 60 })))
    await w.step(3)
    expect(w.live('a')).toEqual({ x: -2500, y: 60 })
    window.dispatchEvent(new MouseEvent('pointerup'))
    await w.step(30)
    expect(w.live('a').x).not.toBe(-2500)
  })

  it('does not start where it is blocked (outside bubble mode, or in neighbourhood mode)', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']], blocked: true })
    expect(w.physics.available.value).toBe(false)
    await w.physics.start()
    expect(w.physics.active.value).toBe(false)
    expect(w.pushUndo).not.toHaveBeenCalled()
  })

  it('runs on up to 2000 nodes and says it is unavailable above that', async () => {
    expect(PHYSICS_MAX_NODES).toBe(2000)
    const many = Array.from({ length: PHYSICS_MAX_NODES + 1 }, (_, i) => node(`n${i}`, i * 300, 0))
    const w = setup({ visible: many })
    expect(w.physics.available.value).toBe(false)
    await w.physics.start()
    expect(w.physics.active.value).toBe(false)
  })

  it('reports running while it moves nodes, and not at rest or when stopped', async () => {
    const w = setup({ visible: [node('a', 0, 0), node('b', 3000, 0)], edges: [['a', 'b']] })
    await w.physics.start()
    expect(w.physics.running.value).toBe(true)
    await w.step(2000)
    expect(w.physics.running.value).toBe(false)
    w.physics.grab('a', w.live('a'))
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

describe('the worker engine', () => {
  /** A worker stand-in that answers on a later task, as a real one does */
  function fakeWorker(): PhysicsWorkerLike & { terminated: boolean } {
    const state = { terminated: false } as PhysicsWorkerLike & { terminated: boolean }
    state.postMessage = (message: unknown) => {
      setTimeout(() => {
        const reply = handlePhysicsMessage(message)
        if (reply) state.onmessage?.({ data: reply } as MessageEvent)
      }, 0)
    }
    state.terminate = () => {
      state.terminated = true
    }
    return state
  }

  it('steps the simulation in the worker and returns the centres as one flat array', async () => {
    const worker = fakeWorker()
    const engine = await createWorkerEngine(
      {
        xy: Float64Array.from([0, 0, 3000, 0]),
        radius: Float64Array.from([10, 10]),
        anchor: Uint8Array.from([0, 0]),
        links: Int32Array.from([0, 1]),
      },
      () => worker
    )
    let result = await engine.step({ pinned: null })
    for (let i = 0; i < 100; i++) result = await engine.step({ pinned: null })
    expect(result.xy).toBeInstanceOf(Float64Array)
    expect(result.xy).toHaveLength(4)
    expect(Math.abs(result.xy[2] - result.xy[0])).toBeLessThan(1500)
    engine.dispose()
    expect(worker.terminated).toBe(true)
  })
})
