/**
 * Zotero library integration composable
 *
 * Provides access to Zotero's local library for importing citations
 * and collections directly into Nodus.
 */
import { ref, computed } from 'vue'
import { invoke } from '../lib/tauri'
import { zoteroApi } from '../lib/zoteroApi'
import { zoteroStorage } from '../lib/storage'
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

// Singleton state - shared across all useZotero() calls
const ZOTERO_PATH_KEY = 'nodus_zotero_path'

const storedPath = typeof localStorage !== 'undefined' ? localStorage.getItem(ZOTERO_PATH_KEY) : null

console.log('[Zotero] Initializing with stored path:', storedPath)
console.log('[Zotero] API configured:', zoteroStorage.isConfigured())

const zoteroPath = ref<string | null>(storedPath)
const collections = ref<ZoteroCollection[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const importProgress = ref<ImportProgress | null>(null)

// Auto-load collections if we have a stored path
if (storedPath) {
  // Defer to avoid blocking - will load collections in background
  setTimeout(async () => {
    try {
      const { invoke } = await import('../lib/tauri')
      const result = await invoke<ZoteroCollection[]>('list_zotero_collections', {
        zoteroPath: storedPath,
      })
      collections.value = result
    } catch (e) {
      console.warn('Failed to auto-load Zotero collections:', e)
      // Clear invalid path
      localStorage.removeItem(ZOTERO_PATH_KEY)
      zoteroPath.value = null
    }
  }, 100)
}

export function useZotero() {
  // State is defined at module level (singleton)

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
        localStorage.setItem(ZOTERO_PATH_KEY, path)
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
      localStorage.setItem(ZOTERO_PATH_KEY, path)
      return true
    } catch (e) {
      error.value = String(e)
      zoteroPath.value = null
      localStorage.removeItem(ZOTERO_PATH_KEY)
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
   * Get ALL items from library (not limited to a collection)
   */
  async function getAllItems(): Promise<ZoteroItem[]> {
    if (!zoteroPath.value) return []

    isLoading.value = true
    error.value = null

    try {
      const items = await invoke<ZoteroItem[]>('get_zotero_all_items', {
        zoteroPath: zoteroPath.value,
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
    localStorage.removeItem(ZOTERO_PATH_KEY)
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

  /**
   * Import ALL items from Zotero library to canvas
   */
  async function importAllToCanvas(
    createNode: (data: CreateNodeInput) => Promise<{ id: string }>,
    options?: {
      workspaceId?: string
      startX?: number
      startY?: number
    }
  ): Promise<ImportResult> {
    const items = await getAllItems()
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

  /**
   * Extract metadata from node content
   */
  function extractMetadata(nodeContent: string): {
    doi: string | null
    date: string | null
    journal: string | null
    creators: Array<{ firstName?: string; lastName?: string; creatorType: string }>
  } {
    let doi: string | null = null
    let date: string | null = null
    let journal: string | null = null

    // Extract from frontmatter
    const frontmatterMatch = nodeContent.match(/^---\s*\n([\s\S]*?)\n---/)
    if (frontmatterMatch) {
      const fm = frontmatterMatch[1]
      const doiMatch = fm.match(/^doi:\s*(.+)$/m)
      if (doiMatch) doi = doiMatch[1].trim()
      const dateMatch = fm.match(/^date:\s*(.+)$/m)
      if (dateMatch) date = dateMatch[1].trim()
      const journalMatch = fm.match(/^journal:\s*"?([^"]+)"?$/m)
      if (journalMatch) journal = journalMatch[1].trim()
    }

    // Extract year from body if date not in frontmatter
    if (!date) {
      const yearMatch = nodeContent.match(/^\*(\d{4})\*$/m) ||
                        nodeContent.match(/\*\((\d{4})\)\*/) ||
                        nodeContent.match(/\((\d{4})\)/)
      if (yearMatch) date = yearMatch[1]
    }

    // Extract journal/venue from publication info line
    if (!journal) {
      const pubInfoMatch = nodeContent.match(/^\*([^*]+)\*$/m)
      if (pubInfoMatch) {
        const pubInfo = pubInfoMatch[1]
        const parts = pubInfo.split(',')
        if (parts.length > 0 && !parts[0].match(/^\d{4}$/)) {
          journal = parts[0].trim()
        }
      }
    }

    // Extract authors from body
    const authorsMatch = nodeContent.match(/\*\*Authors:\*\*\s*(.+)/i)
    const creators: Array<{ firstName?: string; lastName?: string; creatorType: string }> = []
    if (authorsMatch) {
      const authorStr = authorsMatch[1].replace(/, et al\.?$/i, '')
      const authorNames = authorStr.split(/,\s*/)
      for (const name of authorNames) {
        const parts = name.trim().split(/\s+/)
        if (parts.length >= 2) {
          creators.push({
            firstName: parts.slice(0, -1).join(' '),
            lastName: parts[parts.length - 1],
            creatorType: 'author',
          })
        } else if (parts.length === 1) {
          creators.push({
            lastName: parts[0],
            creatorType: 'author',
          })
        }
      }
    }

    return { doi, date, journal, creators }
  }

  /**
   * Add a paper to Zotero library via Web API
   * Extracts metadata from node content and creates a new Zotero item
   * Returns: item key if added, 'duplicate' if already exists, null on error
   */
  async function addToZotero(nodeContent: string, nodeTitle: string): Promise<string | 'duplicate' | null> {
    // Use Web API (recommended - safer and works while Zotero is open)
    if (zoteroApi.isConfigured) {
      return addToZoteroViaApi(nodeContent, nodeTitle)
    }

    // No API configured
    error.value = 'Zotero API not configured. Go to Settings → Zotero to enter your User ID and API Key.'
    return null
  }

  /**
   * Add a paper to Zotero via Web API
   * @param existingDOIs - Set of DOIs already in Zotero (for fast duplicate check)
   * Returns: item key if added, 'duplicate' if already exists, null on error
   */
  async function addToZoteroViaApi(
    nodeContent: string,
    nodeTitle: string,
    existingDOIs?: Set<string>
  ): Promise<string | 'duplicate' | null> {
    if (!zoteroApi.isConfigured) {
      error.value = 'Zotero API not configured. Go to Settings → Zotero to configure.'
      return null
    }

    const { doi, date, journal, creators } = extractMetadata(nodeContent)

    // Check for duplicate by DOI (using pre-fetched set)
    if (doi && existingDOIs?.has(doi)) {
      return 'duplicate'
    }

    const itemData = {
      itemType: 'journalArticle' as const,
      title: nodeTitle,
      creators: creators.map(c => ({
        creatorType: c.creatorType,
        firstName: c.firstName,
        lastName: c.lastName,
      })),
      date: date || undefined,
      publicationTitle: journal || undefined,
      DOI: doi || undefined,
      url: doi ? `https://doi.org/${doi}` : undefined,
    }

    try {
      const itemKey = await zoteroApi.createItem(itemData)
      // Add to existing DOIs set so subsequent items in batch are checked
      if (doi && existingDOIs) {
        existingDOIs.add(doi)
      }
      return itemKey
    } catch (e) {
      console.error('[Zotero API] Failed to add item:', e)
      error.value = String(e)
      return null
    }
  }

  // Progress state for bulk operations
  const addToZoteroProgress = ref<{ current: number; total: number; currentItem: string } | null>(null)
  const addToZoteroCancelled = ref(false)

  /**
   * Cancel the current add to Zotero operation
   */
  function cancelAddToZotero() {
    addToZoteroCancelled.value = true
  }

  /**
   * Add multiple papers to Zotero (parallel with batching)
   */
  async function addNodesToZotero(
    nodes: Array<{ title: string; markdown_content: string | null }>
  ): Promise<{ added: number; errors: string[]; skipped: number; duplicates: number; cancelled: boolean }> {
    const errors: string[] = []
    let added = 0
    let skipped = 0
    let duplicates = 0
    addToZoteroCancelled.value = false

    console.log(`[Zotero] Adding ${nodes.length} nodes to Zotero`)

    // Fetch all existing DOIs once (for fast duplicate checking)
    addToZoteroProgress.value = { current: 0, total: nodes.length, currentItem: 'Loading existing DOIs...' }
    const existingDOIs = await zoteroApi.getAllDOIs()

    if (addToZoteroCancelled.value) {
      addToZoteroProgress.value = null
      return { added, errors, skipped, duplicates, cancelled: true }
    }

    // Filter nodes with content and check duplicates locally
    const nodesToAdd: Array<{ title: string; markdown_content: string }> = []
    for (const node of nodes) {
      if (!node.markdown_content) {
        skipped++
        continue
      }
      // Check duplicate by DOI before adding to queue
      const { doi } = extractMetadata(node.markdown_content)
      if (doi && existingDOIs.has(doi)) {
        duplicates++
        continue
      }
      // Add DOI to set to prevent duplicates within batch
      if (doi) existingDOIs.add(doi)
      nodesToAdd.push({ title: node.title, markdown_content: node.markdown_content })
    }

    console.log(`[Zotero] ${nodesToAdd.length} to add, ${duplicates} duplicates, ${skipped} skipped`)

    // Process sequentially with delay to avoid rate limiting
    const DELAY_MS = 200 // 200ms between requests (5 per second max)

    for (let i = 0; i < nodesToAdd.length; i++) {
      // Check for cancellation
      if (addToZoteroCancelled.value) {
        console.log(`[Zotero] Cancelled after ${added} items`)
        break
      }

      const node = nodesToAdd[i]
      addToZoteroProgress.value = {
        current: i + 1,
        total: nodesToAdd.length,
        currentItem: node.title,
      }

      const { doi, date, journal, creators } = extractMetadata(node.markdown_content)
      const itemData = {
        itemType: 'journalArticle' as const,
        title: node.title,
        creators: creators.map(c => ({
          creatorType: c.creatorType,
          firstName: c.firstName,
          lastName: c.lastName,
        })),
        date: date || undefined,
        publicationTitle: journal || undefined,
        DOI: doi || undefined,
        url: doi ? `https://doi.org/${doi}` : undefined,
      }

      // Retry logic for rate limiting
      let retries = 3
      let success = false
      while (retries > 0 && !success) {
        try {
          await zoteroApi.createItem(itemData)
          added++
          success = true
        } catch (e) {
          const errMsg = String(e)
          if (errMsg.includes('429') && retries > 1) {
            // Rate limited - wait and retry
            const waitTime = (4 - retries) * 2000 // 2s, 4s, 6s
            addToZoteroProgress.value = {
              current: i + 1,
              total: nodesToAdd.length,
              currentItem: `Rate limited, waiting ${waitTime / 1000}s...`,
            }
            await new Promise(resolve => setTimeout(resolve, waitTime))
            retries--
          } else {
            errors.push(`${node.title}: ${errMsg}`)
            retries = 0
          }
        }
      }

      // Small delay between requests to avoid rate limiting
      if (i < nodesToAdd.length - 1 && success) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS))
      }
    }

    addToZoteroProgress.value = null
    console.log(`[Zotero] Done: ${added} added, ${duplicates} duplicates, ${skipped} skipped, ${errors.length} errors`)
    return { added, errors, skipped, duplicates, cancelled: addToZoteroCancelled.value }
  }

  // Computed for API configuration (uses zoteroStorage)
  const isApiConfigured = computed(() => zoteroStorage.isConfigured())

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
    isApiConfigured,
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
    getAllItems,
    importAllToCanvas,
    addToZotero,
    addNodesToZotero,
    addToZoteroProgress,
    cancelAddToZotero,
  }
}
