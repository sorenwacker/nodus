/**
 * Turning a document's structure into graph structure.
 *
 * A paper is already sections, an argument, and a bibliography; these helpers
 * recover that structure from the imported markdown. Everything here is
 * deterministic - no model, no network - so the structural import works
 * offline (PRODUCT_DESIGN.md > PDF as a graph).
 */

import { upsertFrontmatterField } from './contentParser'

/** One heading section of a document */
export interface DocumentSection {
  title: string
  /** Heading level, 1 for the document title */
  level: number
  /** Body text of this section, without its child sections */
  content: string
  /** Index of the enclosing section, or null for the root */
  parentIndex: number | null
}

/** A parsed bibliography entry */
export interface ReferenceEntry {
  /** The entry as written */
  raw: string
  /** Best-effort title, for lookup and for the citation node */
  title: string
  doi: string | null
}

export type VerificationState = 'verified' | 'not_found' | 'not_checked'

export interface Verification {
  state: VerificationState
  detail?: string
}

/**
 * Split markdown into heading sections, keeping the hierarchy. A document with
 * no headings is one section.
 */
export function splitIntoSections(markdown: string): DocumentSection[] {
  const lines = markdown.split('\n')
  const sections: DocumentSection[] = []
  // Innermost open section per level, to resolve parents
  const openByLevel = new Map<number, number>()
  let current: DocumentSection | null = null
  let buffer: string[] = []

  function flush() {
    if (current) current.content = buffer.join('\n').trim()
    buffer = []
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (!heading) {
      buffer.push(line)
      continue
    }

    flush()
    const level = heading[1].length
    // The parent is the nearest open section above this level
    let parentIndex: number | null = null
    for (let l = level - 1; l >= 1; l--) {
      const open = openByLevel.get(l)
      if (open !== undefined) {
        parentIndex = open
        break
      }
    }

    current = { title: heading[2].trim(), level, content: '', parentIndex }
    sections.push(current)
    openByLevel.set(level, sections.length - 1)
    // A new section closes anything deeper
    for (const l of [...openByLevel.keys()]) {
      if (l > level) openByLevel.delete(l)
    }
  }
  flush()

  if (sections.length === 0) {
    return [{ title: '', level: 1, content: markdown.trim(), parentIndex: null }]
  }
  return sections
}

const REFERENCE_TITLES = /^(references|bibliography|literature|works cited|literatur)\b/i

/** The section holding the bibliography, or null when there is none */
export function findReferencesSection(sections: DocumentSection[]): DocumentSection | null {
  return sections.find(s => REFERENCE_TITLES.test(s.title)) ?? null
}

const DOI_PATTERN = /\b(10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+)/

/**
 * Parse bibliography text into entries. Entries are list items or blank-line
 * separated blocks; the title is the first sentence after the year when one is
 * recognisable, otherwise the longest fragment of the entry.
 */
export function parseReferenceEntries(text: string): ReferenceEntry[] {
  const blocks = text
    .split(/\n(?=- |\* |\d+\.\s)|\n\s*\n/)
    .map(b => b.replace(/^[-*]\s+|^\d+\.\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(b => b.length > 10)

  return blocks.map(raw => {
    const doi = raw.match(DOI_PATTERN)?.[1]?.replace(/[).,;]+$/, '') ?? null

    // Title: the fragment after "(year)." up to the next period, the common
    // author-year form; otherwise the longest period-separated fragment
    // A period only ends the title before whitespace and a capital, so
    // "LCDB 1.0: ..." keeps its version number
    const afterYear = raw.match(/\(\d{4}\)\.?\s+(.+?)(?:\.\s+[A-Z]|$)/)?.[1]
    const title = (afterYear ?? longestFragment(raw)).trim()

    return { raw, title, doi }
  })
}

function longestFragment(text: string): string {
  return text
    .split(/\.\s+(?=[A-Z])/)
    .reduce((best, part) => (part.length > best.length ? part : best), '')
}

/**
 * Map a lookup outcome to a verification state. Three states, not two: an
 * outage must never mark a reference as missing
 * (PRODUCT_DESIGN.md > PDF as a graph).
 */
export function verificationFromLookup(outcome: {
  found?: boolean
  error?: string
}): Verification {
  if (outcome.error !== undefined) {
    return { state: 'not_checked', detail: outcome.error }
  }
  return { state: outcome.found ? 'verified' : 'not_found' }
}

/** A node the import will create */
export interface PlannedNode {
  /** Stable key within the plan, for edges */
  key: string
  title: string
  content: string
  nodeType: 'note' | 'citation'
  x: number
  y: number
}

export interface PlannedEdge {
  fromKey: string
  toKey: string
  linkType: 'related' | 'cites'
}

export interface GraphImportPlan {
  frameTitle: string
  rootKey: string
  nodes: PlannedNode[]
  edges: PlannedEdge[]
}

const COLUMN_WIDTH = 300
const ROW_HEIGHT = 200
const SECTIONS_PER_ROW = 4

/**
 * Plan the nodes and edges of a section graph: one node per content section,
 * edges following the document tree, citation nodes for the references, all
 * relative to the drop position. Pure planning - the caller materialises it
 * (PRODUCT_DESIGN.md > PDF as a graph).
 */

/** Heading levels that become their own node; deeper ones fold into the parent */
const MAX_NODE_DEPTH = 2

/**
 * Fold sections deeper than MAX_NODE_DEPTH into their nearest kept ancestor,
 * so a paper becomes its chapters rather than every sub-subsection
 * (PRODUCT_DESIGN.md > PDF as a graph).
 */
export function foldDeepSections(sections: DocumentSection[]): DocumentSection[] {
  const kept: DocumentSection[] = []
  const keptIndexByOriginal = new Map<number, number>()

  sections.forEach((section, i) => {
    if (section.level <= MAX_NODE_DEPTH) {
      // Remap the parent to its position among the kept sections
      const parentKept =
        section.parentIndex !== null ? keptIndexByOriginal.get(section.parentIndex) : null
      kept.push({ ...section, parentIndex: parentKept ?? null })
      keptIndexByOriginal.set(i, kept.length - 1)
      return
    }

    // Walk up to the nearest kept ancestor and append under its own heading
    let ancestor = section.parentIndex
    while (ancestor !== null && !keptIndexByOriginal.has(ancestor)) {
      ancestor = sections[ancestor].parentIndex
    }
    if (ancestor === null) return
    const target = kept[keptIndexByOriginal.get(ancestor)!]
    target.content =
      `${target.content}\n\n${'#'.repeat(section.level)} ${section.title}\n\n${section.content}`.trim()
  })

  return kept
}

export function planGraphImport(
  sections: DocumentSection[],
  references: ReferenceEntry[],
  origin: { x: number; y: number }
): GraphImportPlan {
  const referencesSection = findReferencesSection(sections)
  const folded = foldDeepSections(sections.filter(s => s !== referencesSection))
  const content = folded

  const root = content[0]
  const frameTitle = root?.title || 'Imported document'

  const nodes: PlannedNode[] = []
  const edges: PlannedEdge[] = []
  const keyByIndex = new Map<number, string>()

  content.forEach((section, i) => {
    const key = `s${i}`
    keyByIndex.set(i, key)
    nodes.push({
      key,
      title: section.title || frameTitle,
      content: section.content,
      nodeType: 'note',
      x: origin.x + (i % SECTIONS_PER_ROW) * COLUMN_WIDTH,
      y: origin.y + Math.floor(i / SECTIONS_PER_ROW) * ROW_HEIGHT,
    })
  })

  // Edges follow the document tree
  content.forEach((section, i) => {
    const childKey = keyByIndex.get(i)!
    if (section.parentIndex === null) return
    const parentKey = keyByIndex.get(section.parentIndex)
    if (parentKey && parentKey !== childKey) {
      edges.push({ fromKey: parentKey, toKey: childKey, linkType: 'related' })
    }
  })

  // Citations in their own column right of the sections, cited by the root
  const rootKey = keyByIndex.get(content.indexOf(root)) ?? 's0'
  const citationX = origin.x + SECTIONS_PER_ROW * COLUMN_WIDTH + COLUMN_WIDTH / 2
  references.forEach((ref, i) => {
    const key = `r${i}`
    nodes.push({
      key,
      title: ref.title,
      content: ref.raw + (ref.doi ? `\n\nDOI: ${ref.doi}` : ''),
      nodeType: 'citation',
      x: citationX,
      y: origin.y + i * (ROW_HEIGHT * 0.75),
    })
    edges.push({ fromKey: rootKey, toKey: key, linkType: 'cites' })
  })

  return { frameTitle, rootKey, nodes, edges }
}

/** Record a verification state in a citation node's frontmatter */
export function withVerification(content: string, verification: Verification): string {
  const value =
    verification.state + (verification.detail ? ` (${verification.detail.slice(0, 120)})` : '')
  return upsertFrontmatterField(content, 'verification', value)
}

/**
 * Convert a drag-drop position to the logical pixels the canvas works in.
 *
 * The drop event reports physical pixels on Windows and Linux but logical
 * pixels on macOS; dividing unconditionally halves macOS coordinates on any
 * HiDPI display and drops the node up-left of the cursor
 * (PRODUCT_DESIGN.md > Drop position).
 */
export function dropPositionToLogical(
  position: { x: number; y: number },
  scaleFactor: number,
  platform: 'macos' | 'windows' | 'linux'
): { x: number; y: number } {
  if (platform === 'macos') return { x: position.x, y: position.y }
  return { x: position.x / scaleFactor, y: position.y / scaleFactor }
}

/**
 * The file name from a path, whichever separator the platform uses. Splitting
 * on "/" alone turns a Windows path into a node titled with the whole path
 * (PRODUCT_DESIGN.md > File paths across platforms).
 */
export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path
}
