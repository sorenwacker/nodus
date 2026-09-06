/**
 * Admit new cards a few per frame instead of a column at once.
 *
 * A grid layout crosses the viewport margin in columns: measured on a dense
 * workspace, the number of cards mounting per frame is 0 for most frames and
 * then 20, 30 or 60 in a single one. Mounting is the expensive part - the
 * codebase records that swapping some 300 cards costs seconds - so it is the
 * burst that is felt, while the median frame stays healthy and hides it.
 *
 * The margin is what makes staging safe. It exists so a node is mounted before
 * it is on screen, so admitting it a frame or two later costs nothing visible:
 * it is still outside the viewport when it arrives
 * (PRODUCT_DESIGN.md > Staging what the viewport mounts).
 */

/** How many newly visible nodes may mount in one frame. */
export const MOUNT_BUDGET_PER_FRAME = 8

/**
 * The set that should be mounted this frame.
 *
 * Departures are applied in full and immediately: unmounting frees work, and
 * holding on to a node the viewport has left would only add to the next frame.
 * Arrivals are rationed.
 *
 * Args:
 *   mounted: What is mounted now.
 *   target: What the viewport wants mounted.
 *   budget: Arrivals allowed this frame. Zero admits everything, which turns
 *     staging off.
 *
 * Returns:
 *   The set to mount, never containing a node the target does not want.
 */
export function stageAdditions(
  mounted: Set<string>,
  target: Set<string>,
  budget = MOUNT_BUDGET_PER_FRAME
): Set<string> {
  const next = new Set<string>()

  // Keep what is still wanted; anything else has left the viewport
  for (const id of mounted) {
    if (target.has(id)) next.add(id)
  }

  if (budget <= 0) return new Set(target)

  let admitted = 0
  for (const id of target) {
    if (next.has(id)) continue
    if (admitted >= budget) break
    next.add(id)
    admitted++
  }

  return next
}

/** True when the viewport wants more than is mounted, so another frame is due. */
export function stagingIncomplete(mounted: Set<string>, target: Set<string>): boolean {
  if (mounted.size < target.size) return true
  for (const id of target) if (!mounted.has(id)) return true
  return false
}
