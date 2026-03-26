/**
 * Math rendering service using native Typst via Tauri backend
 * Provides Typst math rendering with caching for performance
 */
import { ref, shallowRef } from 'vue'
import { invoke, isTauri } from '@/lib/tauri'
import { sanitizeSvg, escapeText } from '@/lib/sanitize'

// SVG cache: hash -> rendered SVG
const mathCache = new Map<string, string>()
const MAX_CACHE_SIZE = 500

// Simple hash function for cache keys
function hashCode(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

/**
 * Initialize (check Tauri availability)
 */
async function initTypst(): Promise<void> {
  if (isTauri()) {
    console.log('[Math] Typst renderer ready (via Tauri)')
  } else {
    console.log('[Math] Running in browser mode (Typst unavailable)')
  }
}

/**
 * Render math to SVG using native Typst via Tauri
 */
async function renderMathToSvg(math: string, displayMode: boolean): Promise<string> {
  const cacheKey = hashCode(math + displayMode)
  const cached = mathCache.get(cacheKey)
  if (cached) return cached

  if (!isTauri()) {
    // Fallback for browser mode - show the raw math (escaped)
    return `<span class="math-fallback">${escapeText(math)}</span>`
  }

  try {
    const svg = await invoke<string>('render_typst_math', {
      math,
      displayMode,
    })

    // Sanitize SVG before caching
    const sanitized = sanitizeSvg(svg)

    // Cache the result
    if (mathCache.size >= MAX_CACHE_SIZE) {
      const firstKey = mathCache.keys().next().value
      if (firstKey) mathCache.delete(firstKey)
    }
    mathCache.set(cacheKey, sanitized)

    return sanitized
  } catch (e) {
    console.error('[Math] Render error:', e)
    throw e
  }
}

/**
 * Render Typst code to SVG
 */
async function renderToSvg(code: string): Promise<string> {
  // Extract math content (remove $ delimiters)
  const isDisplay = code.startsWith('$$') && code.endsWith('$$')
  const content = isDisplay
    ? code.slice(2, -2).trim()
    : code.startsWith('$') && code.endsWith('$')
      ? code.slice(1, -1).trim()
      : code.trim()

  return renderMathToSvg(content, isDisplay)
}

/**
 * Render math expression ($ ... $ syntax)
 */
async function renderMath(math: string): Promise<string> {
  const isDisplay = math.startsWith('$$') && math.endsWith('$$')
  const content = isDisplay
    ? math.slice(2, -2).trim()
    : math.startsWith('$') && math.endsWith('$')
      ? math.slice(1, -1).trim()
      : math.trim()

  return renderMathToSvg(content, isDisplay)
}

/**
 * Render a code block (```math ... ```)
 */
async function renderCodeBlock(code: string): Promise<string> {
  return renderMathToSvg(code.trim(), true)
}

/**
 * Extract and render all math blocks from markdown content
 * Returns content with math blocks replaced by SVG
 */
async function renderMathInContent(content: string): Promise<{
  html: string
  mathBlocks: Array<{ original: string; svg: string; error?: string }>
}> {
  const mathBlocks: Array<{ original: string; svg: string; error?: string }> = []

  // Match $...$ (inline) and $$...$$ (display) math
  const mathRegex = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g

  let html = content
  const matches = [...content.matchAll(mathRegex)]

  // Process in reverse order to preserve indices
  const sortedMatches = [...matches].sort((a, b) => (b.index || 0) - (a.index || 0))

  for (const match of sortedMatches) {
    const original = match[0]
    const isDisplay = original.startsWith('$$')

    try {
      const rendered = await renderMath(original)
      mathBlocks.push({ original, svg: rendered })

      const wrapper = isDisplay
        ? `<div class="typst-display">${rendered}</div>`
        : `<span class="typst-inline">${rendered}</span>`

      html = html.slice(0, match.index) +
        wrapper +
        html.slice((match.index || 0) + original.length)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      mathBlocks.push({ original, svg: '', error })
      // Escape both error and original to prevent XSS
      html = html.slice(0, match.index) +
        `<span class="math-error" title="${escapeText(error)}">${escapeText(original)}</span>` +
        html.slice((match.index || 0) + original.length)
    }
  }

  return { html, mathBlocks }
}

/**
 * Check if content contains math blocks
 */
function hasMath(content: string): boolean {
  return /\$[^$]+\$/.test(content)
}

/**
 * Check if content contains math code blocks
 */
function hasTypstBlock(content: string): boolean {
  return /```(?:math|typst)[\s\S]*?```/.test(content)
}

/**
 * Clear the cache
 */
function clearCache(): void {
  mathCache.clear()
}

/**
 * Get cache statistics
 */
function getCacheStats(): { size: number; maxSize: number } {
  return { size: mathCache.size, maxSize: MAX_CACHE_SIZE }
}

// Reactive state for UI
const isInitialized = ref(true)
const isInitializing = ref(false)
const initError = shallowRef<Error | null>(null)

export function useTypst() {
  async function init() {
    await initTypst()
    isInitialized.value = true
  }

  return {
    // State
    isInitialized,
    isInitializing,
    initError,

    // Methods
    init,
    renderToSvg,
    renderMath,
    renderCodeBlock,
    renderMathInContent,
    hasMath,
    hasTypstBlock,
    clearCache,
    getCacheStats,
  }
}

// Export standalone functions for use outside Vue components
export {
  initTypst,
  renderToSvg,
  renderMath,
  renderCodeBlock,
  renderMathInContent,
  hasMath,
  hasTypstBlock,
  clearCache,
  getCacheStats,
}
