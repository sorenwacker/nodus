<script setup lang="ts">
import { ref, computed } from 'vue'
import { useNodesStore } from '../stores/nodes'
import Icon from './Icon.vue'

const props = defineProps<{
  excludeNodeIds?: string[]
  maxItems?: number
  position?: 'above' | 'below'
  allowCreate?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', nodeId: string): void
  (e: 'create', title: string): void
  (e: 'close'): void
}>()

const isCreating = ref(false)
const newNodeTitle = ref('')

const store = useNodesStore()

const maxItems = computed(() => props.maxItems ?? 10)

const availableNodes = computed(() => {
  const excluded = new Set(props.excludeNodeIds || [])
  return store.filteredNodes.filter(n => !excluded.has(n.id))
})

const displayedNodes = computed(() => availableNodes.value.slice(0, maxItems.value))
const hasMore = computed(() => availableNodes.value.length > maxItems.value)
const moreCount = computed(() => availableNodes.value.length - maxItems.value)

function selectNode(nodeId: string) {
  emit('select', nodeId)
}

function startCreating() {
  isCreating.value = true
  newNodeTitle.value = ''
}

function cancelCreate() {
  isCreating.value = false
  newNodeTitle.value = ''
}

function createNode() {
  if (newNodeTitle.value.trim()) {
    emit('create', newNodeTitle.value.trim())
    isCreating.value = false
    newNodeTitle.value = ''
  }
}
</script>

<template>
  <div class="node-picker" :class="{ 'position-above': position === 'above' }">
    <div class="node-picker-header">
      <span>{{ isCreating ? 'New node' : 'Select node' }}</span>
      <button class="close-btn" data-tooltip="Close" @click="$emit('close')">
        <Icon name="close" :size="10" />
      </button>
    </div>

    <!-- Create new node form -->
    <div v-if="isCreating" class="node-picker-create">
      <input
        v-model="newNodeTitle"
        type="text"
        placeholder="Node title..."
        class="create-input"
        autofocus
        @keydown.enter="createNode"
        @keydown.escape="cancelCreate"
      />
      <div class="create-actions">
        <button class="action-btn cancel" @click="cancelCreate">Cancel</button>
        <button class="action-btn create" :disabled="!newNodeTitle.trim()" @click="createNode">Create</button>
      </div>
    </div>

    <!-- Node selection list -->
    <template v-else>
      <!-- Create new option -->
      <button v-if="allowCreate !== false" class="node-picker-item create-option" @click="startCreating">
        <Icon name="plus" :size="14" />
        <span>Create new node</span>
      </button>

      <div v-if="availableNodes.length === 0 && allowCreate === false" class="node-picker-empty">
        No available nodes
      </div>
      <div v-else-if="availableNodes.length > 0" class="node-picker-list">
        <button
          v-for="node in displayedNodes"
          :key="node.id"
          class="node-picker-item"
          @click="selectNode(node.id)"
        >
          <span class="node-title">{{ node.title }}</span>
        </button>
        <div v-if="hasMore" class="node-picker-more">
          +{{ moreCount }} more nodes
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.node-picker {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 6px;
  width: 240px;
  max-height: 280px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 200;
  overflow: hidden;
}

.node-picker.position-above {
  top: auto;
  bottom: 100%;
  margin-top: 0;
  margin-bottom: 6px;
}

.node-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface-alt);
}

.close-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: none;
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

.node-picker-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.node-picker-list {
  max-height: 220px;
  overflow-y: auto;
}

.node-picker-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  color: var(--text-main);
  cursor: pointer;
}

.node-picker-item:hover {
  background: var(--bg-elevated);
}

.node-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-picker-more {
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface-alt);
}

.create-option {
  gap: 8px;
  color: var(--primary-color);
  border-bottom: 1px solid var(--border-default);
}

.create-option:hover {
  background: var(--bg-elevated);
}

.node-picker-create {
  padding: 12px;
}

.create-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
  margin-bottom: 8px;
}

.create-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.action-btn {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.action-btn.cancel {
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.action-btn.create {
  border: none;
  background: var(--primary-color);
  color: white;
}

.action-btn.create:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
