/**
 * LLM Tools Composable
 *
 * Handles tools that require LLM calls or complex state manipulation.
 * These tools were extracted from PixiCanvas.vue switch cases.
 */

import type { Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { Node } from '../../types'
import type { AgentTask, AgentPlan } from '../llm/types'
import { quickResearch } from '../llm/research'

/**
 * LLM Queue interface (subset of llmQueue)
 */
export interface LLMQueueInterface {
  generate: (prompt: string, system?: string, priority?: number) => Promise<string>
}

/**
 * Node store interface for LLM tools
 */
export interface LLMToolsNodeStore {
  filteredNodes: Node[]
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeColor: (id: string, color: string) => Promise<void>
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
  log: (msg: string) => void
  pushContentUndo: (id: string, content: string | null, title: string) => void
}

/**
 * LLM Tools composable
 */
export function useLLMTools(ctx: LLMToolsContext) {
  const { llmQueue, callOllama, store, themesStore, planState, tasks, memoryStorage, log, pushContentUndo } = ctx

  /**
   * Execute an LLM-dependent tool
   * Returns result string or null if tool not handled
   */
  async function executeLLMTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string | null> {
    switch (name) {
      case 'for_each_node': {
        let nodes = [...store.filteredNodes]
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

        const evalExpr = (expr: string, n: number): string => {
          try {
            const safe = expr.replace(/\bn\b/g, String(n)).replace(/\^/g, '**')
            if (!/^[\d\s+\-*/().]+$/.test(safe)) return expr
            return String(
              Math.round(Function(`"use strict"; return (${safe})`)() * 1000) / 1000
            )
          } catch {
            return expr
          }
        }

        const results: string[] = []
        for (const node of nodes) {
          const num = parseInt(node.title.match(/\d+/)?.[0] || '0')
          const query = ((args.template as string) || '')
            .replace(/\{title\}/g, node.title)
            .replace(/\{([^}]+)\}/g, (_: string, expr: string) => evalExpr(expr, num))

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
        const nodes = store.filteredNodes
        if (nodes.length === 0) return 'No nodes to move'
        const instruction = (args.instruction as string) || ''
        log(`> Smart move: ${nodes.length} nodes`)

        let categories: string[] = []
        try {
          const prompt = `Extract category names from: "${instruction}"\nList ONLY categories separated by comma:`
          const response = await llmQueue.generate(prompt)
          categories = (response || '')
            .toLowerCase()
            .split(/[,\n]+/)
            .map((c: string) => c.trim())
            .filter((c: string) => c.length > 1)
        } catch {
          /* ignore LLM errors, use fallback categories */
        }
        if (categories.length < 2) categories = ['left', 'right']

        const groups: Map<string, typeof nodes> = new Map()
        for (const node of nodes) {
          try {
            const prompt = `Classify "${node.title}" into ONE of: ${categories.join(', ')}\nAnswer with ONLY the category:`
            const response = await llmQueue.generate(prompt)
            const group = (response || 'other').toLowerCase().trim().split(/\s+/)[0]
            if (!groups.has(group)) groups.set(group, [])
            groups.get(group)!.push(node)
          } catch {
            /* ignore classification errors */
          }
        }

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
        const nodes = store.filteredNodes
        if (nodes.length < 2) return 'Need at least 2 nodes'
        const groupsArg = (args.groups as string) || ''
        log(`> Smart connect: ${nodes.length} nodes`)

        const nodeGroups: Map<string, string> = new Map()
        for (const node of nodes) {
          try {
            const prompt = `Classify "${node.title}" into ONE of: ${groupsArg}\nAnswer with ONLY the group name:`
            const response = await llmQueue.generate(prompt)
            nodeGroups.set(
              node.id,
              (response || 'other').toLowerCase().trim().split(/\s+/)[0]
            )
          } catch {
            /* ignore classification errors */
          }
        }

        let edgeCount = 0
        const groupedNodes = new Map<string, string[]>()
        for (const [id, group] of nodeGroups) {
          if (!groupedNodes.has(group)) groupedNodes.set(group, [])
          groupedNodes.get(group)!.push(id)
        }

        for (const [, ids] of groupedNodes) {
          for (let i = 0; i < ids.length - 1; i++) {
            await store.createEdge({ source_node_id: ids[i], target_node_id: ids[i + 1] })
            edgeCount++
          }
        }
        return `Created ${edgeCount} edges in ${groupedNodes.size} groups`
      }

      case 'smart_color': {
        const nodes = store.filteredNodes
        if (nodes.length === 0) return 'No nodes to color'
        const instruction = (args.instruction as string) || ''
        log(`> Smart color: ${nodes.length} nodes`)

        let colorMappings: Array<{ category: string; color: string }> = []
        try {
          const prompt = `Extract category-to-color mappings from: "${instruction}"
Output as JSON array: [{"category":"name","color":"#hex"}]
Available colors: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink), #6b7280 (gray)
Example: "departments red, people blue" -> [{"category":"departments","color":"#ef4444"},{"category":"people","color":"#3b82f6"}]
Output ONLY the JSON array:`
          const response = await llmQueue.generate(prompt)
          const match = (response || '').match(/\[[\s\S]*\]/)
          if (match) colorMappings = JSON.parse(match[0])
        } catch {
          /* ignore LLM errors */
        }

        if (colorMappings.length === 0) return 'Could not parse color instruction'

        let colored = 0
        for (const node of nodes) {
          const nodeText = `${node.title} ${node.markdown_content || ''}`.toLowerCase()
          for (const { category, color } of colorMappings) {
            if (
              nodeText.includes(category.toLowerCase()) ||
              nodeText.includes(`#${category.toLowerCase()}`)
            ) {
              await store.updateNodeColor(node.id, color)
              colored++
              break
            }
          }
        }
        return `Colored ${colored} nodes`
      }

      case 'color_matching': {
        const pattern = ((args.pattern as string) || '').toLowerCase()
        const color = (args.color as string) || '#ef4444'
        if (!pattern) return 'Pattern required'

        const nodes = store.filteredNodes
        let colored = 0
        const matchedTitles: string[] = []
        for (const node of nodes) {
          const nodeText =
            `${node.title} ${node.markdown_content || ''} ${node.tags || ''}`.toLowerCase()
          if (nodeText.includes(pattern)) {
            await store.updateNodeColor(node.id, color)
            colored++
            matchedTitles.push(node.title)
          }
        }
        const preview = matchedTitles.slice(0, 5).join(', ')
        return `Colored ${colored}/${nodes.length} nodes matching "${pattern}": ${preview}${colored > 5 ? '...' : ''}`
      }

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

      case 'create_theme': {
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch {
            parsedArgs = {}
          }
        }
        const themeName = (parsedArgs.name as string) || 'custom-theme'
        const description = (parsedArgs.description as string) || ''
        log(`> Creating theme: ${themeName}`)

        try {
          const prompt = `Create a YAML theme configuration based on this description: "${description}"

The theme should have this structure:
name: "${themeName}"
display_name: "${themeName
            .split('-')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')}"
description: "${description}"
is_dark: false (or true if it's a dark theme)
variables:
  bg_canvas: "#hex"
  bg_surface: "#hex"
  bg_surface_alt: "#hex"
  bg_elevated: "#hex"
  text_main: "#hex"
  text_secondary: "#hex"
  text_muted: "#hex"
  border_default: "#hex"
  border_subtle: "#hex"
  primary_color: "#hex"
  danger_color: "#hex"
  danger_bg: "#hex"
  danger_border: "#hex"
  dot_color: "#hex"
  shadow_sm: "rgba(...)"
  shadow_md: "rgba(...)"

Make colors match the description. Be creative! Output ONLY the YAML, no explanations.`

          const yamlContent = await llmQueue.generate(prompt)
          if (!yamlContent) return 'Failed to generate theme'

          let cleanYaml = yamlContent.trim()
          if (cleanYaml.startsWith('```')) {
            cleanYaml = cleanYaml.replace(/^```(yaml)?\n?/, '').replace(/\n?```$/, '')
          }

          const newTheme = await themesStore.createTheme({
            name: themeName,
            display_name: themeName
              .split('-')
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' '),
            yaml_content: cleanYaml,
          })

          themesStore.setTheme(newTheme.name)
          return `Created and applied theme "${themeName}"`
        } catch (e) {
          console.error('[LLMTools] Error creating theme:', e)
          return `Failed to create theme: ${e}`
        }
      }

      case 'update_theme': {
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch {
            parsedArgs = {}
          }
        }
        const themeName = (parsedArgs.name as string) || ''
        const changes = (parsedArgs.changes as string) || ''
        if (!themeName) return 'Theme name required'
        log(`> Updating theme: ${themeName}`)

        try {
          const theme = themesStore.themes.find((t) => t.name === themeName)
          if (!theme) return `Theme "${themeName}" not found`
          if (theme.is_builtin === 1) return 'Cannot modify built-in themes'

          const prompt = `Update this theme YAML based on the instruction: "${changes}"

Current theme YAML:
${theme.yaml_content}

Apply the changes and output the complete updated YAML. Output ONLY the YAML, no explanations.`

          const yamlContent = await llmQueue.generate(prompt)
          if (!yamlContent) return 'Failed to generate updated theme'

          let cleanYaml = yamlContent.trim()
          if (cleanYaml.startsWith('```')) {
            cleanYaml = cleanYaml.replace(/^```(yaml)?\n?/, '').replace(/\n?```$/, '')
          }

          await themesStore.updateTheme({
            id: theme.id,
            yaml_content: cleanYaml,
            display_name: theme.display_name,
          })

          return `Updated theme "${themeName}"`
        } catch (e) {
          return `Failed to update theme: ${e}`
        }
      }

      case 'apply_theme': {
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch {
            parsedArgs = {}
          }
        }
        const themeName = (parsedArgs.name as string) || ''
        if (!themeName) return 'Theme name required'

        const theme = themesStore.themes.find((t) => t.name === themeName)
        if (!theme)
          return `Theme "${themeName}" not found. Available: ${themesStore.themes.map((t) => t.name).join(', ')}`

        themesStore.setTheme(themeName)
        return `Applied theme "${themeName}"`
      }

      case 'list_themes': {
        const builtin = themesStore.builtinThemes.map((t) => t.name)
        const custom = themesStore.customThemes.map((t) => t.name)
        return `Built-in themes: ${builtin.join(', ')}\nCustom themes: ${custom.length > 0 ? custom.join(', ') : '(none)'}\nCurrent: ${themesStore.currentThemeName}`
      }

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

      case 'remember': {
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch {
            parsedArgs = {}
          }
        }
        const message = (parsedArgs.message as string) || ''
        if (!message) return 'Nothing to remember'

        const workspaceId = store.currentWorkspaceId || 'default'
        memoryStorage.addMemory(workspaceId, message)

        log(`[memory] ${message}`)
        return `Remembered for this workspace: ${message}`
      }

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
          const results = await quickResearch(query, store.filteredNodes, sources)
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
