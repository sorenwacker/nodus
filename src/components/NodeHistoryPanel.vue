<script setup lang="ts">
/**
 * Earlier versions of a node, with one shown in full so it can be read before
 * it is restored (PRODUCT_DESIGN.md > Node history). Lives in the fullscreen
 * editor in place of the preview pane.
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import { renderMarkdown } from '../services/MarkdownRenderService'
import type { NodeVersion } from '../types'

const props = defineProps<{
  nodeId: string
  /** Bump to reload, after a restore added a version */
  refresh?: number
}>()

const emit = defineEmits<{
  (e: 'restore', version: NodeVersion): void
  (e: 'close'): void
}>()

const { t, locale } = useI18n()
const store = useNodesStore()

const versions = ref<NodeVersion[]>([])
const selected = ref<NodeVersion | null>(null)

async function load() {
  versions.value = await store.getNodeHistory(props.nodeId)
  selected.value = versions.value[0] ?? null
}

watch([() => props.nodeId, () => props.refresh], load, { immediate: true })

function savedAt(version: NodeVersion): string {
  return new Date(version.saved_at * 1000).toLocaleString(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Each version names the write that replaced it */
function replacedBy(version: NodeVersion): string {
  if (version.source === 'file') return t('history.sourceFile')
  if (version.source === 'restore') return t('history.sourceRestore')
  return t('history.sourceApp')
}

// Safe: renderMarkdown returns sanitizeHtml() output
const rendered = computed(() => renderMarkdown(selected.value?.markdown_content ?? null))
</script>

<template>
  <div class="history-pane">
    <div class="pane-header history-header">
      <span>{{ t('history.title') }}</span>
      <button class="history-back" @click="emit('close')">{{ t('history.back') }}</button>
    </div>
    <div class="history-body">
      <ul class="history-list">
        <li v-if="versions.length === 0" class="history-empty">{{ t('history.empty') }}</li>
        <li
          v-for="version in versions"
          :key="version.id"
          class="history-item"
          :class="{ selected: selected?.id === version.id }"
          @click="selected = version"
        >
          <span class="history-time">{{ savedAt(version) }}</span>
          <span class="history-source">{{ replacedBy(version) }}</span>
          <span class="history-item-title">{{ version.title || t('fullscreen.untitled') }}</span>
        </li>
      </ul>
      <div v-if="selected" class="history-version">
        <div class="history-version-bar">
          <span class="history-version-title">{{ selected.title || t('fullscreen.untitled') }}</span>
          <button class="history-restore" @click="emit('restore', selected)">
            {{ t('history.restore') }}
          </button>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="history-content node-content" v-html="rendered"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-back,
.history-restore {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 4px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0;
}

.history-back:hover,
.history-restore:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.history-restore {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.history-restore:hover {
  background: var(--primary-hover);
  color: white;
}

.history-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 260px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border-subtle);
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
}

.history-item:hover {
  background: var(--bg-elevated);
}

.history-item.selected {
  background: var(--bg-surface-alt);
  box-shadow: inset 3px 0 0 var(--primary-color);
}

.history-time {
  font-size: 13px;
  color: var(--text-main);
}

.history-source,
.history-item-title {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-empty {
  padding: 16px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}

.history-version {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.history-version-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.history-version-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}
</style>
