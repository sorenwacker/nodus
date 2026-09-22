/**
 * The tool context a registry tool receives for one call.
 *
 * Built per call, so every value it carries is read when the tool runs rather
 * than when the canvas was composed (PRODUCT_DESIGN.md > Reads that stay live).
 *
 * The selection it carries is the run's capture. Selection tools read their
 * targets from here and from nowhere else, so a context built from the live
 * selection let a click made while the model was still thinking redirect the
 * change to a node the user never named
 * (PRODUCT_DESIGN.md > What the agent acts on).
 *
 * Every service a tool may need - the model, search, themes, plan state,
 * memory, layout - is composed here and injected. The tools reach for none of
 * them (PRODUCT_DESIGN.md > One implementation per tool).
 */
import type { Ref } from 'vue'
import { applyForceLayout } from '../../layout'
import type {
  LLMService,
  MemoryService,
  PlanService,
  SearchService,
  ThemesService,
  ToolContext,
} from '../../../llm/registry'
import type { LLMQueueInterface, AgentPlan, PlanStep } from '../../../llm/types'
import type { useNodesStore } from '../../../stores/nodes'
import type { memoryStorage, agentMemoryStorage } from '../../../lib/storage'

type NodesStore = ReturnType<typeof useNodesStore>

export interface PlanStateSource {
  currentPlan: Ref<AgentPlan | null>
  showApprovalModal: Ref<boolean>
  createPlan: (
    title: string,
    steps: Array<{ description: string; action?: PlanStep['action']; targets?: string[]; details?: string }>
  ) => AgentPlan
  requestApproval: () => boolean
}

export interface TaskListSource {
  /** The store unwraps its refs, so this is the array itself */
  tasks: Array<{ description: string; status: string }>
  setTasks: (tasks: Array<{ description: string; details?: string }>) => void
  updateTaskStatus: (index: number, status: 'pending' | 'in_progress' | 'done' | 'error') => boolean
}

export interface AgentToolContextDeps {
  store: NodesStore
  log: (msg: string) => void
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  snapToGrid: (value: number) => number
  getModel: () => string
  getContextLength: () => number
  pushContentUndo: ToolContext['pushContentUndo']
  pushContentsUndo: ToolContext['pushContentsUndo']
  service?: ToolContext['service']
  /** The selection captured when the run started, or null between runs. */
  getRunSelection: () => string[] | null
  getEditingNodeId: () => string | null
  llmQueue: LLMQueueInterface
  isRunning: Ref<boolean>
  search: SearchService
  themes: ThemesService
  planState: PlanStateSource
  taskList: TaskListSource
  facts: typeof memoryStorage
  agentMemory: typeof agentMemoryStorage
}

function llmService(deps: AgentToolContextDeps): LLMService {
  return {
    generate: (prompt, system, priority) => deps.llmQueue.generate(prompt, system, priority),
    isCancelled: () => deps.isRunning.value === false,
  }
}

function planService(deps: AgentToolContextDeps): PlanService {
  const { planState, taskList } = deps
  return {
    currentPlan: () => planState.currentPlan.value,
    createPlan: (title, steps) =>
      planState.createPlan(
        title,
        steps.map(s => ({ ...s, action: s.action as PlanStep['action'] }))
      ),
    requestApproval: () => planState.requestApproval(),
    isApprovalOpen: () => planState.showApprovalModal.value,
    setTasks: tasks => taskList.setTasks(tasks.map(description => ({ description }))),
    updateTaskStatus: (index, status) =>
      taskList.updateTaskStatus(
        index,
        status === 'done' ? 'done' : status === 'failed' ? 'error' : 'in_progress'
      ),
    taskCount: () => taskList.tasks.length,
    taskDescription: index => taskList.tasks[index]?.description,
  }
}

function memoryService(deps: AgentToolContextDeps): MemoryService {
  const { facts, agentMemory, store } = deps
  return {
    workspaceId: () => store.currentWorkspaceId,
    addFact: (workspaceId, message) => facts.addMemory(workspaceId, message),
    getSession: id => agentMemory.getSession(id),
    setSession: (id, session) => agentMemory.setSession(id, session),
    clearSession: id => agentMemory.clearSession(id),
    updateProgress: (id, progress, action) => agentMemory.updateProgress(id, progress, action),
    getStack: id => agentMemory.getStack(id),
    pushTask: (id, task) => agentMemory.pushTask(id, task),
    popTask: id => agentMemory.popTask(id),
    peekTask: id => agentMemory.peekTask(id),
    clearStack: id => agentMemory.clearStack(id),
  }
}

export function buildAgentToolContext(deps: AgentToolContextDeps): ToolContext {
  const { store } = deps
  return {
    store: {
      filteredNodes: store.filteredNodes,
      filteredEdges: store.filteredEdges,
      createNode: store.createNode,
      createEdge: store.createEdge,
      deleteNode: store.deleteNode,
      deleteEdge: store.deleteEdge,
      updateNodePosition: store.updateNodePosition,
      updateNodeContent: store.updateNodeContent,
      updateNodeTitle: store.updateNodeTitle,
      updateNodeTags: store.updateNodeTags,
      updateNodeColor: store.updateNodeColor,
      updateEdgeLabel: store.updateEdgeLabel,
      updateEdgeColor: store.updateEdgeColor,
      getFrames: () => store.filteredFrames,
      assignNodesToFrame: store.assignNodesToFrame,
      getStorylines: () => store.filteredStorylines,
      createFrame: (x: number, y: number, width: number, height: number, title: string) =>
        store.createFrame(x, y, width, height, title),
      createStoryline: (title: string, description?: string) =>
        store.createStoryline(title, description),
      addNodeToStoryline: (storylineId: string, nodeId: string) =>
        store.addNodeToStoryline(storylineId, nodeId),
    },
    log: deps.log,
    screenToCanvas: deps.screenToCanvas,
    snapToGrid: deps.snapToGrid,
    model: deps.getModel(),
    contextLength: deps.getContextLength(),
    pushContentUndo: deps.pushContentUndo,
    pushContentsUndo: deps.pushContentsUndo,
    service: deps.service,
    selectedNodeIds: deps.getRunSelection() ?? store.selectedNodeIds,
    editingNodeId: deps.getEditingNodeId(),
    llm: llmService(deps),
    search: deps.search,
    themes: deps.themes,
    plan: planService(deps),
    memory: memoryService(deps),
    // The canvas owns its layout and supplies it; the tool does not reach for it
    layout: { applyForceLayout },
  }
}
