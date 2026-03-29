/**
 * Layout animation utilities
 * Smooth animation of nodes to target positions
 */

export interface LayoutAnimationState {
  animationId: number | null
  stop: () => void
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

  function stop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
  }

  return {
    get animationId() {
      return animationId
    },
    set animationId(id: number | null) {
      animationId = id
    },
    stop,
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
    }
  }

  state.animationId = requestAnimationFrame(animate)
}
