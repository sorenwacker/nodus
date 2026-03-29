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
