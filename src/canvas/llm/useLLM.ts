/**
 * LLM composable
 * Manages LLM settings, state, and provides API access
 */
import { ref, watch } from 'vue'
import type { AgentTask, ChatMessage } from './types'
import { generate, chat } from './ollama'
import { agentTools } from './tools'
import { llmStorage } from '../../lib/storage'

const DEFAULT_SYSTEM_PROMPT = `You are a terse note-taker for a knowledge graph canvas.

FOR MULTIPLE NODES: When asked to create multiple nodes, output JSON array:
USER: create 3 nodes about databases
YOU:
\`\`\`json
[{"title":"SQL","content":"Structured query language for relational databases"},{"title":"NoSQL","content":"Document, key-value, graph databases"},{"title":"ACID","content":"Atomicity, Consistency, Isolation, Durability"}]
\`\`\`

FOR SINGLE CONTENT: Output directly without JSON.
USER: flowchart of auth
YOU:
\`\`\`mermaid
graph TD
    A[Login] --> B{Valid?}
    B -->|Yes| C[Home]
    B -->|No| A
\`\`\`

RULES:
- Multiple nodes = JSON array with title and content
- Diagrams = mermaid code blocks
- No ASCII art, no explanations`

export function useLLM() {
  // Settings (persisted via llmStorage)
  const model = ref(llmStorage.getModel())
  const contextLength = ref(llmStorage.getContextLength())
  const systemPrompt = ref(llmStorage.getSystemPrompt(DEFAULT_SYSTEM_PROMPT))

  // Persist settings
  watch(model, (v) => llmStorage.setModel(v))
  watch(contextLength, (v) => llmStorage.setContextLength(v))
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
   * Simple generate (no tools)
   */
  async function simpleGenerate(prompt: string, customSystem?: string): Promise<string> {
    return generate({
      model: model.value,
      prompt,
      system: customSystem || systemPrompt.value,
      contextLength: contextLength.value,
    })
  }

  /**
   * Chat with tool calling
   */
  async function chatWithTools(messages: ChatMessage[]): Promise<ChatMessage> {
    return chat({
      model: model.value,
      messages,
      tools: agentTools,
      contextLength: contextLength.value,
    })
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
    model,
    contextLength,
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
  }
}
