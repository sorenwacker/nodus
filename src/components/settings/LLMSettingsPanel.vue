<script setup lang="ts">
/**
 * Settings > AI: the LLM Features toggle, then the documented sections in
 * order (PRODUCT_DESIGN.md > Settings > AI).
 */
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage } from '../../lib/storage'
import { useNodesStore } from '../../stores/nodes'
import { useProviderSettings } from '../../composables/useProviderSettings'
import { AI_SETTINGS_SECTIONS } from './aiSections'
import SettingsSection from './SettingsSection.vue'
import LLMConnectionSection from './LLMConnectionSection.vue'
import LLMGenerationSection from './LLMGenerationSection.vue'
import WebSearchSettingsSection from './WebSearchSettingsSection.vue'
import PromptSettingsSection from './PromptSettingsSection.vue'
import AgentSettingsSection from './AgentSettingsSection.vue'

const { t } = useI18n()
const store = useNodesStore()
const workspaceId = computed(() => store.currentWorkspaceId)

const llmEnabled = ref(llmStorage.getLLMEnabled())
watch(llmEnabled, value => {
  llmStorage.setLLMEnabled(value)
  window.dispatchEvent(new CustomEvent('nodus-llm-enabled-change', { detail: value }))
})

const providerSettings = useProviderSettings()

const sections = {
  connection: LLMConnectionSection,
  generation: LLMGenerationSection,
  search: WebSearchSettingsSection,
  prompts: PromptSettingsSection,
  agent: AgentSettingsSection,
}
</script>

<template>
  <div class="settings-section">
    <div class="setting-group">
      <label class="checkbox-label">
        <input v-model="llmEnabled" type="checkbox" />
        {{ t('settings.llmEnabled') }}
      </label>
      <span class="hint">{{ t('settings.llmEnabledHint') }}</span>
    </div>

    <template v-if="llmEnabled">
      <SettingsSection
        v-for="section in AI_SETTINGS_SECTIONS"
        :key="section.id"
        :title="t(section.labelKey)"
        :collapsed="section.collapsed"
      >
        <component
          :is="sections[section.id]"
          v-bind="section.id === 'agent' ? { workspaceId } : { settings: providerSettings }"
        />
      </SettingsSection>
    </template>
  </div>
</template>
