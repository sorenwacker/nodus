<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

// Shortcuts with translation keys
const shortcuts = computed(() => [
  // Navigation
  { category: t('shortcuts.categories.navigation'), key: t('shortcuts.keys.scroll'), desc: t('shortcuts.descriptions.panCanvas') },
  { category: t('shortcuts.categories.navigation'), key: t('shortcuts.keys.pinchZoom'), desc: t('shortcuts.descriptions.zoomInOut') },
  { category: t('shortcuts.categories.navigation'), key: t('shortcuts.keys.fit'), desc: t('shortcuts.descriptions.fitToView') },
  { category: t('shortcuts.categories.navigation'), key: t('shortcuts.keys.neighborhood'), desc: t('shortcuts.descriptions.toggleNeighborhood') },

  // Selection
  { category: t('shortcuts.categories.selection'), key: t('shortcuts.keys.click'), desc: t('shortcuts.descriptions.selectNode') },
  { category: t('shortcuts.categories.selection'), key: t('shortcuts.keys.shiftClick'), desc: t('shortcuts.descriptions.addToSelection') },
  { category: t('shortcuts.categories.selection'), key: t('shortcuts.keys.selectAll'), desc: t('shortcuts.descriptions.selectAll') },
  { category: t('shortcuts.categories.selection'), key: t('shortcuts.keys.escape'), desc: t('shortcuts.descriptions.clearSelection') },

  // Editing
  { category: t('shortcuts.categories.editing'), key: t('shortcuts.keys.doubleClick'), desc: t('shortcuts.descriptions.editCreate') },
  { category: t('shortcuts.categories.editing'), key: t('shortcuts.keys.delete'), desc: t('shortcuts.descriptions.deleteSelected') },
  { category: t('shortcuts.categories.editing'), key: t('shortcuts.keys.undo'), desc: t('shortcuts.descriptions.undo') },
  { category: t('shortcuts.categories.editing'), key: t('shortcuts.keys.redo'), desc: t('shortcuts.descriptions.redo') },

  // Layout
  { category: t('shortcuts.categories.layout'), key: t('shortcuts.keys.layout'), desc: t('shortcuts.descriptions.autoLayout') },
  { category: t('shortcuts.categories.layout'), key: t('shortcuts.keys.resetSizes'), desc: t('shortcuts.descriptions.resetSizes') },

  // Data
  { category: t('shortcuts.categories.data'), key: t('shortcuts.keys.dropFiles'), desc: t('shortcuts.descriptions.importFiles') },
  { category: t('shortcuts.categories.data'), key: t('shortcuts.keys.export'), desc: t('shortcuts.descriptions.exportYaml') },
  { category: t('shortcuts.categories.data'), key: t('shortcuts.keys.refresh'), desc: t('shortcuts.descriptions.refreshFiles') },

  // Math
  { category: t('shortcuts.categories.math'), key: t('shortcuts.keys.inlineMath'), desc: t('shortcuts.descriptions.inlineMath') },
  { category: t('shortcuts.categories.math'), key: t('shortcuts.keys.displayMath'), desc: t('shortcuts.descriptions.displayMath') },
])

const filteredShortcuts = computed(() => {
  if (!searchQuery.value.trim()) return shortcuts.value
  const q = searchQuery.value.toLowerCase()
  return shortcuts.value.filter(s =>
    s.key.toLowerCase().includes(q) ||
    s.desc.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q)
  )
})

const groupedShortcuts = computed(() => {
  const groups: Record<string, Array<{ category: string; key: string; desc: string }>> = {}
  for (const s of filteredShortcuts.value) {
    if (!groups[s.category]) groups[s.category] = []
    groups[s.category].push(s)
  }
  return groups
})

// Close on Escape
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

watch(() => props.show, (show) => {
  if (show) {
    searchQuery.value = ''
    window.addEventListener('keydown', handleKeydown)
    // Focus search input when modal opens
    nextTick(() => {
      searchInputRef.value?.focus()
    })
  } else {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      @click="emit('close')"
      @keydown.escape="emit('close')"
    >
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2 id="keyboard-shortcuts-title">{{ t('shortcuts.title') }}</h2>
          <button class="close-btn" aria-label="Close" @click="emit('close')">&times;</button>
        </div>

        <div class="search-box">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="t('shortcuts.search')"
            class="search-input"
            aria-label="Search keyboard shortcuts"
          />
        </div>

        <div class="shortcuts-list">
          <div v-for="(items, category) in groupedShortcuts" :key="category" class="shortcut-group">
            <h3>{{ category }}</h3>
            <div v-for="s in items" :key="s.key" class="shortcut-row">
              <span class="shortcut-key">{{ s.key }}</span>
              <span class="shortcut-desc">{{ s.desc }}</span>
            </div>
          </div>

          <div v-if="filteredShortcuts.length === 0" class="no-results">
            {{ t('search.noResults') }}
          </div>
        </div>

        <div class="modal-footer">
          {{ t('shortcuts.toggle') }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fade-in 0.15s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  box-shadow: 0 8px 32px var(--shadow-md);
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  animation: slide-up 0.2s ease-out;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-main);
}

.search-box {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-surface-alt);
  color: var(--text-main);
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.shortcuts-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.shortcut-group {
  margin-bottom: 20px;
}

.shortcut-group:last-child {
  margin-bottom: 0;
}

.shortcut-group h3 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin: 0 0 10px 0;
}

.shortcut-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.shortcut-key {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-main);
  background: var(--bg-elevated);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-default);
}

.shortcut-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.no-results {
  text-align: center;
  color: var(--text-muted);
  padding: 24px;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-default);
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.modal-footer kbd {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  background: var(--bg-elevated);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--border-default);
}
</style>
