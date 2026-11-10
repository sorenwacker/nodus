/**
 * The fullscreen editor shows a card's earlier versions in place of the
 * preview, lets one be read, and restores it through the store
 * (PRODUCT_DESIGN.md > Node history).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import en from '../i18n/locales/en.json'
import type { NodeVersion } from '../types'

const nodes = new Map<string, { id: string; title: string; markdown_content: string }>()
const versions: NodeVersion[] = [
  { id: 2, node_id: 'a', title: 'Second draft', markdown_content: 'second', source: 'file', saved_at: 1_700_003_600 },
  { id: 1, node_id: 'a', title: 'First draft', markdown_content: 'first', source: 'app', saved_at: 1_700_000_000 },
]
const getNodeHistory = vi.fn(async () => versions)
const restoreNodeVersion = vi.fn(async (version: NodeVersion) => {
  const node = nodes.get(version.node_id)
  if (node) {
    node.title = version.title
    node.markdown_content = version.markdown_content ?? ''
  }
})

vi.mock('../stores/nodes', () => ({
  useNodesStore: () => ({
    getNode: (id: string) => nodes.get(id),
    get filteredNodes() {
      return [...nodes.values()]
    },
    updateNodeContent: vi.fn(),
    updateNodeTitle: vi.fn(),
    getNodeHistory,
    restoreNodeVersion,
  }),
}))

vi.mock('../lib/tauri', () => ({ openExternal: vi.fn() }))

vi.mock('../services/MarkdownRenderService', () => ({
  renderMarkdown: (text: string | null) => (text ? `<p>${text}</p>` : ''),
  renderPendingContent: vi.fn(async () => {}),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function inBody(selector: string): DOMWrapper<Element> {
  const element = document.body.querySelector(selector)
  if (!element) throw new Error(`Not rendered: ${selector}`)
  return new DOMWrapper(element)
}

async function flush() {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

describe('node history in the fullscreen editor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    nodes.clear()
    nodes.set('a', { id: 'a', title: 'Current', markdown_content: 'current text' })
    getNodeHistory.mockClear()
    restoreNodeVersion.mockClear()
  })

  it('lists the versions in place of the preview, newest first, naming what replaced each', async () => {
    const FullscreenNodeModal = (await import('../components/FullscreenNodeModal.vue')).default
    mount(FullscreenNodeModal, {
      props: { visible: true, nodeId: 'a' },
      global: { plugins: [i18n, createPinia()], stubs: { NodePicker: true } },
    })
    expect(document.body.querySelector('.preview-pane')).not.toBeNull()

    await inBody('button.history-toggle').trigger('click')
    await flush()

    expect(getNodeHistory).toHaveBeenCalledWith('a')
    expect(document.body.querySelector('.preview-pane')).toBeNull()
    const items = [...document.body.querySelectorAll('.history-item')]
    expect(items.map(li => li.querySelector('.history-item-title')?.textContent)).toEqual(['Second draft', 'First draft'])
    expect(items.map(li => li.querySelector('.history-source')?.textContent)).toEqual([
      'before a change on disk',
      'before an edit in Nodus',
    ])
    // The newest version is shown in full
    expect(inBody('.history-content').html()).toContain('<p>second</p>')
  })

  it('restores the chosen version through the store and shows the restored text', async () => {
    const FullscreenNodeModal = (await import('../components/FullscreenNodeModal.vue')).default
    mount(FullscreenNodeModal, {
      props: { visible: true, nodeId: 'a' },
      global: { plugins: [i18n, createPinia()], stubs: { NodePicker: true } },
    })
    await inBody('button.history-toggle').trigger('click')
    await flush()

    await new DOMWrapper(document.body.querySelectorAll('.history-item')[1]).trigger('click')
    await nextTick()
    expect(inBody('.history-content').html()).toContain('<p>first</p>')

    await inBody('.history-restore').trigger('click')
    await flush()

    expect(restoreNodeVersion).toHaveBeenCalledWith(versions[1])
    expect((inBody('.fullscreen-title-input').element as HTMLInputElement).value).toBe('First draft')
    // The list is reloaded, since the restore kept the version it replaced
    expect(getNodeHistory).toHaveBeenCalledTimes(2)
  })
})
