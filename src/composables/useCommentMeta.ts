/**
 * Composable for parsing and serializing comment type metadata
 *
 * Comment metadata is stored as an HTML comment header in markdown_content:
 * <!--comment-meta:{"type":"question","resolved":false}-->
 * Actual comment text here
 */
import type { CommentType, CommentMeta } from '../types'

const META_PATTERN = /^<!--comment-meta:(.*?)-->\n?/

const DEFAULT_META: CommentMeta = {
  type: 'note',
  resolved: false,
}

/**
 * Parse comment metadata and text from markdown content
 */
export function parseCommentMeta(content: string | null): { meta: CommentMeta; text: string } {
  if (!content) {
    return { meta: { ...DEFAULT_META }, text: '' }
  }

  const match = content.match(META_PATTERN)
  if (!match) {
    return { meta: { ...DEFAULT_META }, text: content }
  }

  try {
    const meta = JSON.parse(match[1]) as CommentMeta
    const text = content.slice(match[0].length)
    return {
      meta: {
        type: meta.type || 'note',
        resolved: meta.resolved ?? false,
      },
      text,
    }
  } catch {
    return { meta: { ...DEFAULT_META }, text: content }
  }
}

/**
 * Serialize comment metadata and text into markdown content
 */
export function serializeCommentMeta(meta: CommentMeta, text: string): string {
  const metaJson = JSON.stringify(meta)
  return `<!--comment-meta:${metaJson}-->\n${text}`
}

/**
 * Toggle the resolved state of a comment
 */
export function toggleResolved(content: string | null): string {
  const { meta, text } = parseCommentMeta(content)
  return serializeCommentMeta({ ...meta, resolved: !meta.resolved }, text)
}

/**
 * Update the comment type
 */
export function updateCommentType(content: string | null, type: CommentType): string {
  const { meta, text } = parseCommentMeta(content)
  return serializeCommentMeta({ ...meta, type }, text)
}

/**
 * Create initial comment content with metadata
 */
export function createCommentContent(text: string, type: CommentType = 'note'): string {
  return serializeCommentMeta({ type, resolved: false }, text)
}

export function useCommentMeta() {
  return {
    parseCommentMeta,
    serializeCommentMeta,
    toggleResolved,
    updateCommentType,
    createCommentContent,
  }
}
