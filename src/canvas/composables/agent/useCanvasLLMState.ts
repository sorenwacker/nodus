import { ref } from 'vue'
import { llmStorage } from '../../../lib/storage'

/**
 * Manages LLM-related state for the canvas.
 * Provides reactive state for prompts, loading indicators, and panel visibility.
 */
export function useCanvasLLMState() {
  // Prompt inputs
  const graphPrompt = ref('')
  const nodePrompt = ref('')

  // Loading states
  const isGraphLLMLoading = ref(false)
  const isNodeLLMLoading = ref(false)

  // Panel visibility
  const showAgentLogPanel = ref(false)

  // LLM feature toggle (persisted)
  const llmEnabled = ref(llmStorage.getLLMEnabled())

  // AbortController for canceling node LLM requests
  let nodeLLMAbortController: AbortController | null = null

  function setNodeLLMAbortController(controller: AbortController | null) {
    nodeLLMAbortController = controller
  }

  function getNodeLLMAbortController(): AbortController | null {
    return nodeLLMAbortController
  }

  function clearGraphPrompt() {
    graphPrompt.value = ''
  }

  function clearNodePrompt() {
    nodePrompt.value = ''
  }

  return {
    // Prompt refs
    graphPrompt,
    nodePrompt,

    // Loading states
    isGraphLLMLoading,
    isNodeLLMLoading,

    // Panel visibility
    showAgentLogPanel,
    llmEnabled,

    // Abort controller management
    setNodeLLMAbortController,
    getNodeLLMAbortController,

    // Helpers
    clearGraphPrompt,
    clearNodePrompt,
  }
}
