<script setup lang="ts">
/**
 * Offers the highlights found in a dropped PDF for import.
 *
 * Which passages deserve a node is the reader's judgement, so nothing is
 * imported without being chosen. Highlights the file stores no text for are
 * listed as unavailable rather than hidden, because the reader can see them in
 * their PDF viewer (PRODUCT_DESIGN.md > PDF highlights as nodes).
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HighlightImport } from '../lib/pdfHighlights'

const props = defineProps<{
  entries: HighlightImport[]
  filename: string
}>()

const emit = defineEmits<{
  (e: 'import', entries: HighlightImport[]): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()

const selected = ref(new Set<string>())

// Everything importable and not already on the canvas starts selected: the
// common case is wanting the highlights, and deselecting is cheaper than
// ticking twenty boxes
watch(
  () => props.entries,
  entries => {
    selected.value = new Set(
      entries.filter(e => e.available && !e.alreadyImported).map(e => e.key)
    )
  },
  { immediate: true }
)

const unavailableCount = computed(() => props.entries.filter(e => !e.available).length)

function toggle(entry: HighlightImport, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(entry.key)
  else next.delete(entry.key)
  selected.value = next
}

function confirm() {
  emit(
    'import',
    props.entries.filter(e => selected.value.has(e.key))
  )
}
</script>

<template>
  <div class="highlight-backdrop" @click.self="emit('cancel')">
    <div class="highlight-dialog" role="dialog" aria-modal="true">
      <header class="highlight-header">
        <h2>{{ t('highlights.title') }}</h2>
        <span class="highlight-source">{{ filename }}</span>
      </header>

      <p class="highlight-lead">{{ t('highlights.lead', { count: entries.length }) }}</p>

      <ul class="highlight-list">
        <li
          v-for="entry in entries"
          :key="entry.key"
          class="highlight-row"
          :class="{ unavailable: !entry.available, imported: entry.alreadyImported }"
        >
          <input
            type="checkbox"
            :checked="selected.has(entry.key)"
            :disabled="!entry.available || entry.alreadyImported"
            @change="toggle(entry, ($event.target as HTMLInputElement).checked)"
          />
          <span class="highlight-swatch" :style="{ background: entry.color || 'transparent' }"></span>
          <div class="highlight-body">
            <p v-if="entry.available" class="highlight-text">{{ entry.text }}</p>
            <p v-else class="highlight-text muted">{{ t('highlights.noText') }}</p>
            <span class="highlight-meta">
              {{ t('highlights.page', { page: entry.page }) }}
              <template v-if="entry.annotation.author"> · {{ entry.annotation.author }}</template>
              <template v-if="entry.alreadyImported"> · {{ t('highlights.alreadyImported') }}</template>
            </span>
          </div>
        </li>
      </ul>

      <p v-if="unavailableCount > 0" class="highlight-note">
        {{ t('highlights.unavailableNote', { count: unavailableCount }) }}
      </p>

      <footer class="highlight-actions">
        <button class="highlight-cancel" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button class="highlight-confirm" @click="confirm">
          {{ t('highlights.confirm', { count: selected.size }) }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.highlight-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.highlight-dialog {
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100vw - 32px));
  max-height: min(680px, calc(100vh - 64px));
  padding: 20px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: 0 18px 48px var(--shadow-md);
}

.highlight-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.highlight-header h2 {
  margin: 0;
  font-size: 15px;
  color: var(--text-main);
}

.highlight-source {
  font-size: 11px;
  color: var(--text-muted);
}

.highlight-lead {
  margin: 6px 0 14px;
  font-size: 12px;
  color: var(--text-secondary);
}

.highlight-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.highlight-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 4px;
  border-top: 1px solid var(--border-default);
}

.highlight-row.unavailable,
.highlight-row.imported {
  opacity: 0.6;
}

.highlight-swatch {
  flex-shrink: 0;
  width: 4px;
  align-self: stretch;
  border-radius: 2px;
}

.highlight-body {
  min-width: 0;
}

.highlight-text {
  margin: 0 0 3px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-main);
}

.highlight-text.muted {
  font-style: italic;
  color: var(--text-muted);
}

.highlight-meta {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.highlight-note {
  margin: 12px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}

.highlight-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.highlight-cancel,
.highlight-confirm {
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: transparent;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.highlight-confirm {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
  font-weight: 600;
}
</style>
