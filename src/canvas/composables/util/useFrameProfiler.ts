/**
 * Frame timing for the canvas, measured where it actually happens.
 *
 * Probing the canvas from outside the browser kept clearing the code of blame:
 * culling and node styling measured 0.015ms per frame over a real pan, the edge
 * model 0.41ms, both against a 16.7ms budget, while the app stayed laggy. What
 * a probe outside the browser cannot see is the rendering - the Vue patch,
 * layout, paint and compositing - so the measurement has to be taken in the
 * running app, on the real graph, with the real renderer
 * (PRODUCT_DESIGN.md > Measuring canvas performance).
 */

/** One frame's budget at 60fps, in ms. */
export const FRAME_BUDGET_MS = 16.7

export interface FrameSummary {
  frames: number
  /** Median frame time in ms. */
  p50: number
  /** The tail that is actually felt, in ms. */
  p95: number
  worst: number
  /** Frames that missed the budget. */
  dropped: number
  /** Mean ms per frame attributed to each named phase. */
  spans: Record<string, number>
}

export interface FrameProfiler {
  recordFrame: (ms: number) => void
  recordSpan: (name: string, ms: number) => void
  summary: () => FrameSummary | null
  reset: () => void
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index]
}

/**
 * Collect frame times and phase timings over a recent window.
 *
 * Args:
 *   window: How many frames to keep. A gesture is short, and an unbounded
 *     buffer would grow for as long as the app is open.
 *
 * Returns:
 *   A profiler. `summary` is null until a frame has been recorded.
 */
export function createFrameProfiler(window = 240): FrameProfiler {
  let frames: number[] = []
  const spanTotals = new Map<string, number>()
  const spanCounts = new Map<string, number>()

  return {
    recordFrame(ms: number) {
      frames.push(ms)
      if (frames.length > window) frames = frames.slice(-window)
    },

    recordSpan(name: string, ms: number) {
      spanTotals.set(name, (spanTotals.get(name) ?? 0) + ms)
      spanCounts.set(name, (spanCounts.get(name) ?? 0) + 1)
    },

    summary() {
      if (frames.length === 0) return null
      const sorted = [...frames].sort((a, b) => a - b)
      const spans: Record<string, number> = {}
      for (const [name, total] of spanTotals) {
        spans[name] = total / (spanCounts.get(name) ?? 1)
      }
      return {
        frames: frames.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        worst: sorted[sorted.length - 1],
        dropped: frames.filter(ms => ms > FRAME_BUDGET_MS).length,
        spans,
      }
    },

    reset() {
      frames = []
      spanTotals.clear()
      spanCounts.clear()
    },
  }
}
