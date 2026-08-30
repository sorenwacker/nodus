/**
 * Frame drag threshold tests
 *
 * A press on a frame must travel before it counts as a drag. Two symptoms came
 * from starting the drag on pointerdown instead: frames moved when they were
 * only meant to be selected, and undo appeared dead because every press pushed
 * a geometry snapshot identical to the current state, so Ctrl+Z restored
 * geometry that had never changed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFrames } from '../canvas/composables/frames/useFrames'
import { ref } from 'vue'
import type { Frame, Node } from '../types'

const THRESHOLD = 3

function makeFrame(over: Partial<Frame> = {}): Frame {
  return {
    id: 'f1',
    title: 'Frame',
    canvas_x: 100,
    canvas_y: 100,
    width: 400,
    height: 300,
    ...over,
  } as Frame
}

function makeNode(over: Partial<Node> = {}): Node {
  return {
    id: 'n1',
    title: 'Node',
    canvas_x: 150,
    canvas_y: 150,
    width: 200,
    height: 120,
    frame_id: 'f1',
    ...over,
  } as Node
}

function setup() {
  const frame = makeFrame()
  const node = makeNode()

  const store = {
    frames: [frame],
    filteredNodes: [node],
    selectedNodeIds: [],
    selectedFrameId: null,
    selectFrame: vi.fn(),
    selectNode: vi.fn(),
    createFrame: vi.fn(),
    deleteFrame: vi.fn(),
    updateFramePosition: vi.fn((_id: string, x: number, y: number) => {
      frame.canvas_x = x
      frame.canvas_y = y
    }),
    persistFramePosition: vi.fn(),
    updateFrameSize: vi.fn(),
    persistFrameSize: vi.fn(),
    updateFrameTitle: vi.fn(),
    updateNodePosition: vi.fn((_id: string, x: number, y: number) => {
      node.canvas_x = x
      node.canvas_y = y
    }),
    persistNodePosition: vi.fn(),
    assignNodesToFrame: vi.fn(),
  }

  const pushFramePositionUndo = vi.fn()
  const resolveFrameCollisions = vi.fn()

  const frames = useFrames({
    store: store as never,
    viewState: {
      scale: ref(1),
      offsetX: ref(0),
      offsetY: ref(0),
      canvasRect: () => null,
    },
    // Identity mapping keeps screen pixels and canvas units the same, so the
    // threshold under test is not obscured by a zoom factor.
    screenToCanvas: (x: number, y: number) => ({ x, y }),
    snapToGrid: (v: number) => v,
    pushFramePositionUndo,
    resolveFrameCollisions,
  })

  return { frames, store, frame, node, pushFramePositionUndo, resolveFrameCollisions }
}

function press(x: number, y: number) {
  return new PointerEvent('pointerdown', { clientX: x, clientY: y })
}

function move(x: number, y: number) {
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }))
}

function release() {
  document.dispatchEvent(new PointerEvent('pointerup'))
}

describe('frame drag threshold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not move the frame for a press with no movement', () => {
    const { frames, frame } = setup()
    frames.onPointerDown(press(200, 200), 'f1')
    release()

    expect(frame.canvas_x).toBe(100)
    expect(frame.canvas_y).toBe(100)
  })

  it('does not move the frame for jitter within the threshold', () => {
    const { frames, frame, store } = setup()
    frames.onPointerDown(press(200, 200), 'f1')
    // A pen or touch contact never holds perfectly still
    move(200 + THRESHOLD, 200 - THRESHOLD)
    release()

    expect(store.updateFramePosition).not.toHaveBeenCalled()
    expect(frame.canvas_x).toBe(100)
  })

  it('moves the frame once the pointer clears the threshold', () => {
    const { frames, frame } = setup()
    frames.onPointerDown(press(200, 200), 'f1')
    move(250, 240)
    release()

    // Offsets are measured from the press, not from the point that crossed
    // the threshold, so the frame does not jump on the first qualifying move.
    expect(frame.canvas_x).toBe(150)
    expect(frame.canvas_y).toBe(140)
  })

  it('carries frame members along', () => {
    const { frames, node } = setup()
    frames.onPointerDown(press(200, 200), 'f1')
    move(250, 200)
    release()

    expect(node.canvas_x).toBe(200)
  })

  describe('undo', () => {
    it('records no snapshot for a press that never moves', () => {
      const { frames, pushFramePositionUndo } = setup()
      frames.onPointerDown(press(200, 200), 'f1')
      release()

      // The bug: a snapshot here matched current geometry, so undo looked dead
      expect(pushFramePositionUndo).not.toHaveBeenCalled()
    })

    it('records no snapshot for jitter within the threshold', () => {
      const { frames, pushFramePositionUndo } = setup()
      frames.onPointerDown(press(200, 200), 'f1')
      move(202, 201)
      release()

      expect(pushFramePositionUndo).not.toHaveBeenCalled()
    })

    it('records exactly one snapshot per drag, before the first move', () => {
      const { frames, pushFramePositionUndo, store } = setup()
      frames.onPointerDown(press(200, 200), 'f1')
      move(250, 200)
      move(300, 200)
      move(350, 200)
      release()

      expect(pushFramePositionUndo).toHaveBeenCalledTimes(1)
      expect(pushFramePositionUndo.mock.invocationCallOrder[0]).toBeLessThan(
        store.updateFramePosition.mock.invocationCallOrder[0]
      )
    })
  })

  describe('collision resolution', () => {
    it('does not run after a press that never became a drag', () => {
      const { frames, resolveFrameCollisions } = setup()
      frames.onPointerDown(press(200, 200), 'f1')
      release()

      // Otherwise a plain selection click shuffles frames the user did not
      // touch, with no undo entry behind it
      expect(resolveFrameCollisions).not.toHaveBeenCalled()
    })

    it('runs after a real drag', () => {
      const { frames, resolveFrameCollisions } = setup()
      frames.onPointerDown(press(200, 200), 'f1')
      move(250, 200)
      release()

      expect(resolveFrameCollisions).toHaveBeenCalledTimes(1)
    })
  })

  it('still selects the frame on a press that never becomes a drag', () => {
    const { frames, store } = setup()
    frames.onPointerDown(press(200, 200), 'f1')
    release()

    expect(store.selectFrame).toHaveBeenCalledWith('f1')
  })

  it('does not persist anything when no drag happened', () => {
    const { frames, store } = setup()
    frames.onPointerDown(press(200, 200), 'f1')
    release()

    expect(store.persistFramePosition).not.toHaveBeenCalled()
    expect(store.persistNodePosition).not.toHaveBeenCalled()
  })

  it('persists the frame and its members after a drag', () => {
    const { frames, store } = setup()
    frames.onPointerDown(press(200, 200), 'f1')
    move(250, 200)
    release()

    expect(store.persistFramePosition).toHaveBeenCalledWith('f1')
    expect(store.persistNodePosition).toHaveBeenCalledWith('n1')
  })
})
