/**
 * Zotero library integration composable
 *
 * Provides access to Zotero Cloud library via Web API for importing
 * and exporting citations.
 */
import { ref, computed } from 'vue'
import { zoteroApi, type ZoteroApiItem } from '../lib/zoteroApi'
import { zoteroStorage } from '../lib/storage'
import type { CreateNodeInput } from '../types'

/**
 * Zotero collection (from Web API)
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
 * Zotero library item (internal format)
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

/**
 * Metadata extracted from node content
 */
export interface ExtractedMetadata {
  doi: string | null
  date: string | null
  journal: string | null
  creators: Array<{ firstName?: string; lastName?: string; creatorType: string }>
}

// Singleton state - shared across all useZotero() calls
const collections = ref<ZoteroCollection[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const importProgress = ref<ImportProgress | null>(null)

/**
 * Convert Web API item to internal ZoteroItem format
 */
function convertApiItem(apiItem: ZoteroApiItem): ZoteroItem {
  return {
    key: apiItem.key || '',
    item_type: apiItem.itemType,
    title: apiItem.title || null,
    creators: (apiItem.creators || []).map(c => ({
      first_name: c.firstName || null,
      last_name: c.lastName || c.name || null,
      creator_type: c.creatorType,
    })),
    date: apiItem.date || null,
    publication_title: apiItem.publicationTitle || null,
    publisher: apiItem.publisher || null,
    volume: apiItem.volume || null,
    issue: apiItem.issue || null,
    pages: apiItem.pages || null,
    doi: apiItem.DOI || null,
    url: apiItem.url || null,
    abstract_note: apiItem.abstractNote || null,
    collections: apiItem.collections || [],
  }
}

export function useZotero() {
  // State is defined at module level (singleton)

  // Computed
  const isConnected = computed(() => zoteroApi.isConfigured)

  const topLevelCollections = computed(() =>
    collections.value.filter(c => c.parent_key === null)
  )

  /**
   * Load collections from Zotero via Web API
   */
  async function loadCollections(): Promise<void> {
    if (!zoteroApi.isConfigured) return

    isLoading.value = true
    error.value = null

    try {
      const apiCollections = await zoteroApi.getCollections()
      collections.value = apiCollections.map(c => ({
        key: c.key,
        name: c.data.name,
        parent_key: c.data.parentCollection === false ? null : c.data.parentCollection,
        item_count: 0, // Web API doesn't return item count directly
      }))
    } catch (e) {
      error.value = String(e)
      collections.value = []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get items in a collection via Web API
   */
  async function getCollectionItems(collectionKey: string): Promise<ZoteroItem[]> {
    if (!zoteroApi.isConfigured) return []

    isLoading.value = true
    error.value = null

    try {
      const apiItems = await zoteroApi.getCollectionItems(collectionKey)
      return apiItems.map(convertApiItem)
    } catch (e) {
      error.value = String(e)
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get ALL items from library via Web API
   */
  async function getAllItems(): Promise<ZoteroItem[]> {
    if (!zoteroApi.isConfigured) return []

    isLoading.value = true
    error.value = null

    try {
      const apiItems = await zoteroApi.getItems()
      return apiItems.map(convertApiItem)
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
   * Import Zotero items to canvas as nodes (shared implementation)
   */
  async function importItemsToCanvas(
    items: ZoteroItem[],
    createNode: (data: CreateNodeInput) => Promise<{ id: string }>,
    options?: {
      workspaceId?: string
      startX?: number
      startY?: number
    }
  ): Promise<ImportResult> {
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
    return importItemsToCanvas(items, createNode, options)
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
    return importItemsToCanvas(items, createNode, options)
  }

  /**
   * Extract metadata from node content
   */
  function extractMetadata(nodeContent: string): ExtractedMetadata {
    // Limit input size for regex safety (first 10KB should contain all metadata)
    const MAX_CONTENT_SIZE = 10 * 1024
    const content = nodeContent.length > MAX_CONTENT_SIZE
      ? nodeContent.slice(0, MAX_CONTENT_SIZE)
      : nodeContent

    let doi: string | null = null
    let date: string | null = null
    let journal: string | null = null

    // Extract from frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
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
      const yearMatch = content.match(/^\*(\d{4})\*$/m) ||
                        content.match(/\*\((\d{4})\)\*/) ||
                        content.match(/\((\d{4})\)/)
      if (yearMatch) date = yearMatch[1]
    }

    // Extract journal/venue from publication info line
    if (!journal) {
      const pubInfoMatch = content.match(/^\*([^*]+)\*$/m)
      if (pubInfoMatch) {
        const pubInfo = pubInfoMatch[1]
        const parts = pubInfo.split(',')
        if (parts.length > 0 && !parts[0].match(/^\d{4}$/)) {
          journal = parts[0].trim()
        }
      }
    }

    // Extract authors from body
    const authorsMatch = content.match(/\*\*Authors:\*\*\s*(.+)/i)
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
   * Build Zotero item data from node title and content
   */
  function buildZoteroItemData(title: string, content: string) {
    const { doi, date, journal, creators } = extractMetadata(content)
    return {
      itemData: {
        itemType: 'journalArticle' as const,
        title,
        creators: creators.map(c => ({
          creatorType: c.creatorType,
          firstName: c.firstName,
          lastName: c.lastName,
        })),
        date: date || undefined,
        publicationTitle: journal || undefined,
        DOI: doi || undefined,
        url: doi ? `https://doi.org/${doi}` : undefined,
      },
      doi,
    }
  }

  // Rate limiting constants
  const DELAY_MS = 200 // 200ms between requests (5 per second max)
  const BACKOFF_BASE_MS = 2000 // Base delay for exponential backoff
  const MAX_RETRIES = 3

  /**
   * Retry an async operation with exponential backoff
   */
  async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    onRetry?: (waitTime: number, retriesLeft: number) => void
  ): Promise<T> {
    let retries = MAX_RETRIES
    while (retries > 0) {
      try {
        return await operation()
      } catch (e) {
        const errMsg = String(e)
        if (errMsg.includes('429') && retries > 1) {
          const waitTime = (MAX_RETRIES + 1 - retries) * BACKOFF_BASE_MS
          onRetry?.(waitTime, retries - 1)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          retries--
        } else {
          throw e
        }
      }
    }
    throw new Error('Max retries exceeded')
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

    const { itemData, doi } = buildZoteroItemData(nodeTitle, nodeContent)

    // Check for duplicate by DOI (using pre-fetched set)
    if (doi && existingDOIs?.has(doi)) {
      return 'duplicate'
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

    // Process sequentially with delay to avoid rate limiting
    for (let i = 0; i < nodesToAdd.length; i++) {
      // Check for cancellation
      if (addToZoteroCancelled.value) {
        break
      }

      const node = nodesToAdd[i]
      addToZoteroProgress.value = {
        current: i + 1,
        total: nodesToAdd.length,
        currentItem: node.title,
      }

      const { itemData } = buildZoteroItemData(node.title, node.markdown_content)

      try {
        await retryWithBackoff(
          () => zoteroApi.createItem(itemData),
          (waitTime) => {
            addToZoteroProgress.value = {
              current: i + 1,
              total: nodesToAdd.length,
              currentItem: `Rate limited, waiting ${waitTime / 1000}s...`,
            }
          }
        )
        added++
      } catch (e) {
        errors.push(`${node.title}: ${String(e)}`)
      }

      // Small delay between requests to avoid rate limiting
      if (i < nodesToAdd.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS))
      }
    }

    addToZoteroProgress.value = null
    return { added, errors, skipped, duplicates, cancelled: addToZoteroCancelled.value }
  }

  // Computed for API configuration (uses zoteroStorage)
  const isApiConfigured = computed(() => zoteroStorage.isConfigured())

  return {
    // State
    collections,
    isLoading,
    error,
    importProgress,
    // Computed
    isConnected,
    topLevelCollections,
    isApiConfigured,
    // Actions
    loadCollections,
    getCollectionItems,
    getChildCollections,
    formatCreator,
    formatCreators,
    formatItemAsMarkdown,
    importCollectionToCanvas,
    getAllItems,
    importAllToCanvas,
    addToZotero,
    addNodesToZotero,
    addToZoteroProgress,
    cancelAddToZotero,
  }
}
