/**
 * Display title derivation for nodes.
 *
 * A node may have no explicit title; the canvas then shows an "ad-hoc" title
 * taken from the first meaningful line of its content. The node card and the
 * hover preview must agree, so both use this single function instead of their
 * own copies (which had drifted, leaving the hover preview showing "Untitled").
 */

export interface TitledNode {
  title?: string | null
  markdown_content?: string | null
}

/**
 * Resolve the title to show for a node.
 *
 * @param node Node with an optional title and markdown content.
 * @param untitled Fallback used when neither a title nor content is available.
 * @returns The explicit title, else an ad-hoc title from the first content line,
 *   else the untitled fallback.
 */
export function nodeDisplayTitle(node: TitledNode | null | undefined, untitled = 'Untitled'): string {
  const title = node?.title?.trim()
  if (title) return title

  const content = node?.markdown_content?.trim()
  if (content) {
    const firstLine = content
      .split('\n')[0]
      .replace(/^#+\s*/, '') // heading markers
      .replace(/\*\*/g, '') // bold
      .replace(/\*/g, '') // italic
      .replace(/`/g, '') // inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // link text
      .trim()

    if (firstLine) {
      return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine
    }
  }

  return untitled
}
