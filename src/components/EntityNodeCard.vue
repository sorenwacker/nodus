<script setup lang="ts">
import { computed } from 'vue'
import { useEdgesStore } from '../stores/edges'
import Icon from './Icon.vue'
import type { Node, EntityNodeType } from '../types'

const props = defineProps<{
  entity: Node
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

const edgesStore = useEdgesStore()

// Entity type icons
const entityIcons: Record<EntityNodeType, string> = {
  character: 'user',
  location: 'map-pin',
  citation: 'quote',
  term: 'file-text',
  item: 'box',
}

// Entity type colors (for the indicator dot)
const entityColors: Record<EntityNodeType, string> = {
  character: '#8b5cf6', // Purple
  location: '#22c55e', // Green
  citation: '#3b82f6', // Blue
  term: '#f59e0b',     // Amber
  item: '#6b7280',     // Gray
}

const entityType = computed(() => props.entity.node_type as EntityNodeType)
const icon = computed(() => entityIcons[entityType.value] || 'box')
const color = computed(() => props.entity.color_theme || entityColors[entityType.value] || '#6b7280')

// Count appearances/links to this entity
const linkCount = computed(() => {
  const edges = edgesStore.getEntityEdgesForNode(props.entity.id, 'incoming')
  return edges.length
})

// Get subtitle from metadata or use link count
const subtitle = computed(() => {
  const count = linkCount.value
  if (count === 0) return 'No appearances'
  if (count === 1) return '1 appearance'
  return `${count} appearances`
})
</script>

<template>
  <div class="entity-card" @click="emit('click')">
    <div class="entity-indicator" :style="{ backgroundColor: color }"></div>
    <div class="entity-content">
      <div class="entity-header">
        <Icon :name="icon" :size="12" class="entity-icon" />
        <span class="entity-title">{{ entity.title }}</span>
      </div>
      <span class="entity-subtitle">{{ subtitle }}</span>
    </div>
  </div>
</template>

<style scoped>
.entity-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.1s;
}

.entity-card:hover {
  background: var(--bg-elevated);
}

.entity-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}

.entity-content {
  flex: 1;
  min-width: 0;
}

.entity-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.entity-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.entity-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-subtitle {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
