/**
 * Whether a drag is currently over the storyline panel.
 *
 * The drag handler needs to know this to decide whether a release drops onto
 * the canvas or onto a storyline, and the panel is what knows it. That was
 * passed through `window.__storylinePanelDropTarget`: neither side declared a
 * dependency on the other, so no boundary test could express the contract, and
 * the ordering held only because the panel cleared the flag in a `setTimeout(0)`
 * that happened to run after the drag ended. Reordering either handler would
 * have made the flag read stale and dropped the node on the canvas, silently
 * (PRODUCT_DESIGN.md > Dropping a node on the storyline panel).
 *
 * A small module both sides import instead: still shared state, but named,
 * typed, and findable by every tool that looks for who reads it.
 */
import { ref, readonly } from 'vue'

const overStorylinePanel = ref(false)

/** Read by the drag handler when a release is being resolved. */
export const isOverStorylinePanel = readonly(overStorylinePanel)

/** Set by the storyline panel as the pointer moves during a drag. */
export function setOverStorylinePanel(over: boolean): void {
  overStorylinePanel.value = over
}
