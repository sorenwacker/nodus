/**
 * Whether the window is in full screen.
 *
 * The edge-step gestures are live only in full screen: a window edge that is
 * not a screen edge is crossed during ordinary work, and aiming at a handle
 * does not make such a crossing deliberate
 * (PRODUCT_DESIGN.md > Edge handles).
 *
 * macOS full screen resizes the window rather than raising a document
 * fullscreen event, so the state is re-read on resize. Outside Tauri - a
 * browser dev server - the document's own fullscreen state stands in, so the
 * gesture can still be exercised.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { isTauri } from '../lib/tauri'

export function useWindowFullscreen() {
  const isFullscreen = ref(false)

  // Reads are asynchronous and a transition can raise several, so each carries
  // a token and only the newest may assign: an earlier read resolving late
  // would otherwise report the state the window has just left.
  let latest = 0

  async function read(): Promise<void> {
    const token = ++latest
    const assign = (value: boolean) => {
      if (token === latest) isFullscreen.value = value
    }
    if (!isTauri()) {
      assign(typeof document !== 'undefined' && !!document.fullscreenElement)
      return
    }
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      assign(await getCurrentWindow().isFullscreen())
    } catch {
      assign(false)
    }
  }

  onMounted(() => {
    read()
    window.addEventListener('resize', read)
    document.addEventListener('fullscreenchange', read)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', read)
    document.removeEventListener('fullscreenchange', read)
  })

  return { isFullscreen, read }
}
