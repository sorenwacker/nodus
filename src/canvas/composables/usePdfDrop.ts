/**
 * PDF Drop composable
 * Handles PDF file drops, extracts text, and cleans up with LLM
 */
import { ref } from 'vue'
import { extractPdfText } from '../../lib/tauri'
import { getCurrentWebview } from '@tauri-apps/api/webview'

const CHUNK_SIZE = 3000 // Characters per chunk for LLM processing (smaller = faster LLM responses)
const NODE_SPACING = 350 // Vertical spacing between nodes

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
  createEdge: (data: {
    source_node_id: string
    target_node_id: string
    link_type?: string
  }) => Promise<void>
}

interface ViewState {
  getViewportCenter: () => { x: number; y: number }
}

interface LLM {
  simpleGenerate: (prompt: string) => Promise<string>
}

export interface UsePdfDropOptions {
  store: Store
  viewState: ViewState
  llm: LLM
}

export function usePdfDrop(options: UsePdfDropOptions) {
  const { store, viewState, llm } = options

  let unlistenFileDrop: (() => void) | null = null

  // Processing state
  const isProcessing = ref(false)
  const processingStatus = ref('')
  let aborted = false

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
    const filename = filePath.split('/').pop()?.replace(/\.pdf$/i, '') || 'Imported PDF'

    // Reset abort flag
    aborted = false
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
          nodeId = isFirst ? loadingNode.id : (await store.createNode({
            title: `${filename} (${i + 1}/${chunks.length})`,
            node_type: 'note',
            markdown_content: `_Processing section ${i + 1}..._`,
            canvas_x: x,
            canvas_y: currentY,
          })).id

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
    }
  }

  function setup() {
    // Listen for Tauri v2 drag-drop events
    getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type === 'drop') {
        const paths = event.payload.paths
        for (const path of paths) {
          if (path.toLowerCase().endsWith('.pdf')) {
            const center = viewState.getViewportCenter()
            await processPdfDrop(path, center.x, center.y)
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
    // Actions
    setup,
    cleanup,
    stop,
    processPdfDrop,
  }
}
