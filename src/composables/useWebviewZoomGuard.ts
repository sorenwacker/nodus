/**
 * Keeps the webview at 100% zoom.
 *
 * WebKitGTK zooms the whole page on Ctrl+wheel, and it does so inside the
 * widget - wry installs no handler of its own, and the DOM event's default
 * action is not what performs it, so `preventDefault` cannot stop it. It scaled
 * the entire interface until the toolbar and the zoom controls sat outside the
 * window, and there was no way back: the keyboard shortcuts that would reset it
 * (Ctrl+0, Ctrl+plus/minus) are already taken by the canvas font scale, and
 * once the chrome has scaled away no non-canvas surface is left to Ctrl+wheel
 * over. macOS is unaffected - WKWebView has no such gesture - so this is a
 * Linux problem in practice.
 *
 * Since the zoom cannot be prevented, it is undone: after any gesture that
 * could have zoomed, the zoom level is set back to 1. The canvas keeps its own
 * Ctrl+wheel zoom, which never depended on the page zoom.
 */
import { onMounted, onUnmounted } from 'vue'
import { isTauri } from '../lib/tauri'

/** Coalesced so a wheel burst resets once, not once per event. */
let pending = false

function resetZoom() {
  if (pending || !isTauri()) return
  pending = true
  requestAnimationFrame(async () => {
    pending = false
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      await getCurrentWebviewWindow().setZoom(1)
    } catch {
      /* not in a webview that supports it; nothing to undo */
    }
  })
}

function onWheel(e: WheelEvent) {
  if (!e.ctrlKey) return
  // Harmless where the default action is what zooms, and the canvas reads the
  // event itself rather than relying on it
  e.preventDefault()
  resetZoom()
}

/**
 * A page zoom changes the viewport, so the webview reports a resize. Listening
 * for it catches every route into the zoom - the wheel gesture, a hotkey, or
 * anything WebKitGTK does natively that never reaches the DOM - rather than
 * only the ones this module can name.
 */
function onResize() {
  resetZoom()
}

function onKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_' || e.key === '0') {
    resetZoom()
  }
}

export function useWebviewZoomGuard() {
  onMounted(() => {
    // passive: false - a passive wheel listener may not preventDefault
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    window.addEventListener('keydown', onKeydown, { capture: true })
    window.addEventListener('resize', onResize)
    // Undo any zoom carried in from a previous run
    resetZoom()
  })

  onUnmounted(() => {
    window.removeEventListener('wheel', onWheel, { capture: true })
    window.removeEventListener('keydown', onKeydown, { capture: true })
    window.removeEventListener('resize', onResize)
  })
}
