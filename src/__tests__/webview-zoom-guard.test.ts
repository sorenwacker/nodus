/**
 * The webview stays at 100% zoom.
 *
 * WebKitGTK zooms the whole page on Ctrl+wheel from inside the widget, so the
 * DOM event's default action is not what performs it and `preventDefault`
 * cannot stop it. It scaled the entire interface until the toolbar and the zoom
 * controls sat outside the window with no way back: Ctrl+0 and Ctrl+plus/minus
 * are already taken by the canvas font scale, and once the chrome has scaled
 * away no non-canvas surface is left to Ctrl+wheel over. Since the zoom cannot
 * be prevented it is undone, which means the guard has to catch every route
 * into it and has to coalesce, or a wheel burst issues one IPC call per event
 * (PRODUCT_DESIGN.md > Keeping the webview at 100%).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

const setZoom = vi.fn()

vi.mock('../lib/tauri', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ setZoom: (z: number) => setZoom(z) }),
}))

/**
 * Runs the queued frame and lets the awaited dynamic import settle.
 *
 * The frame callback imports the Tauri module before calling `setZoom`, and a
 * real module load needs a macrotask - flushing microtasks alone leaves
 * `setZoom` uncalled and every assertion here reading zero.
 */
async function settle() {
  const raf = window.requestAnimationFrame as unknown as {
    mock: { calls: [FrameRequestCallback][] }
  }
  const callbacks = raf.mock.calls.map(([cb]) => cb)
  raf.mock.calls.length = 0
  for (const cb of callbacks) await cb(0)
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function mountGuard() {
  const { useWebviewZoomGuard } = await import('../composables/useWebviewZoomGuard')
  return mount(
    defineComponent({
      setup() {
        useWebviewZoomGuard()
        return () => h('div')
      },
    })
  )
}

describe('webview zoom guard', () => {
  beforeEach(() => {
    setZoom.mockClear()
    vi.stubGlobal('requestAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('undoes any zoom carried in from a previous run', async () => {
    const wrapper = await mountGuard()
    await settle()
    expect(setZoom).toHaveBeenCalledWith(1)
    wrapper.unmount()
  })

  it('resets the zoom after a Ctrl+wheel gesture', async () => {
    const wrapper = await mountGuard()
    await settle()
    setZoom.mockClear()

    window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100 }))
    await settle()

    expect(setZoom).toHaveBeenCalledWith(1)
    wrapper.unmount()
  })

  it('coalesces a wheel burst into one reset instead of one per event', async () => {
    const wrapper = await mountGuard()
    await settle()
    setZoom.mockClear()

    for (let i = 0; i < 20; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100 }))
    }
    await settle()

    expect(setZoom).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('leaves a plain wheel alone, so ordinary scrolling is untouched', async () => {
    const wrapper = await mountGuard()
    await settle()
    setZoom.mockClear()

    const e = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
    window.dispatchEvent(e)
    await settle()

    expect(e.defaultPrevented).toBe(false)
    expect(setZoom).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('catches a resize, which is the route a native zoom takes', async () => {
    // WebKitGTK can zoom without the gesture reaching the DOM at all; a page
    // zoom changes the viewport, so the resize is what every route has in
    // common.
    const wrapper = await mountGuard()
    await settle()
    setZoom.mockClear()

    window.dispatchEvent(new Event('resize'))
    await settle()

    expect(setZoom).toHaveBeenCalledWith(1)
    wrapper.unmount()
  })

  it('catches the zoom hotkeys', async () => {
    const wrapper = await mountGuard()
    await settle()

    for (const key of ['+', '-', '=', '_', '0']) {
      setZoom.mockClear()
      window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true }))
      await settle()
      expect(setZoom, `Ctrl+${key}`).toHaveBeenCalledWith(1)
    }
    wrapper.unmount()
  })

  it('stops listening once unmounted', async () => {
    const wrapper = await mountGuard()
    await settle()
    wrapper.unmount()
    setZoom.mockClear()

    window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100 }))
    window.dispatchEvent(new Event('resize'))
    await settle()

    expect(setZoom).not.toHaveBeenCalled()
  })
})
