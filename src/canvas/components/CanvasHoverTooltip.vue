<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Node } from '../../types'

const { t } = useI18n()

defineProps<{
  visible: boolean
  position: { x: number; y: number }
  node: Node | null
  content: string
  renderedContent?: string
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
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-if="renderedContent" class="hover-tooltip-content" v-html="renderedContent"></div>
    <div v-else-if="content" class="hover-tooltip-content">
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
  word-break: break-word;
  max-height: 200px;
  overflow: hidden;
}

/* Markdown content styles (using :deep for v-html content) */
.hover-tooltip-content :deep(p) {
  margin: 0 0 8px 0;
}

.hover-tooltip-content :deep(p:last-child) {
  margin-bottom: 0;
}

.hover-tooltip-content :deep(h1),
.hover-tooltip-content :deep(h2),
.hover-tooltip-content :deep(h3),
.hover-tooltip-content :deep(h4) {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  margin: 8px 0 4px 0;
}

.hover-tooltip-content :deep(h1:first-child),
.hover-tooltip-content :deep(h2:first-child),
.hover-tooltip-content :deep(h3:first-child) {
  margin-top: 0;
}

.hover-tooltip-content :deep(ul),
.hover-tooltip-content :deep(ol) {
  margin: 4px 0;
  padding-left: 16px;
}

.hover-tooltip-content :deep(li) {
  margin: 2px 0;
}

.hover-tooltip-content :deep(code) {
  font-family: monospace;
  font-size: 11px;
  background: var(--bg-muted);
  padding: 1px 4px;
  border-radius: 3px;
}

.hover-tooltip-content :deep(pre) {
  margin: 4px 0;
  padding: 6px;
  background: var(--bg-muted);
  border-radius: 4px;
  overflow-x: auto;
  font-size: 11px;
}

.hover-tooltip-content :deep(pre code) {
  background: none;
  padding: 0;
}

.hover-tooltip-content :deep(table) {
  border-collapse: collapse;
  font-size: 11px;
  margin: 4px 0;
}

.hover-tooltip-content :deep(th),
.hover-tooltip-content :deep(td) {
  border: 1px solid var(--border-default);
  padding: 3px 6px;
}

.hover-tooltip-content :deep(th) {
  background: var(--bg-muted);
  font-weight: 600;
}

.hover-tooltip-content :deep(a) {
  color: var(--primary-color);
  text-decoration: none;
}

.hover-tooltip-content :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid var(--border-default);
  color: var(--text-muted);
}

/* Cyber theme tooltip glow */
:global([data-theme='cyber']) .hover-tooltip {
  border-color: rgba(0, 255, 204, 0.4);
  box-shadow: 0 0 20px rgba(0, 255, 204, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3);
}
</style>
