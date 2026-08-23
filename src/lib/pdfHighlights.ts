/**
 * Turning PDF highlights into canvas nodes.
 *
 * The highlights in a PDF are the passages a reader already judged worth
 * keeping, so importing them saves work that was done once already. Which of
 * them deserve a node stays the reader's judgement, which is why this module
 * only prepares the candidates (PRODUCT_DESIGN.md > PDF highlights as nodes).
 */
import { upsertFrontmatterField, splitFrontmatter } from './contentParser'
import type { PdfAnnotation } from './tauri'

const FRONTMATTER_FIELD = 'source_highlight'

/** A highlight offered for import, with the reason it may not be importable */
export interface HighlightImport {
  key: string
  /** The passage, or the reader's comment when the file stores no passage */
  text: string
  page: number
  color: string | null
  comment: string | null
  /** False when the file records the marked region but not the text */
  available: boolean
  alreadyImported: boolean
  annotation: PdfAnnotation
}

/**
 * Identify a highlight by where it is and what it says, so the same passage is
 * recognised across imports of the same file.
 */
export function highlightKey(filename: string, annotation: PdfAnnotation): string {
  const text = (annotation.content || annotation.comment || '').trim().slice(0, 120)
  return `${filename}#p${annotation.page}:${text}`
}

/** Keys of highlights already imported, read back from the nodes that hold them */
export function importedHighlightKeys(nodes: { markdown_content?: string | null }[]): Set<string> {
  const keys = new Set<string>()
  for (const node of nodes) {
    const { frontmatter } = splitFrontmatter(node.markdown_content || '')
    const match = frontmatter?.match(new RegExp(`^${FRONTMATTER_FIELD}: (.+)$`, 'm'))
    if (match) keys.add(match[1].trim())
  }
  return keys
}

/**
 * Prepare the highlights of one file for the picker.
 *
 * A highlight with neither passage nor comment is kept in the list and marked
 * unavailable: it exists in the reader's PDF, so silently omitting it would
 * look like a failure to read the file.
 */
export function toHighlightImports(
  annotations: PdfAnnotation[],
  filename: string,
  importedKeys: Iterable<string>
): HighlightImport[] {
  const imported = importedKeys instanceof Set ? importedKeys : new Set(importedKeys)
  return annotations.map(annotation => {
    const text = (annotation.content || annotation.comment || '').trim()
    const key = highlightKey(filename, annotation)
    return {
      key,
      text,
      page: annotation.page,
      color: annotation.color,
      comment: annotation.comment,
      available: text.length > 0,
      alreadyImported: imported.has(key),
      annotation,
    }
  })
}

/**
 * Body of the node made from a highlight: the passage as a quote, the reader's
 * own comment below it, and the key that keeps a second import from duplicating
 * it.
 */
export function highlightNodeContent(filename: string, annotation: PdfAnnotation): string {
  const passage = (annotation.content || '').trim()
  const comment = (annotation.comment || '').trim()

  const parts: string[] = []
  if (passage) parts.push(passage.split('\n').map(line => `> ${line}`).join('\n'))
  if (comment && comment !== passage) parts.push(comment)
  parts.push(`_${filename}, p. ${annotation.page}_`)

  return upsertFrontmatterField(
    parts.join('\n\n'),
    FRONTMATTER_FIELD,
    highlightKey(filename, annotation)
  )
}

/** Title for the node made from a highlight: its opening words */
export function highlightNodeTitle(entry: HighlightImport): string {
  const words = entry.text.replace(/\s+/g, ' ').trim()
  return words.length > 60 ? `${words.slice(0, 57)}...` : words || `Highlight p. ${entry.page}`
}
