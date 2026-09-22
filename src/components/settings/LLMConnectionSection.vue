<script setup lang="ts">
/**
 * Settings > AI > Connection: provider, key, URL, model, streaming.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage } from '../../lib/storage'
import type { ProviderSettings } from '../../composables/useProviderSettings'

const props = defineProps<{ settings: ProviderSettings }>()
const { t } = useI18n()

const {
  providers,
  selectedProvider,
  providerStatus,
  providerError,
  availableModels,
  loadingModels,
  requiresApiKey,
  apiKeyStatus,
  apiKey,
  baseUrl,
  selectedModel,
  fetchModels,
  validateApiKey,
} = props.settings

const llmStreaming = ref(llmStorage.getLLMStreaming())
watch(llmStreaming, value => llmStorage.setLLMStreaming(value))
</script>

<template>
  <div class="setting-group">
    <label>{{ t('llm.provider') }}</label>
    <div class="input-with-status">
      <select v-model="selectedProvider">
        <option v-for="p in providers" :key="p.id" :value="p.id">
          {{ p.name }}
        </option>
      </select>
      <span
        class="status-indicator"
        :class="providerStatus"
        :title="providerStatus === 'online' ? t('llm.status.connected') : providerStatus === 'offline' ? t('llm.status.notConnected') : t('llm.status.checking')"
      />
    </div>
    <p v-if="providerError" class="provider-error">{{ providerError }}</p>
  </div>

  <div class="cost-warning">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
    <div class="cost-warning-text">
      <strong>{{ t('llm.costWarning.title') }}</strong>
      <span>{{ t('llm.costWarning.message') }}</span>
    </div>
  </div>

  <div v-if="requiresApiKey || selectedProvider === 'openai-compatible'" class="setting-group">
    <label>{{ t('llm.apiKey.label') }} {{ !requiresApiKey ? t('llm.apiKey.optional') : '' }}</label>
    <div class="input-with-status">
      <input
        v-model="apiKey"
        type="password"
        :placeholder="requiresApiKey ? t('llm.apiKey.placeholder') : t('llm.apiKey.optionalPlaceholder')"
      />
      <button
        v-if="apiKey && apiKeyStatus !== 'validating'"
        class="validate-btn"
        :title="t('llm.apiKey.validate')"
        @click="validateApiKey"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </button>
      <span
        v-if="apiKeyStatus !== 'idle'"
        class="status-indicator"
        :class="apiKeyStatus"
        :title="apiKeyStatus === 'valid' ? t('llm.apiKey.valid') : apiKeyStatus === 'invalid' ? t('llm.apiKey.invalid') : t('llm.apiKey.validating')"
      />
    </div>
    <span class="hint">
      {{ selectedProvider === 'openai' ? t('llm.hints.openai') : selectedProvider === 'openai-compatible' ? t('llm.hints.compatible') : t('llm.hints.anthropic') }}
    </span>
  </div>

  <div class="setting-group">
    <label>{{ selectedProvider === 'ollama' ? t('llm.baseUrl.ollamaLabel') : t('llm.baseUrl.label') }}</label>
    <input
      v-model="baseUrl"
      type="text"
      :placeholder="selectedProvider === 'ollama' ? t('llm.baseUrl.ollamaPlaceholder') : t('llm.baseUrl.placeholder')"
    />
  </div>

  <div class="setting-group">
    <label>{{ t('llm.model.label') }}</label>
    <div class="input-with-status">
      <input
        v-model="selectedModel"
        type="text"
        list="model-list"
        :placeholder="t('llm.model.placeholder')"
        :disabled="loadingModels"
      />
      <datalist id="model-list">
        <option v-for="model in availableModels" :key="model.id" :value="model.id">
          {{ model.name || model.id }}
        </option>
      </datalist>
      <button
        class="refresh-btn"
        :disabled="loadingModels"
        :title="t('llm.model.fetch')"
        @click="fetchModels"
      >
        <svg
          :class="{ spinning: loadingModels }"
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        >
          <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
    </div>
    <span v-if="availableModels.length > 0" class="hint">
      {{ t('llm.model.available', { count: availableModels.length }) }}
    </span>
    <span v-else class="hint">{{ t('llm.model.fetchHint') }}</span>
  </div>

  <div class="setting-group">
    <label class="checkbox-label">
      <input v-model="llmStreaming" type="checkbox" />
      {{ t('llm.streaming.label') }}
    </label>
    <span class="hint">{{ t('llm.streaming.hint') }}</span>
  </div>
</template>
