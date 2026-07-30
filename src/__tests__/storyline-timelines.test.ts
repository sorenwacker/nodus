import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import StorylineTimelines from '../components/StorylineTimelines.vue'
import { useNodesStore } from '../stores/nodes'
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

describe('StorylineTimelines', () => {
  beforeEach(() => {
    localStorageMock.clear()
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case 'get_storylines':
          return Promise.resolve([makeStoryline('s1', 'Plot A'), makeStoryline('s2', 'Plot B')])
        case 'get_storyline_nodes':
          return Promise.resolve(
            args?.storylineId === 's1'
              ? [{ id: 'n1' }, { id: 'n2' }, { id: 'shared' }]
              : [{ id: 'shared' }, { id: 'n3' }]
          )
        default:
          return Promise.reject(new Error(`Mock: unhandled ${command}`))
      }
    })
    useStorylinesStore().setDependencies({
      getCurrentWorkspaceId: () => null,
      getEdges: () => [],
      getNodes: () => [],
      createEdge: vi.fn(),
      deleteEdge: vi.fn(),
    })
  })

  async function mountTimelines() {
    useNodesStore()
    const wrapper = mount(StorylineTimelines, { global: { plugins: [i18n] } })
    await vi.waitFor(() => {
      expect(wrapper.findAll('.timeline-lane').length).toBe(2)
    })
    return wrapper
  }

  it('renders one lane per storyline with a bead per node', async () => {
    const wrapper = await mountTimelines()
    const lanes = wrapper.findAll('.timeline-lane')
    expect(lanes[0].findAll('.lane-bead').length).toBe(3)
    expect(lanes[1].findAll('.lane-bead').length).toBe(2)
    expect(wrapper.text()).toContain('Plot A')
    expect(wrapper.text()).toContain('Plot B')
  })

  it('draws a connector for a node shared between storylines', async () => {
    const wrapper = await mountTimelines()
    expect(wrapper.findAll('.timeline-connector').length).toBe(1)
  })

  it('opens the reader for the clicked lane', async () => {
    const wrapper = await mountTimelines()
    await wrapper.findAll('.timeline-lane')[1].trigger('click')
    expect(wrapper.emitted('open-reader')).toEqual([['s2']])
  })
})
