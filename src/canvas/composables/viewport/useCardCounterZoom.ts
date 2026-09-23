/**
 * Counter-zoom factor for card text
 *
 * Above 100% zoom card text keeps its on-screen size, so a zoomed-in card
 * shows more text instead of larger text. The factor is committed only once
 * the zoom has settled: changing it reflows every visible card, which is too
 * expensive for every frame of a gesture
 * (PRODUCT_DESIGN.md > Card text above 100% zoom).
 */
import { ref, watch, onScopeDispose, type Ref } from 'vue'

/** How long the zoom must be still before the text reflows. */
export const COUNTER_ZOOM_SETTLE_MS = 150

export interface UseCardCounterZoomReturn {
  /** Multiplier for card type and spacing: 1 / max(1, zoom), as last settled. */
  counterZoom: Ref<number>
}

function factorFor(zoom: number): number {
  return 1 / Math.max(1, zoom)
}

/**
 * Track the counter-zoom factor for the node layer.
 *
 * @param scale - Current viewport zoom.
 * @param gestureActive - True while a pan, zoom or pinch gesture is live.
 * @returns The settled counter-zoom factor.
 */
export function useCardCounterZoom(scale: Ref<number>, gestureActive: Ref<boolean>): UseCardCounterZoomReturn {
  const counterZoom = ref(factorFor(scale.value))
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  watch([scale, gestureActive], () => {
    cancel()
    if (gestureActive.value) return
    timer = setTimeout(() => {
      timer = null
      counterZoom.value = factorFor(scale.value)
    }, COUNTER_ZOOM_SETTLE_MS)
  })

  onScopeDispose(cancel)

  return { counterZoom }
}
