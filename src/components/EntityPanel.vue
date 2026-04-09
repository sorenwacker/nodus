<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import Icon from './Icon.vue'
import EntityNodeCard from './EntityNodeCard.vue'
import EntityCreatePopover from './EntityCreatePopover.vue'
import type { EntityNodeType } from '../types'
import { ENTITY_NODE_TYPES } from '../types'

const { t } = useI18n()

const store = useNodesStore()
const showToast = inject<(message: string, type: 'error' | 'success' | 'info') => void>('showToast')

// Filter state
const selectedType = ref<EntityNodeType | 'all'>('all')
const searchQuery = ref('')
const showCreatePopover = ref(false)

// Get entity icons
const entityIcons: Record<EntityNodeType, string> = {
  character: 'user',
  location: 'map-pin',
  citation: 'quote',
  term: 'file-text',
  item: 'box',
}

// Entity type labels
const entityLabels: Record<EntityNodeType, string> = {
  character: 'Characters',
  location: 'Locations',
  citation: 'Citations',
  term: 'Terms',
  item: 'Items',
}

// Get all entities
const allEntities = computed(() => store.getEntities())

// Filter entities by type and search
const filteredEntities = computed(() => {
  let entities = allEntities.value

  // Filter by type
  if (selectedType.value !== 'all') {
    entities = entities.filter(n => n.node_type === selectedType.value)
  }

  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    entities = entities.filter(n =>
      n.title.toLowerCase().includes(query) ||
      n.markdown_content?.toLowerCase().includes(query)
    )
  }

  return entities
})

// Get counts by entity type
const entityCounts = computed(() => {
  const counts: Record<EntityNodeType | 'all', number> = {
    all: allEntities.value.length,
    character: 0,
    location: 0,
    citation: 0,
    term: 0,
    item: 0,
  }

  for (const entity of allEntities.value) {
    const type = entity.node_type as EntityNodeType
    if (ENTITY_NODE_TYPES.includes(type)) {
      counts[type]++
    }
  }

  return counts
})

// Summary text for footer
const summaryText = computed(() => {
  const parts: string[] = []
  for (const type of ENTITY_NODE_TYPES) {
    const count = entityCounts.value[type]
    if (count > 0) {
      parts.push(`${count} ${entityLabels[type].toLowerCase()}`)
    }
  }
  return parts.join(', ') || 'No entities'
})

function selectType(type: EntityNodeType | 'all') {
  selectedType.value = type
}

function handleEntityClick(entityId: string) {
  store.selectNode(entityId)
  window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: entityId } }))
}

async function handleCreateEntity(type: EntityNodeType, title: string, color?: string) {
  try {
    const node = await store.createEntityNode(type, title, {
      color_theme: color || null,
    })
    showToast?.(`Created ${entityLabels[type].slice(0, -1)}: ${title}`, 'success')
    showCreatePopover.value = false

    // Select and zoom to the new entity
    store.selectNode(node.id)
    window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: node.id } }))
  } catch (e) {
    showToast?.(`Failed to create entity: ${e}`, 'error')
  }
}
</script>

<template>
  <aside class="entity-panel">
    <header class="panel-header">
      <span class="panel-title">{{ t('entities.title', 'Entities') }}</span>
      <div class="header-actions">
        <button
          class="add-btn"
          :data-tooltip="t('entities.create', 'Create entity')"
          @click="showCreatePopover = !showCreatePopover"
        >
          <Icon name="plus" :size="14" />
        </button>
      </div>

      <!-- Create popover -->
      <EntityCreatePopover
        v-if="showCreatePopover"
        @create="handleCreateEntity"
        @close="showCreatePopover = false"
      />
    </header>

    <!-- Type filter tabs -->
    <div class="type-tabs">
      <button
        class="type-tab"
        :class="{ active: selectedType === 'all' }"
        @click="selectType('all')"
      >
        All
        <span class="count">{{ entityCounts.all }}</span>
      </button>
      <button
        v-for="type in ENTITY_NODE_TYPES"
        :key="type"
        class="type-tab"
        :class="{ active: selectedType === type }"
        @click="selectType(type)"
      >
        <Icon :name="entityIcons[type]" :size="12" />
        <span class="count">{{ entityCounts[type] }}</span>
      </button>
    </div>

    <!-- Search bar -->
    <div class="search-bar">
      <Icon name="search" :size="14" class="search-icon" />
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="t('entities.search', 'Search entities...')"
        class="search-input"
      />
    </div>

    <!-- Entity list -->
    <div class="entity-list">
      <EntityNodeCard
        v-for="entity in filteredEntities"
        :key="entity.id"
        :entity="entity"
        @click="handleEntityClick(entity.id)"
      />

      <div v-if="filteredEntities.length === 0" class="empty-state">
        <p v-if="searchQuery">No entities matching "{{ searchQuery }}"</p>
        <p v-else-if="selectedType !== 'all'">No {{ entityLabels[selectedType].toLowerCase() }} yet</p>
        <p v-else>No entities yet</p>
        <button class="create-first-btn" @click="showCreatePopover = true">
          Create your first entity
        </button>
      </div>
    </div>

    <!-- Footer summary -->
    <footer class="panel-footer">
      <span class="summary">{{ summaryText }}</span>
    </footer>
  </aside>
</template>

<style scoped>
.entity-panel {
  width: 280px;
  height: 100%;
  background: var(--bg-surface-alt);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface);
  position: relative;
}

.panel-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.add-btn {
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

.add-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.type-tabs {
  display: flex;
  gap: 2px;
  padding: 8px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface);
  overflow-x: auto;
}

.type-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.type-tab:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.type-tab.active {
  background: var(--primary-bg, rgba(59, 130, 246, 0.1));
  color: var(--primary-color);
}

.type-tab .count {
  font-size: 10px;
  background: var(--bg-surface-alt);
  padding: 2px 5px;
  border-radius: 8px;
}

.type-tab.active .count {
  background: var(--primary-color);
  color: white;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.search-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-state p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.create-first-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-main);
  font-size: 12px;
  cursor: pointer;
}

.create-first-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--text-muted);
}

.panel-footer {
  padding: 10px 14px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.summary {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
