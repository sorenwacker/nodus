/**
 * File Drop composable
 * Handles file drops: PDF, Markdown, BibTeX, and Ontology files
 */
import { ref } from 'vue'
import { extractPdfText, readTextFile } from '../../../lib/tauri'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { parseReferences, citationToMarkdown, type BibEntry } from '../../../lib/bibtex'

export type { BibEntry }

/**
 * Pending citation import data
 */
export interface PendingBibImport {
  filePath: string
  filename: string
  entries: BibEntry[]
  collectionName: string | null
  hasAttachments: boolean
  x: number
  y: number
}

const MAX_CLEANUP_SIZE = 15000 // Max characters to send to LLM for cleanup
const MAX_FILENAME_LENGTH = 100
const CHUNK_OVERLAP = 200 // Overlap between chunks to avoid cutting context

/**
 * Split text into chunks at paragraph boundaries
 * Avoids cutting mid-sentence or mid-word
 */
function splitIntoChunks(text: string, maxSize: number): string[] {
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
        const lastSentenceEnd = remaining.slice(0, maxSize).lastIndexOf(sentenceMatch[sentenceMatch.length - 1])
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
    const overlapStart = Math.max(0, breakPoint - CHUNK_OVERLAP)
    remaining = remaining.slice(overlapStart).trim()
  }

  return chunks
}

/**
 * Pre-process PDF text to merge broken lines before LLM cleanup
 * PDFs often have hard line breaks in the middle of sentences
 */
function preProcessPdfText(text: string): string {
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
    const isAllCaps = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-Z]/.test(trimmed)
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
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators and replace special characters
  let sanitized = filename
    .replace(/[/\\]/g, '') // Remove path separators
    .replace(/[<>:"|?*]/g, '_') // Replace invalid chars
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .trim()
  // Truncate to max length
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    sanitized = sanitized.slice(0, MAX_FILENAME_LENGTH)
  }
  // Ensure not empty
  if (!sanitized) {
    sanitized = 'Imported File'
  }
  return sanitized
}

interface Frame {
  id: string
  title: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
}

interface Store {
  createNode: (data: {
    title: string
    node_type: string
    markdown_content: string
    canvas_x: number
    canvas_y: number
  }) => Promise<{ id: string }>
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  createEdge: (data: {
    source_node_id: string
    target_node_id: string
    link_type?: string
  }) => Promise<void>
  importOntology: (
    filePath: string,
    options?: { createClassNodes?: boolean; layout?: 'grid' | 'hierarchical' }
  ) => Promise<{ nodesCreated: number; edgesCreated: number; nodeIds: string[] }>
  createFrame?: (x: number, y: number, width: number, height: number, title: string) => Frame
}

const ONTOLOGY_EXTENSIONS = ['.ttl', '.rdf', '.owl', '.jsonld']
const BIB_EXTENSIONS = ['.bib', '.json']
const MARKDOWN_EXTENSIONS = ['.md', '.markdown']

interface ViewState {
  getViewportCenter: () => { x: number; y: number }
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
}

interface LLM {
  simpleGenerate: (prompt: string) => Promise<string>
}

export interface UsePdfDropOptions {
  store: Store
  viewState: ViewState
  llm: LLM
  pushCreationUndo?: (nodeIds: string[]) => void
}

export function usePdfDrop(options: UsePdfDropOptions) {
  const { store, viewState, llm, pushCreationUndo } = options

  let unlistenFileDrop: (() => void) | null = null

  // Processing state
  const isProcessing = ref(false)
  const processingStatus = ref('')
  let aborted = false
  let lastImportNodeIds: string[] = []

  // Pending bib import (for modal confirmation)
  const pendingBibImport = ref<PendingBibImport | null>(null)
  const showImportOptions = ref(false)

  function stop() {
    aborted = true
    isProcessing.value = false
    processingStatus.value = ''
  }

  async function cleanupChunk(rawText: string, isFirstChunk: boolean): Promise<string> {
    // Pre-process to merge broken lines
    const preprocessed = preProcessPdfText(rawText)

    const prompt = `Clean up this extracted PDF text. The text has been pre-processed but may still have issues.

Instructions:
1. Fix OCR errors, garbled characters, and encoding issues
2. Ensure paragraphs flow naturally (no random line breaks mid-sentence)
3. Remove page numbers, headers, footers, and repeated navigation text
4. Format as clean, readable markdown${isFirstChunk ? ' starting with a # title' : ''}
5. Preserve meaningful structure: headings, lists, tables, blockquotes
6. Keep citations and references intact
7. Do NOT add commentary or explanations - only output the cleaned text

Text to clean:
${preprocessed}`

    return llm.simpleGenerate(prompt)
  }

  async function processPdfDrop(filePath: string, x: number, y: number) {
    const rawFilename = filePath.split('/').pop()?.replace(/\.pdf$/i, '') || 'Imported PDF'
    const filename = sanitizeFilename(rawFilename)

    // Reset state
    aborted = false
    lastImportNodeIds = []
    isProcessing.value = true
    processingStatus.value = 'Extracting text...'

    try {
      // Extract text from PDF
      const rawText = await extractPdfText(filePath)

      if (aborted) {
        return
      }

      if (!rawText.trim()) {
        const emptyNode = await store.createNode({
          title: filename,
          node_type: 'note',
          markdown_content: '_PDF has no extractable text (may be image-only)_',
          canvas_x: x,
          canvas_y: y,
        })
        lastImportNodeIds.push(emptyNode.id)
        return
      }

      // Create a single node with loading state
      const loadingNode = await store.createNode({
        title: 'Processing PDF...',
        node_type: 'note',
        markdown_content: '_Cleaning up text with AI..._',
        canvas_x: x,
        canvas_y: y,
      })
      lastImportNodeIds.push(loadingNode.id)

      processingStatus.value = 'Cleaning up text...'

      // Split into chunks at natural boundaries
      const textChunks = splitIntoChunks(rawText, MAX_CLEANUP_SIZE)
      const cleanedChunks: string[] = []

      for (let i = 0; i < textChunks.length && !aborted; i++) {
        if (textChunks.length > 1) {
          processingStatus.value = `Cleaning section ${i + 1}/${textChunks.length}...`
        }

        const isFirst = i === 0
        const cleaned = await cleanupChunk(textChunks[i], isFirst)
        cleanedChunks.push(cleaned)
      }

      if (aborted) return
      const cleanedText = cleanedChunks.join('\n\n')

      // Extract title from cleaned text or use filename
      const headingMatch = cleanedText.match(/^#\s+(.+)$/m)
      const title = headingMatch ? headingMatch[1] : filename

      // Add source reference with PDF filename at the top
      const contentWithSource = `> Source: ${filename}.pdf\n\n${cleanedText}`

      await store.updateNodeTitle(loadingNode.id, title)
      await store.updateNodeContent(loadingNode.id, contentWithSource)

    } catch (error) {
      const errorNode = await store.createNode({
        title: 'PDF Error',
        node_type: 'note',
        markdown_content: `Error importing PDF: ${error}`,
        canvas_x: x,
        canvas_y: y,
      })
      lastImportNodeIds.push(errorNode.id)
    } finally {
      isProcessing.value = false
      processingStatus.value = ''
      if (lastImportNodeIds.length > 0 && pushCreationUndo) {
        pushCreationUndo(lastImportNodeIds)
      }
    }
  }

  async function processOntologyDrop(filePath: string) {
    const rawFilename = filePath.split('/').pop() || 'Ontology'
    const filename = sanitizeFilename(rawFilename)

    isProcessing.value = true
    processingStatus.value = `Importing ${filename}...`

    try {
      const result = await store.importOntology(filePath, { createClassNodes: true, layout: 'hierarchical' })
      processingStatus.value = ''

      if (result.nodeIds.length > 0 && pushCreationUndo) {
        pushCreationUndo(result.nodeIds)
      }

      return result
    } catch (error) {
      console.error('[Ontology] Import failed:', error)
      processingStatus.value = `Error: ${error}`
      throw error
    } finally {
      isProcessing.value = false
    }
  }

  function isOntologyFile(path: string): boolean {
    const lower = path.toLowerCase()
    return ONTOLOGY_EXTENSIONS.some(ext => lower.endsWith(ext))
  }

  function isBibFile(path: string): boolean {
    const lower = path.toLowerCase()
    return BIB_EXTENSIONS.some(ext => lower.endsWith(ext))
  }

  function isMarkdownFile(path: string): boolean {
    const lower = path.toLowerCase()
    return MARKDOWN_EXTENSIONS.some(ext => lower.endsWith(ext))
  }

  /**
   * Process a dropped Markdown file - create a note node with its content
   */
  async function processMarkdownDrop(filePath: string, x: number, y: number) {
    const rawFilename = filePath.split('/').pop()?.replace(/\.(md|markdown)$/i, '') || 'Imported Note'
    const filename = sanitizeFilename(rawFilename)

    isProcessing.value = true
    processingStatus.value = `Importing ${filename}...`
    lastImportNodeIds = []

    try {
      const content = await readTextFile(filePath)

      // Extract title from first heading or use filename
      const headingMatch = content.match(/^#\s+(.+)$/m)
      const title = headingMatch ? headingMatch[1] : filename

      const node = await store.createNode({
        title,
        node_type: 'note',
        markdown_content: content,
        canvas_x: x,
        canvas_y: y,
      })
      lastImportNodeIds.push(node.id)

      if (pushCreationUndo) {
        pushCreationUndo(lastImportNodeIds)
      }

      return node
    } catch (error) {
      processingStatus.value = `Error: ${error}`
      throw error
    } finally {
      isProcessing.value = false
      processingStatus.value = ''
    }
  }

  /**
   * Calculate frame dimensions for a grid of nodes
   */
  function calculateFrameDimensions(nodeCount: number, nodeSpacing: number, nodesPerRow: number) {
    const cols = Math.min(nodeCount, nodesPerRow)
    const rows = Math.ceil(nodeCount / nodesPerRow)
    const framePadding = 40
    const titleHeight = 30

    return {
      width: cols * nodeSpacing + framePadding,
      height: rows * nodeSpacing + framePadding + titleHeight,
    }
  }

  /**
   * Preview a BibTeX/CSL-JSON file for import options modal
   * Parses the file and prepares the pending import state
   */
  async function previewBibFile(filePath: string, x: number, y: number): Promise<PendingBibImport | null> {
    const rawFilename = filePath.split('/').pop() || 'Citations'
    const filename = sanitizeFilename(rawFilename)

    try {
      const content = await readTextFile(filePath)
      const entries = parseReferences(content)

      if (entries.length === 0) {
        return null
      }

      const collectionName = entries[0]?.collections?.[0] || null
      const hasAttachments = entries.some(e => e.attachments && e.attachments.length > 0)

      const pending: PendingBibImport = {
        filePath,
        filename,
        entries,
        collectionName,
        hasAttachments,
        x,
        y,
      }

      pendingBibImport.value = pending
      showImportOptions.value = true

      return pending
    } catch {
      return null
    }
  }

  /**
   * Confirm pending bib import with options
   */
  async function confirmBibImport(options: { createFrame: boolean; importAttachments: boolean; layout: 'grid' | 'force' }) {
    const pending = pendingBibImport.value
    if (!pending) return { count: 0, collectionName: null }

    showImportOptions.value = false
    pendingBibImport.value = null

    return processBibDrop(pending.filePath, pending.x, pending.y, {
      createFrame: options.createFrame,
    })
  }

  /**
   * Cancel pending bib import
   */
  function cancelBibImport() {
    showImportOptions.value = false
    pendingBibImport.value = null
  }

  /**
   * Process a dropped BibTeX/CSL-JSON file - create citation nodes
   * Optionally creates a frame for the collection
   */
  async function processBibDrop(
    filePath: string,
    x: number,
    y: number,
    options?: { createFrame?: boolean }
  ) {
    const rawFilename = filePath.split('/').pop() || 'Citations'
    const filename = sanitizeFilename(rawFilename)

    isProcessing.value = true
    processingStatus.value = `Parsing ${filename}...`
    lastImportNodeIds = []

    try {
      const content = await readTextFile(filePath)
      const entries = parseReferences(content)

      if (entries.length === 0) {
        processingStatus.value = 'No citations found'
        return { count: 0, collectionName: null }
      }

      // Detect collection name from first entry (Zotero exports include this)
      const collectionName = entries[0]?.collections?.[0] || null
      const shouldCreateFrame = options?.createFrame !== false && store.createFrame && collectionName

      processingStatus.value = `Creating ${entries.length} citation nodes...`

      const nodeSpacing = 250
      const nodesPerRow = 4

      // Calculate frame dimensions and position nodes inside
      let nodeStartX = x
      let nodeStartY = y

      if (shouldCreateFrame && store.createFrame) {
        const { width, height } = calculateFrameDimensions(entries.length, nodeSpacing, nodesPerRow)
        store.createFrame(x, y, width, height, collectionName)
        // Offset nodes to be inside the frame (account for frame title)
        nodeStartX = x + 20
        nodeStartY = y + 50
      }

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const row = Math.floor(i / nodesPerRow)
        const col = i % nodesPerRow

        const node = await store.createNode({
          title: entry.title || entry.key,
          node_type: 'citation',
          markdown_content: citationToMarkdown(entry),
          canvas_x: nodeStartX + col * nodeSpacing,
          canvas_y: nodeStartY + row * nodeSpacing,
        })
        lastImportNodeIds.push(node.id)
      }

      if (pushCreationUndo && lastImportNodeIds.length > 0) {
        pushCreationUndo(lastImportNodeIds)
      }

      return { count: entries.length, collectionName }
    } catch (error) {
      processingStatus.value = `Error: ${error}`
      throw error
    } finally {
      isProcessing.value = false
      processingStatus.value = ''
    }
  }

  function setup() {
    // Listen for Tauri v2 drag-drop events
    getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type === 'drop') {
        const paths = event.payload.paths
        // Get drop position from event, fallback to viewport center
        const position = event.payload.position
        let canvasPos: { x: number; y: number }
        if (position) {
          canvasPos = viewState.screenToCanvas(position.x, position.y)
        } else {
          canvasPos = viewState.getViewportCenter()
        }

        // Process files with spacing between them
        let offsetY = 0
        const FILE_SPACING = 300

        for (const path of paths) {
          const dropY = canvasPos.y + offsetY
          const lowerPath = path.toLowerCase()

          if (lowerPath.endsWith('.pdf')) {
            await processPdfDrop(path, canvasPos.x, dropY)
            offsetY += FILE_SPACING
          } else if (isOntologyFile(path)) {
            try {
              await processOntologyDrop(path)
            } catch (e) {
              console.error('[FileDrop] Ontology import error:', e)
            }
            // Ontology import handles its own layout
          } else if (isMarkdownFile(path)) {
            await processMarkdownDrop(path, canvasPos.x, dropY)
            offsetY += FILE_SPACING
          } else if (isBibFile(path)) {
            // Show import options modal for bib files
            const preview = await previewBibFile(path, canvasPos.x, dropY)
            if (!preview) {
              // No entries found, skip
              continue
            }
            // If no collection detected, import directly without modal
            if (!preview.collectionName) {
              showImportOptions.value = false
              pendingBibImport.value = null
              await processBibDrop(path, canvasPos.x, dropY)
            }
            // Otherwise, modal is shown and user will confirm
            offsetY += FILE_SPACING
          }
        }
      }
    }).then(unlisten => {
      unlistenFileDrop = unlisten
    })
  }

  function cleanup() {
    unlistenFileDrop?.()
  }

  return {
    // State
    isProcessing,
    processingStatus,
    // Import options modal state
    showImportOptions,
    pendingBibImport,
    // Actions
    setup,
    cleanup,
    stop,
    processPdfDrop,
    processOntologyDrop,
    processMarkdownDrop,
    processBibDrop,
    // Bib import with modal
    previewBibFile,
    confirmBibImport,
    cancelBibImport,
    // File type checks
    isOntologyFile,
    isBibFile,
    isMarkdownFile,
  }
}
