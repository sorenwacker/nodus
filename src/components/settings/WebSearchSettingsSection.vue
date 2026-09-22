<script setup lang="ts">
/**
 * Settings > AI > Web search: the Tavily key the web_search and research
 * tools require. A tool credential, not a model parameter.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { llmStorage } from '../../lib/storage'

const { t } = useI18n()

const searchApiKey = ref(llmStorage.getSearchApiKey())
const searchKeyStatus = ref<'idle' | 'testing' | 'valid' | 'invalid'>('idle')

watch(searchApiKey, value => {
  llmStorage.setSearchApiKey(value)
  searchKeyStatus.value = 'idle'
})

async function testSearchKey() {
  if (!searchApiKey.value) return
  searchKeyStatus.value = 'testing'
  try {
    await invoke('web_search', { query: 'test', apiKey: searchApiKey.value })
    searchKeyStatus.value = 'valid'
  } catch {
    searchKeyStatus.value = 'invalid'
  }
}
</script>

<template>
  <div class="setting-group">
    <label>{{ t('llm.searchApi.label') }}</label>
    <div class="input-with-status">
      <input v-model="searchApiKey" type="password" :placeholder="t('llm.searchApi.placeholder')" />
      <button
        v-if="searchApiKey && searchKeyStatus !== 'testing'"
        class="validate-btn"
        :title="t('llm.searchApi.test')"
        @click="testSearchKey"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </button>
      <span
        v-if="searchKeyStatus !== 'idle'"
        class="status-indicator"
        :class="searchKeyStatus === 'testing' ? 'validating' : searchKeyStatus"
        :title="searchKeyStatus === 'valid' ? t('llm.apiKey.valid') : searchKeyStatus === 'invalid' ? t('llm.apiKey.invalid') : t('llm.searchApi.testing')"
      />
    </div>
    <span class="hint">
      {{ t('llm.searchApi.hint') }}
      <a href="https://tavily.com/" target="_blank" rel="noopener">tavily.com</a>
    </span>
  </div>
</template>
