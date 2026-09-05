import { NODE_DEFAULTS } from '../canvas/constants'

/**
 * How much of a node's content a card renders.
 *
 * A node holding an imported paper can carry tens of kilobytes of markdown.
 * Rendering 73KB measured at 82ms - five dropped frames for one click - into a
 * card a few hundred pixels tall. Cards render the leading portion; the full
 * document renders where it is read, in the fullscreen view and the storyline
 * reader (PRODUCT_DESIGN.md > Rendering node content).
 */

/**
 * The most a card will ever render, whatever its size. Chosen from measurement:
 * rendering costs roughly a millisecond per kilobyte, so this stays well inside
 * one frame.
 */
export const CARD_PREVIEW_LIMIT = 4000

/** The least a card renders, so a small card still says something. */
const CARD_PREVIEW_FLOOR = 200

/** Card body font size in canvas px (node-card.css .node-content). */
const BODY_FONT_PX = 13
/** Rough advance width of a character, as a fraction of the font size. */
const CHAR_WIDTH_RATIO = 0.55
/** Line box height, as a multiple of the font size. */
const LINE_HEIGHT_RATIO = 1.5
/**
 * Headroom over what the card can literally show. Markdown syntax does not
 * render, lines break early, and a card can be resized without its content
 * being rendered again, so the cap is deliberately generous.
 */
const HEADROOM = 2

/**
 * How much of a node's content a card of this size can use.
 *
 * A 200x120 card shows about 162 characters - 27 across, 6 down - while the
 * flat cap rendered an average of 896. Measured over 400 real nodes that was 38
 * DOM elements per card against 7, and the whole difference is built, styled
 * and painted for text nobody can see. Every card crossing the viewport during
 * a pan pays it (PRODUCT_DESIGN.md > Rendering node content).
 *
 * Args:
 *   width: Card width in canvas px. Defaults to the standard card.
 *   height: Card height in canvas px. Defaults to the standard card.
 *   fontScale: The user's font scale; larger text fits less.
 *
 * Returns:
 *   The character cap for this card, between the floor and CARD_PREVIEW_LIMIT.
 */
export function capForCard(
  width: number | undefined,
  height: number | undefined,
  fontScale = 1
): number {
  const w = width ?? NODE_DEFAULTS.WIDTH
  const h = height ?? NODE_DEFAULTS.HEIGHT
  const fontSize = BODY_FONT_PX * fontScale

  const charsPerLine = Math.max(1, Math.floor(w / (fontSize * CHAR_WIDTH_RATIO)))
  const lines = Math.max(1, Math.floor(h / (fontSize * LINE_HEIGHT_RATIO)))

  const fits = charsPerLine * lines * HEADROOM
  return Math.min(CARD_PREVIEW_LIMIT, Math.max(CARD_PREVIEW_FLOOR, fits))
}

export interface CardPreview {
  text: string
  /** True when content was left out, so the card can say the text continues */
  truncated: boolean
}

/**
 * The leading portion of a node's content, cut at a line break so a markdown
 * construct is not severed halfway through.
 */
export function previewForCard(content: string | null | undefined, limit = CARD_PREVIEW_LIMIT): CardPreview {
  const text = content || ''
  if (text.length <= limit) return { text, truncated: false }

  const window = text.slice(0, limit + 200)
  const lastBreak = window.lastIndexOf('\n', limit)

  return {
    text: lastBreak > limit / 2 ? window.slice(0, lastBreak) : window,
    truncated: true,
  }
}
