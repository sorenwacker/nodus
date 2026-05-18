/**
 * LLM Tools Composable
 *
 * Handles tools that require LLM calls or complex state manipulation.
 * Uses extracted tool handlers from llm/tools/handlers/ where available.
 */

import type { Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { Node } from '../../../types'
import type { AgentTask, AgentPlan } from '../../../llm/types'
import { quickResearch } from '../../../llm/research'
import { evalMathExpr } from '../../../llm/utils'
import {
  batchClassifyForMove,
  batchClassifyForConnect,
} from '../../../llm/batchClassifier'
import {
  executeRegisteredTool,
  hasToolHandler,
  type ToolContext,
} from '../../../llm/tools/handlers'

/**
 * LLM Queue interface (subset of llmQueue)
 */
export interface LLMQueueInterface {
  generate: (prompt: string, system?: string, priority?: number) => Promise<string>
}

/**
 * Edge interface for LLM tools
 */
export interface LLMToolsEdge {
  id: string
  source_node_id: string
  target_node_id: string
  color?: string | null
}

/**
 * Node store interface for LLM tools
 * Uses getter functions for reactive data to ensure fresh values
 */
export interface LLMToolsNodeStore {
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => LLMToolsEdge[]
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeColor: (id: string, color: string) => Promise<void>
  updateEdgeColor?: (id: string, color: string | null) => Promise<void>
  createEdge: (data: {
    source_node_id: string
    target_node_id: string
    label?: string
    color?: string
  }) => Promise<unknown>
  currentWorkspaceId?: string | null
}

/**
 * Themes store interface
 */
export interface ThemesStoreInterface {
  themes: Array<{
    id: string
    name: string
    display_name: string
    yaml_content: string
    is_builtin: number
  }>
  builtinThemes: Array<{ name: string }>
  customThemes: Array<{ name: string }>
  currentThemeName: string
  createTheme: (input: {
    name: string
    display_name: string
    yaml_content: string
  }) => Promise<{ id: string; name: string }>
  updateTheme: (input: {
    id: string
    yaml_content: string
    display_name: string
  }) => Promise<void>
  setTheme: (name: string) => void
}

/**
 * Plan state interface
 */
export interface PlanStateInterface {
  currentPlan: Ref<AgentPlan | null>
  createPlan: (
    title: string,
    steps: Array<{ description: string; details?: string }>
  ) => AgentPlan
  requestApproval: () => boolean
}

/**
 * Memory storage interface
 */
export interface MemoryStorageInterface {
  addMemory: (workspaceId: string, message: string) => void
}

/**
 * Agent memory storage interface (session + stack)
 */
export interface AgentMemoryStorageInterface {
  getSession: (workspaceId: string) => import('../../../llm/types').SessionMemory | null
  setSession: (workspaceId: string, session: import('../../../llm/types').SessionMemory) => void
  clearSession: (workspaceId: string) => void
  updateProgress: (workspaceId: string, progress: number, completedAction?: string) => void
  getStack: (workspaceId: string) => import('../../../llm/types').StackTask[]
  pushTask: (workspaceId: string, task: Omit<import('../../../llm/types').StackTask, 'id' | 'created_at'>) => import('../../../llm/types').StackTask
  popTask: (workspaceId: string) => import('../../../llm/types').StackTask | null
  peekTask: (workspaceId: string) => import('../../../llm/types').StackTask | null
  clearStack: (workspaceId: string) => void
}

/**
 * Context for LLM tools
 */
export interface LLMToolsContext {
  llmQueue: LLMQueueInterface
  callOllama: (prompt: string, system?: string) => Promise<string>
  store: LLMToolsNodeStore
  themesStore: ThemesStoreInterface
  planState: PlanStateInterface
  tasks: Ref<AgentTask[]>
  memoryStorage: MemoryStorageInterface
  agentMemoryStorage: AgentMemoryStorageInterface
  log: (msg: string) => void
  pushContentUndo: (id: string, content: string | null, title: string) => void
  isRunning?: Ref<boolean>  // Optional: allows tools to check if agent was stopped
}

/**
 * LLM Tools composable
 */
export function useLLMTools(ctx: LLMToolsContext) {
  const { llmQueue, callOllama, store, themesStore, planState, tasks, memoryStorage, agentMemoryStorage, log, pushContentUndo, isRunning } = ctx

  /** Check if agent was stopped */
  function isCancelled(): boolean {
    return isRunning?.value === false
  }

  /**
   * Execute an LLM-dependent tool
   * Returns result string or null if tool not handled
   */
  async function executeLLMTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string | null> {
    // Check if tool has an extracted handler in the registry
    if (hasToolHandler(name)) {
      const toolCtx: ToolContext = {
        llmQueue,
        callOllama,
        store,
        themesStore,
        planState,
        tasks,
        memoryStorage,
        agentMemoryStorage,
        log,
        pushContentUndo,
        isCancelled,
      }
      return executeRegisteredTool(name, args, toolCtx)
    }

    // Handle remaining tools that haven't been extracted yet
    switch (name) {
      case 'for_each_node': {
        let nodes = [...store.getFilteredNodes()]
        const filter = (args.filter as string) || 'all'
        if (filter === 'empty') {
          nodes = nodes.filter((n) => !n.markdown_content?.trim())
        } else if (filter === 'has_content') {
          nodes = nodes.filter((n) => n.markdown_content?.trim())
        } else if (filter !== 'all') {
          const term = filter.toLowerCase()
          nodes = nodes.filter(
            (n) =>
              n.title.toLowerCase().includes(term) ||
              n.markdown_content?.toLowerCase().includes(term)
          )
        }
        if (nodes.length === 0) return `No nodes match filter "${filter}"`
        log(`> Iterating ${nodes.length} nodes`)

        const results: string[] = []
        for (const node of nodes) {
          const num = parseInt(node.title.match(/\d+/)?.[0] || '0')
          const query = ((args.template as string) || '')
            .replace(/\{title\}/g, node.title)
            .replace(/\{([^}]+)\}/g, (_: string, expr: string) => evalMathExpr(expr, num))

          if (args.action === 'set') {
            pushContentUndo(node.id, node.markdown_content, node.title)
            await store.updateNodeContent(node.id, query)
            results.push(`${node.title}: set`)
          } else if (args.action === 'append') {
            pushContentUndo(node.id, node.markdown_content, node.title)
            await store.updateNodeContent(node.id, (node.markdown_content || '') + '\n\n' + query)
            results.push(`${node.title}: appended`)
          } else if (args.action === 'llm') {
            if (!node.markdown_content?.trim()) {
              results.push(`${node.title}: skipped (empty)`)
              continue
            }
            pushContentUndo(node.id, node.markdown_content, node.title)
            try {
              const prompt = `${query}\n\nContent to process:\n${node.markdown_content}`
              const system =
                'You are a text processor. Apply the instruction to the content. Output ONLY the processed text, nothing else.'
              const result = await callOllama(prompt, system)
              if (result?.trim()) {
                await store.updateNodeContent(node.id, result.trim())
                results.push(`${node.title}: processed`)
              }
            } catch (e) {
              results.push(`${node.title}: llm failed - ${e}`)
            }
          }
        }
        return `Processed ${nodes.length} nodes`
      }

      case 'smart_move': {
        const nodes = store.getFilteredNodes()
        if (nodes.length === 0) return 'No nodes to move'
        const instruction = (args.instruction as string) || ''
        log(`> Smart move: ${nodes.length} nodes (batch classification)`)

        // Use batch classification instead of per-node LLM calls
        const nodeClassifications = await batchClassifyForMove(
          nodes.map(n => ({ id: n.id, title: n.title, markdown_content: n.markdown_content })),
          instruction,
          llmQueue,
          { log, isCancelled }
        )

        // Group nodes by classification
        const groups: Map<string, typeof nodes> = new Map()
        for (const node of nodes) {
          const group = nodeClassifications.get(node.id) || 'other'
          if (!groups.has(group)) groups.set(group, [])
          groups.get(group)!.push(node)
        }

        // Position nodes by group
        let moved = 0
        const spacing = 250
        let groupX = 100
        for (const [, groupNodes] of groups) {
          for (let i = 0; i < groupNodes.length; i++) {
            await store.updateNodePosition(groupNodes[i].id, groupX, 100 + i * 180)
            moved++
          }
          groupX += spacing
        }
        return `Moved ${moved} nodes into ${groups.size} groups`
      }

      case 'smart_connect': {
        const nodes = store.getFilteredNodes()
        if (nodes.length < 2) return 'Need at least 2 nodes'
        const groupsArg = (args.groups as string) || ''
        log(`> Smart connect: ${nodes.length} nodes (batch classification)`)

        // Use batch classification instead of per-node LLM calls
        const nodeClassifications = await batchClassifyForConnect(
          nodes.map(n => ({ id: n.id, title: n.title, markdown_content: n.markdown_content })),
          groupsArg,
          llmQueue,
          { log, isCancelled }
        )

        // Group nodes by classification
        const groupedNodes = new Map<string, string[]>()
        for (const node of nodes) {
          const group = nodeClassifications.get(node.id) || 'other'
          if (!groupedNodes.has(group)) groupedNodes.set(group, [])
          groupedNodes.get(group)!.push(node.id)
        }

        // Create edges within groups
        let edgeCount = 0
        for (const [, ids] of groupedNodes) {
          for (let i = 0; i < ids.length - 1; i++) {
            await store.createEdge({ source_node_id: ids[i], target_node_id: ids[i + 1] })
            edgeCount++
          }
        }
        return `Created ${edgeCount} edges in ${groupedNodes.size} groups`
      }

      // Color handlers (smart_color, color_matching, color_regex, reset_edge_colors)
      // are now handled by the tool registry above

      case 'web_search': {
        const query = (args.query as string) || ''
        log(`> Web search: "${query}"`)
        try {
          const apiKey = localStorage.getItem('nodus_search_api_key')

          if (!apiKey) {
            log('> Web search: No API key')
            return 'Web search requires Tavily API key in Settings'
          }

          const results = await invoke<Array<{ title: string; url: string; content: string }>>(
            'web_search',
            { query, apiKey }
          )

          log(`> Web search: Found ${results.length} results`)

          if (results.length === 0) {
            return `No web results for "${query}"`
          }

          const formatted = results
            .map((r, i) => `${i + 1}. **${r.title}**\n${r.content}\n[${r.url}]`)
            .join('\n\n')

          return `## Web Search: "${query}"\n\n${formatted}`
        } catch (e) {
          log(`> Web search failed: ${e}`)
          return `Web search failed: ${e}`
        }
      }

      // Theme handlers (create_theme, update_theme, apply_theme, list_themes)
      // are now handled by the tool registry above

      case 'plan': {
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch {
            parsedArgs = {}
          }
        }
        const taskList = (parsedArgs.tasks as string[]) || []
        if (!Array.isArray(taskList) || taskList.length === 0) return 'No tasks provided'

        tasks.value = taskList.map((t: string, i: number) => ({
          id: `task-${i}`,
          description: t,
          status: 'pending' as const,
        }))

        log('--- PLAN ---')
        taskList.forEach((t: string, i: number) => {
          log(`[ ] ${i + 1}. ${t}`)
        })
        log('------------')

        return `Created plan with ${taskList.length} tasks`
      }

      case 'update_task': {
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch {
            parsedArgs = {}
          }
        }
        const taskIndex = (parsedArgs.task_index as number) ?? -1
        const status = (parsedArgs.status as string) || 'done'

        if (taskIndex < 0 || taskIndex >= tasks.value.length) {
          return `Invalid task index: ${taskIndex}`
        }

        const task = tasks.value[taskIndex]
        const oldStatus = task.status
        task.status = status === 'done' ? 'done' : status === 'failed' ? 'error' : 'running'

        const statusIcon = status === 'done' ? '[x]' : status === 'failed' ? '[!]' : '[>]'
        log(`${statusIcon} Task ${taskIndex + 1}: ${task.description} -> ${status}`)

        return `Task ${taskIndex + 1} updated: ${oldStatus} -> ${status}`
      }

      // Memory handlers (remember, set_goal, update_progress, complete_goal)
      // and stack handlers (push_task, pop_task, peek_stack, clear_stack)
      // are now handled by the tool registry above

      case 'create_plan': {
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch {
            parsedArgs = {}
          }
        }
        const title = (parsedArgs.title as string) || 'Untitled Plan'
        const steps = (parsedArgs.steps as Array<{ description: string; details?: string }>) || []

        if (!Array.isArray(steps) || steps.length === 0) {
          return 'No steps provided for plan'
        }

        const plan = planState.createPlan(title, steps)
        log(`> Plan created: ${title} (${steps.length} steps)`)

        return `__CREATE_PLAN__:${JSON.stringify({ planId: plan.id, title, stepCount: steps.length })}`
      }

      case 'request_approval': {
        if (!planState.currentPlan.value) {
          return 'No plan to approve'
        }

        const success = planState.requestApproval()
        if (!success) {
          return 'Failed to request approval'
        }

        log('> Requesting approval...')
        return `__REQUEST_APPROVAL__:${JSON.stringify({ planId: planState.currentPlan.value.id })}`
      }

      case 'research': {
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch {
            parsedArgs = {}
          }
        }
        const query = (parsedArgs.query as string) || ''
        if (!query) return 'No query provided'

        const sources = Array.isArray(parsedArgs.sources)
          ? (parsedArgs.sources as Array<'local' | 'web' | 'wikipedia'>)
          : (['local', 'web'] as Array<'local' | 'web' | 'wikipedia'>)

        log(`> Researching: ${query}`)

        try {
          const results = await quickResearch(query, store.getFilteredNodes(), sources)
          return results
        } catch (e) {
          return `Research failed: ${e}`
        }
      }

      default:
        return null
    }
  }

  return {
    executeLLMTool,
  }
}

export type UseLLMToolsReturn = ReturnType<typeof useLLMTools>
