import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import StorylineSection from '../components/StorylineSection.vue'
import StorylinePanel from '../components/StorylinePanel.vue'
import { useStorylinesStore } from '../stores/storylines'
import type { Storyline } from '../types'

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
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function makeStoryline(id: string, title: string): Storyline {
  return {
    id,
    title,
    description: null,
    color: null,
    workspace_id: null,
    created_at: 0,
    updated_at: 0,
  }
}

const sectionStubs = {
  StorylineNodeList: { template: '<div class="node-list-stub" />' },
  StorylineEntitySummary: { template: '<div class="entity-summary-stub" />' },
}

describe('StorylineSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockRejectedValue(new Error('Mock: no backend'))
  })

  function mountSection(overrides: { expanded?: boolean; title?: string } = {}) {
    return mount(StorylineSection, {
      props: {
        storyline: makeStoryline('s1', overrides.title ?? 'My storyline'),
        nodes: [],
        nodeCount: 3,
        expanded: overrides.expanded ?? false,
        dropPreviewIndex: null,
      },
      global: { plugins: [i18n, createPinia()], stubs: sectionStubs },
    })
  }

  it('renders the full title without truncation markup', () => {
    const longTitle = 'A very long storyline title that used to be cut off with an ellipsis'
    const wrapper = mountSection({ title: longTitle })
    expect(wrapper.text()).toContain(longTitle)
  })

  it('emits toggle when the header is clicked', async () => {
    const wrapper = mountSection()
    await wrapper.find('.section-header').trigger('click')
    expect(wrapper.emitted('toggle')).toBeTruthy()
  })

  it('shows the node list only while expanded', async () => {
    const wrapper = mountSection({ expanded: false })
    expect(wrapper.find('.node-list-stub').exists()).toBe(false)
    await wrapper.setProps({ expanded: true })
    expect(wrapper.find('.node-list-stub').exists()).toBe(true)
  })
})

describe('StorylinePanel accordion', () => {
  beforeEach(() => {
    localStorageMock.clear()
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      switch (command) {
        case 'get_storylines':
          return Promise.resolve([
            makeStoryline('s1', 'First storyline'),
            makeStoryline('s2', 'Second storyline'),
          ])
        case 'get_storyline_nodes':
          return Promise.resolve([])
        default:
          return Promise.reject(new Error(`Mock: unhandled ${command}`))
      }
    })
  })

  it('allows several storylines to be expanded at once', async () => {
    // Wire storyline-store dependencies the way store initialization does
    useStorylinesStore().setDependencies({
      getCurrentWorkspaceId: () => null,
      getEdges: () => [],
      getNodes: () => [],
      createEdge: vi.fn(),
      deleteEdge: vi.fn(),
    })
    const wrapper = mount(StorylinePanel, {
      global: { plugins: [i18n], stubs: sectionStubs },
    })
    await vi.waitFor(() => {
      expect(wrapper.findAllComponents(StorylineSection).length).toBe(2)
    })

    const sections = wrapper.findAllComponents(StorylineSection)
    await sections[0].find('.section-header').trigger('click')
    await sections[1].find('.section-header').trigger('click')

    expect(sections[0].props('expanded')).toBe(true)
    expect(sections[1].props('expanded')).toBe(true)
  })
})
