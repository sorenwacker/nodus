/**
 * Building the citation graph can be stopped
 * (docs/content/features.md > Citation Graph).
 *
 * The cancel function set a flag the loop never read, and nothing called it,
 * so a build over 130 papers ran its 20 minutes of requests to the end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node } from '../types'

const getPaperByDOI = vi.fn()
const getReferences = vi.fn()
const getCitations = vi.fn()

vi.mock('../lib/semanticScholar', () => ({
  semanticScholar: {
    getPaperByDOI: (...args: unknown[]) => getPaperByDOI(...args),
    getPaperById: vi.fn(),
    getReferences: (...args: unknown[]) => getReferences(...args),
    getCitations: (...args: unknown[]) => getCitations(...args),
  },
}))

import { useCitationGraph } from '../composables/useCitationGraph'

function paper(n: number): Node {
  return {
    id: `p${n}`,
    title: `Paper ${n}`,
    node_type: 'citation',
    markdown_content: `---\ndoi: 10.1000/p${n}\n---\n`,
    canvas_x: 0,
    canvas_y: 0,
    width: 300,
    height: 200,
  } as Node
}

function setup(count: number) {
  const nodes = Array.from({ length: count }, (_, i) => paper(i + 1))
  const createEdge = vi.fn(async () => ({ id: 'e' }))
  const graph = useCitationGraph({
    getNodes: () => nodes,
    getEdges: () => [],
    createNode: vi.fn(async () => ({ id: 'stub' })),
    createEdge,
    getCurrentWorkspaceId: () => null,
  })
  return { graph, createEdge }
}

describe('stopping a citation graph build', () => {
  beforeEach(() => {
    getPaperByDOI.mockReset()
    getReferences.mockReset()
    getCitations.mockReset()
    getPaperByDOI.mockImplementation(async (doi: string) => ({ paperId: doi }))
    getReferences.mockResolvedValue([])
    getCitations.mockResolvedValue([])
  })

  it('ends before the next paper and says it was stopped', async () => {
    const { graph } = setup(5)
    // Stop while the second paper is being fetched
    getPaperByDOI.mockImplementation(async (doi: string) => {
      if (getPaperByDOI.mock.calls.length === 2) graph.cancelBuild()
      return { paperId: doi }
    })

    const result = await graph.buildCitationGraph({ createStubs: false })

    expect(getPaperByDOI).toHaveBeenCalledTimes(2)
    expect(result.cancelled).toBe(true)
    expect(result.papersProcessed).toBe(2)
    expect(graph.isBuilding.value).toBe(false)
  })

  it('keeps what was created before the stop', async () => {
    const { graph, createEdge } = setup(3)
    // Paper 1 cites paper 2, which is on the canvas
    getReferences.mockImplementation(async (paperId: string) => {
      if (paperId.endsWith('p1')) {
        graph.cancelBuild()
        return [{ paperId: 'x', title: 'Paper 2', externalIds: { DOI: '10.1000/p2' } }]
      }
      return []
    })

    const result = await graph.buildCitationGraph({ createStubs: false })

    expect(createEdge).toHaveBeenCalledTimes(1)
    expect(result.edgesCreated).toBe(1)
    expect(result.cancelled).toBe(true)
  })

  it('runs to the end when not stopped, and a new build is not stopped by an old stop', async () => {
    const { graph } = setup(3)
    graph.cancelBuild()

    const result = await graph.buildCitationGraph({ createStubs: false })

    expect(getPaperByDOI).toHaveBeenCalledTimes(3)
    expect(result.cancelled).toBe(false)
    expect(result.papersProcessed).toBe(3)
  })
})
