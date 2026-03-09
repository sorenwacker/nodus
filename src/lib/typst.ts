// Typst math rendering utility
// Uses @myriaddreamin/typst.ts for WASM-based typesetting

import { createTypstRenderer, type TypstRenderer } from '@myriaddreamin/typst.ts'
import { createLogger } from './logger'

const log = createLogger('Typst')

let renderer: TypstRenderer | null = null
let initPromise: Promise<void> | null = null

// Simple LRU cache for rendered math
const cache = new Map<string, string>()
const CACHE_MAX_SIZE = 500

/**
 * Initialize the Typst WASM renderer
 */
export async function initTypst(): Promise<void> {
  if (renderer) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      renderer = await createTypstRenderer()
      log.info('WASM renderer initialized')
    } catch (error) {
      log.error('Failed to initialize renderer:', error)
      throw error
    }
  })()

  return initPromise
}

/**
 * Check if Typst is ready
 */
export function isTypstReady(): boolean {
  return renderer !== null
}

/**
 * Render a math expression to SVG
 * @param math - Math expression (without delimiters)
 * @param displayMode - true for display (block) mode, false for inline
 * @returns SVG string or null on error
 */
export async function renderMath(
  math: string,
  displayMode = false
): Promise<string | null> {
  if (!renderer) {
    await initTypst()
  }

  if (!renderer) {
    log.warn('Renderer not available')
    return null
  }

  // Check cache
  const cacheKey = `${displayMode ? 'd' : 'i'}:${math}`
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!
  }

  try {
    // Wrap in Typst math delimiters
    const typstCode = displayMode ? `$ ${math} $` : `$${math}$`

    // Render to SVG
    const result = await renderer.runWithSession(async (session) => {
      const svg = await session.svg({
        mainContent: typstCode,
      })
      return svg
    })

    // Cache the result
    if (cache.size >= CACHE_MAX_SIZE) {
      // Evict oldest entry
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    cache.set(cacheKey, result)

    return result
  } catch (error) {
    log.error('Rendering error:', error)
    return null
  }
}

/**
 * Process markdown content and render math expressions
 * Supports $...$ for inline and $$...$$ for display math
 * @param content - Markdown content
 * @returns Processed HTML with rendered math
 */
export async function processMarkdownMath(content: string): Promise<string> {
  if (!content) return content

  // Match display math first ($$...$$)
  const displayMathRegex = /\$\$([^$]+)\$\$/g
  // Match inline math ($...$) but not $$
  const inlineMathRegex = /(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g

  let result = content

  // Process display math
  const displayMatches = [...content.matchAll(displayMathRegex)]
  for (const match of displayMatches) {
    const [fullMatch, mathContent] = match
    const svg = await renderMath(mathContent.trim(), true)
    if (svg) {
      result = result.replace(
        fullMatch,
        `<div class="typst-math typst-display">${svg}</div>`
      )
    }
  }

  // Process inline math
  const inlineMatches = [...result.matchAll(inlineMathRegex)]
  for (const match of inlineMatches) {
    const [fullMatch, mathContent] = match
    const svg = await renderMath(mathContent.trim(), false)
    if (svg) {
      result = result.replace(
        fullMatch,
        `<span class="typst-math typst-inline">${svg}</span>`
      )
    }
  }

  return result
}

/**
 * Clear the rendering cache
 */
export function clearCache(): void {
  cache.clear()
}
