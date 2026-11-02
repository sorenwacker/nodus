/**
 * Smart layout arranges nodes as a tree from kind and connections (features.md > Smart Layout).
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import CanvasControls from '../canvas/components/CanvasControls.vue'
import { useLLMTools, type LLMToolsContext } from '../canvas/composables/agent/useLLMTools'
import type { Node } from '../types'

function createContext(
  selected: string[],
  agentRunning = true
): { ctx: LLMToolsContext; moved: Map<string, { x: number; y: number }> } {
  const nodes = [
    { id: 't1', title: '#methods', node_type: 'tag', markdown_content: '', canvas_x: 0, canvas_y: 0 },
    { id: 't2', title: '#surveys', node_type: 'tag', markdown_content: '', canvas_x: 0, canvas_y: 0 },
    { id: 'n1', title: 'Survey design', node_type: 'note', markdown_content: '', canvas_x: 0, canvas_y: 0 },
    { id: 'n2', title: 'Interview study', node_type: 'note', markdown_content: '', canvas_x: 0, canvas_y: 0 },
    { id: 'n3', title: 'Unrelated', node_type: 'note', markdown_content: '', canvas_x: 0, canvas_y: 0 },
  ]
  const edges = [
    { id: 'e1', source_node_id: 'n1', target_node_id: 't1' },
    { id: 'e2', source_node_id: 'n1', target_node_id: 't2' },
    { id: 'e3', source_node_id: 'n2', target_node_id: 't1' },
  ]
  const moved = new Map<string, { x: number; y: number }>()
  const ctx = {
    llmQueue: {
      generate: vi.fn().mockImplementation(async (prompt: string) => (prompt.includes('Order the kinds') ? 'tag, note' : '1: a')),
    },
    callOllama: vi.fn().mockResolvedValue(''),
    store: {
      getFilteredNodes: () => nodes as unknown as Node[],
      getFilteredEdges: () => edges,
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
  it('arranges the visible nodes as a tree, broader kinds above', async () => {
    const { ctx, moved } = createContext([])
    const result = await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    expect(moved.size).toBe(5)
    expect(moved.get('n2')!.y).toBeGreaterThan(moved.get('t1')!.y)
    expect(result).toContain('Arranged 5 nodes')
  })

  it('asks the model only for nodes with several candidate parents', async () => {
    const { ctx } = createContext([])
    await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    const prompts = (ctx.llmQueue.generate as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string)
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('Survey design')
    expect(prompts[1]).not.toContain('Interview study')
  })

  it('works from the canvas controls, outside an agent run', async () => {
    const { ctx, moved } = createContext([], false)
    await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    expect(moved.size).toBe(5)
  })

  it('reports how the run ended in the log', async () => {
    const { ctx } = createContext([])
    await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    const lines = (ctx.log as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string)
    expect(lines.at(-1)).toContain('Arranged 5 nodes')
  })

  it('reports a failed model call instead of ending silently', async () => {
    const { ctx, moved } = createContext([])
    ;(ctx.llmQueue.generate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('provider timed out'))
    const result = await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    expect(result).toContain('provider timed out')
    expect(moved.size).toBe(0)
  })

  it('moves only the selection when there is one', async () => {
    const { ctx, moved } = createContext(['n1', 't1'])
    await useLLMTools(ctx).executeLLMTool('smart_layout', {})
    expect([...moved.keys()].sort()).toEqual(['n1', 't1'])
  })

  it('passes the instruction to the model', async () => {
    const { ctx } = createContext([])
    await useLLMTools(ctx).executeLLMTool('smart_layout', { instruction: 'sources at the top' })
    const prompts = (ctx.llmQueue.generate as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string)
    expect(prompts.some(p => p.includes('sources at the top'))).toBe(true)
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
