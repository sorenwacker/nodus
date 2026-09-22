<script setup lang="ts">
/**
 * Settings > AI > Prompts: the system prompt and the agent prompt, each with a
 * reset to the built-in default.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage } from '../../lib/storage'
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_AGENT_PROMPT } from '../../llm/prompts'

const { t } = useI18n()

const systemPrompt = ref(llmStorage.getSystemPrompt(''))
const agentPrompt = ref(llmStorage.getAgentPrompt(''))

watch(systemPrompt, value => llmStorage.setSystemPrompt(value))
watch(agentPrompt, value => llmStorage.setAgentPrompt(value))
</script>

<template>
  <div class="setting-group">
    <label>
      {{ t('llm.systemPrompt.label') }}
      <button class="text-btn" @click="systemPrompt = ''">{{ t('llm.systemPrompt.reset') }}</button>
    </label>
    <textarea v-model="systemPrompt" rows="4" :placeholder="DEFAULT_SYSTEM_PROMPT" />
  </div>

  <div class="setting-group">
    <label>
      {{ t('llm.agentPrompt.label') }}
      <button class="text-btn" @click="agentPrompt = ''">{{ t('llm.agentPrompt.reset') }}</button>
    </label>
    <textarea v-model="agentPrompt" rows="6" :placeholder="DEFAULT_AGENT_PROMPT" />
  </div>
</template>
