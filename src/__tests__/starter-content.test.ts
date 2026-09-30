import { describe, it, expect, vi } from 'vitest'
import {
  getStarterTemplates,
  getStarterTitles,
  getStarterNodeConfigs,
  getStarterEdgeConfigs,
  getStarterTagGroups,
  getStarterStorylineConfig,
  getStarterStorylineTitle,
} from '../lib/templates'
import type { SupportedLocale } from '../lib/templates'
import { extractFrontmatterField, parseHistoricalDate } from '../lib/timelineDates'
import { resetDefaultWorkspace } from '../stores/nodes/advanced'
import { extractHashtags } from '../lib/contentParser'
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

  it('tag groups reference existing node keys and use valid tags', () => {
    const groups = getStarterTagGroups()
    expect(groups.length).toBeGreaterThanOrEqual(2)
    for (const group of groups) {
      expect(group.nodeKeys.length).toBeGreaterThan(0)
      expect(extractHashtags(`#${group.tag}`)).toEqual([group.tag])
      for (const key of group.nodeKeys) {
        expect(keys, `group ${group.tag} references ${key}`).toContain(key)
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

})

describe('resetDefaultWorkspace seeds tag groups and a storyline', () => {
  function makeDeps() {
    const nodes: Node[] = []
    const storylineNodes: string[] = []
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
      storylinesStore,
    } as unknown as Parameters<typeof resetDefaultWorkspace>[0]
    let nodeCounter = 0
    const createNodeFn = vi.fn(async (data: { title: string; tags?: string[] }) => {
      const node = { id: `node-${++nodeCounter}`, ...data } as unknown as Node
      nodes.push(node)
      return node
    })
    const createEdgeFn = vi.fn(async (data: object) => data as never)
    return { deps, nodes, createNodeFn, createEdgeFn, storylinesStore, storylineNodes }
  }

  it('tags each group and threads the storyline in order', async () => {
    const { deps, nodes, createNodeFn, createEdgeFn, storylinesStore, storylineNodes } = makeDeps()
    await resetDefaultWorkspace(deps, createNodeFn, createEdgeFn)

    for (const group of getStarterTagGroups()) {
      const tagged = nodes.filter(n => (n.tags as unknown as string[] | undefined)?.includes(group.tag))
      expect(tagged.length, group.tag).toBe(group.nodeKeys.length)
    }
    expect(storylinesStore.createStoryline).toHaveBeenCalledTimes(1)
    expect(storylineNodes.length).toBe(getStarterStorylineConfig().nodeKeys.length)
    expect(createNodeFn).toHaveBeenCalledTimes(getStarterNodeConfigs().length)
  })
})
