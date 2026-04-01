/**
 * Typst Document Export
 * Converts nodes to a properly formatted Typst document
 */

import type { Node, Edge } from '../types'

export interface ExportOptions {
  title?: string
  author?: string
  date?: string
  includeConnections?: boolean
  paperSize?: 'a4' | 'us-letter' | 'a5'
  fontSize?: string
  marginSize?: string
}

const defaultOptions: ExportOptions = {
  title: 'Nodus Export',
  includeConnections: true,
  paperSize: 'a4',
  fontSize: '11pt',
  marginSize: '2.5cm',
}

/**
 * Generate Typst document preamble
 */
function generatePreamble(options: ExportOptions): string {
  const lines: string[] = []

  // Page setup
  lines.push(`#set page(`)
  lines.push(`  paper: "${options.paperSize}",`)
  lines.push(`  margin: ${options.marginSize},`)
  lines.push(`)`)
  lines.push('')

  // Text setup
  lines.push(`#set text(`)
  lines.push(`  font: "New Computer Modern",`)
  lines.push(`  size: ${options.fontSize},`)
  lines.push(`)`)
  lines.push('')

  // Paragraph setup
  lines.push(`#set par(justify: true)`)
  lines.push('')

  // Heading setup
  lines.push(`#set heading(numbering: "1.1")`)
  lines.push('')

  // Title block
  if (options.title) {
    lines.push(`#align(center)[`)
    lines.push(`  #text(size: 24pt, weight: "bold")[${escapeTypst(options.title)}]`)
    if (options.author) {
      lines.push(`  #v(0.5em)`)
      lines.push(`  #text(size: 12pt)[${escapeTypst(options.author)}]`)
    }
    if (options.date) {
      lines.push(`  #v(0.3em)`)
      lines.push(`  #text(size: 10pt, style: "italic")[${escapeTypst(options.date)}]`)
    }
    lines.push(`]`)
    lines.push('')
    lines.push(`#v(2em)`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Escape special Typst characters
 */
function escapeTypst(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/@/g, '\\@')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
}

/**
 * Convert markdown-style content to Typst
 */
function markdownToTypst(content: string): string {
  let result = content

  // Headings: # -> =
  result = result.replace(/^######\s+(.+)$/gm, '====== $1')
  result = result.replace(/^#####\s+(.+)$/gm, '===== $1')
  result = result.replace(/^####\s+(.+)$/gm, '==== $1')
  result = result.replace(/^###\s+(.+)$/gm, '=== $1')
  result = result.replace(/^##\s+(.+)$/gm, '== $1')
  result = result.replace(/^#\s+(.+)$/gm, '= $1')

  // Bold: **text** -> *text* (use placeholder to avoid italic conversion)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\*\*([^*]+)\*\*/g, '\x00BOLD\x00$1\x00/BOLD\x00')

  // Italic: *text* -> _text_ (single asterisks only)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\*([^*\x00]+)\*/g, '_$1_')

  // Restore bold markers
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x00BOLD\x00/g, '*')
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x00\/BOLD\x00/g, '*')

  // Code blocks
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `\`\`\`${lang}\n${code}\`\`\``
  })

  // Inline code
  result = result.replace(/`([^`]+)`/g, '`$1`')

  // Links: [text](url) -> #link("url")[text]
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '#link("$2")[$1]')

  // Blockquotes: > text -> #quote[text]
  result = result.replace(/^>\s+(.+)$/gm, '#quote[$1]')

  // Unordered lists: - item -> - item (same syntax)
  // Ordered lists: 1. item -> + item
  result = result.replace(/^\d+\.\s+/gm, '+ ')

  // Horizontal rules
  result = result.replace(/^---+$/gm, '#line(length: 100%)')

  return result
}

/**
 * Convert a citation node to Typst format
 */
function citationToTypst(node: Node): string {
  const lines: string[] = []

  lines.push(`== ${escapeTypst(node.title)}`)
  lines.push('')

  if (node.markdown_content) {
    // Parse citation markdown and convert to Typst
    const content = node.markdown_content

    // Extract authors and year from citation format
    const authorMatch = content.match(/\*\*([^*]+)\*\*\s*\((\d{4})\)/)
    if (authorMatch) {
      lines.push(`*${authorMatch[1]}* (${authorMatch[2]})`)
      lines.push('')
    }

    // Extract journal/venue
    const journalMatch = content.match(/\*([^*]+)\*/)
    if (journalMatch && !authorMatch) {
      lines.push(`_${journalMatch[1]}_`)
      lines.push('')
    }

    // Extract DOI
    const doiMatch = content.match(/DOI:\s*\[([^\]]+)\]/)
    if (doiMatch) {
      lines.push(`#link("https://doi.org/${doiMatch[1]}")[DOI: ${doiMatch[1]}]`)
      lines.push('')
    }

    // Extract abstract
    const abstractMatch = content.match(/## Abstract\s*\n\s*(.+)/s)
    if (abstractMatch) {
      lines.push(`=== Abstract`)
      lines.push('')
      lines.push(abstractMatch[1].split('\n')[0].trim())
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Convert a regular note node to Typst format
 */
function noteToTypst(node: Node): string {
  const lines: string[] = []

  lines.push(`== ${escapeTypst(node.title)}`)
  lines.push('')

  if (node.markdown_content) {
    lines.push(markdownToTypst(node.markdown_content))
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generate a section showing node connections
 */
function generateConnectionsSection(nodes: Node[], edges: Edge[]): string {
  if (edges.length === 0) return ''

  const lines: string[] = []
  lines.push('= Connections')
  lines.push('')

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Group edges by type
  const edgesByType = new Map<string, Edge[]>()
  for (const edge of edges) {
    const type = edge.link_type || 'related'
    if (!edgesByType.has(type)) {
      edgesByType.set(type, [])
    }
    edgesByType.get(type)!.push(edge)
  }

  for (const [type, typeEdges] of edgesByType) {
    lines.push(`== ${type.charAt(0).toUpperCase() + type.slice(1)}`)
    lines.push('')

    for (const edge of typeEdges) {
      const source = nodeMap.get(edge.source_node_id)
      const target = nodeMap.get(edge.target_node_id)
      if (source && target) {
        lines.push(`- ${escapeTypst(source.title)} → ${escapeTypst(target.title)}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Export nodes to a Typst document
 */
export function exportToTypst(
  nodes: Node[],
  edges: Edge[],
  options: Partial<ExportOptions> = {}
): string {
  const opts = { ...defaultOptions, ...options }
  const sections: string[] = []

  // Add preamble
  sections.push(generatePreamble(opts))

  // Sort nodes by position (top-left first) for logical reading order
  const sortedNodes = [...nodes].sort((a, b) => {
    const rowA = Math.floor(a.canvas_y / 200)
    const rowB = Math.floor(b.canvas_y / 200)
    if (rowA !== rowB) return rowA - rowB
    return a.canvas_x - b.canvas_x
  })

  // Convert each node
  for (const node of sortedNodes) {
    if (node.node_type === 'citation') {
      sections.push(citationToTypst(node))
    } else {
      sections.push(noteToTypst(node))
    }
  }

  // Add connections section if requested
  if (opts.includeConnections && edges.length > 0) {
    sections.push(generateConnectionsSection(nodes, edges))
  }

  return sections.join('\n')
}

/**
 * Export a single node to Typst format (for clipboard)
 */
export function nodeToTypst(node: Node): string {
  if (node.node_type === 'citation') {
    return citationToTypst(node)
  }
  return noteToTypst(node)
}

/**
 * Generate filename for export
 */
export function generateExportFilename(title?: string): string {
  const base = title
    ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : 'nodus-export'
  const date = new Date().toISOString().split('T')[0]
  return `${base}-${date}.typ`
}
