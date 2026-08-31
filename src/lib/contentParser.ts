/**
 * Content parsing utilities for extracting hashtags and wikilinks
 */

// Hashtag extraction limits
const MAX_HASHTAG_COUNT = 50
const MAX_HASHTAG_LENGTH = 50

/**
 * Extract hashtags from content
 * Matches: #word, #multi-word-tag, #CamelCase, #123numeric
 * Limited to prevent abuse
 */
export function extractHashtags(content: string): string[] {
  const hashtagRegex = /#([a-zA-Z0-9][\w-]*)/g
  const tags = new Set<string>()
  let match
  let count = 0
  while ((match = hashtagRegex.exec(content)) !== null && count < MAX_HASHTAG_COUNT) {
    const tag = match[1]
    // Skip tags that are too long
    if (tag.length <= MAX_HASHTAG_LENGTH) {
      tags.add(tag)
      count++
    }
  }
  return Array.from(tags)
}

/**
 * Extract wikilinks from content
 * Matches: [[link]], [[link|display text]]
 * Returns lowercased, trimmed link targets
 */
/**
 * Split content into its leading YAML frontmatter block (OKF/Obsidian
 * metadata, delimiters included) and the body. Content without a terminated
 * block at the very start is all body.
 */
export function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
  // CRLF files open with "---\r\n". Testing only for "---\n" treated the whole
  // document as body while extraction.ts read the same block successfully, so
  // one file had its metadata parsed and its YAML rendered as visible text.
  const opener = content.startsWith('---\r\n') ? 5 : content.startsWith('---\n') ? 4 : 0
  if (opener === 0) return { frontmatter: null, body: content }

  // The closing delimiter sits at the start of a line, with either ending
  const closer = content.slice(opener).search(/\r?\n---[ \t]*\r?(\n|$)/)
  if (closer === -1) return { frontmatter: null, body: content }

  const afterCloser = content.slice(opener + closer)
  const closerLength = afterCloser.match(/^\r?\n---[ \t]*\r?\n?/)?.[0].length ?? 0
  const end = opener + closer + closerLength
  const rest = content.slice(end)
  const bodyStart = rest.startsWith('\r\n') ? 2 : rest.startsWith('\n') ? 1 : 0

  return {
    frontmatter: content.slice(0, end + bodyStart),
    body: rest.slice(bodyStart),
  }
}

/** Reattach a preserved frontmatter block to an edited body */
export function joinFrontmatter(frontmatter: string | null, body: string): string {
  return frontmatter ? frontmatter + body : body
}

/**
 * Remove a leading YAML frontmatter block so it is not rendered as visible
 * text; the fields surface as structured node metadata instead.
 */
export function stripFrontmatter(content: string): string {
  return splitFrontmatter(content).body
}

/**
 * Set, replace, or remove (value null) a scalar field in the frontmatter
 * block, creating or dropping the block as needed. Returns the new content.
 */
export function upsertFrontmatterField(
  content: string,
  field: string,
  value: string | null
): string {
  const { frontmatter, body } = splitFrontmatter(content)
  const fieldRe = new RegExp(`^${field}:.*$`)

  // Split on either ending, then drop the opening and closing delimiters and
  // any trailing blank produced by the split
  const lines = frontmatter
    ? frontmatter
        .split(/\r?\n/)
        .filter((line, i, all) => i !== 0 && !(line.trim() === '---' && i > 0) && !(i === all.length - 1 && line === ''))
    : []
  const kept = lines.filter(line => !fieldRe.test(line))
  if (value !== null && value.trim() !== '') {
    kept.push(`${field}: ${value.trim()}`)
  }

  if (kept.length === 0) return body
  return `---\n${kept.join('\n')}\n---\n${body}`
}

/** One wikilink found in a body of text. */
export interface WikilinkMatch {
  /** The link target, trimmed. */
  target: string
  /** The display text after a pipe, or null when the link carries none. */
  alias: string | null
  /** The literal `[[...]]` text, for a caller rewriting the source. */
  text: string
  /** Offset of the match in the content, for a caller rewriting the source. */
  index: number
}

/**
 * A fresh matcher for wikilink syntax: `[[target]]` or `[[target|alias]]`.
 *
 * The one definition of the syntax. It existed as five separate literals - in
 * the frontmatter parser, the markdown renderer, the file-rename path, the
 * references sidebar and the fullscreen editor - and they had already drifted:
 * one accepted an empty alias (`[[Foo|]]`) where the rest rejected it, so the
 * same text was a link in one view and plain prose in another
 * (PRODUCT_DESIGN.md > One rule, one place).
 *
 * Returned from a function rather than exported as a constant because a global
 * regex carries `lastIndex`, and a shared instance would have callers resuming
 * from each other's position.
 */
export function wikilinkPattern(): RegExp {
  return /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
}

/** Every wikilink in `content`, in the order it appears. */
export function matchWikilinks(content: string): WikilinkMatch[] {
  const found: WikilinkMatch[] = []
  for (const match of content.matchAll(wikilinkPattern())) {
    found.push({
      target: match[1].trim(),
      alias: match[2] || null,
      text: match[0],
      index: match.index ?? 0,
    })
  }
  return found
}

/** Link targets in `content`, lowercased, for matching against node titles. */
export function extractWikilinks(content: string): Set<string> {
  return new Set(matchWikilinks(content).map((link) => link.target.toLowerCase()))
}

/**
 * Apply date/date_end values into a content block's frontmatter.
 *
 * Shared by the MCP handlers and the in-app agent tools: a second copy would
 * let the two surfaces disagree about how a date is written.
 * An empty string clears the field; undefined leaves it untouched.
 */
export function withDateFields(
  content: string,
  date: string | undefined,
  dateEnd: string | undefined
): string {
  let result = content
  if (date !== undefined) {
    result = upsertFrontmatterField(result, 'date', date || null)
  }
  if (dateEnd !== undefined) {
    result = upsertFrontmatterField(result, 'date_end', dateEnd || null)
  }
  return result
}

/** A markdown heading, for the contents sidebar */
export interface MarkdownHeading {
  level: number
  text: string
}

/**
 * List the headings in a markdown body, in order, skipping frontmatter and
 * fenced code blocks - a `#` inside a code fence is a comment, not a heading
 * (PRODUCT_DESIGN.md > Contents sidebar).
 */
export function extractHeadings(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  let inFence = false
  for (const line of stripFrontmatter(content || '').split('\n')) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) headings.push({ level: match[1].length, text: match[2].trim() })
  }
  return headings
}
