/**
 * Where a tooltip goes.
 *
 * Placement is measured rather than written per container: a rule that names a
 * container is a guess about how much room that container has, and every
 * container nobody guessed about clipped its labels at the window edge
 * (PRODUCT_DESIGN.md > Tooltip placement).
 */

/** Distance between the trigger and its tooltip */
export const TOOLTIP_GAP = 8

/** Margin kept between the tooltip and the window edge */
const VIEWPORT_MARGIN = 6

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export interface PlacedTooltip {
  left: number
  top: number
  side: TooltipSide
}

function clamp(value: number, min: number, max: number): number {
  // A tooltip wider than the window has no position that satisfies both bounds;
  // the near edge wins, so it is cut off far from the pointer rather than at it
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** Position of the tooltip on a given side, before clamping */
function positionOn(side: TooltipSide, trigger: Rect, tooltip: Size): { left: number; top: number } {
  switch (side) {
    case 'bottom':
      return {
        left: trigger.left + trigger.width / 2 - tooltip.width / 2,
        top: trigger.bottom + TOOLTIP_GAP,
      }
    case 'top':
      return {
        left: trigger.left + trigger.width / 2 - tooltip.width / 2,
        top: trigger.top - TOOLTIP_GAP - tooltip.height,
      }
    case 'right':
      return {
        left: trigger.right + TOOLTIP_GAP,
        top: trigger.top + trigger.height / 2 - tooltip.height / 2,
      }
    case 'left':
      return {
        left: trigger.left - TOOLTIP_GAP - tooltip.width,
        top: trigger.top + trigger.height / 2 - tooltip.height / 2,
      }
  }
}

/** Whether a side has room for the tooltip without clamping it off the trigger */
function fits(side: TooltipSide, trigger: Rect, tooltip: Size, viewport: Viewport): boolean {
  const { left, top } = positionOn(side, trigger, tooltip)
  switch (side) {
    case 'bottom':
      return top + tooltip.height <= viewport.height - VIEWPORT_MARGIN
    case 'top':
      return top >= VIEWPORT_MARGIN
    case 'right':
      return left + tooltip.width <= viewport.width - VIEWPORT_MARGIN
    case 'left':
      return left >= VIEWPORT_MARGIN
  }
}

const OPPOSITE: Record<TooltipSide, TooltipSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/**
 * Place a tooltip for a trigger.
 *
 * The preferred side is used when it fits, otherwise the opposite side, and the
 * result is clamped into the viewport either way, so the tooltip is on screen
 * whatever the trigger's position.
 */
export function placeTooltip(
  trigger: Rect,
  tooltip: Size,
  viewport: Viewport,
  preferred: TooltipSide = 'bottom'
): PlacedTooltip {
  let side = preferred
  if (!fits(side, trigger, tooltip, viewport)) {
    const flipped = OPPOSITE[side]
    // Neither side fits on a very small window; the preferred one is kept and
    // clamped, which keeps the tooltip nearest the control it belongs to
    if (fits(flipped, trigger, tooltip, viewport)) side = flipped
  }

  const { left, top } = positionOn(side, trigger, tooltip)

  return {
    side,
    left: clamp(left, VIEWPORT_MARGIN, viewport.width - tooltip.width - VIEWPORT_MARGIN),
    top: clamp(top, VIEWPORT_MARGIN, viewport.height - tooltip.height - VIEWPORT_MARGIN),
  }
}
