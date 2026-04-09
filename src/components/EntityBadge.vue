<script setup lang="ts">
import { computed } from 'vue'
import type { Node, EntityNodeType } from '../types'

const props = defineProps<{
  entity: Node
  size?: 'small' | 'normal'
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

// Entity type icons (using unicode for simplicity in badges)
const entityIcons: Record<EntityNodeType, string> = {
  character: '\u{1F464}', // bust
  location: '\u{1F4CD}', // pin
  citation: '\u{1F4D6}', // book
  term: '\u{1F4C4}', // page
  item: '\u{1F4E6}', // package
}

// Entity type colors
const entityColors: Record<EntityNodeType, string> = {
  character: '#8b5cf6', // Purple
  location: '#22c55e', // Green
  citation: '#3b82f6', // Blue
  term: '#f59e0b',     // Amber
  item: '#6b7280',     // Gray
}

const entityType = computed(() => props.entity.node_type as EntityNodeType)
const icon = computed(() => entityIcons[entityType.value] || '\u{1F517}')
const color = computed(() => props.entity.color_theme || entityColors[entityType.value] || '#6b7280')
</script>

<template>
  <span
    class="entity-badge"
    :class="{ small: size === 'small' }"
    :style="{ '--entity-color': color }"
    :title="entity.title"
    @click.stop="emit('click')"
  >
    <span class="entity-badge-icon">{{ icon }}</span>
    <span class="entity-badge-title">{{ entity.title }}</span>
  </span>
</template>

<style scoped>
.entity-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
  border-left: 3px solid var(--entity-color);
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  max-width: 120px;
  overflow: hidden;
}

.entity-badge:hover {
  background: rgba(0, 0, 0, 0.1);
}

.entity-badge.small {
  padding: 1px 4px;
  font-size: 10px;
  max-width: 80px;
}

.entity-badge-icon {
  font-size: 0.9em;
  flex-shrink: 0;
}

.entity-badge-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Dark mode */
:global([data-theme='dark']) .entity-badge {
  background: rgba(255, 255, 255, 0.08);
}

:global([data-theme='dark']) .entity-badge:hover {
  background: rgba(255, 255, 255, 0.12);
}
</style>
