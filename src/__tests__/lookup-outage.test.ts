/**
 * A service that cannot answer is not a service that answered "no".
 *
 * `getAllDOIs` returned an empty Set on any failure, which is what a library
 * with no DOIs also returns - so an outage reported "no duplicates" and the
 * caller created them. The Semantic Scholar lookups returned `null` or `[]` on
 * any failure, so "no such paper" and "the network is down" were the same
 * answer. `lookupForVerification` in the same class already keeps them apart
 * (PRODUCT_DESIGN.md > Lookups that cannot be made).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()

describe('Zotero library DOIs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    localStorage.clear()
  })

  async function api() {
    // Configuration is read from storage
    const { zoteroStorage } = await import('../lib/storage')
    zoteroStorage.setUserId('1')
    zoteroStorage.setApiKey('k')
    const { ZoteroWebApi } = await import('../lib/zoteroApi')
    return new ZoteroWebApi()
  }

  it('reports that it could not check, rather than an empty library', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    const zotero = await api()

    // Empty means "checked, and there are none". An outage must not say that,
    // because the caller uses it to decide whether an item is a duplicate.
    await expect(zotero.getAllDOIs()).rejects.toThrow()
  })

  it('returns an empty set for a library that genuinely has no DOIs', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [],
      text: async () => '[]',
    })

    const zotero = await api()

    await expect(zotero.getAllDOIs()).resolves.toEqual(new Set())
  })
})

describe('Semantic Scholar lookups', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    localStorage.clear()
  })

  async function provider() {
    const { SemanticScholarProvider } = await import('../lib/semanticScholar')
    return new SemanticScholarProvider()
  }

  /**
   * A network error is retried three times with exponential backoff, so the
   * rejection arrives well past a test timeout. Drive the clock rather than
   * wait on it.
   */
  async function expectRejection(call: () => Promise<unknown>) {
    vi.useFakeTimers()
    try {
      const assertion = expect(call()).rejects.toThrow()
      await vi.runAllTimersAsync()
      await assertion
    } finally {
      vi.useRealTimers()
    }
  }

  // A fresh provider per assertion: the rate limiter waits between calls on
  // one instance, which has nothing to do with what is under test here
  it('answers "no such paper" with null', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })

    await expect((await provider()).getPaperByDOI('10.1234/absent')).resolves.toBeNull()
  })

  it('does not report a transport failure as "no such paper"', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const scholar = await provider()

    await expectRejection(() => scholar.getPaperByDOI('10.1234/unreachable'))
  })

  it('does not report an outage as a paper with no references', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    const scholar = await provider()
    await expectRejection(() => scholar.getReferences('paper-1'))
  })

  it('does not report an outage as a paper with no citations', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    const scholar = await provider()
    await expectRejection(() => scholar.getCitations('paper-1'))
  })
})
