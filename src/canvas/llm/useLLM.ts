/**
 * LLM composable
 * Manages LLM settings, state, and provides API access
 */
import { ref, watch } from 'vue'
import type { AgentTask, ChatMessage } from './types'
import { providerRegistry } from './providers'
import { agentTools } from './tools'
import { llmStorage } from '../../lib/storage'
import { DEFAULT_SYSTEM_PROMPT } from './prompts'

export function useLLM() {
  // System prompt (shared across providers)
  const systemPrompt = ref(llmStorage.getSystemPrompt(DEFAULT_SYSTEM_PROMPT))

  // Persist system prompt
  watch(systemPrompt, (v) => llmStorage.setSystemPrompt(v))

  // Agent state
  const isRunning = ref(false)
  const tasks = ref<AgentTask[]>([])
  const log = ref<string[]>([])
  const conversationHistory = ref<ChatMessage[]>([])

  // Prompt history
  const promptHistory = ref<string[]>(llmStorage.getPromptHistory())
  let historyIndex = -1

  function savePromptToHistory(prompt: string) {
    if (prompt.trim() && promptHistory.value[promptHistory.value.length - 1] !== prompt) {
      promptHistory.value.push(prompt)
      if (promptHistory.value.length > 50) promptHistory.value.shift()
      llmStorage.setPromptHistory(promptHistory.value)
    }
    historyIndex = -1
  }

  function navigateHistory(direction: 'up' | 'down'): string | null {
    if (direction === 'up' && historyIndex < promptHistory.value.length - 1) {
      historyIndex++
      return promptHistory.value[promptHistory.value.length - 1 - historyIndex]
    } else if (direction === 'down' && historyIndex > 0) {
      historyIndex--
      return promptHistory.value[promptHistory.value.length - 1 - historyIndex]
    } else if (direction === 'down' && historyIndex === 0) {
      historyIndex = -1
      return ''
    }
    return null
  }

  /**
   * Initialize provider from storage
   */
  function initProvider() {
    const providerId = llmStorage.getProvider()
    providerRegistry.setActiveProvider(providerId)

    // Load provider config
    const config = llmStorage.getProviderConfig(providerId)
    if (Object.keys(config).length > 0) {
      providerRegistry.configureProvider(providerId, config)
    }
  }

  // Initialize on first use
  initProvider()

  /**
   * Simple generate (no tools)
   */
  async function simpleGenerate(prompt: string, customSystem?: string): Promise<string> {
    const provider = providerRegistry.getActiveProvider()
    const result = await provider.generate({
      prompt,
      system: customSystem || systemPrompt.value,
    })
    return result.content
  }

  /**
   * Chat with tool calling
   */
  async function chatWithTools(messages: ChatMessage[]): Promise<ChatMessage> {
    const provider = providerRegistry.getActiveProvider()
    const result = await provider.chat({
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
      })),
      tools: agentTools,
    })
    return result.message as ChatMessage
  }

  /**
   * Add to agent log
   */
  function addLog(message: string) {
    log.value.push(message)
  }

  /**
   * Clear agent state
   */
  function clearState() {
    tasks.value = []
    log.value = []
    conversationHistory.value = []
    isRunning.value = false
  }

  /**
   * Stop running agent
   */
  function stop() {
    isRunning.value = false
    addLog('Agent stopped by user')
  }

  return {
    // Settings
    systemPrompt,
    DEFAULT_SYSTEM_PROMPT,

    // State
    isRunning,
    tasks,
    log,
    conversationHistory,
    promptHistory,

    // Methods
    simpleGenerate,
    chatWithTools,
    addLog,
    clearState,
    stop,
    savePromptToHistory,
    navigateHistory,

    // Re-export tools for convenience
    agentTools,

    // Provider access
    getActiveProvider: () => providerRegistry.getActiveProvider(),
    getActiveProviderId: () => providerRegistry.getActiveProviderId(),
  }
}
