<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const { t } = useI18n()

defineProps<{
  title: string
  activeIndex: number
  nodeCount: number
  hasEntities: boolean
  showEntitySidebar: boolean
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'toggle-toc'): void
  (e: 'toggle-entities'): void
}>()
</script>

<template>
  <header class="reader-header">
    <div class="header-left">
      <button
        class="toc-toggle"
        :title="t('storyline.toggleContents')"
        :aria-label="t('storyline.toggleContents')"
        @click="$emit('toggle-toc')"
      >
        <Icon name="menu" :size="18" />
      </button>
      <h1 class="reader-title">{{ title || t('storyline.loading') }}</h1>
    </div>
    <div class="header-right">
      <span class="page-indicator" aria-live="polite">{{ activeIndex + 1 }} / {{ nodeCount }}</span>
      <button
        v-if="hasEntities"
        class="entity-toggle"
        :class="{ active: showEntitySidebar }"
        :aria-label="showEntitySidebar ? 'Hide entity sidebar' : 'Show entity sidebar'"
        :aria-expanded="showEntitySidebar"
        @click="$emit('toggle-entities')"
      >
        <Icon name="user" :size="18" />
      </button>
      <button
        class="close-btn"
        :aria-label="t('storyline.closeEsc')"
        @click="$emit('close')"
      >
        <Icon name="close" :size="20" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toc-toggle {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toc-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.reader-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-indicator {
  font-size: 13px;
  color: var(--text-muted);
}

.entity-toggle {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.entity-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.entity-toggle.active {
  background: var(--primary-bg, rgba(59, 130, 246, 0.1));
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.close-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}
</style>
