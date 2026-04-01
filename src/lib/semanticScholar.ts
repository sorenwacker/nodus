/**
 * Semantic Scholar API integration
 *
 * Provides citation graph data (references and citations) for academic papers.
 * Rate limited to 100 requests per 5 minutes (3 second minimum between requests).
 */

// API response types
export interface SemanticScholarPaper {
  paperId: string
  externalIds?: {
    DOI?: string
    ArXiv?: string
    PubMed?: string
  }
  title: string
  authors?: Array<{ authorId: string; name: string }>
  year?: number
  abstract?: string
  venue?: string
  citationCount?: number
  referenceCount?: number
}

export interface SemanticScholarReference {
  paperId: string
  title: string
  authors?: Array<{ authorId: string; name: string }>
  year?: number
  externalIds?: {
    DOI?: string
  }
}

// Cache entry type
interface CacheEntry<T> {
  data: T
  timestamp: number
}

// Cache duration: 24 hours
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000

// Rate limiting: minimum 10 seconds between requests (conservative for API limits)
// Semantic Scholar free tier: 100 requests/5 min = 1 per 3s, but burst limits apply
const MIN_REQUEST_INTERVAL_MS = 10000

/**
 * Semantic Scholar API provider
 * Handles rate limiting, caching, and API interactions
 */
export class SemanticScholarProvider {
  private lastRequestTime = 0
  private requestQueue: Array<() => void> = []
  private isProcessingQueue = false
  private cachePrefix = 'nodus_ss_cache_'

  /**
   * Get paper metadata by DOI
   */
  async getPaperByDOI(doi: string): Promise<SemanticScholarPaper | null> {
    const cacheKey = `${this.cachePrefix}doi_${doi}`
    const cached = this.getFromCache<SemanticScholarPaper>(cacheKey)
    if (cached) return cached

    try {
      const response = await this.rateLimitedFetch(
        `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=paperId,externalIds,title,authors,year,abstract,venue,citationCount,referenceCount`
      )

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Semantic Scholar API error: ${response.status}`)
      }

      const paper = await response.json() as SemanticScholarPaper
      this.setCache(cacheKey, paper)
      return paper
    } catch (error) {
      console.error(`Failed to fetch paper by DOI ${doi}:`, error)
      return null
    }
  }

  /**
   * Get paper metadata by Semantic Scholar paper ID
   */
  async getPaperById(paperId: string): Promise<SemanticScholarPaper | null> {
    const cacheKey = `${this.cachePrefix}paper_${paperId}`
    const cached = this.getFromCache<SemanticScholarPaper>(cacheKey)
    if (cached) return cached

    try {
      const response = await this.rateLimitedFetch(
        `https://api.semanticscholar.org/graph/v1/paper/${paperId}?fields=paperId,externalIds,title,authors,year,abstract,venue,citationCount,referenceCount`
      )

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Semantic Scholar API error: ${response.status}`)
      }

      const paper = await response.json() as SemanticScholarPaper
      this.setCache(cacheKey, paper)
      return paper
    } catch (error) {
      console.error(`Failed to fetch paper by ID ${paperId}:`, error)
      return null
    }
  }

  /**
   * Get references (papers this paper cites)
   */
  async getReferences(paperId: string, limit = 100): Promise<SemanticScholarReference[]> {
    const cacheKey = `${this.cachePrefix}refs_${paperId}`
    const cached = this.getFromCache<SemanticScholarReference[]>(cacheKey)
    if (cached) return cached

    try {
      const response = await this.rateLimitedFetch(
        `https://api.semanticscholar.org/graph/v1/paper/${paperId}/references?fields=paperId,title,authors,year,externalIds&limit=${limit}`
      )

      if (!response.ok) {
        if (response.status === 404) return []
        throw new Error(`Semantic Scholar API error: ${response.status}`)
      }

      const data = await response.json() as { data: Array<{ citedPaper: SemanticScholarReference }> | null }
      if (!data.data || !Array.isArray(data.data)) {
        return []
      }
      const references = data.data
        .map(r => r.citedPaper)
        .filter(r => r && r.paperId)

      this.setCache(cacheKey, references)
      return references
    } catch (error) {
      console.error(`Failed to fetch references for ${paperId}:`, error)
      return []
    }
  }

  /**
   * Get citations (papers that cite this paper)
   * Fetches all citations using pagination
   */
  async getCitations(paperId: string): Promise<SemanticScholarReference[]> {
    const cacheKey = `${this.cachePrefix}cites_${paperId}`
    const cached = this.getFromCache<SemanticScholarReference[]>(cacheKey)
    if (cached) return cached

    const allCitations: SemanticScholarReference[] = []
    const pageSize = 500 // Max allowed by API
    let offset = 0
    let hasMore = true

    try {
      while (hasMore) {
        const response = await this.rateLimitedFetch(
          `https://api.semanticscholar.org/graph/v1/paper/${paperId}/citations?fields=paperId,title,authors,year,externalIds&limit=${pageSize}&offset=${offset}`
        )

        if (!response.ok) {
          if (response.status === 404) {
            hasMore = false
            continue
          }
          throw new Error(`Semantic Scholar API error: ${response.status}`)
        }

        const data = await response.json() as { data: Array<{ citingPaper: SemanticScholarReference }> | null }
        if (!data.data || !Array.isArray(data.data)) {
          hasMore = false
          continue
        }
        const citations = data.data
          .map(c => c.citingPaper)
          .filter(c => c && c.paperId)

        allCitations.push(...citations)

        // If we got fewer than pageSize, we've reached the end
        if (data.data.length < pageSize) {
          hasMore = false
        } else {
          offset += pageSize
        }
      }

      this.setCache(cacheKey, allCitations)
      return allCitations
    } catch (error) {
      console.error(`Failed to fetch citations for ${paperId}:`, error)
      return allCitations // Return what we got so far
    }
  }

  /**
   * Rate-limited fetch that queues requests to respect API limits
   * Includes retry with exponential backoff for 429 errors
   */
  private rateLimitedFetch(url: string, retryCount = 0): Promise<Response> {
    const maxRetries = 3
    const baseBackoff = 30000 // 30 seconds base backoff for 429

    return new Promise((resolve, reject) => {
      const executeRequest = async () => {
        const now = Date.now()
        const timeSinceLastRequest = now - this.lastRequestTime
        const waitTime = Math.max(0, MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest)

        if (waitTime > 0) {
          await this.sleep(waitTime)
        }

        this.lastRequestTime = Date.now()

        try {
          const response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
            },
          })

          // Handle 429 rate limit with retry
          if (response.status === 429 && retryCount < maxRetries) {
            const backoff = baseBackoff * Math.pow(2, retryCount)
            console.warn(`[SemanticScholar] Rate limited (429), waiting ${backoff / 1000}s before retry ${retryCount + 1}/${maxRetries}...`)
            this.processQueue()
            await this.sleep(backoff)
            // Retry the request
            const retryResponse = await this.rateLimitedFetch(url, retryCount + 1)
            resolve(retryResponse)
            return
          }

          resolve(response)
        } catch (error) {
          // Network errors - typically CORS issues from 429 responses
          // When rate limited, the API returns 429 without CORS headers
          if (retryCount < maxRetries) {
            const backoff = baseBackoff * Math.pow(2, retryCount)
            console.warn(`[SemanticScholar] Rate limit hit (CORS blocked), waiting ${backoff / 1000}s before retry ${retryCount + 1}/${maxRetries}...`)
            this.processQueue()
            await this.sleep(backoff)
            try {
              const retryResponse = await this.rateLimitedFetch(url, retryCount + 1)
              resolve(retryResponse)
              return
            } catch (retryError) {
              reject(retryError)
              return
            }
          }
          console.error(`[SemanticScholar] Request failed after ${maxRetries} retries:`, error)
          reject(error)
        }

        this.processQueue()
      }

      this.requestQueue.push(executeRequest)

      if (!this.isProcessingQueue) {
        this.processQueue()
      }
    })
  }

  /**
   * Process the request queue
   */
  private processQueue() {
    if (this.requestQueue.length === 0) {
      this.isProcessingQueue = false
      return
    }

    this.isProcessingQueue = true
    const nextRequest = this.requestQueue.shift()
    if (nextRequest) {
      nextRequest()
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get item from localStorage cache
   */
  private getFromCache<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key)
      if (!item) return null

      const entry = JSON.parse(item) as CacheEntry<T>
      const now = Date.now()

      if (now - entry.timestamp > CACHE_DURATION_MS) {
        localStorage.removeItem(key)
        return null
      }

      return entry.data
    } catch {
      return null
    }
  }

  /**
   * Set item in localStorage cache
   * Implements cache eviction when quota is exceeded
   */
  private setCache<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    }
    const json = JSON.stringify(entry)

    // Try to set directly first
    try {
      localStorage.setItem(key, json)
      return
    } catch {
      // Quota exceeded - try to free up space
    }

    // Evict oldest cache entries and retry
    try {
      this.evictOldestCacheEntries(5)
      localStorage.setItem(key, json)
    } catch {
      // Still failing - clear all cache and retry
      try {
        this.clearCache()
        localStorage.setItem(key, json)
      } catch (error) {
        // localStorage unavailable or entry too large
        console.warn('Cache unavailable:', error)
      }
    }
  }

  /**
   * Evict oldest cache entries to free up space
   */
  private evictOldestCacheEntries(count: number): void {
    const entries: Array<{ key: string; timestamp: number }> = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(this.cachePrefix)) {
        try {
          const item = localStorage.getItem(key)
          if (item) {
            const entry = JSON.parse(item) as CacheEntry<unknown>
            entries.push({ key, timestamp: entry.timestamp })
          }
        } catch {
          // Invalid entry - mark for removal with old timestamp
          entries.push({ key, timestamp: 0 })
        }
      }
    }

    // Sort by timestamp (oldest first) and remove
    entries.sort((a, b) => a.timestamp - b.timestamp)
    const toRemove = entries.slice(0, count)
    for (const entry of toRemove) {
      localStorage.removeItem(entry.key)
    }

    console.log(`[SemanticScholar] Evicted ${toRemove.length} old cache entries`)
  }

  /**
   * Get cached paper by DOI (no API call)
   */
  getCachedPaperByDOI(doi: string): SemanticScholarPaper | null {
    const cacheKey = `${this.cachePrefix}doi_${doi}`
    return this.getFromCache<SemanticScholarPaper>(cacheKey)
  }

  /**
   * Get cached paper by ID (no API call)
   */
  getCachedPaperById(paperId: string): SemanticScholarPaper | null {
    const cacheKey = `${this.cachePrefix}paper_${paperId}`
    return this.getFromCache<SemanticScholarPaper>(cacheKey)
  }

  /**
   * Get cached references (no API call)
   */
  getCachedReferences(paperId: string): SemanticScholarReference[] | null {
    const cacheKey = `${this.cachePrefix}refs_${paperId}`
    return this.getFromCache<SemanticScholarReference[]>(cacheKey)
  }

  /**
   * Get cached citations (no API call)
   */
  getCachedCitations(paperId: string): SemanticScholarReference[] | null {
    const cacheKey = `${this.cachePrefix}cites_${paperId}`
    return this.getFromCache<SemanticScholarReference[]>(cacheKey)
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(this.cachePrefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  }
}

// Singleton instance
export const semanticScholar = new SemanticScholarProvider()
