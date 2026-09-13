/**
 * A run that works in phases reports what all of them found.
 *
 * The accumulator was reassigned each phase, so the completion payload carried
 * only the last phase's results - typically the smallest - and everything the
 * earlier phases found was dropped without a word
 * (PRODUCT_DESIGN.md > Reporting what a multi-phase run found).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const deepResearch = vi.fn()

vi.mock('../llm/research', () => ({
  deepResearch: (...args: unknown[]) => deepResearch(...args),
  assessCompleteness: () => ({ score: 1, missing: [], suggestions: [] }),
}))

/**
 * A phase counts as complete only when its findings reach its minimum, and the
 * largest phase asks for fifteen. Fewer, and the run stops early to ask for
 * more research instead of reaching the completion payload under test.
 */
function phaseResult(tag: string) {
  return {
    findings: Array.from({ length: 15 }, (_, i) => ({
      claim: `${tag} finding ${i + 1}`,
      sources: [],
      confidence: 1,
    })),
    concepts: [`${tag} concept`],
    sources: [],
    completenessScore: 1,
    suggestedFollowUps: [`${tag} follow-up`],
    queriesPerformed: [],
  }
}

describe('a knowledge base built in phases', () => {
  beforeEach(() => {
    deepResearch.mockReset()
  })

  it('reports the findings of every phase, not only the last', async () => {
    const { toolRegistry } = await import('../llm/registry')
    const { registerCoreTools } = await import('../llm/tools')
    registerCoreTools()

    let phase = 0
    deepResearch.mockImplementation(async () => phaseResult(`phase-${++phase}`))

    const ctx = {
      store: {
        filteredNodes: [],
        filteredEdges: [],
      },
      log: () => {},
    } as never

    const result = await toolRegistry.execute(
      'build_knowledge_base',
      { topic: 'photosynthesis', target_nodes: 1000 },
      ctx
    )

    expect(result.startsWith('__KB_BUILD_COMPLETE__:'), result.slice(0, 60)).toBe(true)
    const payload = JSON.parse(result.replace('__KB_BUILD_COMPLETE__:', ''))
    const claims = payload.findings.map((f: { claim: string }) => f.claim)

    expect(phase, 'the test needs more than one phase to be meaningful').toBeGreaterThan(1)

    // The payload is capped, so the point is not how many findings survive but
    // that no phase is cut out of the report by where the cap falls
    const represented = new Set(claims.map((c: string) => c.split(' ')[0]))
    expect(represented.size, `phases missing from the report: ${[...represented].join(', ')}`).toBe(
      phase
    )
  })
})
