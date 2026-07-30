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

const BASE_NODE = {
  file_path: null,
  node_type: 'note',
  canvas_x: 0,
  canvas_y: 0,
  width: 200,
  height: 120,
  z_index: 0,
  frame_id: null,
  color_theme: null,
  is_collapsed: false,
  tags: null,
  workspace_id: null,
  checksum: null,
  created_at: 0,
  updated_at: 0,
  deleted_at: null,
}

/** Lane s1: dated, undated, shared, era-span. Lane s2: shared, dated. */
function seedDatedNodes() {
  useNodesStore().nodes.push(
    { ...BASE_NODE, id: 'n1', title: 'Dated A', markdown_content: '---\ndate: 100\n---\nx' },
    { ...BASE_NODE, id: 'n2', title: 'Undated', markdown_content: 'plain' },
    { ...BASE_NODE, id: 'n3', title: 'Dated B', markdown_content: '---\ndate: 1500\n---\nx' },
    { ...BASE_NODE, id: 'shared', title: 'Shared', markdown_content: '---\ndate: 800\n---\nx' },
    { ...BASE_NODE, id: 'span1', title: 'Era', markdown_content: '---\ndate: 800\ndate_end: 1800\n---\nx' }
  )
}

async function mountTimelines() {
  const wrapper = mount(StorylineTimelines, { global: { plugins: [i18n] } })
  await vi.waitFor(() => {
    expect(wrapper.findAll('.timeline-lane').length).toBe(2)
  })
  return wrapper
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
              ? [{ id: 'n1' }, { id: 'n2' }, { id: 'shared' }, { id: 'span1' }]
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

  it('places only dated nodes: beads for dates, bars for spans, undated omitted', async () => {
    seedDatedNodes()
    const wrapper = await mountTimelines()

    const beadTitles = wrapper.findAll('.lane-bead title').map(t => t.text())
    // n1 + shared (twice, once per lane) + n3
    expect(beadTitles.length).toBe(4)
    expect(beadTitles.some(t => t.includes('Undated'))).toBe(false)

    const spans = wrapper.findAll('.lane-span')
    expect(spans.length).toBe(1)
    expect(spans[0].find('title').text()).toContain('Era')
  })

  it('draws a connector for a node shared between storylines', async () => {
    seedDatedNodes()
    const wrapper = await mountTimelines()
    expect(wrapper.findAll('.timeline-connector').length).toBe(1)
  })

  it('opens the reader for the clicked lane', async () => {
    seedDatedNodes()
    const wrapper = await mountTimelines()
    await wrapper.findAll('.timeline-lane')[1].trigger('click')
    expect(wrapper.emitted('open-reader')).toEqual([['s2']])
  })

  it('shows the date hint instead of guessing positions when nothing is dated', async () => {
    const wrapper = mount(StorylineTimelines, { global: { plugins: [i18n] } })
    await vi.waitFor(() => {
      // Storylines exist, but nothing is dated: hint instead of positions
      expect(wrapper.find('.timelines-empty').text()).toContain(en.storyline.timelinesDateHint)
    })
    expect(wrapper.findAll('.lane-bead').length).toBe(0)
  })
})
