/**
 * General file drop composable
 * Handles drag-and-drop of various file types onto the canvas
 */
import { ref } from 'vue'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { readTextFile, extractPdfAnnotations, type PdfAnnotation } from '../../lib/tauri'
import { parseReferences, citationToMarkdown } from '../../lib/bibtex'
import { convertLatexDocument } from '../../lib/latex-to-typst'
import { notifications$ } from '../../composables/useNotifications'

interface Store {
  createNode: (data: {
    title: string
    node_type: string
    markdown_content: string
    canvas_x: number
    canvas_y: number
    width?: number
    height?: number
    tags?: string[]
  }) => Promise<{ id: string }>
  importCitations: (filePath: string) => Promise<{ id: string }[]>
}

interface ViewState {
  getViewportCenter: () => { x: number; y: number }
}

export interface UseFileDropOptions {
  store: Store
  viewState: ViewState
  onPdfDrop?: (path: string, x: number, y: number) => Promise<void>
  extractPdfHighlights?: boolean
}

export function useFileDrop(options: UseFileDropOptions) {
  const { store, viewState, onPdfDrop, extractPdfHighlights = true } = options

  let unlistenFileDrop: (() => void) | null = null

  // Drag state for visual feedback
  const isDragging = ref(false)
  const dragFileTypes = ref<string[]>([])

  function getFileType(path: string): 'pdf' | 'bibtex' | 'markdown' | 'latex' | 'unknown' {
    const lower = path.toLowerCase()
    if (lower.endsWith('.pdf')) return 'pdf'
    if (lower.endsWith('.bib')) return 'bibtex'
    if (lower.endsWith('.json')) return 'bibtex' // CSL-JSON
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
    if (lower.endsWith('.tex')) return 'latex'
    return 'unknown'
  }

  async function handleBibTexDrop(paths: string[], x: number, y: number) {
    let totalImported = 0
    const NODE_SPACING = 250
    const NODES_PER_ROW = 4

    for (const path of paths) {
      try {
        const content = await readTextFile(path)
        const entries = parseReferences(content)

        if (entries.length === 0) {
          notifications$.warning('No citations found', `${path.split('/').pop()} contained no valid entries`)
          continue
        }

        // Create nodes for each entry
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]
          const row = Math.floor((totalImported + i) / NODES_PER_ROW)
          const col = (totalImported + i) % NODES_PER_ROW

          await store.createNode({
            title: entry.title || entry.key,
            markdown_content: citationToMarkdown(entry),
            node_type: 'citation',
            canvas_x: x + col * NODE_SPACING,
            canvas_y: y + row * NODE_SPACING,
            width: 220,
            height: 180,
            tags: entry.keywords ? entry.keywords.split(',').map(k => k.trim()) : undefined,
          })
        }

        totalImported += entries.length
      } catch (e) {
        notifications$.error('Import failed', `Failed to import ${path.split('/').pop()}: ${e}`)
      }
    }

    if (totalImported > 0) {
      notifications$.success(
        'Citations imported',
        `${totalImported} citation${totalImported === 1 ? '' : 's'} added to canvas`
      )
    }
  }

  async function handleMarkdownDrop(paths: string[], x: number, y: number) {
    const NODE_SPACING = 250
    let imported = 0

    for (const path of paths) {
      try {
        const content = await readTextFile(path)
        const filename = path.split('/').pop()?.replace(/\.(md|markdown)$/i, '') || 'Imported'

        // Extract title from first heading or use filename
        const headingMatch = content.match(/^#\s+(.+)$/m)
        const title = headingMatch ? headingMatch[1] : filename

        const col = imported % 4
        const row = Math.floor(imported / 4)

        await store.createNode({
          title,
          markdown_content: content,
          node_type: 'note',
          canvas_x: x + col * NODE_SPACING,
          canvas_y: y + row * NODE_SPACING,
          width: 240,
          height: 160,
        })

        imported++
      } catch (e) {
        notifications$.error('Import failed', `Failed to import ${path.split('/').pop()}: ${e}`)
      }
    }

    if (imported > 0) {
      notifications$.success(
        'Notes imported',
        `${imported} note${imported === 1 ? '' : 's'} added to canvas`
      )
    }
  }

  async function handleLatexDrop(paths: string[], x: number, y: number) {
    const NODE_SPACING = 250
    let imported = 0

    for (const path of paths) {
      try {
        const content = await readTextFile(path)
        const filename = path.split('/').pop()?.replace(/\.tex$/i, '') || 'LaTeX Import'

        // Convert LaTeX to Typst-compatible format
        const convertedContent = convertLatexDocument(content)

        // Extract title from first heading or document title command
        const titleMatch = content.match(/\\title\{([^}]+)\}/) ||
                          convertedContent.match(/^#\s+(.+)$/m)
        const title = titleMatch ? titleMatch[1] : filename

        const col = imported % 4
        const row = Math.floor(imported / 4)

        await store.createNode({
          title: `${title} (converted)`,
          markdown_content: convertedContent,
          node_type: 'note',
          canvas_x: x + col * NODE_SPACING,
          canvas_y: y + row * NODE_SPACING,
          width: 280,
          height: 200,
        })

        imported++
      } catch (e) {
        notifications$.error('Import failed', `Failed to import ${path.split('/').pop()}: ${e}`)
      }
    }

    if (imported > 0) {
      notifications$.success(
        'LaTeX converted',
        `${imported} file${imported === 1 ? '' : 's'} converted to Typst and added to canvas`
      )
    }
  }

  async function handlePdfHighlightsDrop(paths: string[], x: number, y: number) {
    const NODE_SPACING = 250
    const NODES_PER_ROW = 4
    let totalImported = 0

    for (const path of paths) {
      try {
        const annotations = await extractPdfAnnotations(path)
        const filename = path.split('/').pop()?.replace(/\.pdf$/i, '') || 'PDF'

        // Filter to only highlights with content
        const highlights = annotations.filter(
          (a: PdfAnnotation) => a.content || a.comment
        )

        if (highlights.length === 0) {
          notifications$.info('No highlights found', `${filename} has no extractable highlights`)
          continue
        }

        // Group by page for better organization
        const byPage = new Map<number, PdfAnnotation[]>()
        for (const h of highlights) {
          const page = h.page
          if (!byPage.has(page)) {
            byPage.set(page, [])
          }
          byPage.get(page)!.push(h)
        }

        // Create nodes for each highlight
        for (const [page, pageHighlights] of byPage) {
          for (const highlight of pageHighlights) {
            const row = Math.floor(totalImported / NODES_PER_ROW)
            const col = totalImported % NODES_PER_ROW

            // Build markdown content
            let content = ''
            if (highlight.content) {
              content = `> ${highlight.content}\n\n`
            }
            if (highlight.comment) {
              content += `**Note:** ${highlight.comment}\n\n`
            }
            content += `_Page ${page} - ${filename}_`

            await store.createNode({
              title: highlight.content
                ? highlight.content.slice(0, 50) + (highlight.content.length > 50 ? '...' : '')
                : `Highlight p.${page}`,
              markdown_content: content,
              node_type: 'highlight',
              canvas_x: x + col * NODE_SPACING,
              canvas_y: y + row * NODE_SPACING,
              width: 220,
              height: 140,
            })

            totalImported++
          }
        }
      } catch (e) {
        notifications$.error('Extraction failed', `Failed to extract highlights from ${path.split('/').pop()}: ${e}`)
      }
    }

    if (totalImported > 0) {
      notifications$.success(
        'Highlights extracted',
        `${totalImported} highlight${totalImported === 1 ? '' : 's'} added to canvas`
      )
    }
  }

  async function handleFileDrop(paths: string[], x: number, y: number) {
    // Group files by type
    const pdfFiles: string[] = []
    const latexFiles: string[] = []
    const bibFiles: string[] = []
    const mdFiles: string[] = []

    for (const path of paths) {
      const type = getFileType(path)
      switch (type) {
        case 'pdf':
          pdfFiles.push(path)
          break
        case 'bibtex':
          bibFiles.push(path)
          break
        case 'markdown':
          mdFiles.push(path)
          break
        case 'latex':
          latexFiles.push(path)
          break
        default:
          notifications$.warning('Unsupported file', `Cannot import ${path.split('/').pop()}`)
      }
    }

    // Process each type with vertical offsets to avoid overlap
    let currentY = y

    if (bibFiles.length > 0) {
      await handleBibTexDrop(bibFiles, x, currentY)
      currentY += 300
    }

    if (mdFiles.length > 0) {
      await handleMarkdownDrop(mdFiles, x, currentY)
      currentY += 300
    }

    if (latexFiles.length > 0) {
      await handleLatexDrop(latexFiles, x, currentY)
      currentY += 300
    }

    if (pdfFiles.length > 0) {
      // Extract highlights first if enabled
      if (extractPdfHighlights) {
        await handlePdfHighlightsDrop(pdfFiles, x, currentY)
        currentY += 300
      }

      // Then process full PDF text if handler provided
      if (onPdfDrop) {
        for (const path of pdfFiles) {
          await onPdfDrop(path, x, currentY)
          currentY += 300
        }
      }
    }
  }

  function setup() {
    getCurrentWebview().onDragDropEvent(async (event) => {
      const { type } = event.payload

      if (type === 'enter' || type === 'over') {
        isDragging.value = true
        // Try to detect file types from paths if available
        if ('paths' in event.payload && Array.isArray(event.payload.paths)) {
          dragFileTypes.value = [...new Set(event.payload.paths.map(getFileType))]
        }
      } else if (type === 'leave') {
        isDragging.value = false
        dragFileTypes.value = []
      } else if (type === 'drop') {
        isDragging.value = false
        dragFileTypes.value = []

        const paths = event.payload.paths
        if (paths && paths.length > 0) {
          const center = viewState.getViewportCenter()
          await handleFileDrop(paths, center.x, center.y)
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
    isDragging,
    dragFileTypes,
    // Actions
    setup,
    cleanup,
    handleFileDrop,
    handlePdfHighlightsDrop,
  }
}
