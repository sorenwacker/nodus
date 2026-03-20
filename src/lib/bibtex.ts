/**
 * BibTeX Parser for Zotero exports
 * Parses .bib files and extracts citation metadata
 */

export interface BibEntry {
  type: string          // article, book, inproceedings, etc.
  key: string           // citation key
  title?: string
  author?: string
  year?: string
  journal?: string
  booktitle?: string
  publisher?: string
  volume?: string
  number?: string
  pages?: string
  doi?: string
  url?: string
  abstract?: string
  keywords?: string
  file?: string         // Path to attached PDF
  zoteroKey?: string    // Zotero item key for future sync
  attachments?: string[] // Paths to attached PDFs
  collections?: string[] // Collection names for Frame mapping
  [key: string]: string | string[] | undefined
}

/**
 * Extract value with balanced braces
 */
function extractBracedValue(str: string, start: number): { value: string; end: number } {
  let depth = 1
  let i = start
  while (i < str.length && depth > 0) {
    if (str[i] === '{') depth++
    else if (str[i] === '}') depth--
    i++
  }
  return { value: str.slice(start, i - 1), end: i }
}

/**
 * Parse fields from BibTeX entry body
 */
function parseFields(body: string, entry: BibEntry): void {
  let pos = 0
  while (pos < body.length) {
    // Skip whitespace and commas
    while (pos < body.length && /[\s,]/.test(body[pos])) pos++
    if (pos >= body.length) break

    // Match field name
    const nameMatch = body.slice(pos).match(/^(\w+)\s*=\s*/)
    if (!nameMatch) {
      pos++
      continue
    }

    const fieldName = nameMatch[1].toLowerCase()
    pos += nameMatch[0].length

    // Get value
    let value = ''
    if (body[pos] === '{') {
      const result = extractBracedValue(body, pos + 1)
      value = result.value
      pos = result.end
    } else if (body[pos] === '"') {
      const endQuote = body.indexOf('"', pos + 1)
      if (endQuote !== -1) {
        value = body.slice(pos + 1, endQuote)
        pos = endQuote + 1
      }
    } else {
      // Bare value (number or single word)
      const bareMatch = body.slice(pos).match(/^(\S+)/)
      if (bareMatch) {
        value = bareMatch[1].replace(/,$/, '')
        pos += bareMatch[0].length
      }
    }

    entry[fieldName] = cleanBibValue(value)
  }
}

/**
 * Parse BibTeX content into structured entries
 */
export function parseBibTeX(content: string): BibEntry[] {
  const entries: BibEntry[] = []

  // Match @type{key, ... }
  const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*?)(?=\n\s*@|\s*$)/gs

  let match
  while ((match = entryRegex.exec(content)) !== null) {
    const [, type, key, body] = match

    const entry: BibEntry = {
      type: type.toLowerCase(),
      key: key.trim(),
    }

    // Parse fields with balanced brace handling
    parseFields(body, entry)

    entries.push(entry)
  }

  return entries
}

/**
 * Clean BibTeX value (remove LaTeX commands, normalize whitespace)
 */
function cleanBibValue(value: string): string {
  // Recursively remove braces used for capitalization/grouping
  let cleaned = value
  let prev = ''
  while (prev !== cleaned) {
    prev = cleaned
    cleaned = cleaned.replace(/\{([^{}]*)\}/g, '$1')
  }

  return cleaned
    // Convert LaTeX commands to unicode
    .replace(/\\&/g, '&')
    .replace(/\\'([aeiou])/gi, (_, c) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' }[c] || c))
    .replace(/\\"([aeiou])/gi, (_, c) => ({ a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' }[c] || c))
    .replace(/\\`([aeiou])/gi, (_, c) => ({ a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' }[c] || c))
    .replace(/\\~([an])/gi, (_, c) => ({ a: 'ã', n: 'ñ', A: 'Ã', N: 'Ñ' }[c] || c))
    .replace(/\\c\{c\}/gi, 'ç')
    .replace(/\\ss\b/g, 'ß')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``/g, '"')
    .replace(/''/g, '"')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Format author string (Last, First and Last, First -> First Last, First Last)
 */
export function formatAuthors(authorStr: string): string[] {
  if (!authorStr) return []

  return authorStr
    .split(/\s+and\s+/i)
    .map(author => {
      const parts = author.split(',').map(p => p.trim())
      if (parts.length === 2) {
        return `${parts[1]} ${parts[0]}` // First Last
      }
      return author.trim()
    })
}

/**
 * Generate markdown content for a citation node
 */
export function citationToMarkdown(entry: BibEntry): string {
  const lines: string[] = []

  // Title
  if (entry.title) {
    lines.push(`# ${entry.title}`)
    lines.push('')
  }

  // Authors and year
  const authors = formatAuthors(entry.author || '')
  if (authors.length > 0 || entry.year) {
    const authorStr = authors.join(', ')
    const yearStr = entry.year ? `(${entry.year})` : ''
    lines.push(`**${authorStr}** ${yearStr}`.trim())
    lines.push('')
  }

  // Publication venue
  if (entry.journal) {
    lines.push(`*${entry.journal}*`)
  } else if (entry.booktitle) {
    lines.push(`In: *${entry.booktitle}*`)
  } else if (entry.publisher) {
    lines.push(`${entry.publisher}`)
  }

  // Volume, number, pages
  const pubDetails: string[] = []
  if (entry.volume) pubDetails.push(`Vol. ${entry.volume}`)
  if (entry.number) pubDetails.push(`No. ${entry.number}`)
  if (entry.pages) pubDetails.push(`pp. ${entry.pages}`)
  if (pubDetails.length > 0) {
    lines.push(pubDetails.join(', '))
  }

  lines.push('')

  // DOI link
  if (entry.doi) {
    lines.push(`DOI: [${entry.doi}](https://doi.org/${entry.doi})`)
    lines.push('')
  }

  // URL
  if (entry.url && !entry.doi) {
    lines.push(`URL: ${entry.url}`)
    lines.push('')
  }

  // Abstract
  if (entry.abstract) {
    lines.push('## Abstract')
    lines.push('')
    lines.push(entry.abstract)
    lines.push('')
  }

  // Keywords
  if (entry.keywords) {
    lines.push(`**Keywords:** ${entry.keywords}`)
    lines.push('')
  }

  // Citation key for reference
  lines.push(`---`)
  lines.push(`*Citation key: ${entry.key}*`)

  return lines.join('\n')
}

/**
 * Parse CSL-JSON format (alternative export from Zotero)
 * Supports standard CSL-JSON and Better BibTeX extended format
 */
export interface CslEntry {
  id: string
  type: string
  title?: string
  author?: Array<{ family?: string; given?: string }>
  issued?: { 'date-parts'?: number[][] }
  'container-title'?: string
  publisher?: string
  volume?: string
  issue?: string
  page?: string
  DOI?: string
  URL?: string
  abstract?: string
  // Better BibTeX / Zotero extensions
  'citation-key'?: string
  collections?: string[]
  attachments?: Array<{ path?: string; title?: string }>
}

export function parseCslJson(content: string): BibEntry[] {
  try {
    const data: CslEntry[] = JSON.parse(content)
    return data.map(csl => ({
      type: csl.type || 'article',
      // Use citation-key if available (Better BibTeX), otherwise use id
      key: csl['citation-key'] || csl.id || crypto.randomUUID(),
      title: csl.title,
      author: csl.author?.map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(' and '),
      year: csl.issued?.['date-parts']?.[0]?.[0]?.toString(),
      journal: csl['container-title'],
      publisher: csl.publisher,
      volume: csl.volume,
      number: csl.issue,
      pages: csl.page,
      doi: csl.DOI,
      url: csl.URL,
      abstract: csl.abstract,
      // Zotero-specific fields
      zoteroKey: csl.id,
      collections: csl.collections,
      attachments: csl.attachments?.map(a => a.path).filter((p): p is string => !!p),
    }))
  } catch {
    return []
  }
}

/**
 * Detect format and parse
 */
export function parseReferences(content: string): BibEntry[] {
  const trimmed = content.trim()

  // CSL-JSON starts with [ or {
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const entries = parseCslJson(trimmed.startsWith('{') ? `[${trimmed}]` : trimmed)
    if (entries.length > 0) return entries
  }

  // Otherwise try BibTeX
  return parseBibTeX(content)
}
