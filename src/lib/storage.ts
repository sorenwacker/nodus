/**
 * Centralized localStorage management
 * Single source of truth for all persisted state
 */
import type { Workspace } from '../types'

// Storage key definitions with types
const KEYS = {
  theme: 'nodus-theme',
  workspaces: 'nodus-workspaces',
  currentWorkspace: 'nodus-current-workspace',
  magnifier: 'nodus-magnifier',
  promptHistory: 'nodus-prompt-history',
  llmPrompt: 'nodus_llm_prompt',
  llmAgentPrompt: 'nodus_llm_agent_prompt',
  llmProvider: 'nodus_llm_provider',
  llmProviderConfigs: 'nodus_llm_provider_configs',
  llmEnabled: 'nodus_llm_enabled',
  llmStreaming: 'nodus_llm_streaming',
  canvasGridSnap: 'nodus_canvas_grid_snap',
  canvasGridSize: 'nodus_canvas_grid_size',
  canvasEdgeStyle: 'nodus_canvas_edge_style',
  chainContextLimit: 'nodus_chain_context_limit',
  searchApiKey: 'nodus_search_api_key',
} as const

/**
 * Safe JSON parse with fallback
 */
function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Theme storage (simplified - only stores theme name)
 * Full theme management is handled by the themes store
 */
export const themeStorage = {
  get(): string {
    return localStorage.getItem(KEYS.theme) || 'light'
  },
  set(value: string): void {
    localStorage.setItem(KEYS.theme, value)
  },
}

/**
 * Workspace storage
 */
export const workspaceStorage = {
  getAll(): Workspace[] {
    return parseJson<Workspace[]>(localStorage.getItem(KEYS.workspaces), [])
  },
  setAll(workspaces: Workspace[]): void {
    localStorage.setItem(KEYS.workspaces, JSON.stringify(workspaces))
  },
  getCurrent(): string | null {
    return localStorage.getItem(KEYS.currentWorkspace) || null
  },
  setCurrent(id: string | null): void {
    localStorage.setItem(KEYS.currentWorkspace, id || '')
  },
}

/**
 * UI preferences storage
 */
export const uiStorage = {
  getMagnifierEnabled(): boolean {
    return localStorage.getItem(KEYS.magnifier) !== 'false'
  },
  setMagnifierEnabled(value: boolean): void {
    localStorage.setItem(KEYS.magnifier, String(value))
  },
}

/**
 * LLM settings storage
 */
export const llmStorage = {
  getSystemPrompt(defaultPrompt: string): string {
    return localStorage.getItem(KEYS.llmPrompt) || defaultPrompt
  },
  setSystemPrompt(value: string): void {
    localStorage.setItem(KEYS.llmPrompt, value)
  },
  getAgentPrompt(defaultPrompt: string): string {
    return localStorage.getItem(KEYS.llmAgentPrompt) || defaultPrompt
  },
  setAgentPrompt(value: string): void {
    localStorage.setItem(KEYS.llmAgentPrompt, value)
  },
  getPromptHistory(): string[] {
    return parseJson<string[]>(localStorage.getItem(KEYS.promptHistory), [])
  },
  setPromptHistory(value: string[]): void {
    localStorage.setItem(KEYS.promptHistory, JSON.stringify(value))
  },
  getProvider(): string {
    return localStorage.getItem(KEYS.llmProvider) || 'ollama'
  },
  setProvider(value: string): void {
    localStorage.setItem(KEYS.llmProvider, value)
  },
  getProviderConfigs(): Record<string, Record<string, unknown>> {
    return parseJson<Record<string, Record<string, unknown>>>(
      localStorage.getItem(KEYS.llmProviderConfigs),
      {}
    )
  },
  setProviderConfigs(value: Record<string, Record<string, unknown>>): void {
    localStorage.setItem(KEYS.llmProviderConfigs, JSON.stringify(value))
  },
  getProviderConfig(providerId: string): Record<string, unknown> {
    const configs = this.getProviderConfigs()
    return configs[providerId] || {}
  },
  setProviderConfig(providerId: string, config: Record<string, unknown>): void {
    const configs = this.getProviderConfigs()
    configs[providerId] = config
    this.setProviderConfigs(configs)
  },
  getChainContextLimit(): number {
    return parseInt(localStorage.getItem(KEYS.chainContextLimit) || '25000', 10)
  },
  setChainContextLimit(value: number): void {
    localStorage.setItem(KEYS.chainContextLimit, String(value))
  },
  getSearchApiKey(): string {
    return localStorage.getItem(KEYS.searchApiKey) || ''
  },
  setSearchApiKey(value: string): void {
    localStorage.setItem(KEYS.searchApiKey, value)
  },
  getLLMEnabled(): boolean {
    return localStorage.getItem(KEYS.llmEnabled) !== 'false'
  },
  setLLMEnabled(value: boolean): void {
    localStorage.setItem(KEYS.llmEnabled, String(value))
  },
  getLLMStreaming(): boolean {
    return localStorage.getItem(KEYS.llmStreaming) === 'true'
  },
  setLLMStreaming(value: boolean): void {
    localStorage.setItem(KEYS.llmStreaming, String(value))
  },
}

/**
 * Canvas settings storage
 */
export const canvasStorage = {
  getGridSnap(): boolean {
    return localStorage.getItem(KEYS.canvasGridSnap) !== 'false'
  },
  setGridSnap(value: boolean): void {
    localStorage.setItem(KEYS.canvasGridSnap, String(value))
  },
  getGridSize(): number {
    return parseInt(localStorage.getItem(KEYS.canvasGridSize) || '20', 10)
  },
  setGridSize(value: number): void {
    localStorage.setItem(KEYS.canvasGridSize, String(value))
  },
  getEdgeStyle(): 'orthogonal' | 'diagonal' | 'curved' | 'straight' {
    const value = localStorage.getItem(KEYS.canvasEdgeStyle)
    if (value === 'diagonal' || value === 'curved' || value === 'straight') {
      return value
    }
    return 'orthogonal'
  },
  setEdgeStyle(value: 'orthogonal' | 'diagonal' | 'curved' | 'straight'): void {
    localStorage.setItem(KEYS.canvasEdgeStyle, value)
  },
}

/**
 * Per-workspace memory storage for agent
 */
export const memoryStorage = {
  getMemories(workspaceId: string): string[] {
    const key = `nodus_memories_${workspaceId}`
    const data = localStorage.getItem(key)
    if (!data) return []
    try {
      return JSON.parse(data) as string[]
    } catch {
      return []
    }
  },
  addMemory(workspaceId: string, memory: string): void {
    const memories = this.getMemories(workspaceId)
    memories.push(memory)
    // Keep last 50 memories
    const trimmed = memories.slice(-50)
    localStorage.setItem(`nodus_memories_${workspaceId}`, JSON.stringify(trimmed))
  },
  clearMemories(workspaceId: string): void {
    localStorage.removeItem(`nodus_memories_${workspaceId}`)
  },
}

/**
 * Clear all Nodus data from localStorage
 */
export function clearAllStorage(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key))
}
