import { ref } from 'vue'
import { marked } from 'marked'
import { invoke } from '@tauri-apps/api/core'
import { sanitizeHtml, sanitizeSvg } from '../lib/sanitize'
import type { Node } from '../types'

// Configure marked
marked.use({
  breaks: true,
  gfm: true,
})

// Math cache for rendered SVGs
const mathSvgCache = new Map<string, string>()

/**
 * Handles markdown and math rendering for the storyline reader.
 * Provides caching for rendered content and math expressions.
 */
export function useStorylineMarkdownRendering() {
  const renderedContent = ref<Map<string, string>>(new Map())

  async function renderMathToSvg(math: string, displayMode: boolean): Promise<string> {
    const cacheKey = `${displayMode ? 'd' : 'i'}:${math}`
    if (mathSvgCache.has(cacheKey)) {
      return mathSvgCache.get(cacheKey)!
    }

    try {
      const svg = await invoke<string>('render_typst_math', { math, displayMode })
      mathSvgCache.set(cacheKey, svg)
      return svg
    } catch (e) {
      console.error('[Math] Render error:', e)
      return `<span class="math-error">${math}</span>`
    }
  }

  async function parseMarkdownAsync(content: string): Promise<string> {
    if (!content) return ''

    // Extract math blocks before markdown processing
    const mathPlaceholders: Map<string, { math: string; isDisplay: boolean }> = new Map()
    let processedContent = content

    // Extract display math first ($$...$$)
    processedContent = processedContent.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      const id = `MATH_DISPLAY_${mathPlaceholders.size}`
      mathPlaceholders.set(id, { math: math.trim(), isDisplay: true })
      return id
    })

    // Extract inline math ($...$)
    processedContent = processedContent.replace(/(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g, (_, math) => {
      const id = `MATH_INLINE_${mathPlaceholders.size}`
      mathPlaceholders.set(id, { math: math.trim(), isDisplay: false })
      return id
    })

    // Render markdown
    let html = marked.parse(processedContent) as string

    // Render math to SVG and restore
    for (const [id, { math, isDisplay }] of mathPlaceholders) {
      const svg = sanitizeSvg(await renderMathToSvg(math, isDisplay))
      const wrapper = isDisplay
        ? `<div class="typst-display typst-math">${svg}</div>`
        : `<span class="typst-inline typst-math">${svg}</span>`
      html = html.replace(new RegExp(id, 'g'), wrapper)
    }

    // Sanitize final HTML output
    return sanitizeHtml(html)
  }

  async function renderNodeContent(node: Node) {
    if (!node.markdown_content) {
      renderedContent.value.set(node.id, '')
      return
    }
    const html = await parseMarkdownAsync(node.markdown_content)
    renderedContent.value = new Map(renderedContent.value).set(node.id, html)
  }

  async function renderAllNodes(nodes: Node[]) {
    for (const node of nodes) {
      if (!renderedContent.value.has(node.id)) {
        await renderNodeContent(node)
      }
    }
  }

  function getRenderedContent(nodeId: string): string {
    return renderedContent.value.get(nodeId) || ''
  }

  function clearCache() {
    renderedContent.value = new Map()
  }

  return {
    renderedContent,
    renderMathToSvg,
    parseMarkdownAsync,
    renderNodeContent,
    renderAllNodes,
    getRenderedContent,
    clearCache,
  }
}
