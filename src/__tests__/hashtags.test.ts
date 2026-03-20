import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'

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
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((command: string) => {
    if (command === 'create_workspace') return Promise.resolve()
    if (command === 'update_node_tags') return Promise.resolve()
    if (command === 'update_node_content') return Promise.resolve(null)
    if (command === 'create_node') {
      return Promise.resolve({
        id: crypto.randomUUID(),
        title: 'Tag Node',
        node_type: 'tag',
        canvas_x: 100,
        canvas_y: 100,
        width: 100,
        height: 40,
        z_index: 0,
        frame_id: null,
        color_theme: 'var(--primary-color)',
        is_collapsed: false,
        tags: null,
        workspace_id: null,
        checksum: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        deleted_at: null,
      })
    }
    if (command === 'create_edge') {
      return Promise.resolve({
        id: crypto.randomUUID(),
        source_node_id: '',
        target_node_id: '',
        label: null,
        link_type: 'tagged',
        weight: 1,
        created_at: Date.now(),
      })
    }
    return Promise.reject(new Error('Mock: No backend'))
  }),
}))

// Mock Tauri event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

describe('Hashtag Extraction', () => {
  beforeEach(() => {
    localStorageMock.clear()
    setActivePinia(createPinia())
  })

  describe('extractHashtags', () => {
    it('should extract simple hashtags', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tags = store.extractHashtags('Hello #world this is #test')
      expect(tags).toEqual(['world', 'test'])
    })

    it('should extract hyphenated hashtags', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tags = store.extractHashtags('This is #machine-learning and #deep-learning')
      expect(tags).toEqual(['machine-learning', 'deep-learning'])
    })

    it('should extract CamelCase hashtags', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tags = store.extractHashtags('#CamelCase and #PascalCase tags')
      expect(tags).toEqual(['CamelCase', 'PascalCase'])
    })

    it('should extract numeric hashtags', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tags = store.extractHashtags('#AI2024 and #version2 tags')
      expect(tags).toEqual(['AI2024', 'version2'])
    })

    it('should handle hashtags starting with numbers', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tags = store.extractHashtags('#123numeric and #42answer')
      expect(tags).toEqual(['123numeric', '42answer'])
    })

    it('should deduplicate hashtags', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tags = store.extractHashtags('#test #test #test')
      expect(tags).toEqual(['test'])
    })

    it('should return empty array for no hashtags', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tags = store.extractHashtags('No hashtags here')
      expect(tags).toEqual([])
    })

    it('should not extract invalid hashtags', async () => {
      const store = useNodesStore()
      await store.initialize()

      // Hashtags must start with letter or number
      const tags = store.extractHashtags('#-invalid # #!')
      expect(tags).toEqual([])
    })

    it('should handle mixed content with hashtags', async () => {
      const store = useNodesStore()
      await store.initialize()

      const content = `
# Research Notes

This document covers #machine-learning and #AI2024 topics.

## Key Points
- Important #research findings
- #deep-learning experiments

See also: #related-work
      `
      const tags = store.extractHashtags(content)
      expect(tags).toContain('machine-learning')
      expect(tags).toContain('AI2024')
      expect(tags).toContain('research')
      expect(tags).toContain('deep-learning')
      expect(tags).toContain('related-work')
    })
  })

  describe('Tag Nodes', () => {
    it('should get tag nodes (empty initially)', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tagNodes = store.getTagNodes()
      expect(tagNodes).toEqual([])
    })

    it('should create tag node with correct properties', async () => {
      const store = useNodesStore()
      await store.initialize()

      const tagNode = await store.getOrCreateTagNode('research')

      expect(tagNode.node_type).toBe('tag')
      expect(tagNode.width).toBe(100)
      expect(tagNode.height).toBe(40)
    })

    it('should return existing tag node if already exists', async () => {
      const store = useNodesStore()
      await store.initialize()

      // Create a tag node
      const tagNode1 = await store.getOrCreateTagNode('research')

      // Add it to the nodes array manually (since mock doesn't persist)
      store.nodes.push({
        ...tagNode1,
        title: 'research',
        node_type: 'tag',
      })

      // Try to create the same tag again
      const tagNode2 = await store.getOrCreateTagNode('research')

      // Should return the existing one
      expect(tagNode2.id).toBe(tagNode1.id)
    })
  })
})

describe('Tag Storage', () => {
  it('should store and retrieve showTagNodes setting', async () => {
    const { tagStorage } = await import('../lib/storage')

    // Default should be false
    expect(tagStorage.getShowTagNodes()).toBe(false)

    // Set to true
    tagStorage.setShowTagNodes(true)
    expect(tagStorage.getShowTagNodes()).toBe(true)

    // Set back to false
    tagStorage.setShowTagNodes(false)
    expect(tagStorage.getShowTagNodes()).toBe(false)
  })
})
