/**
 * Anchoring a node in another node's text.
 *
 * The anchor is the wikilink itself, written at the point in the text it
 * refers to. Because the text carries the anchor, it survives editing here, in
 * Obsidian, or anywhere else, and there are no stored offsets for a later edit
 * to invalidate (PRODUCT_DESIGN.md > Anchored nodes).
 */

const TITLE_WORDS = 6
const TITLE_MAX = 60

/**
 * A title for a comment, short enough to read and unique among `takenTitles`,
 * because a wikilink resolves a node by its title.
 */
export function commentAnchorTitle(text: string, takenTitles: string[]): string {
  const words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, TITLE_WORDS)
    .join(' ')
    .slice(0, TITLE_MAX)
    .replace(/[[\]|]/g, '')
    .trim()

  const base = `Comment: ${words || 'note'}`
  const taken = new Set(takenTitles.map(t => t.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base

  let n = 2
  while (taken.has(`${base} (${n})`.toLowerCase())) n++
  return `${base} (${n})`
}

/**
 * Write the link to an anchored node into the text it belongs to. A link that
 * is already there is left alone, so re-anchoring cannot duplicate it.
 */
export function anchorCommentInText(text: string, anchorTitle: string): string {
  const link = `[[${anchorTitle}]]`
  if (text.includes(link)) return text
  const body = text.trimEnd()
  return body ? `${body}\n\n${link}` : link
}
