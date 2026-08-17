import { describe, it, expect, vi } from 'vitest'
import {
  getStarterTemplates,
  getStarterTitles,
  getStarterNodeConfigs,
  getStarterEdgeConfigs,
  getStarterFrameConfigs,
  getStarterFrameTitle,
  getStarterStorylineConfig,
  getStarterStorylineTitle,
} from '../lib/templates'
import type { SupportedLocale } from '../lib/templates'
import { extractFrontmatterField, parseHistoricalDate } from '../lib/timelineDates'
import { resetDefaultWorkspace } from '../stores/nodes/advanced'
import type { Node } from '../types'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

const LOCALES: SupportedLocale[] = ['en', 'de', 'fr', 'es', 'it']

describe('starter content demos all features', () => {
  const configs = getStarterNodeConfigs()
  const keys = configs.map(c => c.key)

  it('has a template and title for every node config in every locale', () => {
    for (const locale of LOCALES) {
      const templates = getStarterTemplates(locale)
      const titles = getStarterTitles(locale)
      for (const config of configs) {
        expect(templates[config.key], `${config.key} template in ${locale}`).toBeDefined()
        expect(titles[config.key], `${config.key} title in ${locale}`).toBeDefined()
      }
    }
  })

  it('covers all six entity node types', () => {
    const types = new Set(configs.map(c => c.node_type).filter(Boolean))
    for (const t of ['citation', 'comment', 'character', 'location', 'term', 'item']) {
      expect(types.has(t), `node_type ${t} missing`).toBe(true)
    }
  })

  it('has dated nodes with parseable dates, including a date range, in every locale', () => {
    const storyline = getStarterStorylineConfig()
    for (const locale of LOCALES) {
      const templates = getStarterTemplates(locale)
      let rangeSeen = false
      for (const key of storyline.nodeKeys) {
        const content = templates[key]
        const date = extractFrontmatterField(content, 'date')
        expect(parseHistoricalDate(date), `date on ${key} in ${locale}`).not.toBeNull()
        if (extractFrontmatterField(content, 'date_end')) rangeSeen = true
      }
      expect(rangeSeen, `no date_end range in ${locale}`).toBe(true)
    }
  })

  it('has a dated node outside the storyline for the unassigned timeline lane', () => {
    const storyline = new Set(getStarterStorylineConfig().nodeKeys)
    const templates = getStarterTemplates('en')
    const datedOutside = keys.filter(
      k => !storyline.has(k) && extractFrontmatterField(templates[k], 'date')
    )
    expect(datedOutside.length).toBeGreaterThan(0)
  })

  it('includes hashtags in every locale', () => {
    for (const locale of LOCALES) {
      const templates = getStarterTemplates(locale)
      const tagged = keys.filter(k => /(^|\s)#[\p{L}\d_-]+/u.test(templates[k]))
      expect(tagged.length, `no hashtags in ${locale}`).toBeGreaterThan(0)
    }
  })

  it('frame configs reference existing node keys and have titles in every locale', () => {
    const frames = getStarterFrameConfigs()
    expect(frames.length).toBeGreaterThanOrEqual(2)
    for (const frame of frames) {
      expect(frame.nodeKeys.length).toBeGreaterThan(0)
      for (const key of frame.nodeKeys) {
        expect(keys, `frame ${frame.key} references ${key}`).toContain(key)
      }
      for (const locale of LOCALES) {
        expect(getStarterFrameTitle(frame.key, locale)).toBeTruthy()
      }
    }
  })

  it('storyline config references existing node keys and has a title in every locale', () => {
    const storyline = getStarterStorylineConfig()
    expect(storyline.nodeKeys.length).toBeGreaterThanOrEqual(3)
    for (const key of storyline.nodeKeys) {
      expect(keys).toContain(key)
    }
    for (const locale of LOCALES) {
      expect(getStarterStorylineTitle(locale)).toBeTruthy()
    }
  })

  it('edge configs reference only existing node keys', () => {
    for (const edge of getStarterEdgeConfigs()) {
      expect(keys).toContain(edge.sourceKey)
      expect(keys).toContain(edge.targetKey)
    }
  })

  it('places every framed node inside its frame geometry', () => {
    const byKey = new Map(configs.map(c => [c.key, c]))
    for (const frame of getStarterFrameConfigs()) {
      for (const key of frame.nodeKeys) {
        const node = byKey.get(key)!
        expect(node.canvas_x, `${key} left of frame ${frame.key}`).toBeGreaterThanOrEqual(frame.canvas_x)
        expect(node.canvas_y, `${key} above frame ${frame.key}`).toBeGreaterThanOrEqual(frame.canvas_y)
        expect(node.canvas_x + node.width, `${key} right of frame ${frame.key}`).toBeLessThanOrEqual(frame.canvas_x + frame.width)
        expect(node.canvas_y + node.height, `${key} below frame ${frame.key}`).toBeLessThanOrEqual(frame.canvas_y + frame.height)
      }
    }
  })
})

describe('resetDefaultWorkspace seeds frames and a storyline', () => {
  function makeDeps() {
    const nodes: Node[] = []
    const createdFrames: Array<{ title: string }> = []
    const storylineNodes: string[] = []
    let frameCounter = 0
    const framesStore = {
      frames: [] as Array<{ id: string; workspace_id: string | null }>,
      createFrameAsync: vi.fn(async (_x: number, _y: number, _w: number, _h: number, title: string) => {
        createdFrames.push({ title })
        return { id: `frame-${++frameCounter}` }
      }),
      deleteFrame: vi.fn(),
    }
    const storylinesStore = {
      storylines: [] as Array<{ id: string; workspace_id: string | null }>,
      createStoryline: vi.fn(async () => ({ id: 'story-1' })),
      addNodeToStoryline: vi.fn(async (_id: string, nodeId: string) => {
        storylineNodes.push(nodeId)
      }),
      deleteStoryline: vi.fn(async () => {}),
    }
    const deps = {
      state: { nodes: { value: nodes }, selectedNodeIds: { value: [] } },
      framesStore,
      storylinesStore,
    } as unknown as Parameters<typeof resetDefaultWorkspace>[0]
    let nodeCounter = 0
    const createNodeFn = vi.fn(async (data: { title: string }) => {
      const node = { id: `node-${++nodeCounter}`, ...data } as unknown as Node
      nodes.push(node)
      return node
    })
    const createEdgeFn = vi.fn(async (data: object) => data as never)
    return { deps, createNodeFn, createEdgeFn, framesStore, storylinesStore, storylineNodes }
  }

  it('creates the configured frames and threads the storyline in order', async () => {
    const { deps, createNodeFn, createEdgeFn, framesStore, storylinesStore, storylineNodes } = makeDeps()
    await resetDefaultWorkspace(deps, createNodeFn, createEdgeFn)

    expect(framesStore.createFrameAsync).toHaveBeenCalledTimes(getStarterFrameConfigs().length)
    expect(storylinesStore.createStoryline).toHaveBeenCalledTimes(1)
    expect(storylineNodes.length).toBe(getStarterStorylineConfig().nodeKeys.length)
    expect(createNodeFn).toHaveBeenCalledTimes(getStarterNodeConfigs().length)
  })
})
