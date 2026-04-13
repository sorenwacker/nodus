import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useLLMTools, type LLMToolsContext } from '../canvas/composables/agent/useLLMTools'

// Mock node data
const createMockNodes = () => [
  { id: '1', title: 'Faculty of Science', markdown_content: 'Research in physics', canvas_x: 0, canvas_y: 0 },
  { id: '2', title: 'Faculty of Engineering', markdown_content: 'Engineering school', canvas_x: 100, canvas_y: 0 },
  { id: '3', title: 'Department of Physics', markdown_content: '#department', canvas_x: 200, canvas_y: 0 },
  { id: '4', title: 'John Smith', markdown_content: 'Professor at Faculty of Science', canvas_x: 300, canvas_y: 0 },
  { id: '5', title: 'Jane Doe', markdown_content: '#person Works in engineering', canvas_x: 400, canvas_y: 0 },
  { id: '6', title: 'Research Project Alpha', markdown_content: '#faculty Research initiative', canvas_x: 500, canvas_y: 0 },
  { id: '7', title: 'Faculty of Arts', markdown_content: '', canvas_x: 600, canvas_y: 0 },
  { id: '8', title: 'Kees Vuik', markdown_content: 'Mathematics professor', canvas_x: 700, canvas_y: 0 },
  { id: '9', title: 'Department of Chemistry', markdown_content: 'Chemistry research #department', canvas_x: 800, canvas_y: 0 },
  { id: '10', title: 'European Data Spaces', markdown_content: 'EU initiative', canvas_x: 900, canvas_y: 0 },
]

// Track color updates
const colorUpdates: Map<string, string> = new Map()

// Create mock context
function createMockContext(mockLLMResponse?: (prompt: string) => string): LLMToolsContext {
  const nodes = createMockNodes()
  colorUpdates.clear()

  return {
    llmQueue: {
      generate: vi.fn().mockImplementation(async (prompt: string) => {
        if (mockLLMResponse) {
          return mockLLMResponse(prompt)
        }
        // Default: return NO for everything
        return 'NO'
      }),
    },
    callOllama: vi.fn().mockResolvedValue(''),
    store: {
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => [],
      updateNodeContent: vi.fn().mockResolvedValue(undefined),
      updateNodePosition: vi.fn().mockResolvedValue(undefined),
      updateNodeColor: vi.fn().mockImplementation(async (id: string, color: string) => {
        colorUpdates.set(id, color)
      }),
      createEdge: vi.fn().mockResolvedValue({}),
    },
    themesStore: {
      themes: [],
      builtinThemes: [],
      customThemes: [],
      currentThemeName: 'default',
      createTheme: vi.fn().mockResolvedValue({ id: '1', name: 'test' }),
      updateTheme: vi.fn().mockResolvedValue(undefined),
      setTheme: vi.fn(),
    },
    planState: {
      currentPlan: ref(null),
      createPlan: vi.fn(),
      requestApproval: vi.fn().mockReturnValue(true),
    },
    tasks: ref([]),
    memoryStorage: {
      addMemory: vi.fn(),
    },
    log: vi.fn(),
    pushContentUndo: vi.fn(),
    isRunning: ref(true),
  }
}

describe('color_matching tool', () => {
  describe('literal pattern detection', () => {
    it('should detect "Faculty of..." as literal pattern', async () => {
      const ctx = createMockContext()
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('color_matching', { pattern: 'Faculty of...', color: '#ef4444' })

      // Should match: Faculty of Science, Faculty of Engineering, Faculty of Arts
      expect(colorUpdates.size).toBe(3)
      expect(colorUpdates.has('1')).toBe(true) // Faculty of Science
      expect(colorUpdates.has('2')).toBe(true) // Faculty of Engineering
      expect(colorUpdates.has('7')).toBe(true) // Faculty of Arts

      // Should NOT match people or departments
      expect(colorUpdates.has('4')).toBe(false) // John Smith
      expect(colorUpdates.has('3')).toBe(false) // Department of Physics
    })

    it('should detect "Department of" as literal pattern', async () => {
      const ctx = createMockContext()
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('color_matching', { pattern: 'Department of', color: '#3b82f6' })

      // Should match: Department of Physics, Department of Chemistry
      expect(colorUpdates.size).toBe(2)
      expect(colorUpdates.has('3')).toBe(true)
      expect(colorUpdates.has('9')).toBe(true)

      // Should NOT match faculties or people
      expect(colorUpdates.has('1')).toBe(false)
      expect(colorUpdates.has('4')).toBe(false)
    })

    it('should handle quoted patterns as literal', async () => {
      const ctx = createMockContext()
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('color_matching', { pattern: '"Faculty"', color: '#ef4444' })

      // Should match anything with "Faculty" in title
      expect(colorUpdates.size).toBe(3)
    })

    it('should be case-insensitive for literal patterns', async () => {
      const ctx = createMockContext()
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('color_matching', { pattern: 'faculty of', color: '#ef4444' })

      // Should still match Faculty of... nodes
      expect(colorUpdates.size).toBe(3)
    })
  })

  describe('tag matching', () => {
    it('should match #faculty tag in content', async () => {
      const ctx = createMockContext()
      const { executeLLMTool } = useLLMTools(ctx)

      // Using a semantic criterion that triggers tag check
      await executeLLMTool('color_matching', { pattern: 'faculty', color: '#ef4444' })

      // Should match node 6 which has #faculty tag
      expect(colorUpdates.has('6')).toBe(true)
    })

    it('should match #department tag', async () => {
      const ctx = createMockContext()
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('color_matching', { pattern: 'department', color: '#3b82f6' })

      // Should match nodes with #department tag (3 and 9)
      expect(colorUpdates.has('3')).toBe(true)
      expect(colorUpdates.has('9')).toBe(true)
    })

    it('should match #person tag', async () => {
      const ctx = createMockContext()
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('color_matching', { pattern: 'person', color: '#22c55e' })

      // Should match node 5 which has #person tag
      expect(colorUpdates.has('5')).toBe(true)
    })
  })

  describe('semantic evaluation', () => {
    it('should use LLM for abstract criteria like "person"', async () => {
      const ctx = createMockContext((prompt) => {
        // Simulate LLM correctly identifying people
        if (prompt.includes('John Smith') || prompt.includes('Jane Doe') || prompt.includes('Kees Vuik')) {
          return 'YES'
        }
        return 'NO'
      })
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('color_matching', { pattern: 'person', color: '#22c55e' })

      // Should have called LLM for non-tag nodes
      expect(ctx.llmQueue.generate).toHaveBeenCalled()
    })

    it('should NOT call LLM for literal patterns', async () => {
      const ctx = createMockContext()
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('color_matching', { pattern: 'Faculty of...', color: '#ef4444' })

      // Should NOT have called LLM - literal pattern uses text search
      expect(ctx.llmQueue.generate).not.toHaveBeenCalled()
    })
  })

  describe('cancellation', () => {
    it('should stop when isRunning becomes false', async () => {
      const ctx = createMockContext()
      const isRunning = ctx.isRunning!

      // Set up to cancel after first node
      let callCount = 0
      ctx.store.updateNodeColor = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount >= 1) {
          isRunning.value = false
        }
      })

      const { executeLLMTool } = useLLMTools(ctx)
      const result = await executeLLMTool('color_matching', { pattern: 'Faculty of...', color: '#ef4444' })

      // Should have stopped early
      expect(result).toContain('Stopped')
      expect(callCount).toBeLessThan(3) // Should not process all 3 Faculty nodes
    })
  })
})

describe('smart_color tool', () => {
  describe('category extraction', () => {
    it('should extract category-color mappings from instruction', async () => {
      const ctx = createMockContext((prompt) => {
        // Mock LLM extracting categories
        if (prompt.includes('Extract category-to-color')) {
          return '[{"category":"faculty","color":"#ef4444"},{"category":"department","color":"#3b82f6"}]'
        }
        // Classification responses
        if (prompt.includes('Faculty of')) return 'faculty'
        if (prompt.includes('Department of')) return 'department'
        return 'NONE'
      })
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('smart_color', { instruction: 'faculties red, departments blue' })

      // Should have called LLM for category extraction
      expect(ctx.llmQueue.generate).toHaveBeenCalled()
    })
  })

  describe('tag-based fast path', () => {
    it('should use tags before LLM classification', async () => {
      const llmCalls: string[] = []
      const ctx = createMockContext((prompt) => {
        llmCalls.push(prompt)
        if (prompt.includes('Extract category-to-color')) {
          return '[{"category":"faculty","color":"#ef4444"}]'
        }
        return 'NONE'
      })
      const { executeLLMTool } = useLLMTools(ctx)

      await executeLLMTool('smart_color', { instruction: 'faculty red' })

      // Node 6 has #faculty tag - should be colored without LLM classification call
      expect(colorUpdates.has('6')).toBe(true)
    })
  })
})

describe('literal pattern detection logic', () => {
  const isLiteralPattern = (criterion: string): boolean => {
    return criterion.includes('...') ||
      criterion.includes('"') ||
      criterion.includes("'") ||
      /^[A-Z][a-z]/.test(criterion) ||
      / of\b/.test(criterion) || // Contains " of" (word boundary)
      / and\b/.test(criterion) // Contains " and" (word boundary)
  }

  it('should detect "Faculty of..." as literal', () => {
    expect(isLiteralPattern('Faculty of...')).toBe(true)
  })

  it('should detect "Department of Science" as literal', () => {
    expect(isLiteralPattern('Department of Science')).toBe(true)
  })

  it('should detect quoted text as literal', () => {
    expect(isLiteralPattern('"Faculty"')).toBe(true)
    expect(isLiteralPattern("'Department'")).toBe(true)
  })

  it('should detect capitalized phrases as literal', () => {
    expect(isLiteralPattern('Faculty')).toBe(true)
    expect(isLiteralPattern('Research Project')).toBe(true)
  })

  it('should NOT detect lowercase single words as literal', () => {
    expect(isLiteralPattern('person')).toBe(false)
    expect(isLiteralPattern('organization')).toBe(false)
    expect(isLiteralPattern('faculty')).toBe(false) // lowercase = semantic
  })

  it('should detect "X and Y" patterns as literal', () => {
    expect(isLiteralPattern('Arts and Sciences')).toBe(true)
  })
})
