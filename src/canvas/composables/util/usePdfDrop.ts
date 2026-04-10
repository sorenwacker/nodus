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
    const prompt = `Clean up this PDF text extraction. Fix:
- OCR errors and garbled characters
- Broken paragraphs (rejoin split sentences)
- Remove page numbers, headers, footers
- Format as clean markdown${isFirstChunk ? ' with a title heading' : ''}
- Preserve lists, tables, and structure

Raw text:
${rawText}`

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

      // Clean up text with AI (truncate if too long for LLM)
      let cleanedText: string
      if (rawText.length <= MAX_CLEANUP_SIZE) {
        cleanedText = await cleanupChunk(rawText, true)
      } else {
        // For large PDFs, clean up the first part and keep the rest raw
        const firstPart = await cleanupChunk(rawText.slice(0, MAX_CLEANUP_SIZE), true)
        const remainingText = rawText.slice(MAX_CLEANUP_SIZE)
        cleanedText = firstPart + '\n\n---\n\n' + remainingText
      }

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
