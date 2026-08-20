/**
 * Display Settings Pinia Store
 * Provides reactive display thresholds that composables can depend on
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { displayStorage, uiStorage } from '../lib/storage'

export const useDisplayStore = defineStore('display', () => {
  // Reactive refs for all display settings
  const lodThreshold = ref(displayStorage.getLodThreshold())
  const semanticZoomThreshold = ref(displayStorage.getSemanticZoomThreshold())
  const edgeLabelZoomThreshold = ref(displayStorage.getEdgeLabelZoomThreshold())
  const edgeHoverThreshold = ref(displayStorage.getEdgeHoverThreshold())
  const magnifierZoomThreshold = ref(displayStorage.getMagnifierZoomThreshold())
  const magnifierEnabled = ref(uiStorage.getMagnifierEnabled())
  const fontScale = ref(uiStorage.getFontScale())
  const spellcheckEnabled = ref(uiStorage.getSpellcheckEnabled())
  const hoverTooltipEnabled = ref(uiStorage.getHoverTooltipEnabled())
  // Agent panel fold state: shared so the toolbar and the canvas agree
  const agentPanelCollapsed = ref(uiStorage.getAgentPanelCollapsed())

  // Reload all values from storage
  function reload() {
    lodThreshold.value = displayStorage.getLodThreshold()
    semanticZoomThreshold.value = displayStorage.getSemanticZoomThreshold()
    edgeLabelZoomThreshold.value = displayStorage.getEdgeLabelZoomThreshold()
    edgeHoverThreshold.value = displayStorage.getEdgeHoverThreshold()
    magnifierZoomThreshold.value = displayStorage.getMagnifierZoomThreshold()
    magnifierEnabled.value = uiStorage.getMagnifierEnabled()
    fontScale.value = uiStorage.getFontScale()
    spellcheckEnabled.value = uiStorage.getSpellcheckEnabled()
    hoverTooltipEnabled.value = uiStorage.getHoverTooltipEnabled()
    agentPanelCollapsed.value = uiStorage.getAgentPanelCollapsed()
  }

  function toggleAgentPanel() {
    agentPanelCollapsed.value = !agentPanelCollapsed.value
    uiStorage.setAgentPanelCollapsed(agentPanelCollapsed.value)
  }

  // Event handler for settings changes
  function handleSettingsChange() {
    reload()
  }

  // Setup event listener
  function setupListener() {
    window.addEventListener('nodus-display-settings-change', handleSettingsChange)
  }

  function cleanupListener() {
    window.removeEventListener('nodus-display-settings-change', handleSettingsChange)
  }

  return {
    // State
    lodThreshold,
    semanticZoomThreshold,
    edgeLabelZoomThreshold,
    edgeHoverThreshold,
    magnifierZoomThreshold,
    magnifierEnabled,
    fontScale,
    spellcheckEnabled,
    hoverTooltipEnabled,
    agentPanelCollapsed,
    // Actions
    toggleAgentPanel,
    reload,
    setupListener,
    cleanupListener,
  }
})
