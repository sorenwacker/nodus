/**
 * Screen-size floors for bubble-mode circles
 * (PRODUCT_DESIGN.md > Circle size in bubble mode).
 *
 * A circle's radius is in canvas units, so zooming out shrinks it with the
 * view. The floors keep every node visible and pressable on screen.
 */

/** Smallest radius, in screen pixels, a circle is drawn at. */
export const MIN_DRAW_RADIUS_PX = 4

/** Smallest radius, in screen pixels, a node may be pressed at. */
export const MIN_HIT_RADIUS_PX = 9

/** The canvas radius, raised so it is never below `minPx` on screen. */
export function screenFloorRadius(radius: number, scale: number, minPx: number): number {
  return Math.max(radius, minPx / scale)
}
