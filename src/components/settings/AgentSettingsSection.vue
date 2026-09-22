<script setup lang="ts">
/**
 * Settings > AI > Agent: the mode a run starts in, the tools the agent has,
 * and the facts it has remembered for this workspace
 * (PRODUCT_DESIGN.md > Agent section).
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage, memoryStorage, type AgentStartMode } from '../../lib/storage'
import { describeAgentTools } from '../../llm/toolCatalog'
import type { AgentToolMode } from '../../llm/registry'

const props = defineProps<{ workspaceId: string | null }>()
const { t } = useI18n()

const defaultMode = ref<AgentStartMode>(llmStorage.getDefaultAgentMode())
watch(defaultMode, value => llmStorage.setDefaultAgentMode(value))

// The table is read from the registry declarations, so it cannot describe a
// tool the agent does not have
const searchKey = ref(llmStorage.getSearchApiKey())
const tools = computed(() => describeAgentTools({ search: searchKey.value.length > 0 }))

function modesLabel(modes: AgentToolMode[]): string {
  return modes.map(m => t(`settings.agent.modes.${m}`)).join(', ')
}

const facts = ref<string[]>([])
function loadFacts() {
  facts.value = props.workspaceId ? memoryStorage.getMemories(props.workspaceId) : []
}
watch(() => props.workspaceId, loadFacts, { immediate: true })

function forgetFact(index: number) {
  if (!props.workspaceId) return
  memoryStorage.removeMemory(props.workspaceId, index)
  loadFacts()
}

function forgetAll() {
  if (!props.workspaceId) return
  memoryStorage.clearMemories(props.workspaceId)
  loadFacts()
}
</script>

<template>
  <div class="setting-group">
    <label>{{ t('settings.agent.defaultMode') }}</label>
    <select v-model="defaultMode" data-default-mode>
      <option value="plan">{{ t('settings.agent.modes.plan') }}</option>
      <option value="explore">{{ t('settings.agent.modes.explore') }}</option>
    </select>
    <span class="hint">{{ t('settings.agent.defaultModeHint') }}</span>
  </div>

  <div class="setting-group">
    <label>{{ t('settings.agent.tools') }}</label>
    <span class="hint">{{ t('settings.agent.toolsHint') }}</span>
    <div class="settings-table-scroll">
      <table class="settings-table">
        <thead>
          <tr>
            <th>{{ t('settings.agent.tool') }}</th>
            <th>{{ t('settings.agent.offeredIn') }}</th>
            <th>{{ t('settings.agent.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tool in tools" :key="tool.name" :data-tool="tool.name">
            <td>
              <code>{{ tool.name }}</code>
              <span v-if="tool.mutates" class="muted"> · {{ t('settings.agent.changesGraph') }}</span>
            </td>
            <td>
              <span v-if="tool.modes.length > 0">{{ modesLabel(tool.modes) }}</span>
              <span v-else class="muted" :title="tool.unexposedReason">{{ t('settings.agent.notOffered') }}</span>
            </td>
            <td>
              <span v-if="tool.missing.includes('search')" class="unavailable">{{ t('settings.agent.needsSearchKey') }}</span>
              <span v-else-if="tool.modes.length > 0" class="muted">{{ t('settings.agent.available') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="setting-group">
    <label>
      {{ t('settings.agent.facts') }}
      <button v-if="facts.length > 0" class="text-btn" @click="forgetAll">{{ t('settings.agent.forgetAll') }}</button>
    </label>
    <span class="hint">{{ t('settings.agent.factsHint') }}</span>
    <p v-if="facts.length === 0" class="hint">{{ t('settings.agent.noFacts') }}</p>
    <ul v-else class="settings-list">
      <li v-for="(fact, index) in facts" :key="index" data-fact>
        <span>{{ fact }}</span>
        <button class="text-btn" :title="t('settings.agent.forget')" @click="forgetFact(index)">
          {{ t('settings.agent.forget') }}
        </button>
      </li>
    </ul>
  </div>
</template>
