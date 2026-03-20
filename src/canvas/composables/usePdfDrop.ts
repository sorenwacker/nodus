/**
 * File Drop composable
 * Handles file drops: PDF, Markdown, BibTeX, and Ontology files
 */
import { ref } from 'vue'
import { extractPdfText, readTextFile } from '../../lib/tauri'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { parseReferences, citationToMarkdown, type BibEntry } from '../../lib/bibtex'

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

const CHUNK_SIZE = 3000 // Characters per chunk for LLM processing (smaller = faster LLM responses)
const NODE_SPACING = 350 // Vertical spacing between nodes
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

    // Create loading node
    const loadingNode = await store.createNode({
      title: 'Processing PDF...',
      node_type: 'note',
      markdown_content: '_Extracting text..._',
      canvas_x: x,
      canvas_y: y,
    })
    lastImportNodeIds.push(loadingNode.id)

    try {
      // Extract text from PDF
      const rawText = await extractPdfText(filePath)

      if (aborted) {
        await store.updateNodeContent(loadingNode.id, '_Processing stopped_')
        return
      }

      if (!rawText.trim()) {
        await store.updateNodeContent(loadingNode.id, '_PDF has no extractable text (may be image-only)_')
        await store.updateNodeTitle(loadingNode.id, 'Empty PDF')
        return
      }

      // Calculate chunks needed
      const chunks: string[] = []
      for (let i = 0; i < rawText.length; i += CHUNK_SIZE) {
        chunks.push(rawText.slice(i, i + CHUNK_SIZE))
      }

      // Single chunk - process directly
      if (chunks.length === 1) {
        await store.updateNodeContent(loadingNode.id, '_Cleaning up text with AI..._')
        const cleanedText = await cleanupChunk(chunks[0], true)

        const headingMatch = cleanedText.match(/^#\s+(.+)$/m)
        const title = headingMatch ? headingMatch[1] : filename

        await store.updateNodeTitle(loadingNode.id, title)
        await store.updateNodeContent(loadingNode.id, cleanedText)
        return
      }

      // Multiple chunks - create multiple nodes
      processingStatus.value = `Processing ${chunks.length} sections...`
      await store.updateNodeContent(loadingNode.id, `_Processing ${chunks.length} sections..._`)

      let currentY = y
      const nodeIds: string[] = []

      for (let i = 0; i < chunks.length; i++) {
        // Check for abort
        if (aborted) {
          processingStatus.value = ''
          return
        }

        processingStatus.value = `Section ${i + 1}/${chunks.length}`
        const isFirst = i === 0
        let nodeId: string

        try {
          if (isFirst) {
            nodeId = loadingNode.id
          } else {
            const newNode = await store.createNode({
              title: `${filename} (${i + 1}/${chunks.length})`,
              node_type: 'note',
              markdown_content: `_Processing section ${i + 1}..._`,
              canvas_x: x,
              canvas_y: currentY,
            })
            nodeId = newNode.id
            lastImportNodeIds.push(nodeId)
          }

          nodeIds.push(nodeId)

          if (!isFirst) currentY += NODE_SPACING

          const cleanedText = await cleanupChunk(chunks[i], isFirst)

          if (isFirst) {
            const headingMatch = cleanedText.match(/^#\s+(.+)$/m)
            const title = headingMatch ? headingMatch[1] : filename
            await store.updateNodeTitle(nodeId, `${title} (1/${chunks.length})`)
          }

          await store.updateNodeContent(nodeId, cleanedText)

          // Connect to previous node
          if (i > 0 && nodeIds.length >= 2) {
            await store.createEdge({
              source_node_id: nodeIds[i - 1],
              target_node_id: nodeId,
              link_type: 'related',
            })
          }
        } catch (err) {
          // On error, keep raw text so user doesn't lose content
          if (nodeId!) {
            await store.updateNodeContent(nodeId, `_Section ${i + 1} failed: ${err}. Raw text:_\n\n${chunks[i]}`)
          }
        }
      }

    } catch (error) {
      // Only update first node on fatal errors (like PDF extraction failing)
      await store.updateNodeContent(loadingNode.id, `Error: ${error}`)
      await store.updateNodeTitle(loadingNode.id, 'PDF Error')
    } finally {
      isProcessing.value = false
      processingStatus.value = ''
      // Push to undo stack if any nodes were created
      if (lastImportNodeIds.length > 0 && pushCreationUndo) {
        pushCreationUndo(lastImportNodeIds)
      }
    }
  }

  async function processOntologyDrop(filePath: string) {
    const rawFilename = filePath.split('/').pop() || 'Ontology'
    const filename = sanitizeFilename(rawFilename)

    console.log('[Ontology] Starting import:', filePath)
    isProcessing.value = true
    processingStatus.value = `Importing ${filename}...`

    try {
      const result = await store.importOntology(filePath, { createClassNodes: true, layout: 'hierarchical' })

      console.log('[Ontology] Import result:', result)
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
          console.log('[FileDrop] Processing file:', path)

          if (path.toLowerCase().endsWith('.pdf')) {
            await processPdfDrop(path, canvasPos.x, dropY)
            offsetY += FILE_SPACING
          } else if (isOntologyFile(path)) {
            console.log('[FileDrop] Recognized as ontology file')
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
