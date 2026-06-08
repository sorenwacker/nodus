import { ref, computed } from 'vue'
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

  // LLM configuration status (reactive to storage changes)
  const llmConfigured = ref(llmStorage.isLLMConfigured())

  // Combined: show AI bar only if enabled AND configured
  const showLLMBar = computed(() => llmEnabled.value && llmConfigured.value)

  function clearGraphPrompt() {
    graphPrompt.value = ''
  }

  function refreshLLMConfigured() {
    llmConfigured.value = llmStorage.isLLMConfigured()
  }

  return {
    // Prompt ref
    graphPrompt,

    // Loading state
    isGraphLLMLoading,

    // Panel visibility
    showAgentLogPanel,
    llmEnabled,
    llmConfigured,
    showLLMBar,

    // Helpers
    clearGraphPrompt,
    refreshLLMConfigured,
  }
}
