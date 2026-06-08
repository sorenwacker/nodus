<script setup lang="ts">
/**
 * StorylineEntitySummary - Displays entities referenced in a storyline
 *
 * Shows characters, locations, citations, terms, and items that appear
 * in the storyline nodes, grouped by type with occurrence counts.
 */
import { ref, computed } from 'vue'
import { useNodesStore } from '../stores/nodes'
import Icon from './Icon.vue'
import type { Node, EntityNodeType } from '../types'
import { ENTITY_NODE_TYPES } from '../types'

const props = defineProps<{
  storylineId: string
  nodeIds: string[]
}>()

const store = useNodesStore()

const showEntitySummary = ref(false)

function toggleEntitySummary() {
  showEntitySummary.value = !showEntitySummary.value
}

function panToEntity(entityId: string) {
  store.selectNode(entityId)
  window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: entityId } }))
}

const entityTypeLabels: Record<EntityNodeType, string> = {
  character: 'Characters',
  location: 'Locations',
  citation: 'Citations',
  term: 'Terms',
  item: 'Items',
}

const storylineEntities = computed((): Record<EntityNodeType, { entity: Node; count: number }[]> => {
  const emptyResult: Record<EntityNodeType, { entity: Node; count: number }[]> = {
    character: [],
    location: [],
    citation: [],
    term: [],
    item: [],
  }
  if (!props.storylineId) return emptyResult

  const entitiesByType: Record<EntityNodeType, { entity: Node; count: number }[]> = {
    character: [],
    location: [],
    citation: [],
    term: [],
    item: [],
  }

  const entityCounts = new Map<string, number>()

  for (const nodeId of props.nodeIds) {
    const linkedEntities = store.getLinkedEntities(nodeId)
    for (const entity of linkedEntities) {
      const type = entity.node_type as EntityNodeType
      if (ENTITY_NODE_TYPES.includes(type)) {
        const count = (entityCounts.get(entity.id) || 0) + 1
        entityCounts.set(entity.id, count)
      }
    }
  }

  for (const [entityId, count] of entityCounts) {
    const entity = store.getNode(entityId)
    if (entity) {
      const type = entity.node_type as EntityNodeType
      if (ENTITY_NODE_TYPES.includes(type)) {
        entitiesByType[type].push({ entity, count })
      }
    }
  }

  for (const type of ENTITY_NODE_TYPES) {
    entitiesByType[type].sort((a, b) => b.count - a.count)
  }

  return entitiesByType
})

const hasEntities = computed(() => {
  return ENTITY_NODE_TYPES.some(type => storylineEntities.value[type]?.length > 0)
})
</script>

<template>
  <div v-if="hasEntities" class="entity-summary-section">
    <button class="entity-summary-toggle" @click="toggleEntitySummary">
      <Icon :name="showEntitySummary ? 'chevron-down' : 'forward'" :size="12" />
      <span>Entities in this storyline</span>
    </button>

    <div v-if="showEntitySummary" class="entity-summary-content">
      <template v-for="type in ENTITY_NODE_TYPES" :key="type">
        <div v-if="storylineEntities[type]?.length > 0" class="entity-type-group">
          <div class="entity-type-label">{{ entityTypeLabels[type] }}</div>
          <div class="entity-list">
            <button
              v-for="{ entity, count } in storylineEntities[type]"
              :key="entity.id"
              class="entity-chip"
              @click="panToEntity(entity.id)"
            >
              {{ entity.title }}
              <span class="entity-count">({{ count }})</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.entity-summary-section {
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.entity-summary-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s, color 0.1s;
}

.entity-summary-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.entity-summary-content {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border-default);
}

.entity-type-group {
  margin-bottom: 10px;
}

.entity-type-group:last-child {
  margin-bottom: 0;
}

.entity-type-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.entity-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.entity-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: none;
  border-radius: 12px;
  background: var(--bg-elevated);
  color: var(--text-main);
  font-size: 11px;
  cursor: pointer;
}

.entity-chip:hover {
  background: var(--primary-bg, rgba(59, 130, 246, 0.1));
  color: var(--primary-color);
}

.entity-count {
  font-size: 10px;
  color: var(--text-muted);
}
</style>
