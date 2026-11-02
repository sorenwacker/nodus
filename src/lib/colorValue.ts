/**
 * Whether a string is a colour a stylesheet accepts
 * (PRODUCT_DESIGN.md > A node's colour is a colour or nothing).
 */

const COLOR_SYNTAX = /^(#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|hsl)a?\([^()]+\)|var\(--[\w-]+\))$/i

/**
 * True for a hex colour, an rgb()/hsl() colour, a custom property reference,
 * or anything else the running browser accepts as a colour, which covers the
 * named colours.
 *
 * Args:
 *   value: The candidate, as stored or as given by a caller.
 *
 * Returns:
 *   Whether a background or fill may be built from it.
 */
export function isColorValue(value: string): boolean {
  const candidate = value.trim()
  if (!candidate) return false
  if (COLOR_SYNTAX.test(candidate)) return true
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('color', candidate)
}
