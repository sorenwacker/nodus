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

// Rate limiting: minimum 3 seconds between requests
const MIN_REQUEST_INTERVAL_MS = 3000

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

      const data = await response.json() as { data: Array<{ citedPaper: SemanticScholarReference }> }
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
   */
  async getCitations(paperId: string, limit = 100): Promise<SemanticScholarReference[]> {
    const cacheKey = `${this.cachePrefix}cites_${paperId}`
    const cached = this.getFromCache<SemanticScholarReference[]>(cacheKey)
    if (cached) return cached

    try {
      const response = await this.rateLimitedFetch(
        `https://api.semanticscholar.org/graph/v1/paper/${paperId}/citations?fields=paperId,title,authors,year,externalIds&limit=${limit}`
      )

      if (!response.ok) {
        if (response.status === 404) return []
        throw new Error(`Semantic Scholar API error: ${response.status}`)
      }

      const data = await response.json() as { data: Array<{ citingPaper: SemanticScholarReference }> }
      const citations = data.data
        .map(c => c.citingPaper)
        .filter(c => c && c.paperId)

      this.setCache(cacheKey, citations)
      return citations
    } catch (error) {
      console.error(`Failed to fetch citations for ${paperId}:`, error)
      return []
    }
  }

  /**
   * Rate-limited fetch that queues requests to respect API limits
   */
  private rateLimitedFetch(url: string): Promise<Response> {
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
          resolve(response)
        } catch (error) {
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
   */
  private setCache<T>(key: string, data: T): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      }
      localStorage.setItem(key, JSON.stringify(entry))
    } catch (error) {
      // localStorage might be full or unavailable
      console.warn('Failed to cache Semantic Scholar data:', error)
    }
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
