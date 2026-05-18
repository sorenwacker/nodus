/**
 * Text Processing Utilities
 *
 * Functions for text chunking, PDF preprocessing, and filename sanitization.
 */

const MAX_FILENAME_LENGTH = 100
const DEFAULT_CHUNK_OVERLAP = 200

/**
 * Split text into chunks at paragraph boundaries
 * Avoids cutting mid-sentence or mid-word
 *
 * @param text - Text to split
 * @param maxSize - Maximum chunk size in characters
 * @param overlap - Overlap between chunks for context continuity
 * @returns Array of text chunks
 */
export function splitIntoChunks(
  text: string,
  maxSize: number,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): string[] {
  if (text.length <= maxSize) {
    return [text]
  }

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxSize) {
      chunks.push(remaining)
      break
    }

    // Find a good break point within maxSize
    let breakPoint = maxSize

    // First try: find paragraph break (double newline)
    const paragraphBreak = remaining.lastIndexOf('\n\n', maxSize)
    if (paragraphBreak > maxSize * 0.5) {
      breakPoint = paragraphBreak + 2
    } else {
      // Second try: find sentence end (. ! ?)
      const sentenceMatch = remaining.slice(0, maxSize).match(/[.!?]\s+(?=[A-Z])/g)
      if (sentenceMatch) {
        const lastSentenceEnd = remaining
          .slice(0, maxSize)
          .lastIndexOf(sentenceMatch[sentenceMatch.length - 1])
        if (lastSentenceEnd > maxSize * 0.5) {
          breakPoint = lastSentenceEnd + sentenceMatch[sentenceMatch.length - 1].length
        }
      } else {
        // Last resort: find any whitespace
        const spaceBreak = remaining.lastIndexOf(' ', maxSize)
        if (spaceBreak > maxSize * 0.7) {
          breakPoint = spaceBreak + 1
        }
      }
    }

    chunks.push(remaining.slice(0, breakPoint).trim())

    // Start next chunk with small overlap for context continuity
    const overlapStart = Math.max(0, breakPoint - overlap)
    remaining = remaining.slice(overlapStart).trim()
  }

  return chunks
}

/**
 * Pre-process PDF text to merge broken lines
 * PDFs often have hard line breaks in the middle of sentences
 *
 * @param text - Raw PDF text
 * @returns Preprocessed text with merged paragraphs
 */
export function preProcessPdfText(text: string): string {
  const lines = text.split('\n')
  const merged: string[] = []
  let currentParagraph = ''

  for (const line of lines) {
    const trimmed = line.trim()

    // Empty line = paragraph break
    if (!trimmed) {
      if (currentParagraph) {
        merged.push(currentParagraph)
        currentParagraph = ''
      }
      continue
    }

    // Detect if this looks like a heading, list item, or standalone line
    const isHeading = /^#{1,6}\s/.test(trimmed)
    const isListItem = /^[-*•]\s|^\d+[.)]\s/.test(trimmed)
    const isAllCaps =
      trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-Z]/.test(trimmed)
    const isShortLine = trimmed.length < 50
    const endsWithPunctuation = /[.!?:;]$/.test(trimmed)

    // Start new paragraph for headings, list items, or lines that look like titles
    if (isHeading || isListItem || (isAllCaps && isShortLine)) {
      if (currentParagraph) {
        merged.push(currentParagraph)
        currentParagraph = ''
      }
      merged.push(trimmed)
      continue
    }

    // If current paragraph is empty, start it
    if (!currentParagraph) {
      currentParagraph = trimmed
    } else {
      // Merge with previous line
      // Add space unless previous ends with hyphen (word continuation)
      if (currentParagraph.endsWith('-')) {
        currentParagraph = currentParagraph.slice(0, -1) + trimmed
      } else {
        currentParagraph += ' ' + trimmed
      }
    }

    // End paragraph if line ends with sentence-ending punctuation and is reasonably long
    if (endsWithPunctuation && currentParagraph.length > 100) {
      merged.push(currentParagraph)
      currentParagraph = ''
    }
  }

  // Don't forget the last paragraph
  if (currentParagraph) {
    merged.push(currentParagraph)
  }

  return merged.join('\n\n')
}

/**
 * Sanitize a filename for use in node titles
 * Removes potentially dangerous characters and limits length
 *
 * @param filename - Original filename
 * @param maxLength - Maximum length (default 100)
 * @returns Sanitized filename
 */
export function sanitizeFilename(
  filename: string,
  maxLength: number = MAX_FILENAME_LENGTH
): string {
  // Remove path separators and replace special characters
  let sanitized = filename
    .replace(/[/\\]/g, '') // Remove path separators
    .replace(/[<>:"|?*]/g, '_') // Replace invalid chars
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .trim()

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength)
  }

  // Ensure not empty
  if (!sanitized) {
    sanitized = 'Imported File'
  }

  return sanitized
}

/**
 * Remove file extension from a filename
 */
export function removeExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot > 0) {
    return filename.slice(0, lastDot)
  }
  return filename
}

/**
 * Truncate text to a maximum length, adding ellipsis if truncated
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Extract the first N characters or first paragraph, whichever is shorter
 */
export function extractPreview(text: string, maxLength: number = 200): string {
  const firstParagraph = text.split(/\n\n/)[0] || text
  return truncateText(firstParagraph.trim(), maxLength)
}

/**
 * Normalize whitespace in text (collapse multiple spaces/newlines)
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
