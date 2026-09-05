/**
 * Where a pointer-anchored menu opens.
 *
 * A menu positioned at the pointer runs off screen whenever the pointer is near
 * an edge - a right-click on a node at the bottom of the canvas put most of the
 * menu below the window. The menu opens at the pointer where it fits, on the
 * other side of the pointer where it does not, and is clamped to the viewport
 * when neither side has room (PRODUCT_DESIGN.md > Context Menu > Placement).
 */

export interface MenuPoint {
  x: number
  y: number
}

export interface MenuSize {
  width: number
  height: number
}

export interface MenuViewport {
  width: number
  height: number
}

/**
 * Place one axis: at the anchor, flipped to the other side of it, or clamped.
 *
 * Clamping runs the wrong way for a menu larger than the viewport, so the lower
 * bound wins: a menu taller than the window sits at the top edge, where its
 * first item is reachable, rather than at a negative offset.
 */
function placeAxis(anchor: number, extent: number, viewport: number, margin: number): number {
  if (anchor + extent <= viewport - margin) return anchor
  const flipped = anchor - extent
  if (flipped >= margin) return flipped
  return Math.max(margin, viewport - extent - margin)
}

/**
 * The top-left corner at which a menu of this size should open.
 *
 * Args:
 *   anchor: Pointer position, in viewport coordinates.
 *   menu: Measured menu size.
 *   viewport: Window size.
 *   margin: Gap to keep from the window edge, in px.
 *
 * Returns:
 *   The position to place the menu at.
 */
export function placeMenuInViewport(
  anchor: MenuPoint,
  menu: MenuSize,
  viewport: MenuViewport,
  margin = 0
): MenuPoint {
  return {
    x: placeAxis(anchor.x, menu.width, viewport.width, margin),
    y: placeAxis(anchor.y, menu.height, viewport.height, margin),
  }
}
