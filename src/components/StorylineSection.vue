<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import Icon from './Icon.vue'
import StorylineNodeList from './StorylineNodeList.vue'
import StorylineEntitySummary from './StorylineEntitySummary.vue'
import type { Node, Storyline } from '../types'
import type { StorylineService } from '../services/storylineService'
import { useStorylineOperations } from '../composables/useStorylineOperations'

const { t } = useI18n()

const props = defineProps<{
  storyline: Storyline
  nodes: Node[]
  nodeCount: number
  expanded: boolean
  dropPreviewIndex: number | null
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'open-reader', storylineId: string): void
  (e: 'deleted'): void
}>()

const store = useNodesStore()
const showToast = inject<(message: string, type: 'error' | 'success' | 'info') => void>('showToast')
const storylineService = inject<StorylineService>('storylineService')

const isEditing = ref(false)
const editTitle = ref('')
const expandedNodeIds = ref<Set<string>>(new Set())

const nodeIds = computed(() => props.nodes.map(n => n.id))

const {
  handleNodeAdd,
  handleNodeCreate,
  handleCommentCreate,
  handleNodeRemove,
  handleNodeReorder,
} = useStorylineOperations({
  store,
  storylineService,
  selectedStorylineId: computed(() => props.storyline.id),
  showToast,
})

function startEditing() {
  isEditing.value = true
  editTitle.value = props.storyline.title
}

async function saveEdit() {
  if (!editTitle.value.trim()) return
  try {
    await store.updateStoryline(props.storyline.id, editTitle.value.trim())
    isEditing.value = false
  } catch (e) {
    console.error('Failed to update storyline:', e)
  }
}

function cancelEdit() {
  isEditing.value = false
  editTitle.value = ''
}

async function deleteStoryline() {
  if (!confirm('Delete this storyline? The nodes will not be deleted.')) return
  try {
    await store.deleteStoryline(props.storyline.id)
    showToast?.('Deleted storyline', 'info')
    emit('deleted')
  } catch (e) {
    console.error('Failed to delete storyline:', e)
  }
}

async function updateColor(event: Event) {
  const color = (event.target as HTMLInputElement).value
  try {
    await store.updateStoryline(
      props.storyline.id,
      props.storyline.title,
      props.storyline.description || undefined,
      color
    )
    await store.updateStorylineEdgeColors(props.storyline.id, color)
  } catch (e) {
    console.error('Failed to update storyline color:', e)
  }
}

function handleNodeClick(index: number) {
  const node = props.nodes[index]
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
</script>

<template>
  <section class="storyline-section" :data-storyline-id="storyline.id">
    <header class="section-header" @click="emit('toggle')">
      <Icon
        name="chevron-right"
        :size="14"
        class="section-chevron"
        :class="{ rotated: expanded }"
      />
      <span
        class="storyline-icon"
        :style="{ backgroundColor: storyline.color || 'var(--primary-color)' }"
      >
        <Icon name="book" :size="12" />
      </span>

      <template v-if="isEditing">
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
        <span class="node-count">{{ nodeCount }}</span>
      </template>

      <div class="storyline-actions" @click.stop>
        <label class="color-picker" :data-tooltip="t('storyline.edgeColor')">
          <span
            class="color-swatch"
            :style="{ backgroundColor: storyline.color || '#94a3b8' }"
          ></span>
          <input
            type="color"
            :value="storyline.color || '#94a3b8'"
            @input="updateColor($event)"
          />
        </label>
        <button
          class="icon-btn"
          :data-tooltip="t('storyline.readMode')"
          @click="emit('open-reader', storyline.id)"
        >
          <Icon name="book" :size="12" />
        </button>
        <button class="icon-btn" :data-tooltip="t('storyline.rename')" @click="startEditing">
          <Icon name="edit" :size="12" />
        </button>
        <button class="icon-btn danger" :data-tooltip="t('common.delete')" @click="deleteStoryline">
          <Icon name="trash" :size="12" />
        </button>
      </div>
    </header>

    <div v-if="expanded" class="section-body">
      <StorylineNodeList
        v-model:expanded-node-ids="expandedNodeIds"
        :nodes="nodes"
        :storyline-id="storyline.id"
        :external-drop-index="dropPreviewIndex"
        @node-click="handleNodeClick"
        @toggle-expand="toggleExpandNode"
        @reorder="handleNodeReorder"
        @remove="handleNodeRemove"
        @add="handleNodeAdd"
        @create="handleNodeCreate"
        @create-comment="handleCommentCreate"
      />
      <StorylineEntitySummary :storyline-id="storyline.id" :node-ids="nodeIds" />
    </div>
  </section>
</template>

<style scoped>
.storyline-section {
  border-bottom: 1px solid var(--border-default);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.section-header:hover {
  background: var(--bg-elevated);
}

.section-chevron {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform 0.15s;
}

.section-chevron.rotated {
  transform: rotate(90deg);
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
}

.storyline-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-main);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.edit-input {
  flex: 1;
  min-width: 0;
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
  flex-shrink: 0;
}

.storyline-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.1s;
  flex-shrink: 0;
}

.section-header:hover .storyline-actions,
.section-header:focus-within .storyline-actions {
  opacity: 1;
}

.icon-btn {
  width: 26px;
  height: 26px;
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

.color-picker {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.color-picker input[type='color'] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.color-swatch {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 2px solid var(--border-default);
  transition: border-color 0.1s;
}

.color-picker:hover .color-swatch {
  border-color: var(--text-muted);
}

.section-body {
  padding: 0 8px 12px;
}
</style>
