/**
 * Content renderer composable for canvas nodes
 *
 * Delegates to MarkdownRenderService for consistent rendering across all views.
 * Manages node-specific caching and watchers for the canvas.
 */
import { ref, watch, nextTick } from 'vue'
import {
  renderMarkdown as serviceRenderMarkdown,
  renderPendingMath,
  renderPendingMermaid,
  reinitializeMermaid,
  type RenderOptions,
} from '../../../services/MarkdownRenderService'
import type { Node, Frame } from '../../../types'

export interface UseContentRendererOptions {
  getFilteredNodes: () => Node[]
  getFilteredFrames?: () => Frame[]
  debounceMs?: number
}

export function useContentRenderer(options: UseContentRendererOptions) {
  const { getFilteredNodes, getFilteredFrames, debounceMs = 50 } = options

  // Local markdown cache (content hash -> rendered HTML)
  const markdownCache = new Map<string, string>()

  // Pre-rendered HTML cache for each node
  const nodeRenderedContent = ref<Record<string, string>>({})
  const nodeContentHashes = new Map<string, string>()

  // Debounce timer
  let markdownRenderTimer: ReturnType<typeof setTimeout> | null = null

  // Track nodes that contain mermaid blocks
  const nodesWithMermaid = new Set<string>()
  let lastMermaidCode = ''

  /**
   * Render markdown to HTML using the unified service
   */
  function renderMarkdown(content: string | null): string {
    if (!content) return ''

    // Check local cache first
    if (markdownCache.has(content)) {
      return markdownCache.get(content)!
    }

    // Build wikilink checker from current nodes/frames
    const wikilinkExists = (target: string): boolean => {
      const nodes = getFilteredNodes()
      const frames = getFilteredFrames?.() || []
      const targetLower = target.toLowerCase()
      const pathParts = target.split('/')
      const targetWithoutPath = pathParts[pathParts.length - 1]

      // 1. Exact title match
      if (nodes.some(n => n.title.toLowerCase() === targetLower)) return true

      // 2. File path match
      if (nodes.some(n => n.file_path?.toLowerCase().includes(targetLower))) return true

      // 3. Frame + node title match
      if (pathParts.length >= 2) {
        const framePath = pathParts.slice(0, -1).join('/')
        const frame = frames.find(f =>
          f.title.toLowerCase() === framePath.toLowerCase() ||
          f.folder_path?.toLowerCase().includes(framePath.toLowerCase())
        )
        if (frame && nodes.some(n =>
          n.title.toLowerCase() === targetWithoutPath.toLowerCase() &&
          n.frame_id === frame.id
        )) return true
      }

      // 4. Filename-only match
      return nodes.some(n => n.title.toLowerCase() === targetWithoutPath.toLowerCase())
    }

    const renderOptions: RenderOptions = { wikilinkExists }
    const html = serviceRenderMarkdown(content, renderOptions)

    // Cache the result (limit size)
    if (markdownCache.size > 2000) {
      const firstKey = markdownCache.keys().next().value
      if (firstKey) markdownCache.delete(firstKey)
    }
    markdownCache.set(content, html)

    return html
  }

  /**
   * Render pending math expressions in the DOM
   */
  async function renderTypstMath() {
    await renderPendingMath()
  }

  /**
   * Render pending mermaid diagrams in the DOM
   */
  async function renderMermaidDiagrams() {
    await renderPendingMermaid()
  }

  /**
   * Update rendered content for all visible nodes
   */
  function updateRenderedContent() {
    if (markdownRenderTimer) clearTimeout(markdownRenderTimer)
    markdownRenderTimer = setTimeout(() => {
      const result = { ...nodeRenderedContent.value }
      let changed = false

      // Track which nodes still exist
      const currentIds = new Set<string>()

      for (const node of getFilteredNodes()) {
        currentIds.add(node.id)
        const contentKey = node.markdown_content || ''
        const prevHash = nodeContentHashes.get(node.id)

        // Only re-render if content actually changed
        if (prevHash !== contentKey) {
          result[node.id] = renderMarkdown(node.markdown_content)
          nodeContentHashes.set(node.id, contentKey)
          changed = true
        } else if (!result[node.id]) {
          // New node, render it
          result[node.id] = renderMarkdown(node.markdown_content)
          nodeContentHashes.set(node.id, contentKey)
          changed = true
        }
      }

      // Clean up removed nodes
      for (const id of nodeContentHashes.keys()) {
        if (!currentIds.has(id)) {
          nodeContentHashes.delete(id)
          delete result[id]
          changed = true
        }
      }

      if (changed) {
        nodeRenderedContent.value = result
        // Render pending content after DOM updates
        nextTick(async () => {
          await renderTypstMath()
          await renderMermaidDiagrams()
        })
      }
    }, debounceMs)
  }

  /**
   * Clear all caches
   */
  function clearCaches() {
    markdownCache.clear()
    nodeContentHashes.clear()
    nodeRenderedContent.value = {}
  }

  /**
   * Render a single node's content
   */
  function renderSingleNode(nodeId: string, content: string | null) {
    nodeRenderedContent.value = {
      ...nodeRenderedContent.value,
      [nodeId]: renderMarkdown(content),
    }
    // Render pending content after DOM updates
    nextTick(async () => {
      await renderTypstMath()
      await renderMermaidDiagrams()
    })
  }

  /**
   * Setup watchers for node changes
   */
  function setupWatchers() {
    // Watch for node changes with shallow comparison
    watch(
      () =>
        getFilteredNodes().length +
        getFilteredNodes().reduce((sum, n) => sum + (n.markdown_content?.length || 0), 0),
      updateRenderedContent,
      { immediate: true }
    )

    // Watch for mermaid content changes
    watch(
      () => {
        const nodes = getFilteredNodes()
        const mermaidBlocks: string[] = []

        for (const node of nodes) {
          const content = node.markdown_content || ''
          const hasMermaid = content.includes('```mermaid')

          if (hasMermaid) {
            nodesWithMermaid.add(node.id)
            const matches = content.match(/```mermaid[\s\S]*?```/g)
            if (matches) {
              mermaidBlocks.push(...matches)
            }
          } else if (nodesWithMermaid.has(node.id)) {
            nodesWithMermaid.delete(node.id)
          }
        }

        // Clean up deleted nodes
        const nodeIds = new Set(nodes.map(n => n.id))
        for (const id of nodesWithMermaid) {
          if (!nodeIds.has(id)) {
            nodesWithMermaid.delete(id)
          }
        }

        return mermaidBlocks.join('|||')
      },
      newMermaidCode => {
        if (newMermaidCode && newMermaidCode !== lastMermaidCode) {
          lastMermaidCode = newMermaidCode
          setTimeout(renderMermaidDiagrams, 100)
        }
      }
    )
  }

  return {
    // State
    nodeRenderedContent,

    // Methods
    renderMarkdown,
    renderTypstMath,
    renderMermaidDiagrams,
    updateRenderedContent,
    clearCaches,
    renderSingleNode,
    setupWatchers,
    reinitializeMermaid,
  }
}
