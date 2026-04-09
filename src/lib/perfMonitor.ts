/**
 * Performance Monitor
 *
 * Usage in browser console:
 *   window.perfMonitor.start()     // Start measuring
 *   window.perfMonitor.stop()      // Stop and show results
 *   window.perfMonitor.report()    // Show current stats
 *   window.perfMonitor.reset()     // Clear all measurements
 */

interface FrameTiming {
  timestamp: number
  duration: number
  type: 'idle' | 'interaction'
}

interface PerfStats {
  frameTimings: FrameTiming[]
  startTime: number
  endTime: number
  interactionCount: number
  domMutationCount: number
}

class PerfMonitor {
  private stats: PerfStats | null = null
  private animationFrameId: number | null = null
  private lastFrameTime = 0
  private mutationObserver: MutationObserver | null = null
  private isInteracting = false
  private boundHandlers: {
    onInteractionStart: () => void
    onInteractionEnd: () => void
  } | null = null

  start(): void {
    if (this.stats) {
      console.log('[PerfMonitor] Already running. Call stop() first.')
      return
    }

    this.stats = {
      frameTimings: [],
      startTime: performance.now(),
      endTime: 0,
      interactionCount: 0,
      domMutationCount: 0,
    }
    this.lastFrameTime = 0

    // Track frames
    const trackFrame = (timestamp: number) => {
      if (!this.stats) return

      const duration = this.lastFrameTime > 0 ? timestamp - this.lastFrameTime : 0
      this.lastFrameTime = timestamp

      if (duration > 0) {
        this.stats.frameTimings.push({
          timestamp,
          duration,
          type: this.isInteracting ? 'interaction' : 'idle',
        })
      }

      this.animationFrameId = requestAnimationFrame(trackFrame)
    }
    this.animationFrameId = requestAnimationFrame(trackFrame)

    // Track DOM mutations
    this.mutationObserver = new MutationObserver((mutations) => {
      if (this.stats) {
        this.stats.domMutationCount += mutations.length
      }
    })
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    })

    // Track interaction state
    this.boundHandlers = {
      onInteractionStart: () => {
        this.isInteracting = true
        if (this.stats) this.stats.interactionCount++
      },
      onInteractionEnd: () => {
        this.isInteracting = false
      },
    }

    document.addEventListener('pointerdown', this.boundHandlers.onInteractionStart)
    document.addEventListener('pointerup', this.boundHandlers.onInteractionEnd)
    document.addEventListener('wheel', this.boundHandlers.onInteractionStart)
    document.addEventListener('keydown', this.boundHandlers.onInteractionStart)

    console.log('[PerfMonitor] Started. Interact with the canvas, then call window.perfMonitor.stop()')
  }

  stop(): ReturnType<typeof this.report> {
    if (!this.stats) {
      console.log('[PerfMonitor] Not running.')
      return null
    }

    this.stats.endTime = performance.now()

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = null
    }

    if (this.boundHandlers) {
      document.removeEventListener('pointerdown', this.boundHandlers.onInteractionStart)
      document.removeEventListener('pointerup', this.boundHandlers.onInteractionEnd)
      document.removeEventListener('wheel', this.boundHandlers.onInteractionStart)
      document.removeEventListener('keydown', this.boundHandlers.onInteractionStart)
      this.boundHandlers = null
    }

    return this.report()
  }

  report() {
    if (!this.stats) {
      console.log('[PerfMonitor] No data. Call start() first.')
      return null
    }

    const { frameTimings, startTime, endTime, interactionCount, domMutationCount } = this.stats
    const duration = (endTime || performance.now()) - startTime

    // Calculate FPS stats
    const idleFrames = frameTimings.filter(f => f.type === 'idle')
    const interactionFrames = frameTimings.filter(f => f.type === 'interaction')

    const calcStats = (frames: FrameTiming[]) => {
      if (frames.length === 0) return { avg: 0, p95: 0, max: 0, fps: 0 }
      const durations = frames.map(f => f.duration).sort((a, b) => a - b)
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length
      const p95 = durations[Math.floor(durations.length * 0.95)] || 0
      const max = durations[durations.length - 1] || 0
      const fps = avg > 0 ? 1000 / avg : 0
      return { avg, p95, max, fps }
    }

    const idleStats = calcStats(idleFrames)
    const interactionStats = calcStats(interactionFrames)

    // Find jank frames (>50ms)
    const jankFrames = frameTimings.filter(f => f.duration > 50)

    const result = {
      duration: `${(duration / 1000).toFixed(1)}s`,
      totalFrames: frameTimings.length,
      idleFrames: {
        count: idleFrames.length,
        avgFPS: idleStats.fps.toFixed(1),
        avgFrameTime: `${idleStats.avg.toFixed(1)}ms`,
        p95FrameTime: `${idleStats.p95.toFixed(1)}ms`,
        maxFrameTime: `${idleStats.max.toFixed(1)}ms`,
      },
      interactionFrames: {
        count: interactionFrames.length,
        avgFPS: interactionStats.fps.toFixed(1),
        avgFrameTime: `${interactionStats.avg.toFixed(1)}ms`,
        p95FrameTime: `${interactionStats.p95.toFixed(1)}ms`,
        maxFrameTime: `${interactionStats.max.toFixed(1)}ms`,
      },
      jankFrames: jankFrames.length,
      interactionCount,
      domMutationCount,
      summary: `Idle: ${idleStats.fps.toFixed(0)} FPS | Interaction: ${interactionStats.fps.toFixed(0)} FPS | Jank: ${jankFrames.length}`,
    }

    console.log('[PerfMonitor] Performance Report:')
    console.table(result.idleFrames)
    console.table(result.interactionFrames)
    console.log(`Summary: ${result.summary}`)
    console.log(`DOM mutations: ${domMutationCount}, Interactions: ${interactionCount}`)

    return result
  }

  reset(): void {
    this.stop()
    this.stats = null
    console.log('[PerfMonitor] Reset.')
  }
}

export const perfMonitor = new PerfMonitor()

// Expose globally for console access
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).perfMonitor = perfMonitor
}
