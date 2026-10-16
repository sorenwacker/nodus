/**
 * Smart layout groups nodes by meaning and places each group in its own
 * region (features.md > Smart Layout).
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import CanvasControls from '../canvas/components/CanvasControls.vue'
import { arrangeGroups } from '../canvas/layout/semanticGroupLayout'
import { useLLMTools, type LLMToolsContext } from '../canvas/composables/agent/useLLMTools'
import type { Node } from '../types'

type Box = { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function box(positions: Map<string, { x: number; y: number }>, ids: string[]): Box {
  const xs = ids.map(id => positions.get(id)!.x)
  const ys = ids.map(id => positions.get(id)!.y)
  const minX = Math.min(...xs), minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX + 200, h: Math.max(...ys) - minY + 120 }
}

describe('arrangeGroups', () => {
  const sized = (ids: string[]) => ids.map(id => ({ id, width: 200, height: 120 }))
  const groups = [
    { name: 'a', nodes: sized(['a1', 'a2', 'a3', 'a4']) },
    { name: 'b', nodes: sized(['b1', 'b2']) },
    { name: 'c', nodes: sized(['c1']) },
  ]

  it('positions every node', () => {
    const positions = arrangeGroups(groups, { x: 0, y: 0 })
    expect(positions.size).toBe(7)
  })

  it('keeps nodes from overlapping', () => {
    const positions = arrangeGroups(groups, { x: 0, y: 0 })
    const boxes = [...positions.values()].map(p => ({ x: p.x, y: p.y, w: 200, h: 120 }))
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false)
  })

  it('gives each group a region of its own', () => {
    const positions = arrangeGroups(groups, { x: 0, y: 0 })
    const regions = groups.map(g => box(positions, g.nodes.map(n => n.id)))
    for (let i = 0; i < regions.length; i++)
      for (let j = i + 1; j < regions.length; j++) expect(overlaps(regions[i], regions[j])).toBe(false)
  })

  it('places groups listed next to each other next to each other', () => {
    const positions = arrangeGroups(groups, { x: 0, y: 0 })
    const [a, b] = [box(positions, ['a1', 'a2', 'a3', 'a4']), box(positions, ['b1', 'b2'])]
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.w)
    expect(b.y).toBe(a.y)
  })
})

function createContext(selected: string[], agentRunning = true): { ctx: LLMToolsContext; moved: Map<string, { x: number; y: number }> } {
  const nodes = [
    { id: '1', title: 'Survey methods', markdown_content: '', canvas_x: 0, canvas_y: 0 },
    { id: '2', title: 'Interview study', markdown_content: '', canvas_x: 0, canvas_y: 0 },
    { id: '3', title: 'Gradient descent', markdown_content: '', canvas_x: 0, canvas_y: 0 },
    { id: '4', title: 'Backpropagation', markdown_content: '', canvas_x: 0, canvas_y: 0 },
  ]
  const moved = new Map<string, { x: number; y: number }>()
  const ctx = {
    llmQueue: {
      generate: vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Propose')) return 'qualitative methods, optimization'
        // Batch classification: answer by title
        return nodes
          .filter(n => prompt.includes(n.title))
          .map((n, i) => `${i + 1}. ${/descent|Backprop/.test(n.title) ? 'optimization' : 'qualitative methods'}`)
          .join('\n')
      }),
    },
    callOllama: vi.fn().mockResolvedValue(''),
    store: {
      getFilteredNodes: () => nodes as unknown as Node[],
      getFilteredEdges: () => [],
      selectedNodeIds: selected,
      updateNodePosition: vi.fn().mockImplementation(async (id: string, x: number, y: number) => {
        moved.set(id, { x, y })
      }),
    },
    log: vi.fn(),
    isRunning: ref(agentRunning),
  } as unknown as LLMToolsContext
  return { ctx, moved }
}

describe('the smart_layout tool', () => {
  it('moves every visible node when nothing is selected', async () => {
    const { ctx, moved } = createContext([])
    const result = await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    expect(moved.size).toBe(4)
    expect(result).toContain('2 groups')
  })

  it('groups the nodes when started from the canvas controls, outside an agent run', async () => {
    const { ctx, moved } = createContext([], false)
    const result = await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    expect(result).toContain('2 groups')
    expect(moved.get('3')!.x).not.toBe(moved.get('1')!.x)
  })

  it('reports how the run ended in the log', async () => {
    const { ctx } = createContext([])
    await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    const lines = (ctx.log as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string)
    expect(lines.at(-1)).toContain('Arranged 4 nodes')
  })

  it('reports a failed model call instead of ending silently', async () => {
    const { ctx, moved } = createContext([])
    ;(ctx.llmQueue.generate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('provider timed out'))
    const result = await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    expect(result).toContain('provider timed out')
    expect(moved.size).toBe(0)
  })

  it('moves only the selection when there is one', async () => {
    const { ctx, moved } = createContext(['1', '3'])
    await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    expect([...moved.keys()].sort()).toEqual(['1', '3'])
  })

  it('passes the instruction to the model', async () => {
    const { ctx } = createContext([])
    await useLLMTools(ctx).executeLLMTool('smart_layout', { instruction: 'by research method' })
    const prompts = (ctx.llmQueue.generate as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string)
    expect(prompts.some(p => p.includes('by research method'))).toBe(true)
  })
})

describe('the smart layout control', () => {
  function mountControls(smartLayoutAvailable: boolean) {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    return mount(CanvasControls, {
      props: {
        scale: 1, gridLockEnabled: false, isLargeGraph: false, globalEdgeStyle: 'orthogonal',
        neighborhoodMode: false, neighborhoodDepth: 1, highlightAllEdges: false, bubbleModeActive: false,
        physicsActive: false, physicsAvailable: true, smartLayoutAvailable,
      },
      global: { plugins: [i18n] },
    })
  }

  it('requests a smart layout', async () => {
    const controls = mountControls(true)
    await controls.find('.smart-layout').trigger('click')
    expect(controls.emitted('smartLayout')).toHaveLength(1)
  })

  it('is hidden when no AI provider is enabled', () => {
    expect(mountControls(false).find('.smart-layout').exists()).toBe(false)
  })
})
