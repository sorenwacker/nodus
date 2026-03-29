/**
 * Shared citation formatting utilities
 *
 * Provides consistent markdown formatting for citation data from
 * Semantic Scholar, Zotero, and other sources.
 */

export interface CitationData {
  title: string
  doi?: string
  semanticScholarId?: string
  zoteroKey?: string
  itemType?: string
  year?: number | string
  date?: string
  venue?: string
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  authors?: Array<{
    name?: string
    firstName?: string
    lastName?: string
  }>
  abstract?: string
}

/**
 * Format citation data as markdown with YAML frontmatter
 */
export function formatCitationAsMarkdown(data: CitationData): string {
  const lines: string[] = ['---']

  // Frontmatter
  if (data.doi) lines.push(`doi: ${data.doi}`)
  if (data.semanticScholarId) lines.push(`semantic_scholar_id: ${data.semanticScholarId}`)
  if (data.zoteroKey) lines.push(`zotero_key: ${data.zoteroKey}`)
  if (data.itemType) lines.push(`type: ${data.itemType}`)
  if (data.date) lines.push(`date: ${data.date}`)
  else if (data.year) lines.push(`date: ${data.year}`)
  if (data.journal || data.venue) {
    lines.push(`journal: "${data.journal || data.venue}"`)
  }
  lines.push('---')
  lines.push('')

  // Title
  lines.push(`# ${data.title || 'Untitled'}`)
  lines.push('')

  // Authors
  if (data.authors && data.authors.length > 0) {
    const authorNames = data.authors
      .slice(0, 10)
      .map(a => a.name || `${a.firstName || ''} ${a.lastName || ''}`.trim())
      .filter(n => n)
      .join(', ')
    if (authorNames) {
      if (data.authors.length > 10) {
        lines.push(`**Authors:** ${authorNames}, et al.`)
      } else {
        lines.push(`**Authors:** ${authorNames}`)
      }
      lines.push('')
    }
  }

  // Publication info
  const pubInfo: string[] = []
  if (data.journal || data.venue) pubInfo.push(data.journal || data.venue || '')
  if (data.volume) pubInfo.push(`Vol. ${data.volume}`)
  if (data.issue) pubInfo.push(`Issue ${data.issue}`)
  if (data.pages) pubInfo.push(`pp. ${data.pages}`)
  if (data.year || data.date) pubInfo.push(`(${data.year || data.date})`)
  if (pubInfo.length > 0) {
    lines.push(`*${pubInfo.join(', ')}*`)
    lines.push('')
  } else if (data.year) {
    lines.push(`*${data.year}*`)
    lines.push('')
  }

  // DOI link
  if (data.doi) {
    lines.push(`**DOI:** [${data.doi}](https://doi.org/${data.doi})`)
    lines.push('')
  }

  // Abstract
  if (data.abstract) {
    lines.push('## Abstract')
    lines.push('')
    lines.push(data.abstract)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format minimal stub content (for citation references without full data)
 */
export function formatStubCitation(data: {
  title: string
  doi?: string
  semanticScholarId?: string
  year?: number
  authors?: Array<{ name: string }>
}): string {
  const lines: string[] = ['---']

  if (data.doi) lines.push(`doi: ${data.doi}`)
  if (data.semanticScholarId) lines.push(`semantic_scholar_id: ${data.semanticScholarId}`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${data.title || 'Untitled'}`)
  lines.push('')

  if (data.authors && data.authors.length > 0) {
    const authorNames = data.authors.slice(0, 5).map(a => a.name).join(', ')
    if (data.authors.length > 5) {
      lines.push(`**Authors:** ${authorNames}, et al.`)
    } else {
      lines.push(`**Authors:** ${authorNames}`)
    }
    lines.push('')
  }

  if (data.year) {
    lines.push(`*${data.year}*`)
    lines.push('')
  }

  if (data.doi) {
    lines.push(`**DOI:** [${data.doi}](https://doi.org/${data.doi})`)
    lines.push('')
  }

  return lines.join('\n')
}
