/**
 * Content renderer composable
 * Manages markdown, Typst math, and Mermaid diagram rendering with caching
 * Uses Tauri backend when available, falls back to WASM in browser mode
 */
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import { invoke, isTauri } from '../../../lib/tauri'
import { renderMath as renderMathWasm, initTypst as initTypstWasm, isTypstReady } from '../../../lib/typst'
import type { Node } from '../../../types'

export interface UseContentRendererOptions {
  getFilteredNodes: () => Node[]
  isDarkMode: () => boolean
  debounceMs?: number
}

export function useContentRenderer(options: UseContentRendererOptions) {
  const { getFilteredNodes, isDarkMode, debounceMs = 50 } = options

  // Configure marked
  marked.use({
    gfm: true,
    breaks: true,
    async: false,
  })

  // Caches
  const markdownCache = new Map<string, string>()
  const mathCache = new Map<string, string>()
  const mermaidCache = new Map<string, string>()

  // Counters for unique IDs
  let mermaidCounter = 0

  // Pre-rendered HTML cache for each node
  const nodeRenderedContent = ref<Record<string, string>>({})
  const nodeContentHashes = new Map<string, string>()

  // Mermaid state
  let mermaidLoaded = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mermaidApi: any = null
  let mermaidRenderPending = false
  let mermaidRenderQueued = false
  let lastMermaidCode = ''

  // Debounce timer
  let markdownRenderTimer: ReturnType<typeof setTimeout> | null = null

  async function renderTypstMath() {
    const elements = document.querySelectorAll('.typst-pending')
    if (elements.length === 0) return

    // Initialize WASM renderer if needed (for browser mode)
    if (!isTauri() && !isTypstReady()) {
      try {
        await initTypstWasm()
      } catch (e) {
        console.warn('WASM Typst init failed:', e)
      }
    }

    for (const el of elements) {
      const math = el.getAttribute('data-math')
      const isDisplay = el.classList.contains('typst-display')
      if (!math) continue

      // Check cache
      const cacheKey = `${isDisplay ? 'd' : 'i'}:${math}`
      if (mathCache.has(cacheKey)) {
        el.innerHTML = mathCache.get(cacheKey)!
        el.classList.remove('typst-pending')
        continue
      }

      try {
        let svg: string | null = null

        if (isTauri()) {
          // Use Tauri backend for native performance
          svg = await invoke<string>('render_typst_math', {
            math,
            displayMode: isDisplay,
          })
        } else if (isTypstReady()) {
          // Use WASM renderer in browser mode
          svg = await renderMathWasm(math, isDisplay)
        }

        if (svg) {
          mathCache.set(cacheKey, svg)
          el.innerHTML = svg
          el.classList.remove('typst-pending')
        } else {
          // No renderer available - show raw math
          el.classList.remove('typst-pending')
          el.classList.add('typst-fallback')
        }
      } catch (e) {
        console.warn('Math render error:', e)
        el.textContent = math // Fallback to raw math
        el.classList.remove('typst-pending')
        el.classList.add('typst-error')
      }
    }
  }

  function renderMarkdown(content: string | null): string {
    if (!content) return ''

    // Don't cache content with math - render inline instead
    const hasMath = /\$[^$]+\$/.test(content)

    // Check cache first (only for non-math content)
    if (!hasMath && markdownCache.has(content)) {
      return markdownCache.get(content)!
    }

    // Extract math blocks BEFORE markdown processing to preserve backslashes
    const mathPlaceholders: Map<string, string> = new Map()
    let processedContent = content

    // Extract display math first ($$...$$)
    processedContent = processedContent.replace(/\$\$([^$]+)\$\$/g, (_match, math) => {
      const id = `MATH_DISPLAY_${mathPlaceholders.size}`
      mathPlaceholders.set(id, math.trim())
      return id
    })

    // Extract inline math ($...$)
    processedContent = processedContent.replace(/(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g, (_match, math) => {
      const id = `MATH_INLINE_${mathPlaceholders.size}`
      mathPlaceholders.set(id, math.trim())
      return id
    })

    // Render markdown (without math blocks)
    let html = marked.parse(processedContent) as string

    // Restore math blocks - use cached SVG or create pending placeholders
    for (const [id, math] of mathPlaceholders) {
      const isDisplay = id.startsWith('MATH_DISPLAY_')
      const cacheKey = `${isDisplay ? 'd' : 'i'}:${math}`

      let wrapper: string
      if (mathCache.has(cacheKey)) {
        // Use cached SVG
        const rendered = mathCache.get(cacheKey)!
        wrapper = isDisplay
          ? `<div class="typst-display">${rendered}</div>`
          : `<span class="typst-inline">${rendered}</span>`
      } else {
        // Create placeholder for async rendering
        const escapedMath = math.replace(/"/g, '&quot;')
        wrapper = isDisplay
          ? `<div class="typst-display typst-pending" data-math="${escapedMath}">${math}</div>`
          : `<span class="typst-inline typst-pending" data-math="${escapedMath}">${math}</span>`
      }
      html = html.replace(id, wrapper)
    }

    // Post-process to handle mermaid code blocks
    const mermaidRegex = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g

    let needsMermaidRender = false
    html = html.replace(mermaidRegex, (_match, code) => {
      const id = `mermaid-${mermaidCounter++}`
      const decoded = code
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")

      // If we have cached SVG for this mermaid code, use it directly
      if (mermaidCache.has(decoded)) {
        return `<div class="mermaid-wrapper">${mermaidCache.get(decoded)}</div>`
      }
      // Only trigger mermaid render if we have uncached diagrams
      needsMermaidRender = true
      return `<div class="mermaid-wrapper"><pre class="mermaid" id="${id}">${decoded}</pre></div>`
    })

    // Only schedule mermaid render if there are uncached diagrams
    if (needsMermaidRender) {
      setTimeout(() => renderMermaidDiagrams(), 50)
    }

    // Convert [[link]] and [[link|display]] wikilinks to clickable elements
    const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
    html = html.replace(wikilinkRegex, (_match, target, display) => {
      const displayText = display || target
      const targetTrimmed = target.trim()
      // Check if target node exists for styling
      const targetExists = getFilteredNodes().some(
        (n) => n.title.toLowerCase() === targetTrimmed.toLowerCase()
      )
      const missingClass = targetExists ? '' : ' missing'
      return `<a class="wikilink${missingClass}" data-target="${targetTrimmed}">${displayText}</a>`
    })

    // Cache the result (limit cache size)
    if (markdownCache.size > 100) {
      const firstKey = markdownCache.keys().next().value
      if (firstKey) markdownCache.delete(firstKey)
    }
    markdownCache.set(content, html)

    return html
  }

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
        // Render Typst math after DOM updates
        nextTick(() => renderTypstMath())
      }
    }, debounceMs)
  }

  async function renderMermaidDiagrams() {
    // If already rendering, queue another render for when it's done
    if (mermaidRenderPending) {
      mermaidRenderQueued = true
      return
    }
    mermaidRenderPending = true
    mermaidRenderQueued = false

    await nextTick()

    const elements = document.querySelectorAll('.mermaid')
    if (elements.length === 0) {
      mermaidRenderPending = false
      // Check if another render was queued
      if (mermaidRenderQueued) {
        mermaidRenderQueued = false
        setTimeout(renderMermaidDiagrams, 50)
      }
      return
    }

    // Lazy load mermaid only when needed
    if (!mermaidLoaded) {
      try {
        const mod = await import('mermaid')
        let api = mod.default || mod
        if (api.default) api = api.default

        mermaidApi = api
        if (typeof mermaidApi.initialize === 'function') {
          mermaidApi.initialize({
            startOnLoad: false,
            theme: isDarkMode() ? 'dark' : 'default',
            securityLevel: 'loose',
          })
        }
        mermaidLoaded = true
      } catch (e) {
        console.error('Mermaid load error:', e)
        mermaidRenderPending = false
        return
      }
    }

    let didRenderNew = false
    for (const el of elements) {
      // Skip if already contains SVG (already rendered in DOM)
      if (el.querySelector('svg')) continue

      const code = el.textContent?.trim() || ''
      if (!code) continue

      // Check cache first
      if (mermaidCache.has(code)) {
        el.innerHTML = mermaidCache.get(code)!
        didRenderNew = true
        continue
      }

      try {
        const id = `m${Date.now()}${Math.random().toString(36).substr(2, 5)}`
        const { svg } = await mermaidApi.render(id, code)
        mermaidCache.set(code, svg)
        el.innerHTML = svg
        didRenderNew = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        const msg = e.message || String(e)
        const errorHtml = `<div style="color:var(--danger-color);font-size:11px;padding:8px;user-select:text;">Diagram error: ${msg.substring(0, 100)}</div>`
        mermaidCache.set(code, errorHtml)
        el.innerHTML = errorHtml
        didRenderNew = true
      }
    }

    // Only clear markdown cache if we actually rendered something new
    if (didRenderNew) {
      markdownCache.clear()
    }

    mermaidRenderPending = false

    // Check if another render was queued while we were rendering
    if (mermaidRenderQueued) {
      mermaidRenderQueued = false
      setTimeout(renderMermaidDiagrams, 50)
    }
  }

  function clearCaches() {
    markdownCache.clear()
    mathCache.clear()
    mermaidCache.clear()
    nodeContentHashes.clear()
    nodeRenderedContent.value = {}
  }

  function renderSingleNode(nodeId: string, content: string | null) {
    nodeRenderedContent.value = {
      ...nodeRenderedContent.value,
      [nodeId]: renderMarkdown(content),
    }
  }

  // Setup watchers
  function setupWatchers() {
    // Watch for node changes with shallow comparison
    watch(
      () =>
        getFilteredNodes().length +
        getFilteredNodes().reduce((sum, n) => sum + (n.markdown_content?.length || 0), 0),
      updateRenderedContent,
      { immediate: true }
    )

    // Watch for mermaid content changes only
    watch(
      () => {
        // Extract only mermaid code blocks from all nodes
        const mermaidBlocks: string[] = []
        for (const node of getFilteredNodes()) {
          const content = node.markdown_content || ''
          const matches = content.match(/```mermaid[\s\S]*?```/g)
          if (matches) {
            mermaidBlocks.push(...matches)
          }
        }
        return mermaidBlocks.join('|||')
      },
      (newMermaidCode) => {
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
  }
}
