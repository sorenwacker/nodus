<script setup lang="ts">
import Icon from './Icon.vue'
import type { Node, EntityNodeType } from '../types'
import { ENTITY_NODE_TYPES } from '../types'

defineProps<{
  entitiesByType: Record<EntityNodeType, Node[]>
  hasEntities: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate', entityId: string, direction: 'prev' | 'next'): void
  (e: 'pan-to-entity', entityId: string): void
}>()

// Entity type labels
const entityTypeLabels: Record<EntityNodeType, string> = {
  character: 'Characters',
  location: 'Locations',
  citation: 'Citations',
  term: 'Terms',
  item: 'Items',
}
</script>

<template>
  <aside class="entity-sidebar">
    <div class="entity-sidebar-header">
      <h3 class="entity-sidebar-title">In this scene</h3>
    </div>
    <div class="entity-sidebar-content">
      <template v-for="type in ENTITY_NODE_TYPES" :key="type">
        <div v-if="entitiesByType[type].length > 0" class="entity-type-section">
          <div class="entity-type-label">{{ entityTypeLabels[type] }}</div>
          <div
            v-for="entity in entitiesByType[type]"
            :key="entity.id"
            class="entity-item"
          >
            <span
              class="entity-indicator"
              :style="{ backgroundColor: entity.color_theme || '#6b7280' }"
            ></span>
            <span class="entity-name">{{ entity.title }}</span>
            <div class="entity-nav-btns">
              <button
                class="entity-nav-btn"
                title="Previous appearance"
                @click="emit('navigate', entity.id, 'prev')"
              >
                <Icon name="back" :size="10" />
              </button>
              <button
                class="entity-nav-btn"
                title="Next appearance"
                @click="emit('navigate', entity.id, 'next')"
              >
                <Icon name="forward" :size="10" />
              </button>
              <button
                class="entity-nav-btn"
                title="Go to entity on canvas"
                @click="emit('pan-to-entity', entity.id)"
              >
                <Icon name="link" :size="10" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <div v-if="!hasEntities" class="entity-empty">
        No entities in this scene
      </div>
    </div>
  </aside>
</template>

<style scoped>
.entity-sidebar {
  width: 220px;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.entity-sidebar-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-default);
}

.entity-sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.entity-sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.entity-type-section {
  margin-bottom: 16px;
}

.entity-type-section:last-child {
  margin-bottom: 0;
}

.entity-type-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.entity-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
}

.entity-item:hover {
  background: var(--bg-elevated);
}

.entity-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.entity-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-nav-btns {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.1s;
}

.entity-item:hover .entity-nav-btns {
  opacity: 1;
}

.entity-nav-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.entity-nav-btn:hover {
  background: var(--bg-surface);
  color: var(--primary-color);
}

.entity-empty {
  text-align: center;
  padding: 20px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
