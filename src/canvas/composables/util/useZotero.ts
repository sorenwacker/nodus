/**
 * Zotero library integration composable
 *
 * Provides access to Zotero's local library for importing citations
 * and collections directly into Nodus.
 */
import { ref, computed } from 'vue'
import { invoke } from '../../../lib/tauri'

/**
 * Zotero collection
 */
export interface ZoteroCollection {
  key: string
  name: string
  parent_key: string | null
  item_count: number
}

/**
 * Zotero creator (author, editor, etc.)
 */
export interface ZoteroCreator {
  first_name: string | null
  last_name: string | null
  creator_type: string
}

/**
 * Zotero attachment
 */
export interface ZoteroAttachment {
  key: string
  title: string | null
  path: string | null
  content_type: string | null
}

/**
 * Zotero library item
 */
export interface ZoteroItem {
  key: string
  item_type: string
  title: string | null
  creators: ZoteroCreator[]
  date: string | null
  publication_title: string | null
  publisher: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
  url: string | null
  abstract_note: string | null
  attachments: ZoteroAttachment[]
  collections: string[]
}

export function useZotero() {
  // State
  const zoteroPath = ref<string | null>(null)
  const collections = ref<ZoteroCollection[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const isConnected = computed(() => zoteroPath.value !== null)

  const topLevelCollections = computed(() =>
    collections.value.filter(c => c.parent_key === null)
  )

  /**
   * Detect and connect to local Zotero library
   */
  async function detectZotero(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const path = await invoke<string | null>('detect_zotero_path')
      zoteroPath.value = path

      if (path) {
        await loadCollections()
        return true
      }
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Set custom Zotero library path
   */
  async function setZoteroPath(path: string): Promise<boolean> {
    zoteroPath.value = path
    error.value = null

    try {
      await loadCollections()
      return true
    } catch (e) {
      error.value = String(e)
      zoteroPath.value = null
      return false
    }
  }

  /**
   * Load collections from Zotero
   */
  async function loadCollections(): Promise<void> {
    if (!zoteroPath.value) return

    isLoading.value = true
    error.value = null

    try {
      const result = await invoke<ZoteroCollection[]>('list_zotero_collections', {
        zoteroPath: zoteroPath.value,
      })
      collections.value = result
    } catch (e) {
      error.value = String(e)
      collections.value = []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get items in a collection
   */
  async function getCollectionItems(collectionKey: string): Promise<ZoteroItem[]> {
    if (!zoteroPath.value) return []

    isLoading.value = true
    error.value = null

    try {
      const items = await invoke<ZoteroItem[]>('get_zotero_collection_items', {
        zoteroPath: zoteroPath.value,
        collectionKey,
      })
      return items
    } catch (e) {
      error.value = String(e)
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get child collections of a parent
   */
  function getChildCollections(parentKey: string): ZoteroCollection[] {
    return collections.value.filter(c => c.parent_key === parentKey)
  }

  /**
   * Format creator name for display
   */
  function formatCreator(creator: ZoteroCreator): string {
    const parts: string[] = []
    if (creator.first_name) parts.push(creator.first_name)
    if (creator.last_name) parts.push(creator.last_name)
    return parts.join(' ') || 'Unknown'
  }

  /**
   * Format creators list for display
   */
  function formatCreators(creators: ZoteroCreator[]): string {
    const authors = creators.filter(c => c.creator_type === 'author')
    if (authors.length === 0) return ''
    if (authors.length === 1) return formatCreator(authors[0])
    if (authors.length === 2) return `${formatCreator(authors[0])} & ${formatCreator(authors[1])}`
    return `${formatCreator(authors[0])} et al.`
  }

  /**
   * Disconnect from Zotero
   */
  function disconnect(): void {
    zoteroPath.value = null
    collections.value = []
    error.value = null
  }

  return {
    // State
    zoteroPath,
    collections,
    isLoading,
    error,
    // Computed
    isConnected,
    topLevelCollections,
    // Actions
    detectZotero,
    setZoteroPath,
    loadCollections,
    getCollectionItems,
    getChildCollections,
    formatCreator,
    formatCreators,
    disconnect,
  }
}
