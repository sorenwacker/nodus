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
  getPromptHistory(): string[] {
    return parseJson<string[]>(localStorage.getItem(KEYS.promptHistory), [])
  },
  setPromptHistory(value: string[]): void {
    localStorage.setItem(KEYS.promptHistory, JSON.stringify(value))
  },
}

/**
 * Clear all Nodus data from localStorage
 */
export function clearAllStorage(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key))
}
