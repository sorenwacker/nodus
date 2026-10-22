/**
 * How a collapsed card's title wraps, judged the way the browser wraps it:
 * whole words, each measured at the title's font
 * (PRODUCT_DESIGN.md > Collapsed node titles).
 */

/** Width in pixels of `text` set in the collapsed title font at `size` px. */
export type MeasureTitle = (text: string, size: number) => number

/** The collapsed header's font: bold, in the application's sans stack. */
const TITLE_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Ubuntu', 'Cantarell', 'Noto Sans', sans-serif"
/** The header's letter spacing, applied after every glyph. */
const LETTER_SPACING = -0.5
/** Mean advance of a bold sans glyph, used only where no canvas can measure. */
const AVG_CHAR_EM = 0.52

let context: CanvasRenderingContext2D | null | undefined

/** Measure with a 2D canvas, falling back to an average glyph width. */
export const measureTitleText: MeasureTitle = (text, size) => {
  if (context === undefined) {
    try {
      context = document.createElement('canvas').getContext('2d')
    } catch {
      context = null
    }
  }
  if (!context) return text.length * size * AVG_CHAR_EM
  context.font = `700 ${size}px ${TITLE_FONT_FAMILY}`
  return context.measureText(text).width + LETTER_SPACING * text.length
}

/**
 * Lines `title` takes when wrapped greedily at word boundaries into `width`.
 * A word wider than a whole line is broken across lines, as the stylesheet's
 * overflow-wrap: break-word does.
 */
export function wrappedLineCount(
  title: string,
  width: number,
  size: number,
  measure: MeasureTitle
): number {
  const words = title.split(/\s+/).filter(Boolean)
  const space = measure(' ', size)
  let lines = 1
  // Width already used on the current line; null before its first word
  let used: number | null = null
  for (const word of words) {
    const wordWidth = measure(word, size)
    if (used !== null && used + space + wordWidth <= width) {
      used += space + wordWidth
      continue
    }
    if (used !== null) lines++
    if (wordWidth > width) {
      // Broken word: every full line it fills is counted, its tail carries on
      const fullLines = Math.ceil(wordWidth / width) - 1
      lines += fullLines
      used = wordWidth - fullLines * width
    } else {
      used = wordWidth
    }
  }
  return lines
}
