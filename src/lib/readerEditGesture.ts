/**
 * Whether a double-click in a reader section's body starts editing it
 * (PRODUCT_DESIGN.md > Editing in the reader).
 */

/** Elements inside the rendered text whose double-click is their own */
const OWN_GESTURE = 'a, button, input, textarea, select, summary, [contenteditable="true"]'

/**
 * True when the double-click landed on text, false on a link or a control.
 *
 * Args:
 *   target: The event target of the double-click.
 *
 * Returns:
 *   Whether the section should open for editing.
 */
export function doubleClickEditsSection(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(OWN_GESTURE) === null
}
