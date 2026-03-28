/**
 * Zotero Web API client
 *
 * Provides bidirectional sync with Zotero Cloud library.
 * Allows exporting citations created in Nodus to Zotero.
 */
import { zoteroStorage } from './storage'

// Zotero API types
export interface ZoteroApiCollection {
  key: string
  version: number
  data: {
    key: string
    name: string
    parentCollection: string | false
  }
}

export interface ZoteroApiItem {
  key?: string
  version?: number
  itemType: string
  title: string
  creators?: Array<{
    creatorType: string
    firstName?: string
    lastName?: string
    name?: string
  }>
  date?: string
  DOI?: string
  url?: string
  abstractNote?: string
  publicationTitle?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  collections?: string[]
  tags?: Array<{ tag: string }>
}

export interface ZoteroApiError {
  error: string
  message?: string
}

/**
 * Zotero Web API client
 */
export class ZoteroWebApi {
  private baseUrl = 'https://api.zotero.org'

  /**
   * Get configured User ID
   */
  get userId(): string {
    return zoteroStorage.getUserId()
  }

  /**
   * Get configured API Key
   */
  get apiKey(): string {
    return zoteroStorage.getApiKey()
  }

  /**
   * Check if API is configured
   */
  get isConfigured(): boolean {
    return zoteroStorage.isConfigured()
  }

  /**
   * Make authenticated request to Zotero API
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new Error('Zotero API not configured. Please add User ID and API Key in settings.')
    }

    const url = `${this.baseUrl}/users/${this.userId}${endpoint}`
    const headers: HeadersInit = {
      'Zotero-API-Key': this.apiKey,
      'Zotero-API-Version': '3',
    }

    if (body) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      let errorMessage = `Zotero API error: ${response.status}`
      try {
        const errorData = await response.json() as ZoteroApiError
        if (errorData.message) {
          errorMessage = errorData.message
        }
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage)
    }

    // Handle empty responses
    const text = await response.text()
    if (!text) return {} as T

    return JSON.parse(text) as T
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request<ZoteroApiCollection[]>('GET', '/collections?limit=1')
      return true
    } catch {
      return false
    }
  }

  /**
   * Get all collections
   */
  async getCollections(): Promise<ZoteroApiCollection[]> {
    return this.request<ZoteroApiCollection[]>('GET', '/collections')
  }

  /**
   * Get items in a collection
   */
  async getCollectionItems(collectionKey: string): Promise<ZoteroApiItem[]> {
    const response = await this.request<Array<{ key: string; data: ZoteroApiItem }>>(
      'GET',
      `/collections/${collectionKey}/items?itemType=-attachment&format=json`
    )
    // Zotero API v3 wraps item data in a 'data' property
    return response
      .filter(item => item.data && item.data.itemType !== 'attachment')
      .map(item => ({ ...item.data, key: item.key || item.data.key }))
  }

  /**
   * Get all library items (top-level, no attachments)
   */
  async getItems(): Promise<ZoteroApiItem[]> {
    const response = await this.request<Array<{ key: string; data: ZoteroApiItem }>>(
      'GET',
      '/items/top?itemType=-attachment&format=json'
    )
    // Zotero API v3 wraps item data in a 'data' property
    console.log('[ZoteroAPI] getItems response:', JSON.stringify(response.slice(0, 1), null, 2))
    return response
      .filter(item => item.data && item.data.itemType !== 'attachment')
      .map(item => ({ ...item.data, key: item.key || item.data.key }))
  }

  /**
   * Create a new item in Zotero
   */
  async createItem(item: ZoteroApiItem): Promise<string> {
    // Zotero API expects items in an array
    const response = await this.request<{
      successful: Record<string, { key: string }>
      failed: Record<string, { message: string }>
    }>('POST', '/items', [item])

    // Check for success
    const successKeys = Object.keys(response.successful || {})
    if (successKeys.length > 0) {
      return response.successful[successKeys[0]].key
    }

    // Check for failure
    const failedKeys = Object.keys(response.failed || {})
    if (failedKeys.length > 0) {
      throw new Error(response.failed[failedKeys[0]].message)
    }

    throw new Error('Unknown error creating item')
  }

  /**
   * Add item to collection
   */
  async addToCollection(itemKey: string, collectionKey: string): Promise<void> {
    // First get the item
    const item = await this.request<ZoteroApiItem>('GET', `/items/${itemKey}`)

    // Update collections
    const collections = item.collections || []
    if (!collections.includes(collectionKey)) {
      collections.push(collectionKey)
    }

    // Patch the item
    await this.request<void>('PATCH', `/items/${itemKey}`, {
      collections,
    })
  }

  /**
   * Create item from node content
   */
  createItemFromNode(
    title: string,
    content: string | null
  ): ZoteroApiItem {
    const item: ZoteroApiItem = {
      itemType: 'journalArticle', // Default type
      title,
    }

    if (!content) return item

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1]

      // Extract DOI
      const doiMatch = frontmatter.match(/^doi:\s*(.+)$/m)
      if (doiMatch) {
        item.DOI = doiMatch[1].trim()
      }

      // Extract type
      const typeMatch = frontmatter.match(/^type:\s*(.+)$/m)
      if (typeMatch) {
        const type = typeMatch[1].trim().toLowerCase()
        // Map common types
        if (type === 'book') item.itemType = 'book'
        else if (type === 'thesis' || type === 'dissertation') item.itemType = 'thesis'
        else if (type === 'conference' || type === 'inproceedings') item.itemType = 'conferencePaper'
        else if (type === 'webpage' || type === 'website') item.itemType = 'webpage'
      }

      // Extract journal
      const journalMatch = frontmatter.match(/^journal:\s*"?(.+?)"?\s*$/m)
      if (journalMatch) {
        item.publicationTitle = journalMatch[1]
      }

      // Extract date/year
      const dateMatch = frontmatter.match(/^date:\s*(.+)$/m)
      if (dateMatch) {
        item.date = dateMatch[1].trim()
      }
    }

    // Parse body for authors
    const authorsMatch = content.match(/\*\*Authors:\*\*\s*(.+)/)
    if (authorsMatch) {
      const authorString = authorsMatch[1]
      // Remove "et al." and split by comma
      const authorList = authorString
        .replace(/,?\s*et\s+al\.?$/i, '')
        .split(/,\s*/)

      item.creators = authorList.map(author => {
        const parts = author.trim().split(/\s+/)
        if (parts.length === 1) {
          return { creatorType: 'author', name: parts[0] }
        }
        return {
          creatorType: 'author',
          firstName: parts.slice(0, -1).join(' '),
          lastName: parts[parts.length - 1],
        }
      })
    }

    // Extract abstract
    const abstractMatch = content.match(/## Abstract\s*\n\s*\n([\s\S]*?)(?=\n##|\n---|\n*$)/)
    if (abstractMatch) {
      item.abstractNote = abstractMatch[1].trim()
    }

    return item
  }
}

// Singleton instance
export const zoteroApi = new ZoteroWebApi()
