/**
 * Layout animation utilities
 * Smooth animation of nodes to target positions
 */

export interface LayoutAnimationState {
  animationId: number | null
  stop: () => void
  /**
   * Complete the in-flight animation instantly: apply all remaining targets
   * and stop. Starting a new layout run must settle (not freeze) the previous
   * one, so state is never left mid-flight between a frame and its nodes.
   */
  settle: () => void
  pending: { targets: Map<string, { x: number; y: number }>; update: (id: string, x: number, y: number) => void } | null
}

/**
 * Cubic ease-out function for smooth deceleration
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Create an animation controller for layout transitions
 */
export function createLayoutAnimator(): LayoutAnimationState {
  let animationId: number | null = null
  let pending: LayoutAnimationState['pending'] = null

  function stop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
  }

  function settle() {
    stop()
    if (pending) {
      for (const [id, pos] of pending.targets) {
        pending.update(id, pos.x, pos.y)
      }
      pending = null
    }
  }

  return {
    get animationId() {
      return animationId
    },
    set animationId(id: number | null) {
      animationId = id
    },
    get pending() {
      return pending
    },
    set pending(value: LayoutAnimationState['pending']) {
      pending = value
    },
    stop,
    settle,
  }
}

/**
 * Animate nodes to target positions with easing
 */
export function animateToPositions(
  targets: Map<string, { x: number; y: number }>,
  getNodePosition: (id: string) => { x: number; y: number } | null,
  updateNodePosition: (id: string, x: number, y: number) => void,
  state: LayoutAnimationState,
  duration = 400
): void {
  state.stop()
  state.pending = { targets, update: updateNodePosition }

  const startTime = performance.now()
  const startPositions = new Map<string, { x: number; y: number }>()

  for (const [id] of targets) {
    const pos = getNodePosition(id)
    if (pos) {
      startPositions.set(id, { x: pos.x, y: pos.y })
    }
  }

  function animate() {
    const elapsed = performance.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = easeOutCubic(progress)

    for (const [id, target] of targets) {
      const start = startPositions.get(id)
      if (start) {
        const x = start.x + (target.x - start.x) * eased
        const y = start.y + (target.y - start.y) * eased
        updateNodePosition(id, x, y)
      }
    }

    if (progress < 1) {
      state.animationId = requestAnimationFrame(animate)
    } else {
      state.animationId = null
      state.pending = null
    }
  }

  state.animationId = requestAnimationFrame(animate)
}
