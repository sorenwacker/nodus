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
  llmModel: 'nodus_llm_model',
  llmContext: 'nodus_llm_context',
  llmPrompt: 'nodus_llm_prompt',
  llmAgentPrompt: 'nodus_llm_agent_prompt',
  llmUrl: 'nodus_llm_url',
  llmTimeout: 'nodus_llm_timeout',
  llmProvider: 'nodus_llm_provider',
  llmProviderConfigs: 'nodus_llm_provider_configs',
  canvasGridSnap: 'nodus_canvas_grid_snap',
  canvasGridSize: 'nodus_canvas_grid_size',
  canvasEdgeStyle: 'nodus_canvas_edge_style',
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
 * Theme storage
 */
export const themeStorage = {
  get(): 'light' | 'dark' {
    return localStorage.getItem(KEYS.theme) === 'dark' ? 'dark' : 'light'
  },
  set(value: 'light' | 'dark'): void {
    localStorage.setItem(KEYS.theme, value)
  },
  isDark(): boolean {
    return this.get() === 'dark'
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
  getModel(): string {
    return localStorage.getItem(KEYS.llmModel) || 'llama3.2'
  },
  setModel(value: string): void {
    localStorage.setItem(KEYS.llmModel, value)
  },
  getContextLength(): number {
    return parseInt(localStorage.getItem(KEYS.llmContext) || '4096', 10)
  },
  setContextLength(value: number): void {
    localStorage.setItem(KEYS.llmContext, String(value))
  },
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
  getUrl(): string {
    return localStorage.getItem(KEYS.llmUrl) || 'http://localhost:11434'
  },
  setUrl(value: string): void {
    localStorage.setItem(KEYS.llmUrl, value)
  },
  getTimeout(): number {
    return parseInt(localStorage.getItem(KEYS.llmTimeout) || '60000', 10)
  },
  setTimeout(value: number): void {
    localStorage.setItem(KEYS.llmTimeout, String(value))
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
  getEdgeStyle(): 'orthogonal' | 'diagonal' {
    const value = localStorage.getItem(KEYS.canvasEdgeStyle)
    return value === 'diagonal' ? 'diagonal' : 'orthogonal'
  },
  setEdgeStyle(value: 'orthogonal' | 'diagonal'): void {
    localStorage.setItem(KEYS.canvasEdgeStyle, value)
  },
}

/**
 * Clear all Nodus data from localStorage
 */
export function clearAllStorage(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key))
}
