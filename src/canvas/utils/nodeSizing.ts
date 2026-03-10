/**
 * Node sizing utilities
 * Measures content and calculates optimal node dimensions
 */

export interface NodeSizeResult {
  width: number
  height: number
}

export interface NodeSizingOptions {
  minWidth?: number
  minHeight?: number
  maxHeight?: number
  maxImageWidth?: number
  maxDiagramWidth?: number
}

const DEFAULT_OPTIONS: Required<NodeSizingOptions> = {
  minWidth: 180,
  minHeight: 80,
  maxHeight: 800,
  maxImageWidth: 600,
  maxDiagramWidth: 800,
}

/**
 * Measure a node card's content and calculate optimal dimensions
 *
 * @param cardEl - The node card DOM element
 * @param currentWidth - Current width of the node
 * @param options - Sizing constraints
 * @returns Calculated width and height, or null if measurement failed
 */
export function measureNodeContent(
  cardEl: HTMLElement,
  currentWidth: number,
  options: NodeSizingOptions = {}
): NodeSizeResult | null {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const contentEl = cardEl.querySelector('.node-content') as HTMLElement
  const editorEl = cardEl.querySelector('.inline-editor') as HTMLTextAreaElement
  const headerEl = cardEl.querySelector('.node-header') as HTMLElement

  const headerHeight = headerEl?.offsetHeight || 36
  const border = 4  // 2px top + 2px bottom

  if (contentEl) {
    // View mode: measure rendered content
    return measureViewModeContent(contentEl, headerHeight, border, currentWidth, opts)
  } else if (editorEl) {
    // Edit mode: measure textarea
    return measureEditModeContent(editorEl, headerHeight, border, currentWidth, opts)
  }

  return null
}

/**
 * Measure content in view mode (rendered markdown)
 */
function measureViewModeContent(
  contentEl: HTMLElement,
  headerHeight: number,
  border: number,
  currentWidth: number,
  opts: Required<NodeSizingOptions>
): NodeSizeResult {
  const contentScrollHeight = contentEl.scrollHeight

  // Check for fixed-size content that needs more width
  let requiredWidth = currentWidth
  const images = contentEl.querySelectorAll('img')
  const mermaidSvgs = contentEl.querySelectorAll('.mermaid svg')

  for (const img of images) {
    const imgWidth = (img as HTMLImageElement).naturalWidth
    if (imgWidth > 0) {
      requiredWidth = Math.max(requiredWidth, Math.min(imgWidth + 24, opts.maxImageWidth))
    }
  }

  for (const svg of mermaidSvgs) {
    const svgWidth = (svg as SVGElement).getBoundingClientRect().width
    if (svgWidth > 0) {
      requiredWidth = Math.max(requiredWidth, Math.min(svgWidth + 24, opts.maxDiagramWidth))
    }
  }

  return {
    width: Math.max(requiredWidth, opts.minWidth),
    height: Math.min(opts.maxHeight, Math.max(contentScrollHeight + headerHeight + border, opts.minHeight)),
  }
}

/**
 * Measure content in edit mode (textarea)
 */
function measureEditModeContent(
  editorEl: HTMLTextAreaElement,
  headerHeight: number,
  border: number,
  currentWidth: number,
  opts: Required<NodeSizingOptions>
): NodeSizeResult {
  // Save current style
  const savedStyle = editorEl.style.cssText

  // Temporarily auto-size to measure
  editorEl.style.height = 'auto'
  editorEl.style.overflow = 'hidden'

  // Force reflow and measure
  void editorEl.offsetHeight
  const scrollHeight = editorEl.scrollHeight

  // Restore
  editorEl.style.cssText = savedStyle

  return {
    width: currentWidth,
    height: Math.min(opts.maxHeight, Math.max(scrollHeight + headerHeight + border, opts.minHeight)),
  }
}
