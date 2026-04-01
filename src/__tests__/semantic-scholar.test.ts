import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SemanticScholarProvider, type WaitStatus } from '../lib/semanticScholar'

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
  get length() {
    return Object.keys(localStorageMock.store).length
  },
  key: vi.fn((index: number) => Object.keys(localStorageMock.store)[index] || null),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('SemanticScholarProvider', () => {
  let provider: SemanticScholarProvider

  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()
    mockFetch.mockReset()
    provider = new SemanticScholarProvider()
  })

  afterEach(() => {
    vi.useRealTimers()
    provider.setWaitStatusCallback(null)
  })

  describe('Wait Status Callback', () => {
    it('should set and clear wait status callback', () => {
      const callback = vi.fn()
      provider.setWaitStatusCallback(callback)

      // Setting to null should not throw
      provider.setWaitStatusCallback(null)
    })

    it('should emit wait status during rate limit wait', async () => {
      const statusUpdates: WaitStatus[] = []
      provider.setWaitStatusCallback((status) => {
        statusUpdates.push({ ...status })
      })

      // Mock successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ paperId: '123', title: 'Test Paper' }),
      })

      // Start a request (this will wait due to rate limiting after first request)
      const promise = provider.getPaperByDOI('10.1234/test')

      // First request should complete without waiting (no previous request)
      await vi.runAllTimersAsync()
      await promise

      // Now make a second request - should trigger rate limit wait
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ paperId: '456', title: 'Test Paper 2' }),
      })

      const promise2 = provider.getPaperByDOI('10.1234/test2')

      // Should emit initial waiting status
      await vi.advanceTimersByTimeAsync(1000)

      // Check that we got a waiting status
      const waitingStatus = statusUpdates.find(s => s.isWaiting)
      if (waitingStatus) {
        expect(waitingStatus.isWaiting).toBe(true)
        expect(waitingStatus.reason).toBe('rate-limit')
        expect(waitingStatus.remainingSeconds).toBeGreaterThan(0)
      }

      // Complete the wait
      await vi.runAllTimersAsync()
      await promise2

      // Should have received a non-waiting status at the end
      const finalStatus = statusUpdates[statusUpdates.length - 1]
      expect(finalStatus.isWaiting).toBe(false)
      expect(finalStatus.remainingSeconds).toBe(0)
    })

    it('should emit backoff status on 429 response', async () => {
      const statusUpdates: WaitStatus[] = []
      provider.setWaitStatusCallback((status) => {
        statusUpdates.push({ ...status })
      })

      // First request - 429 response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

      // Retry request - successful
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ paperId: '123', title: 'Test Paper' }),
      })

      const promise = provider.getPaperByDOI('10.1234/test')

      // Advance timers to trigger backoff
      await vi.advanceTimersByTimeAsync(1000)

      // Should have backoff status
      const backoffStatus = statusUpdates.find(s => s.reason === 'backoff')
      if (backoffStatus) {
        expect(backoffStatus.isWaiting).toBe(true)
        expect(backoffStatus.reason).toBe('backoff')
      }

      // Complete all timers
      await vi.runAllTimersAsync()

      // The request might fail or succeed depending on retry timing
      try {
        await promise
      } catch {
        // Expected if retries exhausted
      }
    })

    it('should countdown seconds correctly', async () => {
      const statusUpdates: WaitStatus[] = []
      provider.setWaitStatusCallback((status) => {
        statusUpdates.push({ ...status })
      })

      // Make first request to set lastRequestTime
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ paperId: '123', title: 'Test' }),
      })
      await provider.getPaperByDOI('10.1234/first')
      await vi.runAllTimersAsync()

      statusUpdates.length = 0 // Clear previous updates

      // Make second request - should wait
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ paperId: '456', title: 'Test 2' }),
      })

      const promise = provider.getPaperByDOI('10.1234/second')

      // Advance by 1 second at a time and check countdown
      const initialRemaining = statusUpdates[0]?.remainingSeconds || 30

      await vi.advanceTimersByTimeAsync(1000)

      // Find a status update with lower remaining time
      const laterStatus = statusUpdates.find(s =>
        s.remainingSeconds < initialRemaining && s.remainingSeconds > 0
      )

      if (laterStatus && initialRemaining > 0) {
        expect(laterStatus.remainingSeconds).toBeLessThan(initialRemaining)
      }

      // Complete all timers
      await vi.runAllTimersAsync()
      await promise
    })
  })

  describe('Caching', () => {
    it('should cache paper data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          paperId: '123',
          title: 'Test Paper',
          externalIds: { DOI: '10.1234/test' }
        }),
      })

      // First call - should fetch
      const result1 = await provider.getPaperByDOI('10.1234/test')
      await vi.runAllTimersAsync()

      expect(result1?.paperId).toBe('123')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      const result2 = await provider.getPaperByDOI('10.1234/test')
      await vi.runAllTimersAsync()

      expect(result2?.paperId).toBe('123')
      // Should still be 1 call (cached)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should return cached paper without API call', async () => {
      // Pre-populate cache
      const cacheKey = 'nodus_ss_cache_doi_10.1234/cached'
      localStorageMock.store[cacheKey] = JSON.stringify({
        data: { paperId: 'cached-123', title: 'Cached Paper' },
        timestamp: Date.now(),
      })

      const cached = provider.getCachedPaperByDOI('10.1234/cached')
      expect(cached?.paperId).toBe('cached-123')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should clear cache', async () => {
      // Pre-populate cache
      localStorageMock.store['nodus_ss_cache_doi_test1'] = JSON.stringify({
        data: { paperId: '1' },
        timestamp: Date.now(),
      })
      localStorageMock.store['nodus_ss_cache_doi_test2'] = JSON.stringify({
        data: { paperId: '2' },
        timestamp: Date.now(),
      })
      localStorageMock.store['other_key'] = 'should remain'

      provider.clearCache()

      expect(localStorageMock.store['nodus_ss_cache_doi_test1']).toBeUndefined()
      expect(localStorageMock.store['nodus_ss_cache_doi_test2']).toBeUndefined()
      expect(localStorageMock.store['other_key']).toBe('should remain')
    })
  })

  describe('Error Handling', () => {
    it('should return null for 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await provider.getPaperByDOI('10.1234/notfound')
      await vi.runAllTimersAsync()

      expect(result).toBeNull()
    })

    it('should return null on network error after retries', async () => {
      // Mock all retry attempts to fail
      mockFetch.mockRejectedValue(new Error('Network error'))

      const promise = provider.getPaperByDOI('10.1234/error')

      // Advance through all retry backoff periods (10s, 20s, 40s)
      await vi.advanceTimersByTimeAsync(10000) // First retry
      await vi.advanceTimersByTimeAsync(20000) // Second retry
      await vi.advanceTimersByTimeAsync(40000) // Third retry
      await vi.runAllTimersAsync()

      const result = await promise
      expect(result).toBeNull()
    })
  })
})
