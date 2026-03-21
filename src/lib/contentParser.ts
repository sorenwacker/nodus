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
export function extractWikilinks(content: string): Set<string> {
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const links = new Set<string>()
  let match
  while ((match = wikilinkRegex.exec(content)) !== null) {
    links.add(match[1].trim().toLowerCase())
  }
  return links
}
