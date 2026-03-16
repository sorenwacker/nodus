/**
 * PDF Export
 * Compiles Typst documents to PDF using the WASM compiler
 */

import type { Node, Edge } from '../types'
import { exportToTypst, type ExportOptions as TypstExportOptions } from './typst-export'

// Typst instance (lazy loaded)
let $typst: any = null
let initPromise: Promise<void> | null = null

/**
 * Initialize the Typst compiler (lazy load WASM)
 */
async function initTypst(): Promise<void> {
  if ($typst) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const module = await import('@myriaddreamin/typst.ts')
      $typst = module.$typst
      console.log('[PDF Export] Typst compiler initialized')
    } catch (e) {
      console.error('[PDF Export] Failed to initialize Typst:', e)
      throw e
    }
  })()

  return initPromise
}

export interface PdfExportOptions extends TypstExportOptions {
  /** Output filename (without extension) */
  filename?: string
}

/**
 * Export nodes to PDF
 * @param nodes - Nodes to export
 * @param edges - Edges between nodes
 * @param options - Export options
 * @returns PDF as Uint8Array
 */
export async function exportToPdf(
  nodes: Node[],
  edges: Edge[],
  options: Partial<PdfExportOptions> = {}
): Promise<Uint8Array> {
  // Generate Typst source
  const typstSource = exportToTypst(nodes, edges, options)

  // Initialize Typst compiler
  await initTypst()

  if (!$typst) {
    throw new Error('Typst compiler not available')
  }

  try {
    // Compile to PDF
    const pdf = await $typst.pdf({ mainContent: typstSource })

    if (!pdf) {
      throw new Error('PDF compilation failed - no output')
    }

    return pdf
  } catch (e) {
    console.error('[PDF Export] Compilation error:', e)
    throw new Error(`PDF compilation failed: ${e}`)
  }
}

/**
 * Export nodes to PDF and trigger download
 * @param nodes - Nodes to export
 * @param edges - Edges between nodes
 * @param options - Export options
 */
export async function downloadPdf(
  nodes: Node[],
  edges: Edge[],
  options: Partial<PdfExportOptions> = {}
): Promise<void> {
  const pdf = await exportToPdf(nodes, edges, options)

  // Generate filename
  const filename = options.filename
    ? `${options.filename}.pdf`
    : `nodus-export-${new Date().toISOString().split('T')[0]}.pdf`

  // Create blob and download
  const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}

/**
 * Export Typst source code and trigger download
 * @param nodes - Nodes to export
 * @param edges - Edges between nodes
 * @param options - Export options
 */
export function downloadTypst(
  nodes: Node[],
  edges: Edge[],
  options: Partial<PdfExportOptions> = {}
): void {
  const typstSource = exportToTypst(nodes, edges, options)

  // Generate filename
  const filename = options.filename
    ? `${options.filename}.typ`
    : `nodus-export-${new Date().toISOString().split('T')[0]}.typ`

  // Create blob and download
  const blob = new Blob([typstSource], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}

/**
 * Export selected nodes as PDF
 * Convenience function for exporting a subset of nodes
 */
export async function exportSelectedToPdf(
  allNodes: Node[],
  allEdges: Edge[],
  selectedIds: string[],
  options: Partial<PdfExportOptions> = {}
): Promise<Uint8Array> {
  // Filter to selected nodes
  const selectedNodes = allNodes.filter(n => selectedIds.includes(n.id))

  // Filter edges to only those between selected nodes
  const selectedEdges = allEdges.filter(
    e => selectedIds.includes(e.source_node_id) && selectedIds.includes(e.target_node_id)
  )

  return exportToPdf(selectedNodes, selectedEdges, options)
}
