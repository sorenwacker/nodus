/**
 * The edge-step gestures are live only in full screen, so the state they read
 * has to follow the window: macOS full screen resizes the window rather than
 * raising a document fullscreen event (PRODUCT_DESIGN.md > Edge handles).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useWindowFullscreen } from '../composables/useWindowFullscreen'

const windowIsFullscreen = { value: false }

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ isFullscreen: async () => windowIsFullscreen.value }),
}))

vi.mock('../lib/tauri', () => ({ isTauri: () => true }))

let probe: ReturnType<typeof mount> | null = null

/** Mount the composable and hand back the ref it exposes. */
function mountProbe(): Ref<boolean> {
  let state!: Ref<boolean>
  probe = mount(
    defineComponent({
      setup() {
        state = useWindowFullscreen().isFullscreen
        return () => null
      },
    })
  )
  return state
}

/** Let a read finish: it spans a dynamic import and a call across it. */
const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('useWindowFullscreen', () => {
  beforeEach(() => {
    windowIsFullscreen.value = false
  })

  // A probe left mounted keeps listening, and every listener reads the window
  afterEach(() => {
    probe?.unmount()
    probe = null
  })

  it('reads the window state on mount', async () => {
    windowIsFullscreen.value = true
    const isFullscreen = mountProbe()
    await settle()
    expect(isFullscreen.value).toBe(true)
  })

  it('follows a transition into full screen, which arrives as a resize', async () => {
    const isFullscreen = mountProbe()
    await settle()
    expect(isFullscreen.value).toBe(false)

    windowIsFullscreen.value = true
    window.dispatchEvent(new Event('resize'))
    await settle()
    expect(isFullscreen.value).toBe(true)
  })

  it('follows a transition back out of full screen', async () => {
    windowIsFullscreen.value = true
    const isFullscreen = mountProbe()
    await settle()
    expect(isFullscreen.value).toBe(true)

    windowIsFullscreen.value = false
    window.dispatchEvent(new Event('resize'))
    await settle()
    expect(isFullscreen.value).toBe(false)
  })
})
