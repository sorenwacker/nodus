/**
 * App search composable
 * Manages the global search functionality
 */
import { ref, computed } from 'vue'
import type { Node } from '../types'

export interface UseAppSearchOptions {
  getFilteredNodes: () => Node[]
  selectNode?: (id: string | null) => void
}

export function useAppSearch(options: UseAppSearchOptions) {
  const { getFilteredNodes, selectNode } = options

  const searchQuery = ref('')
  const showSearch = ref(false)

  // Normalize text for search: lowercase and remove diacritics (ö→o, é→e, etc.)
  function normalizeText(str: string): string {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  const searchResults = computed(() => {
    if (!searchQuery.value.trim()) return []
    const q = normalizeText(searchQuery.value)

    // Search in filtered nodes (current workspace)
    const matches = getFilteredNodes().filter((n) => {
      const title = normalizeText(n.title || '')
      const content = normalizeText(n.markdown_content || '')
      return title.includes(q) || content.includes(q)
    })

    // Sort by relevance: exact title match > title starts with > title contains > content only
    matches.sort((a, b) => {
      const aTitle = normalizeText(a.title || '')
      const bTitle = normalizeText(b.title || '')

      // Exact title match
      if (aTitle === q && bTitle !== q) return -1
      if (bTitle === q && aTitle !== q) return 1

      // Title starts with query
      const aStarts = aTitle.startsWith(q)
      const bStarts = bTitle.startsWith(q)
      if (aStarts && !bStarts) return -1
      if (bStarts && !aStarts) return 1

      // Title contains query
      const aTitleMatch = aTitle.includes(q)
      const bTitleMatch = bTitle.includes(q)
      if (aTitleMatch && !bTitleMatch) return -1
      if (bTitleMatch && !aTitleMatch) return 1

      // Both in content only - sort alphabetically
      return aTitle.localeCompare(bTitle)
    })

    return matches.slice(0, 10)
  })

  function toggleSearch() {
    showSearch.value = !showSearch.value
    if (showSearch.value) {
      setTimeout(() => {
        document.querySelector<HTMLInputElement>('.search-input')?.focus()
      }, 50)
    }
  }

  function closeSearch() {
    showSearch.value = false
    searchQuery.value = ''
  }

  function selectResult(nodeId: string) {
    selectNode?.(nodeId)
    closeSearch()
    // Dispatch event for canvas to zoom to node
    window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId } }))
  }

  return {
    searchQuery,
    showSearch,
    searchResults,
    normalizeText,
    toggleSearch,
    closeSearch,
    selectResult,
  }
}
