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
  fontScale: 'nodus-font-scale',
  // Display thresholds
  lodThreshold: 'nodus-lod-threshold',
  semanticZoomThreshold: 'nodus-semantic-zoom-threshold',
  edgeHoverThreshold: 'nodus-edge-hover-threshold',
  magnifierZoomThreshold: 'nodus-magnifier-zoom-threshold',
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
  canvasHighlightAllEdges: 'nodus_canvas_highlight_all_edges',
  canvasDefaultLayout: 'nodus_canvas_default_layout',
  canvasRadialStyle: 'nodus_canvas_radial_style',
  canvasBubbleMode: 'nodus_canvas_bubble_mode',
  chainContextLimit: 'nodus_chain_context_limit',
  searchApiKey: 'nodus_search_api_key',
  showTagNodes: 'nodus_show_tag_nodes',
  zoteroUserId: 'nodus_zotero_user_id',
  zoteroApiKey: 'nodus_zotero_api_key',
  spellcheckEnabled: 'nodus_spellcheck_enabled',
  hoverTooltipEnabled: 'nodus_hover_tooltip_enabled',
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
  getFontScale(): number {
    const val = localStorage.getItem(KEYS.fontScale)
    return val ? parseFloat(val) : 1.0
  },
  setFontScale(value: number): void {
    localStorage.setItem(KEYS.fontScale, String(value))
  },
  getSpellcheckEnabled(): boolean {
    return localStorage.getItem(KEYS.spellcheckEnabled) === 'true'
  },
  setSpellcheckEnabled(value: boolean): void {
    localStorage.setItem(KEYS.spellcheckEnabled, String(value))
  },
  getHoverTooltipEnabled(): boolean {
    // Default to true - tooltips enabled by default
    return localStorage.getItem(KEYS.hoverTooltipEnabled) !== 'false'
  },
  setHoverTooltipEnabled(value: boolean): void {
    localStorage.setItem(KEYS.hoverTooltipEnabled, String(value))
  },
}

/**
 * Display and performance thresholds storage
 */
export const displayStorage = {
  // LOD (Level of Detail) mode threshold - show nodes as dots when this many visible
  getLodThreshold(): number {
    const val = localStorage.getItem(KEYS.lodThreshold)
    return val ? parseInt(val, 10) : 500
  },
  setLodThreshold(value: number): void {
    localStorage.setItem(KEYS.lodThreshold, String(value))
  },

  // Semantic zoom threshold - collapse nodes to title-only below this zoom level (0-1)
  getSemanticZoomThreshold(): number {
    const val = localStorage.getItem(KEYS.semanticZoomThreshold)
    return val ? parseFloat(val) : 0.5
  },
  setSemanticZoomThreshold(value: number): void {
    localStorage.setItem(KEYS.semanticZoomThreshold, String(value))
  },

  // Edge hover-only threshold - only show edges on hover when this many edges
  getEdgeHoverThreshold(): number {
    const val = localStorage.getItem(KEYS.edgeHoverThreshold)
    return val ? parseInt(val, 10) : 1500
  },
  setEdgeHoverThreshold(value: number): void {
    localStorage.setItem(KEYS.edgeHoverThreshold, String(value))
  },

  // Magnifier activation zoom threshold (0-1)
  getMagnifierZoomThreshold(): number {
    const val = localStorage.getItem(KEYS.magnifierZoomThreshold)
    return val ? parseFloat(val) : 0.4
  },
  setMagnifierZoomThreshold(value: number): void {
    localStorage.setItem(KEYS.magnifierZoomThreshold, String(value))
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
 * Canvas settings storage (workspace-specific)
 */
export const canvasStorage = {
  // Helper to get workspace-specific key
  _key(base: string, workspaceId?: string): string {
    return workspaceId ? `${base}_${workspaceId}` : base
  },

  getGridSnap(workspaceId?: string): boolean {
    return localStorage.getItem(this._key(KEYS.canvasGridSnap, workspaceId)) !== 'false'
  },
  setGridSnap(value: boolean, workspaceId?: string): void {
    localStorage.setItem(this._key(KEYS.canvasGridSnap, workspaceId), String(value))
  },
  getGridSize(workspaceId?: string): number {
    return parseInt(localStorage.getItem(this._key(KEYS.canvasGridSize, workspaceId)) || '20', 10)
  },
  setGridSize(value: number, workspaceId?: string): void {
    localStorage.setItem(this._key(KEYS.canvasGridSize, workspaceId), String(value))
  },
  getEdgeStyle(workspaceId?: string): 'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic' | 'straight' | 'direct' {
    const value = localStorage.getItem(this._key(KEYS.canvasEdgeStyle, workspaceId))
    if (value === 'diagonal' || value === 'curved' || value === 'hyperbolic' || value === 'straight' || value === 'direct') {
      return value
    }
    return 'orthogonal'
  },
  setEdgeStyle(value: 'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic' | 'straight' | 'direct', workspaceId?: string): void {
    localStorage.setItem(this._key(KEYS.canvasEdgeStyle, workspaceId), value)
  },
  getHighlightAllEdges(workspaceId?: string): boolean {
    return localStorage.getItem(this._key(KEYS.canvasHighlightAllEdges, workspaceId)) === 'true'
  },
  setHighlightAllEdges(value: boolean, workspaceId?: string): void {
    localStorage.setItem(this._key(KEYS.canvasHighlightAllEdges, workspaceId), String(value))
  },
  getDefaultLayout(workspaceId?: string): 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' | 'radial' {
    const value = localStorage.getItem(this._key(KEYS.canvasDefaultLayout, workspaceId))
    if (value === 'horizontal' || value === 'vertical' || value === 'force' || value === 'hierarchical' || value === 'radial') {
      return value
    }
    return 'grid'
  },
  setDefaultLayout(value: 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' | 'radial', workspaceId?: string): void {
    localStorage.setItem(this._key(KEYS.canvasDefaultLayout, workspaceId), value)
  },
  getRadialStyle(workspaceId?: string): 'compact' | 'spacious' {
    const value = localStorage.getItem(this._key(KEYS.canvasRadialStyle, workspaceId))
    if (value === 'spacious') return 'spacious'
    return 'compact'
  },
  setRadialStyle(value: 'compact' | 'spacious', workspaceId?: string): void {
    localStorage.setItem(this._key(KEYS.canvasRadialStyle, workspaceId), value)
  },
  getBubbleMode(workspaceId?: string): boolean {
    return localStorage.getItem(this._key(KEYS.canvasBubbleMode, workspaceId)) === 'true'
  },
  setBubbleMode(value: boolean, workspaceId?: string): void {
    localStorage.setItem(this._key(KEYS.canvasBubbleMode, workspaceId), String(value))
  },
}

/**
 * Tag settings storage
 */
export const tagStorage = {
  getShowTagNodes(): boolean {
    return localStorage.getItem(KEYS.showTagNodes) === 'true'
  },
  setShowTagNodes(value: boolean): void {
    localStorage.setItem(KEYS.showTagNodes, String(value))
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
 * Zotero Cloud API settings storage
 */
export const zoteroStorage = {
  getUserId(): string {
    return localStorage.getItem(KEYS.zoteroUserId) || ''
  },
  setUserId(value: string): void {
    localStorage.setItem(KEYS.zoteroUserId, value)
  },
  getApiKey(): string {
    return localStorage.getItem(KEYS.zoteroApiKey) || ''
  },
  setApiKey(value: string): void {
    localStorage.setItem(KEYS.zoteroApiKey, value)
  },
  isConfigured(): boolean {
    return Boolean(this.getUserId() && this.getApiKey())
  },
  clear(): void {
    localStorage.removeItem(KEYS.zoteroUserId)
    localStorage.removeItem(KEYS.zoteroApiKey)
  },
}

/**
 * Storyline reading position storage
 * Remembers scroll position when returning to a storyline
 */
export const storylineReadingStorage = {
  _key(storylineId: string): string {
    return `nodus-storyline-position-${storylineId}`
  },

  getPosition(storylineId: string): { nodeIndex: number; scrollTop: number } | null {
    const data = localStorage.getItem(this._key(storylineId))
    if (!data) return null
    try {
      return JSON.parse(data) as { nodeIndex: number; scrollTop: number }
    } catch {
      return null
    }
  },

  setPosition(storylineId: string, nodeIndex: number, scrollTop: number): void {
    localStorage.setItem(this._key(storylineId), JSON.stringify({ nodeIndex, scrollTop }))
  },

  clearPosition(storylineId: string): void {
    localStorage.removeItem(this._key(storylineId))
  },
}

/**
 * Clear all Nodus data from localStorage
 */
export function clearAllStorage(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key))
}
