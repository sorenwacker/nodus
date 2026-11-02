/**
 * In the packaged application the Zotero Web API is reached through the
 * backend, because the web view's content security policy does not list it
 * (PRODUCT_DESIGN.md > Requests to outside services go through the backend).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const invoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('../lib/storage', () => ({
  zoteroStorage: {
    getUserId: () => '12345',
    getApiKey: () => 'test-key',
    isConfigured: () => true,
  },
}))

describe('Zotero requests in the packaged application', () => {
  const directFetch = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    invoke.mockReset()
    directFetch.mockReset()
    vi.stubGlobal('fetch', directFetch)
    ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI__
    vi.unstubAllGlobals()
  })

  it('are handed to the backend with the key, not fetched by the web view', async () => {
    invoke.mockResolvedValue({ status: 200, body: JSON.stringify([{ key: 'C1', data: { key: 'C1', name: 'Reading' } }]) })
    const { ZoteroWebApi } = await import('../lib/zoteroApi')

    const collections = await new ZoteroWebApi().getCollections()

    expect(directFetch).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalled()
    const [command, payload] = invoke.mock.calls[0] as [string, { input: { url: string; headers: Record<string, string> } }]
    expect(command).toBe('http_request')
    expect(payload.input.url).toContain('https://api.zotero.org/users/12345/collections')
    expect(payload.input.headers['Zotero-API-Key']).toBe('test-key')
    expect(collections).toHaveLength(1)
  })

  it('report the service refusing the key as an error', async () => {
    invoke.mockResolvedValue({ status: 403, body: 'Forbidden' })
    const { ZoteroWebApi } = await import('../lib/zoteroApi')

    await expect(new ZoteroWebApi().getCollections()).rejects.toThrow('403')
  })
})

describe('what the Zotero panel says about the connection', () => {
  it('does not promise synchronisation, in any language', async () => {
    // Import and export are single actions; the hint said "sync bidirectionally"
    const { readFileSync, readdirSync } = await import('fs')
    const { join } = await import('path')
    const dir = join(__dirname, '..', 'i18n', 'locales')
    for (const file of readdirSync(dir).filter(name => name.endsWith('.json'))) {
      const hint: string = JSON.parse(readFileSync(join(dir, file), 'utf8')).settings.zotero.cloud.hint
      expect(hint, file).not.toMatch(/bidire|bidirekt/i)
    }
  })
})
