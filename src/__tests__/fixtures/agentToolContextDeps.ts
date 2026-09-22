/**
 * A complete set of dependencies for buildAgentToolContext, with every service
 * stubbed, so a test can override the one thing it is about.
 */
import { ref } from 'vue'
import { vi } from 'vitest'
import type { AgentToolContextDeps } from '../../canvas/composables/agent/agentToolContext'

export function fakeNodesStore(overrides: Record<string, unknown> = {}): AgentToolContextDeps['store'] {
  // Getters in the overrides stay getters, so a test can vary a value after
  // the store is built; a spread would read them once
  const store = {
    selectedNodeIds: [],
    filteredNodes: [],
    filteredEdges: [],
    filteredFrames: [],
    filteredStorylines: [],
    currentWorkspaceId: null,
    createNode: vi.fn(),
    createEdge: vi.fn(),
    deleteNode: vi.fn(),
    deleteEdge: vi.fn(),
    updateNodePosition: vi.fn(),
    updateNodeContent: vi.fn(),
    updateNodeTitle: vi.fn(),
    updateNodeTags: vi.fn(),
    updateNodeColor: vi.fn(),
    updateEdgeLabel: vi.fn(),
    updateEdgeColor: vi.fn(),
    createFrame: vi.fn(),
    assignNodesToFrame: vi.fn(),
    createStoryline: vi.fn(),
    addNodeToStoryline: vi.fn(),
  }
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(overrides))
  return store as never
}

export function fakeAgentToolContextDeps(
  overrides: Partial<AgentToolContextDeps> = {}
): AgentToolContextDeps {
  return {
    store: fakeNodesStore(),
    log: () => {},
    screenToCanvas: (x, y) => ({ x, y }),
    snapToGrid: v => v,
    getModel: () => 'test-model',
    getContextLength: () => 8192,
    pushContentUndo: undefined,
    pushContentsUndo: undefined,
    getRunSelection: () => null,
    getEditingNodeId: () => null,
    llmQueue: { generate: vi.fn(async () => '') },
    isRunning: ref(true),
    search: {
      webSearch: vi.fn(async () => []),
      fetchUrl: vi.fn(async () => ''),
      searchWikipedia: vi.fn(async () => []),
      fetchWikipediaArticle: vi.fn(async () => null),
      quickResearch: vi.fn(async () => ''),
      deepResearch: vi.fn(),
      formatDeepResearchResults: vi.fn(() => ''),
      validateClaim: vi.fn(),
    },
    themes: {
      themes: [],
      builtinThemes: [],
      customThemes: [],
      currentThemeName: 'light',
      createTheme: vi.fn(),
      updateTheme: vi.fn(),
      setTheme: vi.fn(),
    },
    planState: {
      currentPlan: ref(null),
      showApprovalModal: ref(false),
      createPlan: vi.fn(),
      requestApproval: vi.fn(() => true),
    },
    taskList: { tasks: [], setTasks: vi.fn(), updateTaskStatus: vi.fn(() => true) },
    facts: { getMemories: vi.fn(() => []), addMemory: vi.fn() } as never,
    agentMemory: {
      getSession: vi.fn(() => null),
      setSession: vi.fn(),
      clearSession: vi.fn(),
      updateProgress: vi.fn(),
      getStack: vi.fn(() => []),
      pushTask: vi.fn(),
      popTask: vi.fn(() => null),
      peekTask: vi.fn(() => null),
      clearStack: vi.fn(),
    } as never,
    ...overrides,
  }
}
