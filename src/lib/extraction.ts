/**
 * Content extraction utilities
 * Functions to extract identifiers and metadata from text
 */

/**
 * Extract DOI from text content
 * Supports:
 * - Direct DOI (10.xxxx/...)
 * - DOI URLs (https://doi.org/10.xxxx/...)
 * - DOI: prefix (DOI: 10.xxxx/...)
 * - YAML frontmatter (doi: xxx)
 */
export function extractDOI(content: string | null): string | null {
  if (!content) return null

  const text = content.trim()

  // Check YAML frontmatter first
  const frontmatterMatch = text.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const doiMatch = frontmatterMatch[1].match(/^doi:\s*(.+)$/m)
    if (doiMatch) {
      return doiMatch[1].trim()
    }
  }

  // Direct DOI (10.xxxx/...)
  const directMatch = text.match(/^(10\.\d{4,}\/[^\s\])"']+)$/i)
  if (directMatch) {
    return cleanDOI(directMatch[1])
  }

  // Check for DOI in body text (various formats)
  const patterns = [
    /doi\.org\/(10\.\d{4,}\/[^\s\])"']+)/i,
    /DOI:\s*(10\.\d{4,}\/[^\s\])"']+)/i,
    /\b(10\.\d{4,}\/[^\s\])"']+)/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return cleanDOI(match[1] || match[0])
    }
  }

  return null
}

/**
 * Clean up a DOI string by removing trailing punctuation
 */
function cleanDOI(doi: string): string {
  return doi.replace(/[.,;:)\]]+$/, '')
}

/**
 * Extract Zotero key from content frontmatter
 */
export function extractZoteroKey(content: string | null): string | null {
  if (!content) return null

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const keyMatch = frontmatterMatch[1].match(/^zotero_key:\s*(.+)$/m)
    if (keyMatch) {
      return keyMatch[1].trim()
    }
  }

  return null
}

/**
 * Extract Semantic Scholar ID from content frontmatter
 */
export function extractSemanticScholarId(content: string | null): string | null {
  if (!content) return null

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const idMatch = frontmatterMatch[1].match(/^semantic_scholar_id:\s*(.+)$/m)
    if (idMatch) {
      return idMatch[1].trim()
    }
  }

  return null
}

/**
 * Extract title from YAML frontmatter
 * Supports: title: "My Title" or title: My Title
 */
export function extractFrontmatterTitle(content: string | null): string | null {
  if (!content) return null

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    // Match title: value (with optional quotes)
    const titleMatch = frontmatterMatch[1].match(/^title:\s*["']?([^"'\n]+)["']?\s*$/m)
    if (titleMatch) {
      return titleMatch[1].trim()
    }
  }

  return null
}

/**
 * Extract tags from YAML frontmatter
 * Supports:
 * - tags: [tag1, tag2, tag3]
 * - tags: tag1, tag2, tag3
 * - tags:
 *   - tag1
 *   - tag2
 */
export function extractFrontmatterTags(content: string | null): string[] | null {
  if (!content) return null

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return null

  const frontmatter = frontmatterMatch[1]

  // Try array format: tags: [tag1, tag2]
  const arrayMatch = frontmatter.match(/^tags:\s*\[([^\]]+)\]\s*$/m)
  if (arrayMatch) {
    return arrayMatch[1]
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''))
      .filter(t => t.length > 0)
  }

  // Try inline format: tags: tag1, tag2
  const inlineMatch = frontmatter.match(/^tags:\s*([^[\n]+)$/m)
  if (inlineMatch && !inlineMatch[1].trim().startsWith('-')) {
    return inlineMatch[1]
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''))
      .filter(t => t.length > 0)
  }

  // Try YAML list format:
  // tags:
  //   - tag1
  //   - tag2
  const listMatch = frontmatter.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m)
  if (listMatch) {
    return listMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s+-\s+/, '').trim())
      .filter(t => t.length > 0)
  }

  return null
}

/**
 * Extract all frontmatter metadata at once
 */
export function extractFrontmatter(content: string | null): {
  title: string | null
  tags: string[] | null
  doi: string | null
  zoteroKey: string | null
  semanticScholarId: string | null
} {
  return {
    title: extractFrontmatterTitle(content),
    tags: extractFrontmatterTags(content),
    doi: extractDOI(content),
    zoteroKey: extractZoteroKey(content),
    semanticScholarId: extractSemanticScholarId(content),
  }
}
