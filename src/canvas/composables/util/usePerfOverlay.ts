/**
 * Drive the canvas performance readout.
 *
 * Frames are only sampled while a viewport gesture is live: that is when the
 * stutter is felt, and a permanent rAF loop would itself be work the canvas
 * does not need (PRODUCT_DESIGN.md > Measuring canvas performance).
 */
import { onUnmounted, ref, watch, type Ref } from 'vue'
import { perfStorage } from '../../../lib/storage'
import { createFrameProfiler, type FrameSummary } from './useFrameProfiler'

export interface UsePerfOverlayReturn {
  showPerfOverlay: Ref<boolean>
  perfSummary: Ref<FrameSummary | null>
  /** Attribute time to a named phase, e.g. the 2D canvas draw. */
  recordSpan: (name: string, ms: number) => void
}

export function usePerfOverlay(gestureActive: Ref<boolean>): UsePerfOverlayReturn {
  const showPerfOverlay = ref(perfStorage.getShowPerfOverlay())
  const perfSummary = ref<FrameSummary | null>(null)
  const profiler = createFrameProfiler()

  let raf: number | null = null
  let lastFrame = 0

  function tick(now: number) {
    if (lastFrame) profiler.recordFrame(now - lastFrame)
    lastFrame = now
    perfSummary.value = profiler.summary()
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    if (raf !== null) {
      cancelAnimationFrame(raf)
      raf = null
    }
  }

  watch([showPerfOverlay, gestureActive], ([on, gesturing]) => {
    if (on && gesturing) {
      if (raf !== null) return
      profiler.reset()
      lastFrame = 0
      raf = requestAnimationFrame(tick)
    } else {
      stop()
    }
  })

  const onSettingChange = (e: Event) => {
    showPerfOverlay.value = Boolean((e as CustomEvent).detail)
  }
  window.addEventListener('nodus-perf-overlay-change', onSettingChange)

  onUnmounted(() => {
    stop()
    window.removeEventListener('nodus-perf-overlay-change', onSettingChange)
  })

  return {
    showPerfOverlay,
    perfSummary,
    recordSpan: (name, ms) => profiler.recordSpan(name, ms),
  }
}
