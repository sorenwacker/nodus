<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'
import type { EntityNodeType } from '../types'
import { ENTITY_NODE_TYPES } from '../types'

const emit = defineEmits<{
  (e: 'create', type: EntityNodeType, title: string, color?: string): void
  (e: 'close'): void
}>()

const selectedType = ref<EntityNodeType>('character')
const title = ref('')
const color = ref('#8b5cf6')
const titleInput = ref<HTMLInputElement | null>(null)

// Entity type config
const entityConfig: Record<EntityNodeType, { icon: string; label: string; defaultColor: string; placeholder: string }> = {
  character: { icon: 'user', label: 'Character', defaultColor: '#8b5cf6', placeholder: 'Character name...' },
  location: { icon: 'map-pin', label: 'Location', defaultColor: '#22c55e', placeholder: 'Location name...' },
  citation: { icon: 'quote', label: 'Citation', defaultColor: '#3b82f6', placeholder: 'Citation title...' },
  term: { icon: 'file-text', label: 'Term', defaultColor: '#f59e0b', placeholder: 'Term name...' },
  item: { icon: 'box', label: 'Item', defaultColor: '#6b7280', placeholder: 'Item name...' },
}

function selectType(type: EntityNodeType) {
  selectedType.value = type
  color.value = entityConfig[type].defaultColor
}

function handleCreate() {
  if (!title.value.trim()) return
  emit('create', selectedType.value, title.value.trim(), color.value)
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.entity-create-popover')) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  titleInput.value?.focus()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="entity-create-popover" @click.stop>
    <div class="popover-header">
      <span class="popover-title">Create Entity</span>
      <button class="close-btn" @click="emit('close')">
        <Icon name="close" :size="14" />
      </button>
    </div>

    <!-- Type selector -->
    <div class="type-selector">
      <button
        v-for="type in ENTITY_NODE_TYPES"
        :key="type"
        class="type-option"
        :class="{ active: selectedType === type }"
        @click="selectType(type)"
      >
        <Icon :name="entityConfig[type].icon" :size="14" />
        <span>{{ entityConfig[type].label }}</span>
      </button>
    </div>

    <!-- Title input -->
    <div class="input-group">
      <input
        ref="titleInput"
        v-model="title"
        type="text"
        :placeholder="entityConfig[selectedType].placeholder"
        class="title-input"
        @keydown.enter="handleCreate"
        @keydown.escape="emit('close')"
      />
    </div>

    <!-- Color picker -->
    <div class="color-picker-row">
      <label class="color-label">Color:</label>
      <label class="color-picker">
        <span class="color-swatch" :style="{ backgroundColor: color }"></span>
        <input v-model="color" type="color" />
      </label>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="cancel-btn" @click="emit('close')">Cancel</button>
      <button
        class="create-btn"
        :disabled="!title.trim()"
        @click="handleCreate"
      >
        Create
      </button>
    </div>
  </div>
</template>

<style scoped>
.entity-create-popover {
  position: absolute;
  top: 100%;
  right: 0;
  width: 260px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  margin-top: 4px;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-default);
}

.popover-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.type-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-default);
}

.type-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.type-option:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.type-option.active {
  background: var(--primary-bg, rgba(59, 130, 246, 0.1));
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.input-group {
  padding: 12px 14px;
}

.title-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.title-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.title-input::placeholder {
  color: var(--text-muted);
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 12px;
}

.color-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.color-picker {
  position: relative;
  cursor: pointer;
}

.color-picker input[type="color"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.color-swatch {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid var(--border-default);
  transition: border-color 0.1s;
}

.color-picker:hover .color-swatch {
  border-color: var(--text-muted);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--border-default);
}

.cancel-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.cancel-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.create-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: var(--primary-color);
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.create-btn:hover {
  opacity: 0.9;
}

.create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
