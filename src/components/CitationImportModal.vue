<script setup lang="ts">
import { ref, computed } from 'vue'
import type { BibEntry } from '../lib/bibtex'
import { formatAuthors } from '../lib/bibtex'

const props = defineProps<{
  entries: BibEntry[]
  filename: string
}>()

const emit = defineEmits<{
  (e: 'import', selected: BibEntry[]): void
  (e: 'cancel'): void
}>()

const selected = ref<Set<string>>(new Set(props.entries.map(e => e.key)))

const allSelected = computed(() => selected.value.size === props.entries.length)
const noneSelected = computed(() => selected.value.size === 0)

function toggleAll() {
  if (allSelected.value) {
    selected.value = new Set()
  } else {
    selected.value = new Set(props.entries.map(e => e.key))
  }
}

function toggle(key: string) {
  if (selected.value.has(key)) {
    selected.value.delete(key)
  } else {
    selected.value.add(key)
  }
  selected.value = new Set(selected.value) // trigger reactivity
}

function importSelected() {
  const selectedEntries = props.entries.filter(e => selected.value.has(e.key))
  emit('import', selectedEntries)
}

function formatAuthorShort(entry: BibEntry): string {
  const authors = formatAuthors(entry.author || '')
  if (authors.length === 0) return ''
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`
  return `${authors[0]} et al.`
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Import Citations</h2>
        <span class="filename">{{ filename }}</span>
        <button class="close-btn" data-tooltip="Close" @click="emit('cancel')">x</button>
      </div>

      <div class="selection-controls">
        <label class="select-all">
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate="!allSelected && !noneSelected"
            @change="toggleAll"
          />
          Select all ({{ entries.length }})
        </label>
        <span class="selected-count">{{ selected.size }} selected</span>
      </div>

      <div class="citations-list">
        <label
          v-for="entry in entries"
          :key="entry.key"
          class="citation-item"
          :class="{ selected: selected.has(entry.key) }"
        >
          <input
            type="checkbox"
            :checked="selected.has(entry.key)"
            @change="toggle(entry.key)"
          />
          <div class="citation-info">
            <div class="citation-title">{{ entry.title || entry.key }}</div>
            <div class="citation-meta">
              <span v-if="entry.author" class="author">{{ formatAuthorShort(entry) }}</span>
              <span v-if="entry.year" class="year">({{ entry.year }})</span>
              <span v-if="entry.journal" class="venue">{{ entry.journal }}</span>
              <span v-else-if="entry.booktitle" class="venue">{{ entry.booktitle }}</span>
            </div>
          </div>
        </label>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="emit('cancel')">Cancel</button>
        <button
          class="btn-import"
          :disabled="noneSelected"
          @click="importSelected"
        >
          Import {{ selected.size }} citation{{ selected.size === 1 ? '' : 's' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  background: var(--bg-node, #fff);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-node, #e4e4e7);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text-main, #18181b);
}

.filename {
  color: var(--text-muted, #71717a);
  font-size: 13px;
  flex: 1;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-muted, #71717a);
  padding: 4px 8px;
}

.close-btn:hover {
  color: var(--text-main, #18181b);
}

.selection-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-node, #e4e4e7);
  background: var(--bg-canvas, #f4f4f5);
}

.select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-main, #18181b);
}

.selected-count {
  font-size: 13px;
  color: var(--text-muted, #71717a);
}

.citations-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.citation-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.15s;
}

.citation-item:hover {
  background: var(--bg-canvas, #f4f4f5);
}

.citation-item.selected {
  background: color-mix(in srgb, var(--primary-color, #3b82f6) 10%, transparent);
}

.citation-item input[type="checkbox"] {
  margin-top: 3px;
  flex-shrink: 0;
}

.citation-info {
  flex: 1;
  min-width: 0;
}

.citation-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main, #18181b);
  margin-bottom: 4px;
  line-height: 1.3;
}

.citation-meta {
  font-size: 12px;
  color: var(--text-muted, #71717a);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.citation-meta .author {
  font-weight: 500;
}

.citation-meta .venue {
  font-style: italic;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-node, #e4e4e7);
}

.btn-cancel, .btn-import {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-node, #e4e4e7);
  color: var(--text-main, #18181b);
}

.btn-cancel:hover {
  background: var(--bg-canvas, #f4f4f5);
}

.btn-import {
  background: var(--primary-color, #3b82f6);
  border: none;
  color: white;
}

.btn-import:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-import:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
