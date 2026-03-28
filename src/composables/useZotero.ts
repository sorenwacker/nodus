/**
 * Zotero library integration composable
 *
 * Provides access to Zotero's local library for importing citations
 * and collections directly into Nodus.
 */
import { ref, computed } from 'vue'
import { invoke } from '../lib/tauri'
import type { CreateNodeInput } from '../types'

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

export interface ImportProgress {
  current: number
  total: number
  currentItem: string
}

export interface ImportResult {
  nodesCreated: number
  nodeIds: string[]
}

export function useZotero() {
  // State
  const zoteroPath = ref<string | null>(null)
  const collections = ref<ZoteroCollection[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const importProgress = ref<ImportProgress | null>(null)

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

  /**
   * Format Zotero item as markdown content with frontmatter
   * Stores DOI and Zotero key for citation graph lookup
   */
  function formatItemAsMarkdown(item: ZoteroItem): string {
    const frontmatter: string[] = ['---']
    if (item.doi) frontmatter.push(`doi: ${item.doi}`)
    frontmatter.push(`zotero_key: ${item.key}`)
    if (item.item_type) frontmatter.push(`type: ${item.item_type}`)
    if (item.date) frontmatter.push(`date: ${item.date}`)
    if (item.publication_title) frontmatter.push(`journal: "${item.publication_title}"`)
    frontmatter.push('---')

    const lines: string[] = [frontmatter.join('\n'), '']

    // Title
    if (item.title) {
      lines.push(`# ${item.title}`)
      lines.push('')
    }

    // Authors
    if (item.creators && item.creators.length > 0) {
      const authors = item.creators
        .filter(c => c.creator_type === 'author')
        .map(c => formatCreator(c))
        .join(', ')
      if (authors) {
        lines.push(`**Authors:** ${authors}`)
        lines.push('')
      }
    }

    // Publication info
    const pubInfo: string[] = []
    if (item.publication_title) pubInfo.push(item.publication_title)
    if (item.volume) pubInfo.push(`Vol. ${item.volume}`)
    if (item.issue) pubInfo.push(`Issue ${item.issue}`)
    if (item.pages) pubInfo.push(`pp. ${item.pages}`)
    if (item.date) pubInfo.push(`(${item.date})`)
    if (pubInfo.length > 0) {
      lines.push(`*${pubInfo.join(', ')}*`)
      lines.push('')
    }

    // DOI link
    if (item.doi) {
      lines.push(`**DOI:** [${item.doi}](https://doi.org/${item.doi})`)
      lines.push('')
    }

    // Abstract
    if (item.abstract_note) {
      lines.push('## Abstract')
      lines.push('')
      lines.push(item.abstract_note)
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Import a Zotero collection to canvas as nodes
   */
  async function importCollectionToCanvas(
    collectionKey: string,
    createNode: (data: CreateNodeInput) => Promise<{ id: string }>,
    options?: {
      workspaceId?: string
      startX?: number
      startY?: number
    }
  ): Promise<ImportResult> {
    const items = await getCollectionItems(collectionKey)
    if (items.length === 0) {
      return { nodesCreated: 0, nodeIds: [] }
    }

    const nodeIds: string[] = []
    const startX = options?.startX ?? 100
    const startY = options?.startY ?? 100
    const nodeWidth = 300
    const nodeHeight = 200
    const cols = Math.ceil(Math.sqrt(items.length))
    const padding = 40

    importProgress.value = { current: 0, total: items.length, currentItem: '' }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      importProgress.value = {
        current: i + 1,
        total: items.length,
        currentItem: item.title || 'Untitled',
      }

      const col = i % cols
      const row = Math.floor(i / cols)
      const x = startX + col * (nodeWidth + padding)
      const y = startY + row * (nodeHeight + padding)

      const markdown = formatItemAsMarkdown(item)

      try {
        const node = await createNode({
          title: item.title || 'Untitled',
          markdown_content: markdown,
          node_type: 'citation',
          canvas_x: x,
          canvas_y: y,
          width: nodeWidth,
          height: nodeHeight,
          workspace_id: options?.workspaceId,
        })
        nodeIds.push(node.id)
      } catch (e) {
        console.error(`Failed to create node for ${item.title}:`, e)
      }
    }

    importProgress.value = null
    return { nodesCreated: nodeIds.length, nodeIds }
  }

  return {
    // State
    zoteroPath,
    collections,
    isLoading,
    error,
    importProgress,
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
    formatItemAsMarkdown,
    disconnect,
    importCollectionToCanvas,
  }
}
