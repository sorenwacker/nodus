<script setup lang="ts">
import { ref, computed, watch, inject, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import Icon from './Icon.vue'
import StorylineNodeList from './StorylineNodeList.vue'
import StorylineEntitySummary from './StorylineEntitySummary.vue'
import type { Node, Storyline } from '../types'
import type { ComponentPublicInstance } from 'vue'
import type { StorylineService } from '../services/storylineService'
import { useStorylineOperations } from '../composables/useStorylineOperations'
import { useStorylineDropTarget } from '../canvas/composables/util/useStorylineDropTarget'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open-reader', storylineId: string): void
}>()

const store = useNodesStore()
const { storylineNodes, storylineNodesVersion } = storeToRefs(store)
const showToast = inject<(message: string, type: 'error' | 'success' | 'info') => void>('showToast')
const storylineService = inject<StorylineService>('storylineService')

const selectedStorylineId = ref<string | null>(null)
const newStorylineTitle = ref('')
const nodeListRef = ref<ComponentPublicInstance | null>(null)
const isCreating = ref(false)
const editingStorylineId = ref<string | null>(null)
const editTitle = ref('')
const expandedNodeIds = ref<Set<string>>(new Set())
const panelRef = ref<HTMLElement | null>(null)

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

// Use extracted operations composable
const {
  handleNodeAdd,
  handleNodeCreate,
  handleCommentCreate,
  handleNodeRemove,
  handleNodeReorder,
} = useStorylineOperations({
  store,
  storylineService,
  selectedStorylineId,
  showToast,
})

function handleNodeClick(index: number) {
  const node = selectedStorylineNodes.value[index]
  if (node) {
    store.selectNode(node.id)
    window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: node.id } }))
  }
}

function toggleExpandNode(nodeId: string) {
  const newSet = new Set(expandedNodeIds.value)
  if (newSet.has(nodeId)) {
    newSet.delete(nodeId)
  } else {
    newSet.add(nodeId)
  }
  expandedNodeIds.value = newSet
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

// Use extracted drop target composable
const { isDropTarget, dropPreviewIndex } = useStorylineDropTarget(panelRef, {
  store,
  storylineService,
  selectedStorylineId,
  selectedStorylineNodes,
  nodeListRef,
  showToast,
  selectStoryline,
  storylines,
})

// Get storyline node IDs for entity summary
const selectedStorylineNodeIds = computed(() => {
  if (!selectedStorylineId.value) return []
  return storylineNodes.value.get(selectedStorylineId.value) || []
})

// Load storylines when panel mounts
onMounted(() => {
  store.loadStorylines()
})

// Reload storylines when workspace changes
watch(() => store.currentWorkspaceId, () => {
  store.loadStorylines()
  selectedStorylineId.value = null
})
</script>

<template>
  <aside
    ref="panelRef"
    class="storyline-panel"
    :class="{ 'drop-target': isDropTarget }"
  >
    <!-- Storyline View (when a storyline is selected) -->
    <template v-if="selectedStoryline">
      <header class="panel-header storyline-view-header">
        <button class="back-btn" :data-tooltip="t('storyline.backToList')" @click="exitStorylineView">
          <Icon name="back" :size="16" />
        </button>
        <span class="panel-title">{{ selectedStoryline.title }}</span>
        <label class="color-picker" :data-tooltip="t('storyline.edgeColor')">
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
        <button class="icon-btn" :data-tooltip="t('storyline.readMode')" @click="openReader">
          <Icon name="book" :size="14" />
        </button>
      </header>

      <!-- Drop hint shows when dragging over - always visible during drag -->
      <div v-if="isDropTarget" class="drop-hint">
        <Icon name="plus" :size="28" />
        <span>Drop here to add</span>
      </div>

      <div class="storyline-nodes-list" :class="{ 'external-dragging': isDropTarget }">
        <StorylineNodeList
          ref="nodeListRef"
          v-model:expanded-node-ids="expandedNodeIds"
          :nodes="selectedStorylineNodes"
          :storyline-id="selectedStorylineId!"
          :external-drop-index="dropPreviewIndex"
          @node-click="handleNodeClick"
          @toggle-expand="toggleExpandNode"
          @reorder="handleNodeReorder"
          @remove="handleNodeRemove"
          @add="handleNodeAdd"
          @create="handleNodeCreate"
          @create-comment="handleCommentCreate"
        />
      </div>

      <!-- Entity Summary Section -->
      <StorylineEntitySummary
        :storyline-id="selectedStorylineId!"
        :node-ids="selectedStorylineNodeIds"
      />
    </template>

    <!-- Storyline List (default view) -->
    <template v-else>
      <header class="panel-header">
        <span class="panel-title">{{ t('toolbar.storylines') }}</span>
        <button
          v-if="!isCreating"
          class="add-btn"
          :data-tooltip="t('storyline.newStoryline')"
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

      <!-- Drop hint for list view - show which storyline will receive the drop -->
      <div v-if="isDropTarget" class="drop-hint">
        <Icon name="plus" :size="24" />
        <span v-if="storylines.length > 0">Drop to add to "{{ storylines[0].title }}"</span>
        <span v-else>Create a storyline first</span>
      </div>

      <!-- Storylines list -->
      <div v-if="!isDropTarget || storylines.length === 0" class="storylines-list">
        <div
          v-for="storyline in storylines"
          :key="storyline.id"
          class="storyline-list-item"
          @click="selectStoryline(storyline.id)"
        >
          <span class="storyline-icon" :style="{ backgroundColor: storyline.color || 'var(--primary-color)' }">
            <Icon name="book" :size="12" />
          </span>

          <template v-if="editingStorylineId === storyline.id">
            <input
              v-model="editTitle"
              type="text"
              class="edit-input"
              @click.stop
              @keydown.enter="saveEdit"
              @keydown.escape="cancelEdit"
            />
            <button class="icon-btn" :data-tooltip="t('common.save')" @click.stop="saveEdit">
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
              :data-tooltip="t('storyline.rename')"
              @click="startEditing(storyline)"
            >
              <Icon name="edit" :size="12" />
            </button>
            <button
              class="icon-btn danger"
              :data-tooltip="t('common.delete')"
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
  width: 260px;
  height: 100%;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.storyline-panel.drop-target {
  background: rgba(59, 130, 246, 0.08);
  border-color: var(--primary-color);
  box-shadow: inset 0 0 0 3px var(--primary-color);
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 24px;
  margin: 12px;
  border: 3px dashed var(--primary-color);
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.15);
  color: var(--primary-color);
  font-size: 15px;
  font-weight: 600;
  animation: drop-hint-pulse 0.6s ease-in-out infinite;
}

@keyframes drop-hint-pulse {
  0%, 100% {
    transform: scale(1);
    border-color: var(--primary-color);
  }
  50% {
    transform: scale(1.02);
    border-color: rgba(59, 130, 246, 0.6);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  height: 52px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-default);
}

.storyline-view-header {
  /* Same as base, just reaffirming height */
}

.back-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, color 0.1s;
}

.back-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.panel-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.storyline-view-header .panel-title {
  font-size: 14px;
  color: var(--text-main);
  text-transform: none;
  letter-spacing: normal;
}

.add-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}

.add-btn:hover {
  background: var(--bg-elevated);
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.new-storyline {
  padding: 12px 16px;
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
  padding: 0 8px 16px;
  min-height: 0;
  overscroll-behavior: contain;
}

.storyline-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
  background: var(--bg-surface);
  transition: background 0.1s, transform 0.15s;
}

.storyline-list-item:hover {
  background: var(--bg-elevated);
}

.storyline-list-item:active {
  transform: scale(0.98);
}

.storyline-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: var(--primary-color);
  border-radius: 50%;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.storyline-list-item:hover .storyline-icon {
  transform: scale(1.1);
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
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-elevated);
  padding: 2px 8px;
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
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}

.icon-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--border-default);
  color: var(--text-main);
}

.icon-btn.danger:hover {
  background: var(--danger-bg, rgba(239, 68, 68, 0.1));
  border-color: var(--danger-color, #ef4444);
  color: var(--danger-color, #ef4444);
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
  padding: 0 8px 16px;
  padding-bottom: 320px; /* Space for dropdown to be visible when at bottom */
  min-height: 0;
  overscroll-behavior: contain;
  transition: background 0.15s ease;
}

.storyline-nodes-list.external-dragging {
  background: rgba(59, 130, 246, 0.05);
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
