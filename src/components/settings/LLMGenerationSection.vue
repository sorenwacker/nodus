<script setup lang="ts">
/**
 * Settings > AI > Generation: limits with working defaults. Collapsed by
 * default so they read as optional.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage } from '../../lib/storage'
import type { ProviderSettings } from '../../composables/useProviderSettings'

const props = defineProps<{ settings: ProviderSettings }>()
const { t } = useI18n()

const { maxTokens, contextWindow, timeoutSeconds } = props.settings

const MAX_TOKEN_PRESETS = [512, 1024, 2048, 4096, 8192, 16384, 32768]
const CONTEXT_PRESETS = [4096, 8192, 16384, 32768, 65536, 131072]

function short(n: number): string {
  return n >= 1024 ? `${n / 1024}k` : String(n)
}

const chainContextLimit = ref(llmStorage.getChainContextLimit())
watch(chainContextLimit, value => llmStorage.setChainContextLimit(value))
</script>

<template>
  <div class="setting-group">
    <label>{{ t('llm.maxTokens.label') }}</label>
    <div class="slider-group">
      <input v-model.number="maxTokens" type="range" min="256" max="32768" step="256" class="slider" />
      <span class="slider-value">{{ maxTokens >= 1024 ? (maxTokens / 1024).toFixed(1) + 'k' : maxTokens }}</span>
    </div>
    <div class="preset-buttons">
      <button
        v-for="preset in MAX_TOKEN_PRESETS"
        :key="preset"
        :class="{ active: maxTokens === preset }"
        @click="maxTokens = preset"
      >
        {{ short(preset) }}
      </button>
    </div>
    <span class="hint">{{ t('llm.maxTokens.hint') }}</span>
  </div>

  <div class="setting-group">
    <label>{{ t('llm.contextWindow.label') }}</label>
    <div class="input-with-presets">
      <input v-model.number="contextWindow" type="number" min="2048" max="131072" step="1024" />
      <div class="preset-buttons">
        <button
          v-for="preset in CONTEXT_PRESETS"
          :key="preset"
          :class="{ active: contextWindow === preset }"
          @click="contextWindow = preset"
        >
          {{ short(preset) }}
        </button>
      </div>
    </div>
    <span class="hint">{{ t('llm.contextWindow.hint') }}</span>
  </div>

  <div class="setting-group">
    <label>{{ t('llm.timeout.label') }}</label>
    <input v-model.number="timeoutSeconds" type="number" min="10" max="300" step="10" />
  </div>

  <div class="setting-group">
    <label>{{ t('llm.neighborContext.label') }}</label>
    <div class="slider-group">
      <input v-model.number="chainContextLimit" type="range" min="0" max="200000" step="10000" class="slider" />
      <span class="slider-value">{{ chainContextLimit === 0 ? t('llm.neighborContext.off') : (chainContextLimit / 1000) + 'k' }}</span>
    </div>
    <span class="hint">{{ t('llm.neighborContext.hint') }}</span>
  </div>
</template>
