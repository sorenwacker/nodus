import { ref } from 'vue'
import { llmStorage } from '../../../lib/storage'

/**
 * Manages LLM-related state for the canvas.
 * Provides reactive state for prompts, loading indicators, and panel visibility.
 */
export function useCanvasLLMState() {
  // Prompt input
  const graphPrompt = ref('')

  // Loading state
  const isGraphLLMLoading = ref(false)

  // Panel visibility
  const showAgentLogPanel = ref(false)

  // LLM feature toggle (persisted)
  const llmEnabled = ref(llmStorage.getLLMEnabled())

  function clearGraphPrompt() {
    graphPrompt.value = ''
  }

  return {
    // Prompt ref
    graphPrompt,

    // Loading state
    isGraphLLMLoading,

    // Panel visibility
    showAgentLogPanel,
    llmEnabled,

    // Helpers
    clearGraphPrompt,
  }
}
