/**
 * Canvas constants
 * Centralized configuration values for canvas rendering
 */

/** Default node dimensions */
export const NODE_DEFAULTS = {
  WIDTH: 200,
  HEIGHT: 120,
  MIN_HEIGHT: 60,
  MAX_HEIGHT: 800,
} as const

/**
 * The zoom range, defined once. This was an 0.01/3 clamp duplicated across
 * seven files (two of them inline template arithmetic), so the floor could
 * only be changed by finding every copy. The floor sits below the ~0.0094 a
 * measured worst-case fit needed, so fit-to-content can always contain the
 * layout it is asked to fit; the extreme range is safe because bubble mode
 * takes over long before it (useGraphMetrics > zoomForcesLOD).
 */
export const ZOOM_LIMITS = {
  MIN: 0.005,
  MAX: 3,
} as const

