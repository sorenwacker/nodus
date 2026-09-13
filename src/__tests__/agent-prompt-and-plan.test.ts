/**
 * What the model is asked, and what an approved run is told.
 *
 * The request was classified by regular expressions into a graph type and a
 * domain, and the classification's whole product was two appended lines the
 * system prompt already carried (PRODUCT_DESIGN.md > Classifying what the user
 * wrote).
 *
 * A run resuming after approval replays the messages it saved, whose system
 * prompt was built in plan mode: it tells the model it has no tools to change
 * the graph, and it carries no plan. So the model executed an approved plan it
 * could not see, under instructions not to act
 * (PRODUCT_DESIGN.md > The prompt of an approved run carries its plan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { ToolDefinition } from '../llm/types'

const chat = vi.fn()

vi.mock('../llm/queue', () => ({
  llmQueue: {
    chat: (...args: unknown[]) => chat(...args),
    cancelCurrent: vi.fn(),
    generate: vi.fn(async () => ''),
  },
}))

vi.mock('../lib/storage', () => ({
  llmStorage: { getAgentPrompt: (fallback: string) => fallback },
  agentMemoryStorage: { getAgentMemory: () => ({ session: null, stack: [], facts: [] }) },
}))

function toolNamed(name: string): ToolDefinition {
  return {
    type: 'function',
    function: { name, description: name, parameters: { type: 'object', properties: {} } },
  } as unknown as ToolDefinition
}

function makeContext(executeAgentTool: (name: string, args: Record<string, unknown>) => Promise<string>) {
  return {
    filteredNodes: () => [],
    filteredEdges: () => [],
    cleanupOrphanEdges: () => {},
    workspaceId: () => 'workspace-1',
    selectedNodeIds: () => [],
    model: ref('test-model'),
    contextLength: ref(8192),
    getProviderId: () => 'test-provider',
    isRunning: ref(false),
    log: ref<string[]>([]),
    tasks: ref([]),
    conversationHistory: ref([]),
    transcript: ref([]),
    agentTools: [toolNamed('request_approval'), toolNamed('create_node'), toolNamed('think')],
    executeAgentTool,
  }
}

async function settle() {
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0))
}

describe('the request the model receives', () => {
  beforeEach(() => chat.mockReset())

  it('is what the user wrote, not a guess about it', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const ctx = makeContext(async () => 'ok')
    const runner = useAgentRunner(ctx as never)

    chat.mockImplementation(async () => ({ message: { role: 'assistant', content: 'ok' } }))
    void runner.run('create a mind map of photosynthesis')
    await settle()

    const messages = chat.mock.calls[0][0] as Array<{ role: string; content: string }>
    const asked = messages.find(m => m.role === 'user')!

    expect(asked.content).toBe('create a mind map of photosynthesis')
    expect(ctx.log.value.join('\n')).not.toContain('ENHANCED PROMPT')
  })
})

describe('a run resumed after approval', () => {
  beforeEach(() => chat.mockReset())

  const plan = {
    id: 'p1',
    title: 'Build the photosynthesis map',
    steps: [
      { id: 's1', description: 'Create the core nodes', status: 'approved' as const },
      { id: 's2', description: 'Connect them', status: 'approved' as const },
    ],
    status: 'approved' as const,
    createdAt: 0,
  }

  it('is told the plan it is executing, and that it may act', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const ctx = makeContext(async () => '__REQUEST_APPROVAL__:{"planId":"p1"}')
    const runner = useAgentRunner(ctx as never)

    chat.mockImplementation(async () => ({ message: { role: 'assistant', content: 'ok' } }))
    chat.mockReturnValueOnce(
      Promise.resolve({
        message: {
          role: 'assistant',
          tool_calls: [
            { id: 'c1', function: { name: 'request_approval', arguments: '{}' } },
          ],
        },
      })
    )

    void runner.run('map photosynthesis')
    await settle()
    expect(runner.isPaused.value, 'the run should be waiting for approval').toBe(true)

    void runner.resume({ approved: true }, plan)
    await settle()

    const lastCall = chat.mock.calls[chat.mock.calls.length - 1][0] as Array<{
      role: string
      content: string
    }>
    const system = lastCall.find(m => m.role === 'system')!.content

    expect(system, 'the model cannot see the plan it approved').toContain(
      'Build the photosynthesis map'
    )
    // The mode line is what carries the restriction. "Do NOT modify the graph"
    // also appears in the base agent prompt, about answering questions, so it
    // is present in every prompt and proves nothing here.
    expect(system, 'the resumed run is still under plan-mode instructions').not.toContain(
      'MODE: PLAN'
    )
    expect(system).toContain('MODE: EXECUTE')
  })
})
