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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await renderer.runWithSession(async (session: any) => {
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
 * Clear the rendering cache
 */
export function clearCache(): void {
  cache.clear()
}
