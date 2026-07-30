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
 * Remove a leading YAML frontmatter block (OKF/Obsidian metadata) so it is
 * not rendered as visible text. Content without a terminated block at the
 * very start is returned unchanged.
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) return content
  const end = content.indexOf('\n---', 4)
  if (end === -1) return content
  return content.slice(end + 4).replace(/^\r?\n/, '')
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
