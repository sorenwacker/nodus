/**
 * Layout animation utilities
 * Smooth animation of nodes to target positions
 */
import { ref, type Ref } from 'vue'

export interface LayoutAnimationState {
  animationId: number | null
  /** True while frames are being animated; edges route cheaply meanwhile */
  running: Ref<boolean>
  stop: () => void
  /**
   * Complete the in-flight animation instantly: apply all remaining targets
   * and stop. Starting a new layout run must settle (not freeze) the previous
   * one, so state is never left mid-flight between a frame and its nodes.
   */
  settle: () => void
  pending: PendingAnimation | null
}

/** The in-flight animation: where it is heading, and how to apply and store positions */
export interface PendingAnimation {
  targets: Map<string, { x: number; y: number }>
  apply: (positions: Map<string, { x: number; y: number }>) => void
  persist?: (id: string) => void | Promise<void>
}

/**
 * Store the positions of every node an animation moves
 * (PRODUCT_DESIGN.md > Persisting animated positions).
 */
function persistAll(animation: PendingAnimation) {
  if (!animation.persist) return
  for (const [id] of animation.targets) void animation.persist(id)
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
  const running = ref(false)

  function stop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
    running.value = false
  }

  function settle() {
    stop()
    if (pending) {
      const settled = pending
      pending = null
      settled.apply(settled.targets)
      persistAll(settled)
    }
  }

  return {
    get animationId() {
      return animationId
    },
    set animationId(id: number | null) {
      animationId = id
      running.value = id !== null
    },
    running,
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
  /**
   * Apply one frame's positions, all at once. Applied node by node, each write
   * searched the node list and changed the layout version on its own
   * (PRODUCT_DESIGN.md > Persisting animated positions).
   */
  applyFrame: (positions: Map<string, { x: number; y: number }>) => void,
  state: LayoutAnimationState,
  duration = 400,
  /**
   * Store the positions the animation reached. Frames update memory only: one
   * write per node per frame is ~18,000 writes for 500 nodes over 600ms, of
   * which 500 matter (PRODUCT_DESIGN.md > Persisting animated positions).
   */
  persistNodePosition?: (id: string) => void | Promise<void>
): void {
  state.stop()
  // A superseded animation stores what it reached, so no position is left
  // unsaved (PRODUCT_DESIGN.md > Persisting animated positions)
  if (state.pending) persistAll(state.pending)
  const animation: PendingAnimation = { targets, apply: applyFrame, persist: persistNodePosition }
  state.pending = animation

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

    const frame = new Map<string, { x: number; y: number }>()
    for (const [id, target] of targets) {
      const start = startPositions.get(id)
      if (start) {
        frame.set(id, { x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased })
      }
    }
    applyFrame(frame)

    if (progress < 1) {
      state.animationId = requestAnimationFrame(animate)
    } else {
      state.animationId = null
      state.pending = null
      // Where they landed is the only position worth storing
      persistAll(animation)
    }
  }

  state.animationId = requestAnimationFrame(animate)
}
