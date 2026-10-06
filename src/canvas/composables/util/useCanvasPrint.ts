/**
 * Print the canvas as one PDF page (PRODUCT_DESIGN.md > Printing the canvas).
 */
import { nodesToPrint, printCanvasToPdf } from '../../../lib/canvasPrint'
import { saveExportFile } from '../../../lib/tauri'
import type { Node, Edge } from '../../../types'

export interface UseCanvasPrintContext {
  getNodes: () => Node[]
  getEdges: () => Edge[]
  /** Says why the page could not be produced or saved */
  reportFailure: (error: string) => void
}

export function useCanvasPrint(ctx: UseCanvasPrintContext) {
  /** Print the given nodes, or every node when none is given */
  async function printToPdf(nodeIds: string[]): Promise<void> {
    try {
      const nodes = nodesToPrint(ctx.getNodes(), nodeIds)
      // Compiled before the dialog opens: a page that cannot be produced leaves no file
      const bytes = await printCanvasToPdf(nodes, ctx.getEdges())
      await saveExportFile(bytes, `nodus-canvas-${new Date().toISOString().split('T')[0]}.pdf`, 'pdf')
    } catch (e) {
      ctx.reportFailure(e instanceof Error ? e.message : String(e))
    }
  }

  return { printToPdf }
}
