import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/storage', () => ({
  zoteroStorage: {
    getUserId: () => '12345',
    getApiKey: () => 'test-key',
    isConfigured: () => true,
  },
}))

import { ZoteroWebApi } from '../lib/zoteroApi'

function makeItem(i: number) {
  return { key: `K${i}`, data: { key: `K${i}`, itemType: 'journalArticle', title: `Item ${i}` } }
}

// The Zotero Web API caps responses at 25 items unless limit/start pagination
// is used. Without it, libraries over 25 items import silently truncated.
describe('ZoteroWebApi pagination', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  function mockPages(total: number) {
    fetchMock.mockImplementation(async (url: string) => {
      const start = Number(new URL(url).searchParams.get('start') || '0')
      const limit = Number(new URL(url).searchParams.get('limit') || '25')
      const items = Array.from(
        { length: Math.max(0, Math.min(limit, total - start)) },
        (_, i) => makeItem(start + i)
      )
      return {
        ok: true,
        text: async () => JSON.stringify(items),
      }
    })
  }

  it('getItems fetches every page, not just the first 25', async () => {
    mockPages(130)
    const api = new ZoteroWebApi()
    const items = await api.getItems()
    expect(items).toHaveLength(130)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    const starts = fetchMock.mock.calls.map(c => new URL(c[0] as string).searchParams.get('start'))
    expect(starts).toContain('100')
  })

  it('getCollectionItems fetches every page', async () => {
    mockPages(101)
    const api = new ZoteroWebApi()
    const items = await api.getCollectionItems('COLL')
    expect(items).toHaveLength(101)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('single short page needs one request only', async () => {
    mockPages(10)
    const api = new ZoteroWebApi()
    const items = await api.getItems()
    expect(items).toHaveLength(10)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
