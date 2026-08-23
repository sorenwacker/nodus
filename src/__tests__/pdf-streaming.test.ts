import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePdfDrop } from '../canvas/composables/util/usePdfDrop'

/**
 * A dropped PDF's cleanup is visible while it runs: the cleaned text streams
 * into the node as the model produces it, and the node being written is
 * flagged in the store so the canvas can pulse it. The flag is cleared no
 * matter how processing ends.
 */

vi.mock('../lib/tauri', () => ({
  extractPdfText: vi.fn().mockResolvedValue('Raw extracted text for the test.'),
  extractPdfAnnotations: vi.fn().mockResolvedValue([]),
  readTextFile: vi.fn().mockResolvedValue(''),
}))
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: vi.fn() }) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({}) }))

function makeStore() {
  const contentWrites: string[] = []
  return {
    contentWrites,
    aiWorkingNodeId: { value: null as string | null },
    workingIdDuringRun: null as string | null,
    createNode: vi.fn(async () => ({ id: 'node-1' })),
    updateNodeContent: vi.fn(async (_id: string, content: string) => {
      contentWrites.push(content)
    }),
    updateNodeTitle: vi.fn(async () => {}),
    deleteNode: vi.fn(async () => {}),
    createEdge: vi.fn(async () => ({})),
    importOntology: vi.fn(async () => ({ nodesCreated: 0, edgesCreated: 0, nodeIds: [] })),
  }
}

const viewState = {
  getViewportCenter: () => ({ x: 0, y: 0 }),
  screenToCanvas: (x: number, y: number) => ({ x, y }),
}

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  vi.useRealTimers()
  store = makeStore()
})

describe('PDF import streaming', () => {
  it('streams the accumulating text into the node while the model runs', async () => {
    const llm = {
      simpleGenerate: vi.fn(async (_p: string, _s?: string, onProgress?: (t: string) => void) => {
        onProgress?.('# Cleaned')
        await new Promise(r => setTimeout(r, 350))
        onProgress?.('# Cleaned title\n\nBody text.')
        await new Promise(r => setTimeout(r, 350))
        return '# Cleaned title\n\nBody text.'
      }),
    }
    const drop = usePdfDrop({ store, viewState, llm })

    await drop.processPdfDrop('/tmp/test.pdf', 10, 10)

    // At least one write happened before the final full-document write.
    const mid = store.contentWrites.filter(c => c.includes('# Cleaned') && !c.includes('Source:'))
    expect(mid.length).toBeGreaterThan(0)
  })

  it('flags the node as being worked on and clears the flag afterwards', async () => {
    const llm = {
      simpleGenerate: vi.fn(async () => {
        store.workingIdDuringRun = store.aiWorkingNodeId.value
        return 'cleaned'
      }),
    }
    const drop = usePdfDrop({ store, viewState, llm })

    await drop.processPdfDrop('/tmp/test.pdf', 0, 0)

    expect(store.workingIdDuringRun).toBe('node-1')
    expect(store.aiWorkingNodeId.value).toBeNull()
  })

  it('clears the working flag when cleanup fails', async () => {
    const llm = {
      simpleGenerate: vi.fn(async () => {
        throw new Error('model gone')
      }),
    }
    const drop = usePdfDrop({ store, viewState, llm })

    await drop.processPdfDrop('/tmp/test.pdf', 0, 0)

    expect(store.aiWorkingNodeId.value).toBeNull()
  })
})

describe('canvas working highlight', () => {
  it('the node card pulses exactly while the store flags it', async () => {
    const { readFileSync } = await import('fs')
    const card = readFileSync('src/canvas/components/CanvasNodeCard.vue', 'utf-8')

    expect(card).toContain("'ai-working': nodesStore.aiWorkingNodeId === props.node.id")
    expect(card).toMatch(/\.node-card\.ai-working\s*\{[^}]*animation/s)
    expect(card).toContain('@keyframes ai-working-pulse')
  })
})
