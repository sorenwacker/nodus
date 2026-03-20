<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import Icon from './Icon.vue'
import StorylineNodeList from './StorylineNodeList.vue'
import type { Node, Storyline } from '../types'

const emit = defineEmits<{
  (e: 'open-reader', storylineId: string): void
}>()

const store = useNodesStore()
const { storylineNodes, storylineNodesVersion } = storeToRefs(store)
const showToast = inject<(message: string, type: 'error' | 'success' | 'info') => void>('showToast')

const selectedStorylineId = ref<string | null>(null)
const newStorylineTitle = ref('')
const isCreating = ref(false)
const editingStorylineId = ref<string | null>(null)
const editTitle = ref('')
const isDropTarget = ref(false)

const storylines = computed(() => store.filteredStorylines)

const selectedStoryline = computed(() =>
  storylines.value.find(s => s.id === selectedStorylineId.value)
)

// Get nodes for selected storyline - reactive to store changes
const selectedStorylineNodes = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _version = storylineNodesVersion.value // Force reactivity on Map changes
  if (!selectedStorylineId.value) return []
  const nodeIds = storylineNodes.value.get(selectedStorylineId.value) || []
  console.log('[StorylinePanel] selectedStorylineNodes computed', { version: _version, nodeIds })
  return nodeIds.map(id => store.getNode(id)).filter((n): n is Node => n !== undefined)
})

// Get node counts for all storylines - reactive to Map changes
const storylineNodeCounts = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _version = storylineNodesVersion.value // Force reactivity
  const counts: Record<string, number> = {}
  for (const [id, nodeIds] of storylineNodes.value.entries()) {
    counts[id] = nodeIds.length
  }
  return counts
})

function selectStoryline(id: string) {
  selectedStorylineId.value = id
  // Load nodes from backend
  loadStorylineNodes(id)
}

function exitStorylineView() {
  selectedStorylineId.value = null
}

async function loadStorylineNodes(storylineId: string) {
  try {
    await store.getStorylineNodes(storylineId)
    // getStorylineNodes already updates the store's cache
  } catch (e) {
    console.error('Failed to load storyline nodes:', e)
  }
}

async function createStoryline() {
  if (!newStorylineTitle.value.trim()) return

  try {
    const storyline = await store.createStoryline(newStorylineTitle.value.trim())
    newStorylineTitle.value = ''
    isCreating.value = false
    showToast?.(`Created storyline: ${storyline.title}`, 'success')
    // Auto-select the new storyline
    selectStoryline(storyline.id)
  } catch (e) {
    console.error('Failed to create storyline:', e)
    showToast?.(`Failed to create storyline: ${e}`, 'error')
  }
}

function startEditing(storyline: Storyline) {
  editingStorylineId.value = storyline.id
  editTitle.value = storyline.title
}

async function saveEdit() {
  if (!editingStorylineId.value || !editTitle.value.trim()) return

  try {
    await store.updateStoryline(editingStorylineId.value, editTitle.value.trim())
    editingStorylineId.value = null
    editTitle.value = ''
  } catch (e) {
    console.error('Failed to update storyline:', e)
  }
}

function cancelEdit() {
  editingStorylineId.value = null
  editTitle.value = ''
}

async function deleteStoryline(id: string) {
  if (!confirm('Delete this storyline? The nodes will not be deleted.')) return

  try {
    await store.deleteStoryline(id)
    if (selectedStorylineId.value === id) {
      selectedStorylineId.value = null
    }
    showToast?.('Deleted storyline', 'info')
  } catch (e) {
    console.error('Failed to delete storyline:', e)
  }
}

// Node list event handlers
async function handleNodeAdd(index: number, nodeId: string) {
  if (!selectedStorylineId.value) return
  try {
    await store.addNodeToStoryline(selectedStorylineId.value, nodeId, index)
    showToast?.('Node added to storyline', 'success')
  } catch (e) {
    console.error('Failed to add node:', e)
    showToast?.(`Failed to add node: ${e}`, 'error')
  }
}

async function handleNodeCreate(index: number, title: string) {
  if (!selectedStorylineId.value) return
  try {
    const node = await store.createNode({ title, markdown_content: '' })
    await store.addNodeToStoryline(selectedStorylineId.value, node.id, index)
    showToast?.(`Created "${title}"`, 'success')
  } catch (e) {
    console.error('Failed to create node:', e)
    showToast?.(`Failed to create node: ${e}`, 'error')
  }
}

async function handleNodeRemove(nodeId: string) {
  if (!selectedStorylineId.value) return
  try {
    await store.removeNodeFromStoryline(selectedStorylineId.value, nodeId)
  } catch (e) {
    console.error('Failed to remove node:', e)
  }
}

async function handleNodeReorder(nodeIds: string[]) {
  if (!selectedStorylineId.value) return
  try {
    await store.reorderStorylineNodes(selectedStorylineId.value, nodeIds)
  } catch (e) {
    console.error('Failed to reorder nodes:', e)
  }
}

function handleNodeClick(index: number) {
  const node = selectedStorylineNodes.value[index]
  if (node) {
    store.selectNode(node.id)
    window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: node.id } }))
  }
}

function openReader() {
  if (selectedStorylineId.value) {
    emit('open-reader', selectedStorylineId.value)
  }
}

async function updateStorylineColor(event: Event) {
  const input = event.target as HTMLInputElement
  const color = input.value
  if (selectedStoryline.value) {
    try {
      await store.updateStoryline(
        selectedStoryline.value.id,
        selectedStoryline.value.title,
        selectedStoryline.value.description || undefined,
        color
      )
      await store.updateStorylineEdgeColors(selectedStoryline.value.id, color)
    } catch (e) {
      console.error('Failed to update storyline color:', e)
    }
  }
}

// Handle nodes dropped from canvas
async function handleNodeDrop(event: Event) {
  const e = event as CustomEvent<{ nodeIds: string[], x: number, y: number }>
  const { nodeIds } = e.detail

  // If we're in a storyline view, add to that storyline
  if (selectedStorylineId.value) {
    try {
      for (const nodeId of nodeIds) {
        await store.addNodeToStoryline(selectedStorylineId.value, nodeId)
      }
      showToast?.(`Added ${nodeIds.length} node(s) to storyline`, 'success')
    } catch (err) {
      showToast?.(`Failed to add nodes: ${err}`, 'error')
    }
  } else if (storylines.value.length > 0) {
    // If not in a storyline view but storylines exist, add to first one
    const firstStoryline = storylines.value[0]
    try {
      for (const nodeId of nodeIds) {
        await store.addNodeToStoryline(firstStoryline.id, nodeId)
      }
      showToast?.(`Added ${nodeIds.length} node(s) to "${firstStoryline.title}"`, 'success')
      // Auto-select the storyline
      selectStoryline(firstStoryline.id)
    } catch (err) {
      showToast?.(`Failed to add nodes: ${err}`, 'error')
    }
  } else {
    showToast?.('Create a storyline first', 'info')
  }
}

// Track when nodes are being dragged over the panel
function onPanelMouseEnter() {
  // Check if there's an active canvas drag by looking for body class
  if (document.body.classList.contains('node-dragging')) {
    isDropTarget.value = true
  }
}

function onPanelMouseLeave() {
  isDropTarget.value = false
}

// Load storylines when panel mounts
onMounted(() => {
  store.loadStorylines()
  window.addEventListener('node-dropped-on-storyline', handleNodeDrop)
})

onUnmounted(() => {
  window.removeEventListener('node-dropped-on-storyline', handleNodeDrop)
})

// Reload storylines when workspace changes
watch(() => store.currentWorkspaceId, () => {
  store.loadStorylines()
  selectedStorylineId.value = null
})
</script>

<template>
  <aside
    class="storyline-panel"
    :class="{ 'drop-target': isDropTarget }"
    @mouseenter="onPanelMouseEnter"
    @mouseleave="onPanelMouseLeave"
  >
    <!-- Storyline View (when a storyline is selected) -->
    <template v-if="selectedStoryline">
      <header class="panel-header storyline-view-header">
        <button class="back-btn" title="Back to list" @click="exitStorylineView">
          <Icon name="back" :size="16" />
        </button>
        <span class="panel-title">{{ selectedStoryline.title }}</span>
        <label class="color-picker" title="Edge color">
          <span
            class="color-swatch"
            :style="{ backgroundColor: selectedStoryline.color || '#94a3b8' }"
          ></span>
          <input
            type="color"
            :value="selectedStoryline.color || '#94a3b8'"
            @input="updateStorylineColor($event)"
          />
        </label>
        <button class="icon-btn" title="Read Mode" @click="openReader">
          <Icon name="book" :size="14" />
        </button>
      </header>

      <!-- Drop hint overlay -->
      <div v-if="isDropTarget" class="drop-hint">
        <Icon name="plus" :size="24" />
        <span>Drop to add</span>
      </div>

      <div class="storyline-nodes-list">
        <StorylineNodeList
          :nodes="selectedStorylineNodes"
          :storyline-id="selectedStorylineId!"
          @node-click="handleNodeClick"
          @reorder="handleNodeReorder"
          @remove="handleNodeRemove"
          @add="handleNodeAdd"
          @create="handleNodeCreate"
        />
      </div>
    </template>

    <!-- Storyline List (default view) -->
    <template v-else>
      <header class="panel-header">
        <span class="panel-title">Storylines</span>
        <button
          v-if="!isCreating"
          class="add-btn"
          title="New Storyline"
          @click="isCreating = true"
        >
          <Icon name="plus" :size="14" />
        </button>
      </header>

      <!-- New storyline input -->
      <div v-if="isCreating" class="new-storyline">
        <input
          v-model="newStorylineTitle"
          type="text"
          placeholder="Storyline title..."
          class="storyline-input"
          @keydown.enter="createStoryline"
          @keydown.escape="isCreating = false"
        />
        <div class="new-storyline-actions">
          <button class="action-btn cancel" @click="isCreating = false">Cancel</button>
          <button
            class="action-btn create"
            :disabled="!newStorylineTitle.trim()"
            @click="createStoryline"
          >Create</button>
        </div>
      </div>

      <!-- Drop hint for list view -->
      <div v-if="isDropTarget && storylines.length > 0" class="drop-hint">
        <Icon name="plus" :size="24" />
        <span>Drop to add to "{{ storylines[0].title }}"</span>
      </div>

      <!-- Storylines list -->
      <div v-if="!isDropTarget || storylines.length === 0" class="storylines-list">
        <div
          v-for="storyline in storylines"
          :key="storyline.id"
          class="storyline-list-item"
          @click="selectStoryline(storyline.id)"
        >
          <Icon name="book" :size="16" class="storyline-icon" />

          <template v-if="editingStorylineId === storyline.id">
            <input
              v-model="editTitle"
              type="text"
              class="edit-input"
              @click.stop
              @keydown.enter="saveEdit"
              @keydown.escape="cancelEdit"
            />
            <button class="icon-btn" title="Save" @click.stop="saveEdit">
              <Icon name="check" :size="12" />
            </button>
          </template>
          <template v-else>
            <span class="storyline-title">{{ storyline.title }}</span>
            <span class="node-count">
              {{ storylineNodeCounts[storyline.id] || 0 }}
            </span>
          </template>

          <div class="storyline-actions" @click.stop>
            <button
              class="icon-btn"
              title="Edit"
              @click="startEditing(storyline)"
            >
              <Icon name="edit" :size="12" />
            </button>
            <button
              class="icon-btn danger"
              title="Delete"
              @click="deleteStoryline(storyline.id)"
            >
              <Icon name="trash" :size="12" />
            </button>
          </div>
        </div>

        <div v-if="!storylines.length && !isCreating" class="empty-panel">
          <p>No storylines yet</p>
          <button class="create-first-btn" @click="isCreating = true">
            Create your first storyline
          </button>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.storyline-panel {
  width: 280px;
  height: 100%;
  background: var(--bg-surface-alt);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.storyline-panel.drop-target {
  border-color: var(--primary-color);
  box-shadow: inset 0 0 0 2px var(--primary-color);
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  margin: 8px;
  border: 2px dashed var(--primary-color);
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.1);
  color: var(--primary-color);
  font-size: 13px;
  font-weight: 500;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.storyline-view-header {
  gap: 10px;
}

.back-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--bg-surface-alt);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.panel-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.new-storyline {
  padding: 12px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.storyline-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
  margin-bottom: 8px;
}

.storyline-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.new-storyline-actions {
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

.storylines-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.storyline-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.1s;
}

.storyline-list-item:hover {
  background: var(--bg-elevated);
}

.storyline-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.storyline-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.node-count {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 10px;
}

.storyline-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.1s;
}

.storyline-list-item:hover .storyline-actions {
  opacity: 1;
}

.icon-btn {
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

.icon-btn:hover {
  background: var(--bg-surface);
  color: var(--text-main);
}

.icon-btn.danger:hover {
  background: var(--danger-bg);
  color: var(--danger-color);
}

/* Color picker */
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
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid var(--border-default);
  transition: border-color 0.1s;
}

.color-picker:hover .color-swatch {
  border-color: var(--text-muted);
}

/* Storyline nodes view */
.storyline-nodes-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-panel p {
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
</style>
