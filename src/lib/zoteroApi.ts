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

    // Validate userId is numeric (Zotero user IDs are always integers)
    if (!/^\d+$/.test(this.userId)) {
      throw new Error('Invalid Zotero User ID. User ID must be numeric.')
    }

    const url = `${this.baseUrl}/users/${encodeURIComponent(this.userId)}${endpoint}`
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
   * Fetch every page of a paginated list endpoint.
   *
   * The Zotero Web API returns at most 25 items per request unless a `limit`
   * is given (max 100), so a single request silently truncates any library or
   * collection with more than 25 items. `endpoint` must already contain a
   * query string (this appends `&limit=&start=`).
   */
  private async requestAllPages<T>(endpoint: string): Promise<T[]> {
    const all: T[] = []
    let start = 0
    const limit = 100

    for (;;) {
      const page = await this.request<T[]>(
        'GET',
        `${endpoint}&limit=${limit}&start=${start}`
      )
      all.push(...page)
      if (page.length < limit) break
      start += limit
    }

    return all
  }

  /**
   * Get items in a collection
   */
  async getCollectionItems(collectionKey: string): Promise<ZoteroApiItem[]> {
    const response = await this.requestAllPages<{ key: string; data: ZoteroApiItem }>(
      `/collections/${collectionKey}/items?itemType=-attachment&format=json`
    )
    return transformApiItems(response)
  }

  /**
   * Get all library items (top-level, no attachments)
   */
  async getItems(): Promise<ZoteroApiItem[]> {
    const response = await this.requestAllPages<{ key: string; data: ZoteroApiItem }>(
      '/items/top?itemType=-attachment&format=json'
    )
    return transformApiItems(response)
  }

  /**
   * Get all DOIs in the library (for duplicate checking)
   * Returns a Set of DOIs for fast lookup
   */
  async getAllDOIs(): Promise<Set<string>> {
    try {
      const dois = new Set<string>()
      const items = await this.requestAllPages<{ data: ZoteroApiItem }>(
        '/items/top?itemType=-attachment&format=json'
      )
      for (const item of items) {
        if (item.data?.DOI) {
          dois.add(item.data.DOI)
        }
      }
      console.log(`[Zotero API] Loaded ${dois.size} DOIs from library`)
      return dois
    } catch (e) {
      console.error('[Zotero API] Failed to fetch DOIs:', e)
      return new Set()
    }
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

}

/**
 * Transform API response items to ZoteroApiItem array
 * Filters out attachments and unwraps the data property
 */
function transformApiItems(
  response: Array<{ key: string; data: ZoteroApiItem }>
): ZoteroApiItem[] {
  return response
    .filter(item => item.data && item.data.itemType !== 'attachment')
    .map(item => ({ ...item.data, key: item.key || item.data.key }))
}

// Singleton instance
export const zoteroApi = new ZoteroWebApi()
