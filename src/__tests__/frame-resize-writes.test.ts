/**
 * A gesture costs one write per thing it moved, not one per event.
 *
 * Resizing a frame called `updateFramePosition` and `updateFrameSize` on every
 * `pointermove`, so dragging a corner across the canvas issued hundreds of
 * backend writes for one resize. The drag path already solved this with
 * `skipPersist` and a flush at the end; the resize path never used it
 * (PRODUCT_DESIGN.md > Persisting a gesture).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const invoke = vi.fn()
// The store calls invoke through lib/tauri, not the Tauri package directly
vi.mock('../lib/tauri', () => ({ invoke: (...a: unknown[]) => invoke(...a), isTauri: () => true }))

async function frameStore() {
  const { useFramesStore } = await import('../stores/frames')
  const store = useFramesStore()
  // Push rather than reassign: reassigning the exposed ref through the store
  // proxy left the store's own `frames` empty, so every update found no frame
  // and wrote nothing - and the test passed while proving nothing.
  store.frames.push(...([
    {
      id: 'f1',
      title: 'Frame',
      canvas_x: 0,
      canvas_y: 0,
      width: 400,
      height: 300,
      created_at: 0,
      updated_at: 0,
    },
  ] as never[]))
  return store
}

describe('resizing a frame', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
  })

  it('writes nothing to the backend while the gesture is live', async () => {
    const store = await frameStore()

    for (let i = 1; i <= 40; i++) {
      store.updateFrameSize('f1', 400 + i, 300 + i, { skipPersist: true })
      store.updateFramePosition('f1', i, i, { skipPersist: true })
    }

    expect(invoke).not.toHaveBeenCalled()
    // The in-memory frame still followed the pointer
    expect(store.frames[0].width).toBe(440)
    expect(store.frames[0].canvas_x).toBe(40)
  })

  it('writes the final size once when the gesture ends', async () => {
    const store = await frameStore()
    store.updateFrameSize('f1', 500, 350, { skipPersist: true })

    store.persistFrameSize('f1')

    const sizeWrites = invoke.mock.calls.filter(([cmd]) => cmd === 'update_frame_size')
    expect(sizeWrites).toHaveLength(1)
    expect(sizeWrites[0][1]).toMatchObject({ id: 'f1', width: 500, height: 350 })
  })

  it('still writes immediately when no gesture is in progress', async () => {
    // A one-off size change has no end to flush at
    const store = await frameStore()

    store.updateFrameSize('f1', 500, 350)

    expect(invoke).toHaveBeenCalledWith('update_frame_size', {
      id: 'f1',
      width: 500,
      height: 350,
    })
  })
})
