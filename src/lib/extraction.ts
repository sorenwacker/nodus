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

/**
 * Parse raw YAML frontmatter into key-value pairs
 * Returns null if no frontmatter found
 */
export function parseFrontmatterRaw(content: string | null): Record<string, string> | null {
  if (!content) return null

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return null

  const result: Record<string, string> = {}
  const lines = frontmatterMatch[1].split('\n')

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/)
    if (match) {
      const key = match[1]
      let value = match[2].trim()
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      result[key] = value
    }
  }

  return Object.keys(result).length > 0 ? result : null
}

/**
 * Citation metadata extracted from node content
 */
export interface ExtractedCitationMetadata {
  doi: string | null
  date: string | null
  journal: string | null
  itemType: string | null
  creators: Array<{ firstName?: string; lastName?: string; creatorType: string }>
}

/**
 * Extract citation metadata from markdown content
 * Parses frontmatter and body text for DOI, date, journal, and authors
 */
export function extractCitationMetadata(content: string | null): ExtractedCitationMetadata {
  const result: ExtractedCitationMetadata = {
    doi: null,
    date: null,
    journal: null,
    itemType: null,
    creators: [],
  }

  if (!content) return result

  // Limit input size for safety (first 10KB should contain all metadata)
  const MAX_CONTENT_SIZE = 10 * 1024
  const text = content.length > MAX_CONTENT_SIZE
    ? content.slice(0, MAX_CONTENT_SIZE)
    : content

  // Extract from frontmatter
  const frontmatter = parseFrontmatterRaw(text)
  if (frontmatter) {
    result.doi = frontmatter.doi || null
    result.date = frontmatter.date || null
    result.journal = frontmatter.journal || null
    result.itemType = frontmatter.type || null
  }

  // Extract year from body if date not in frontmatter
  if (!result.date) {
    const yearMatch = text.match(/^\*(\d{4})\*$/m) ||
                      text.match(/\*\((\d{4})\)\*/) ||
                      text.match(/\((\d{4})\)/)
    if (yearMatch) result.date = yearMatch[1]
  }

  // Extract journal/venue from publication info line
  if (!result.journal) {
    const pubInfoMatch = text.match(/^\*([^*]+)\*$/m)
    if (pubInfoMatch) {
      const pubInfo = pubInfoMatch[1]
      const parts = pubInfo.split(',')
      if (parts.length > 0 && !parts[0].match(/^\d{4}$/)) {
        result.journal = parts[0].trim()
      }
    }
  }

  // Extract authors from body
  const authorsMatch = text.match(/\*\*Authors:\*\*\s*(.+)/i)
  if (authorsMatch) {
    const authorStr = authorsMatch[1].replace(/, et al\.?$/i, '')
    const authorNames = authorStr.split(/,\s*/)
    for (const name of authorNames) {
      const parts = name.trim().split(/\s+/)
      if (parts.length >= 2) {
        result.creators.push({
          firstName: parts.slice(0, -1).join(' '),
          lastName: parts[parts.length - 1],
          creatorType: 'author',
        })
      } else if (parts.length === 1) {
        result.creators.push({
          lastName: parts[0],
          creatorType: 'author',
        })
      }
    }
  }

  return result
}
