/**
 * Content parsing utilities for extracting hashtags and wikilinks
 */

// Hashtag extraction limits
export const MAX_HASHTAG_COUNT = 50
export const MAX_HASHTAG_LENGTH = 50

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
  if (!content.startsWith('---\n')) return { frontmatter: null, body: content }
  const end = content.indexOf('\n---', 4)
  if (end === -1) return { frontmatter: null, body: content }
  const rest = content.slice(end + 4)
  const bodyStart = rest.startsWith('\r\n') ? 2 : rest.startsWith('\n') ? 1 : 0
  return {
    frontmatter: content.slice(0, end + 4 + bodyStart),
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

  const lines = frontmatter
    ? frontmatter.split('\n').slice(1, -2) // strip delimiters and trailing newline
    : []
  const kept = lines.filter(line => !fieldRe.test(line))
  if (value !== null && value.trim() !== '') {
    kept.push(`${field}: ${value.trim()}`)
  }

  if (kept.length === 0) return body
  return `---\n${kept.join('\n')}\n---\n${body}`
}

export function extractWikilinks(content: string): Set<string> {
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const links = new Set<string>()
  let match
  while ((match = wikilinkRegex.exec(content)) !== null) {
    links.add(match[1].trim().toLowerCase())
  }
  return links
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
