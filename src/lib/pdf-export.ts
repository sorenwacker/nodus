/**
 * PDF Export
 * Compiles Typst documents to PDF with the backend's Typst compiler
 */

import type { Node, Edge } from '../types'
import { exportToTypst, type ExportOptions as TypstExportOptions } from './typst-export'
import { compileTypstPdf } from './tauri'

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
  return compileTypstToPdf(exportToTypst(nodes, edges, options))
}

/**
 * Compile Typst source to PDF bytes. The backend compiles: the compiler in the
 * web view cannot be loaded there and fetches its fonts from a network the
 * application may not reach (PRODUCT_DESIGN.md > Document export)
 */
export async function compileTypstToPdf(typstSource: string): Promise<Uint8Array> {
  try {
    return await compileTypstPdf(typstSource)
  } catch (e) {
    throw new Error(`PDF compilation failed: ${e instanceof Error ? e.message : String(e)}`)
  }
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

