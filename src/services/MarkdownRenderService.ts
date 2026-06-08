/**
 * Unified Markdown Rendering Service
 *
 * Provides consistent markdown, math (Typst), and mermaid rendering
 * across all views (canvas nodes, storyline reader, detail modals).
 *
 * Key pattern: Two-phase rendering
 * 1. renderMarkdown() - sync, creates placeholders for math/mermaid
 * 2. renderPendingMath() / renderPendingMermaid() - async, injects SVG into DOM
 *
 * This avoids SVG being stripped by sanitizeHtml() since injection
 * happens after sanitization.
 */
import { nextTick } from 'vue'
import { marked } from '../lib/markdown'
import { invoke, isTauri } from '../lib/tauri'
import {
  renderMath as renderMathWasm,
  initTypst as initTypstWasm,
  isTypstReady,
} from '../lib/typst'
import {
  sanitizeSvg,
  sanitizeHtml,
  escapeText,
  sanitizeMermaidSvg,
  decodeHtmlEntities,
} from '../lib/sanitize'

// ============================================================================
// Caches - shared across all views for efficiency
// ============================================================================
const mathCache = new Map<string, string>()
const mermaidCache = new Map<string, string>()

// Mermaid state
let mermaidLoaded = false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mermaidApi: any = null
let mermaidRenderPending = false
let mermaidRenderQueued = false

// ============================================================================
// Phase 1: Synchronous markdown rendering (creates placeholders)
// ============================================================================

export interface RenderOptions {
  /** Function to check if a wikilink target exists */
  wikilinkExists?: (target: string) => boolean
}

/**
 * Render markdown to HTML synchronously.
 *
 * Math expressions become placeholders with `typst-pending` class.
 * Mermaid blocks become placeholders with `mermaid` class.
 *
 * After inserting this HTML into DOM, call:
 * - renderPendingMath() to render math SVGs
 * - renderPendingMermaid() to render mermaid diagrams
 */
export function renderMarkdown(content: string | null, options: RenderOptions = {}): string {
  if (!content) return ''

  // Extract math blocks BEFORE markdown processing to preserve backslashes
  const mathPlaceholders: Map<string, string> = new Map()
  let processedContent = content

  // Extract display math first ($$...$$)
  processedContent = processedContent.replace(/\$\$([^$]+)\$\$/g, (_match, math) => {
    const id = `NODUS_MATH_DISPLAY_${mathPlaceholders.size}_END`
    mathPlaceholders.set(id, math.trim())
    return id
  })

  // Extract inline math ($...$)
  processedContent = processedContent.replace(
    /(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g,
    (_match, math) => {
      const id = `NODUS_MATH_INLINE_${mathPlaceholders.size}_END`
      mathPlaceholders.set(id, math.trim())
      return id
    }
  )

  // Render markdown (without math blocks)
  let html = marked.parse(processedContent) as string

  // Restore math blocks - use cached SVG or create pending placeholders
  for (const [id, math] of mathPlaceholders) {
    const isDisplay = id.includes('MATH_DISPLAY')
    const cacheKey = `${isDisplay ? 'd' : 'i'}:${math}`

    let wrapper: string
    if (mathCache.has(cacheKey)) {
      // Use cached SVG - insert directly
      const rendered = mathCache.get(cacheKey)!
      wrapper = isDisplay
        ? `<div class="typst-display typst-math">${rendered}</div>`
        : `<span class="typst-inline typst-math">${rendered}</span>`
    } else {
      // Create placeholder for async rendering
      const escapedMath = math.replace(/"/g, '&quot;')
      wrapper = isDisplay
        ? `<div class="typst-display typst-pending" data-math="${escapedMath}">${escapeText(math)}</div>`
        : `<span class="typst-inline typst-pending" data-math="${escapedMath}">${escapeText(math)}</span>`
    }
    html = html.replace(new RegExp(id, 'g'), wrapper)
  }

  // Post-process to handle mermaid code blocks
  const mermaidRegex = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g
  html = html.replace(mermaidRegex, (_match, code) => {
    const decoded = decodeHtmlEntities(code)

    // Check cache - include theme in cache key
    const theme = typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') || 'light'
      : 'light'
    const dark = theme === 'dark' || theme === 'pitch-black' || theme === 'cyber'
    const cacheKey = `${dark ? 'dark' : 'light'}:${decoded}`

    if (mermaidCache.has(cacheKey)) {
      return `<div class="mermaid-wrapper">${mermaidCache.get(cacheKey)}</div>`
    }

    // Create placeholder for async rendering
    return `<div class="mermaid-wrapper"><pre class="mermaid">${escapeText(decoded)}</pre></div>`
  })

  // Convert [[link]] and [[link|display]] wikilinks to clickable elements
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  html = html.replace(wikilinkRegex, (_match, target, display) => {
    const displayText = display || target
    const targetTrimmed = target.trim()
    const targetExists = options.wikilinkExists?.(targetTrimmed) ?? false
    const missingClass = targetExists ? '' : ' missing'
    return `<a class="wikilink${missingClass}" data-target="${targetTrimmed}">${displayText}</a>`
  })

  // Sanitize HTML to prevent XSS
  // Note: This strips SVG, which is why we use placeholders
  return sanitizeHtml(html)
}

// ============================================================================
// Phase 2: Async rendering (injects SVG into DOM)
// ============================================================================

/**
 * Find all pending math placeholders in DOM and render to SVG.
 * Call this after inserting HTML from renderMarkdown() into the DOM.
 *
 * @param container - Optional container element to search within (defaults to document)
 */
export async function renderPendingMath(container?: Element): Promise<void> {
  const root = container || document
  const elements = root.querySelectorAll('.typst-pending')
  if (elements.length === 0) return

  // Initialize WASM renderer if needed (for browser mode)
  if (!isTauri() && !isTypstReady()) {
    try {
      await initTypstWasm()
    } catch (e) {
      console.warn('[MarkdownRenderService] WASM Typst init failed:', e)
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
        svg = await invoke<string>('render_typst_math', {
          math,
          displayMode: isDisplay,
        })
      } else if (isTypstReady()) {
        svg = await renderMathWasm(math, isDisplay)
      }

      if (svg) {
        const sanitized = sanitizeSvg(svg)
        mathCache.set(cacheKey, sanitized)
        el.innerHTML = sanitized
        el.classList.remove('typst-pending')
      } else {
        // No renderer available - show raw math
        el.classList.remove('typst-pending')
        el.classList.add('typst-fallback')
      }
    } catch (e) {
      console.warn('[MarkdownRenderService] Math render error:', e)
      el.textContent = math
      el.classList.remove('typst-pending')
      el.classList.add('typst-error')
    }
  }
}

/**
 * Find all pending mermaid placeholders in DOM and render diagrams.
 * Call this after inserting HTML from renderMarkdown() into the DOM.
 *
 * @param container - Optional container element to search within (defaults to document)
 */
export async function renderPendingMermaid(container?: Element): Promise<void> {
  // If already rendering, queue another render for when it's done
  if (mermaidRenderPending) {
    mermaidRenderQueued = true
    return
  }
  mermaidRenderPending = true
  mermaidRenderQueued = false

  await nextTick()

  const root = container || document
  const elements = root.querySelectorAll('.mermaid')
  if (elements.length === 0) {
    mermaidRenderPending = false
    if (mermaidRenderQueued) {
      mermaidRenderQueued = false
      setTimeout(() => renderPendingMermaid(container), 50)
    }
    return
  }

  // Lazy load mermaid only when needed
  if (!mermaidLoaded) {
    try {
      const mod = await import('mermaid')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let api: any = mod.default || mod
      if (api.default) api = api.default
      mermaidApi = api
      mermaidLoaded = true
    } catch (e) {
      console.error('[MarkdownRenderService] Mermaid load error:', e)
      mermaidRenderPending = false
      return
    }
  }

  // Initialize Mermaid with appropriate built-in theme
  if (typeof mermaidApi.initialize === 'function') {
    const theme = document.documentElement.getAttribute('data-theme') || 'light'
    const isDark = theme === 'dark' || theme === 'pitch-black' || theme === 'cyber'
    mermaidApi.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
    })
  }

  for (const el of elements) {
    // Skip if already contains SVG
    if (el.querySelector('svg')) continue

    const code = el.textContent?.trim() || ''
    if (!code) continue

    // Store original code for theme change reinit
    el.setAttribute('data-mermaid-code', code)

    // Include theme in cache key
    const theme = document.documentElement.getAttribute('data-theme') || 'light'
    const dark = theme === 'dark' || theme === 'pitch-black' || theme === 'cyber'
    const cacheKey = `${dark ? 'dark' : 'light'}:${code}`

    // Check cache
    if (mermaidCache.has(cacheKey)) {
      el.innerHTML = mermaidCache.get(cacheKey)!
      continue
    }

    try {
      const id = `m${Date.now()}${Math.random().toString(36).substr(2, 5)}`
      const { svg } = await mermaidApi.render(id, code)
      const sanitized = sanitizeMermaidSvg(svg)
      mermaidCache.set(cacheKey, sanitized)
      el.innerHTML = sanitized
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      const msg = e.message || String(e)
      const errorHtml = `<div style="color:var(--danger-color);font-size:11px;padding:8px;user-select:text;">Diagram error: ${escapeText(msg.substring(0, 100))}</div>`
      mermaidCache.set(cacheKey, errorHtml)
      el.innerHTML = errorHtml
    }
  }

  mermaidRenderPending = false

  if (mermaidRenderQueued) {
    mermaidRenderQueued = false
    setTimeout(() => renderPendingMermaid(container), 50)
  }
}

/**
 * Render all pending content (math + mermaid) in DOM.
 * Convenience function that calls both renderPendingMath and renderPendingMermaid.
 */
export async function renderPendingContent(container?: Element): Promise<void> {
  await Promise.all([
    renderPendingMath(container),
    renderPendingMermaid(container),
  ])
}

// ============================================================================
// Cache management
// ============================================================================

/**
 * Clear all caches. Call when theme changes or when needed.
 */
export function clearCaches(): void {
  mathCache.clear()
  mermaidCache.clear()
}

/**
 * Reinitialize mermaid for theme changes.
 * Clears mermaid cache and forces re-render of diagrams.
 */
export function reinitializeMermaid(container?: Element): void {
  mermaidCache.clear()
  mermaidLoaded = false
  mermaidApi = null

  const root = container || document
  const elements = root.querySelectorAll('.mermaid')
  for (const el of elements) {
    if (el.querySelector('svg')) {
      const code = el.getAttribute('data-mermaid-code') || ''
      if (code) {
        el.innerHTML = escapeText(code)
      }
    }
  }

  setTimeout(() => renderPendingMermaid(container), 50)
}

/**
 * Get the math cache for inspection/debugging.
 */
export function getMathCache(): Map<string, string> {
  return mathCache
}

/**
 * Get the mermaid cache for inspection/debugging.
 */
export function getMermaidCache(): Map<string, string> {
  return mermaidCache
}
