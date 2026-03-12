/**
 * Typst WASM rendering service
 * Provides instant math rendering with caching for performance
 *
 * Uses @myriaddreamin/typst.ts for WASM-based Typst compilation
 * See: https://github.com/Myriad-Dreamin/typst.ts
 */
import { ref, shallowRef } from 'vue'

// Typst instance (lazy loaded)
let $typst: any = null
let initPromise: Promise<void> | null = null

// SVG cache: hash -> rendered SVG
const svgCache = new Map<string, string>()
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
 * Initialize the Typst compiler (lazy load WASM)
 */
async function initTypst(): Promise<void> {
  if ($typst) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      // Use the simplified $typst API
      const module = await import('@myriaddreamin/typst.ts')
      $typst = module.$typst
      console.log('[Typst] Compiler initialized')
    } catch (e) {
      console.error('[Typst] Failed to initialize:', e)
      throw e
    }
  })()

  return initPromise
}

/**
 * Render Typst code to SVG
 */
async function renderToSvg(code: string): Promise<string> {
  // Check cache first
  const cacheKey = hashCode(code)
  const cached = svgCache.get(cacheKey)
  if (cached) return cached

  // Ensure compiler is initialized
  await initTypst()
  if (!$typst) {
    throw new Error('Typst compiler not available')
  }

  try {
    // Wrap in document template for standalone rendering
    const mainContent = `#set page(width: auto, height: auto, margin: 0.5em)
#set text(size: 14pt)
${code}`

    const svg = await $typst.svg({ mainContent })

    if (!svg) {
      throw new Error('No SVG output')
    }

    // Cache the result
    if (svgCache.size >= MAX_CACHE_SIZE) {
      const firstKey = svgCache.keys().next().value
      if (firstKey) svgCache.delete(firstKey)
    }
    svgCache.set(cacheKey, svg)

    return svg
  } catch (e) {
    console.error('[Typst] Render error:', e)
    throw e
  }
}

/**
 * Render math expression ($ ... $ syntax)
 */
async function renderMath(math: string): Promise<string> {
  // Typst uses $ for inline math, $$ for display math (centered)
  const isDisplay = math.startsWith('$$') && math.endsWith('$$')
  const content = isDisplay
    ? math.slice(2, -2).trim()
    : math.startsWith('$') && math.endsWith('$')
      ? math.slice(1, -1).trim()
      : math.trim()

  // For display math, use equation block
  const typstCode = isDisplay
    ? `$ ${content} $`
    : `$${content}$`

  return renderToSvg(typstCode)
}

/**
 * Render a Typst code block (```typst ... ```)
 */
async function renderCodeBlock(code: string): Promise<string> {
  return renderToSvg(code)
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

  // Process in parallel for speed
  const results = await Promise.allSettled(
    matches.map(async (match) => {
      const original = match[0]
      try {
        const svg = await renderMath(original)
        return { original, svg, index: match.index }
      } catch (e) {
        return { original, svg: '', error: String(e), index: match.index }
      }
    })
  )

  // Replace in reverse order to preserve indices
  const sortedResults = results
    .map((r, i) => ({ result: r, match: matches[i] }))
    .sort((a, b) => (b.match.index || 0) - (a.match.index || 0))

  for (const { result, match } of sortedResults) {
    if (result.status === 'fulfilled') {
      const { original, svg, error } = result.value
      mathBlocks.push({ original, svg, error })

      const isDisplay = original.startsWith('$$')
      if (error) {
        html = html.slice(0, match.index) +
          `<span class="typst-error" title="${error}">${original}</span>` +
          html.slice((match.index || 0) + original.length)
      } else {
        const wrapper = isDisplay
          ? `<div class="typst-math typst-display">${svg}</div>`
          : `<span class="typst-math typst-inline">${svg}</span>`
        html = html.slice(0, match.index) +
          wrapper +
          html.slice((match.index || 0) + original.length)
      }
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
 * Check if content contains Typst code blocks
 */
function hasTypstBlock(content: string): boolean {
  return /```typst[\s\S]*?```/.test(content)
}

/**
 * Clear the SVG cache
 */
function clearCache(): void {
  svgCache.clear()
}

/**
 * Get cache statistics
 */
function getCacheStats(): { size: number; maxSize: number } {
  return { size: svgCache.size, maxSize: MAX_CACHE_SIZE }
}

// Reactive state for UI
const isInitialized = ref(false)
const isInitializing = ref(false)
const initError = shallowRef<Error | null>(null)

export function useTypst() {
  async function init() {
    if (isInitialized.value || isInitializing.value) return

    isInitializing.value = true
    initError.value = null

    try {
      await initTypst()
      isInitialized.value = true
    } catch (e) {
      initError.value = e as Error
    } finally {
      isInitializing.value = false
    }
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
