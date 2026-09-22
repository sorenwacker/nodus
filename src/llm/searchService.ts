/**
 * The `search` context service: web, Wikipedia and the research procedures,
 * with page text truncated to what the run can carry.
 *
 * Composed by the canvas and the node agent and handed to the registry; the
 * tools never reach for the network themselves
 * (PRODUCT_DESIGN.md > One implementation per tool).
 */
import { invoke } from '@tauri-apps/api/core'
import type { SearchService } from './registry'
import { llmStorage } from '../lib/storage'
import {
  webSearch,
  searchWikipedia,
  fetchWikipediaArticle,
  quickResearch,
  deepResearch,
  formatDeepResearchResults,
  validateClaim,
} from './research'

/** Characters a fetched page may occupy; the tail is kept so a conclusion survives */
function truncateToBudget(content: string, maxChars: number): string {
  if (maxChars <= 0 || content.length <= maxChars) return content
  const keepStart = Math.floor(maxChars * 0.85)
  const keepEnd = Math.floor(maxChars * 0.1)
  return (
    content.slice(0, keepStart) +
    `\n\n[... truncated ${content.length - maxChars} chars to fit context ...]\n\n` +
    content.slice(-keepEnd)
  )
}

export function createSearchService(): SearchService {
  return {
    webSearch,
    fetchUrl: async (url: string) => {
      const content = await invoke<string>('fetch_url', { url })
      // The note's context limit decides how much of a page is worth carrying
      return truncateToBudget(content, llmStorage.getChainContextLimit())
    },
    searchWikipedia,
    fetchWikipediaArticle,
    quickResearch,
    deepResearch,
    formatDeepResearchResults,
    validateClaim,
  }
}
