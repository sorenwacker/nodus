<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  visible: boolean
  nodePrompt: string
  isLoading: boolean
  nodeX: number
  nodeY: number
  nodeWidth: number
  scale: number
}>()

defineEmits<{
  (e: 'update:nodePrompt', value: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'keydown', event: KeyboardEvent): void
}>()
</script>

<template>
  <div
    v-if="visible"
    class="node-llm-bar-floating"
    :style="{
      left: nodeX + 'px',
      top: nodeY + 'px',
      transform: 'translateY(-100%)',
      width: nodeWidth + 'px'
    }"
    @pointerdown.stop
    @click.stop
  >
    <input
      :value="nodePrompt"
      type="text"
      :placeholder="isLoading ? t('canvas.node.processing') : t('canvas.node.askPlaceholder')"
      class="node-llm-input"
      :class="{ loading: isLoading }"
      tabindex="0"
      :disabled="isLoading"
      @input="$emit('update:nodePrompt', ($event.target as HTMLInputElement).value)"
      @pointerdown.stop
      @keydown.enter.stop="$emit('send')"
      @keydown.up.prevent="$emit('keydown', $event)"
      @keydown.down.prevent="$emit('keydown', $event)"
      @keydown.stop
    />
    <button
      v-if="!isLoading"
      class="node-llm-send"
      tabindex="0"
      :disabled="!nodePrompt.trim()"
      @pointerdown.stop
      @click.stop="$emit('send')"
    >
      AI
    </button>
    <button
      v-else
      class="node-llm-stop"
      tabindex="0"
      @pointerdown.stop
      @click.stop="$emit('stop')"
    >
      Stop
    </button>
  </div>
</template>
