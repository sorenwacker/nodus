<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Node } from '../../types'

const { t } = useI18n()

defineProps<{
  visible: boolean
  position: { x: number; y: number }
  node: Node | null
  content: string
}>()
</script>

<template>
  <div
    v-if="visible && node"
    class="hover-tooltip"
    :style="{
      left: (position.x + 16) + 'px',
      top: (position.y + 16) + 'px',
    }"
  >
    <div class="hover-tooltip-title">{{ node.title || t('canvas.node.untitled') }}</div>
    <div v-if="content" class="hover-tooltip-content">
      {{ content }}{{ content.length >= 200 ? '...' : '' }}
    </div>
  </div>
</template>

<style scoped>
.hover-tooltip {
  position: fixed;
  z-index: 9999;
  max-width: 300px;
  padding: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow-md);
  pointer-events: none;
  animation: tooltip-fade-in 0.15s ease-out;
}

@keyframes tooltip-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hover-tooltip-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-main);
  margin-bottom: 6px;
  line-height: 1.3;
}

.hover-tooltip-content {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Cyber theme tooltip glow */
:global([data-theme='cyber']) .hover-tooltip {
  border-color: rgba(0, 255, 204, 0.4);
  box-shadow: 0 0 20px rgba(0, 255, 204, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3);
}
</style>
