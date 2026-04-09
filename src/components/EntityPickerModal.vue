<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useNodesStore } from '../stores/nodes'
import Icon from './Icon.vue'
import type { EntityNodeType } from '../types'
import { ENTITY_NODE_TYPES } from '../types'

defineProps<{
  visible: boolean
  sourceNodeIds: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', entityId: string): void
}>()

const store = useNodesStore()

const searchQuery = ref('')
const selectedType = ref<EntityNodeType | 'all'>('all')

// Entity type config
const entityConfig: Record<EntityNodeType, { icon: string; label: string }> = {
  character: { icon: 'user', label: 'Characters' },
  location: { icon: 'map-pin', label: 'Locations' },
  citation: { icon: 'quote', label: 'Citations' },
  term: { icon: 'file-text', label: 'Terms' },
  item: { icon: 'box', label: 'Items' },
}

// Filter entities
const filteredEntities = computed(() => {
  let entities = store.getEntities()

  // Filter by type
  if (selectedType.value !== 'all') {
    entities = entities.filter(n => n.node_type === selectedType.value)
  }

  // Filter by search
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    entities = entities.filter(n =>
      n.title.toLowerCase().includes(query)
    )
  }

  return entities
})

// Entity counts by type
const entityCounts = computed(() => {
  const allEntities = store.getEntities()
  const counts: Record<string, number> = { all: allEntities.length }

  for (const type of ENTITY_NODE_TYPES) {
    counts[type] = allEntities.filter(n => n.node_type === type).length
  }

  return counts
})

function selectEntity(entityId: string) {
  emit('select', entityId)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="entity-picker-overlay" @click.self="emit('close')">
      <div class="entity-picker-modal">
        <header class="picker-header">
          <h2 class="picker-title">Link to Entity</h2>
          <button class="close-btn" @click="emit('close')">
            <Icon name="close" :size="18" />
          </button>
        </header>

        <!-- Type filter -->
        <div class="type-filter">
          <button
            class="type-btn"
            :class="{ active: selectedType === 'all' }"
            @click="selectedType = 'all'"
          >
            All
            <span class="count">{{ entityCounts.all }}</span>
          </button>
          <button
            v-for="type in ENTITY_NODE_TYPES"
            :key="type"
            class="type-btn"
            :class="{ active: selectedType === type }"
            @click="selectedType = type"
          >
            <Icon :name="entityConfig[type].icon" :size="12" />
            <span class="count">{{ entityCounts[type] }}</span>
          </button>
        </div>

        <!-- Search -->
        <div class="search-bar">
          <Icon name="search" :size="14" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search entities..."
            class="search-input"
          />
        </div>

        <!-- Entity list -->
        <div class="entity-list">
          <button
            v-for="entity in filteredEntities"
            :key="entity.id"
            class="entity-item"
            @click="selectEntity(entity.id)"
          >
            <span
              class="entity-indicator"
              :style="{ backgroundColor: entity.color_theme || '#6b7280' }"
            ></span>
            <span class="entity-name">{{ entity.title }}</span>
            <span class="entity-type">{{ entityConfig[entity.node_type as EntityNodeType]?.label || entity.node_type }}</span>
          </button>

          <div v-if="filteredEntities.length === 0" class="empty-state">
            <p v-if="searchQuery">No entities matching "{{ searchQuery }}"</p>
            <p v-else>No entities available</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.entity-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 600;
}

.entity-picker-modal {
  width: 400px;
  max-height: 500px;
  background: var(--bg-surface);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
}

.picker-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
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

.type-filter {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-default);
  overflow-x: auto;
}

.type-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.type-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.type-btn.active {
  background: var(--primary-bg, rgba(59, 130, 246, 0.1));
  color: var(--primary-color);
}

.type-btn .count {
  font-size: 10px;
  padding: 1px 5px;
  background: var(--bg-surface-alt);
  border-radius: 8px;
}

.type-btn.active .count {
  background: var(--primary-color);
  color: white;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-default);
}

.search-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-main);
}

.search-input:focus {
  outline: none;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.entity-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.entity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  margin-bottom: 2px;
}

.entity-item:hover {
  background: var(--bg-elevated);
}

.entity-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.entity-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-type {
  font-size: 11px;
  color: var(--text-muted);
}

.empty-state {
  padding: 32px 20px;
  text-align: center;
}

.empty-state p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}
</style>
