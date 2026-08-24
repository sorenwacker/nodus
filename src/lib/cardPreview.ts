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
 * Characters a card renders. Chosen from measurement: rendering costs roughly
 * a millisecond per kilobyte, so this stays well inside one frame.
 */
export const CARD_PREVIEW_LIMIT = 4000

export interface CardPreview {
  text: string
  /** True when content was left out, so the card can say the text continues */
  truncated: boolean
}

/**
 * The leading portion of a node's content, cut at a line break so a markdown
 * construct is not severed halfway through.
 */
export function previewForCard(content: string | null | undefined): CardPreview {
  const text = content || ''
  if (text.length <= CARD_PREVIEW_LIMIT) return { text, truncated: false }

  const window = text.slice(0, CARD_PREVIEW_LIMIT + 200)
  const lastBreak = window.lastIndexOf('\n', CARD_PREVIEW_LIMIT)

  return {
    text: lastBreak > CARD_PREVIEW_LIMIT / 2 ? window.slice(0, lastBreak) : window,
    truncated: true,
  }
}
