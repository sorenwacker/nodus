<script setup lang="ts">
import { ref, computed, watch, inject, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import { useStorylinesStore } from '../stores/storylines'
import { usePointerReorder, moveItem } from '../composables/usePointerReorder'
import Icon from './Icon.vue'
import StorylineSection from './StorylineSection.vue'
import type { Node } from '../types'
import type { StorylineService } from '../services/storylineService'
import {
  useStorylineDropTarget,
  type StorylineDropTarget,
} from '../canvas/composables/util/useStorylineDropTarget'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open-reader', storylineId: string): void
  (e: 'open-timelines'): void
}>()

const store = useNodesStore()
const { storylineNodes, storylineNodesVersion } = storeToRefs(store)
const showToast = inject<(message: string, type: 'error' | 'success' | 'info') => void>('showToast')
const storylineService = inject<StorylineService>('storylineService')

const newStorylineTitle = ref('')
const isCreating = ref(false)
const expandedStorylineIds = ref<Set<string>>(new Set())
const panelRef = ref<HTMLElement | null>(null)

const storylines = computed(() => store.filteredStorylines)

// Reordering storylines uses the same mechanism as reordering their items
const storylinesStore = useStorylinesStore()
const {
  draggingIndex: draggingSectionIndex,
  dragOverIndex: dragOverSectionIndex,
  onPointerDown: onSectionPointerDown,
} = usePointerReorder({
  itemSelector: '.storyline-section',
  containerSelector: '.storylines-list',
  // Drags start from the section header only; the body has its own item drag
  ignoreSelector: '.section-body, button, input, textarea',
  onReorder: (fromIndex, toIndex) =>
    storylinesStore.reorderStorylines(moveItem(storylines.value, fromIndex, toIndex).map(s => s.id)),
})

// Nodes per storyline - reactive to store Map changes
const nodesByStoryline = computed(() => {
  // Touch the version so the computed re-runs when the Map mutates in place
  void storylineNodesVersion.value
  const result: Record<string, Node[]> = {}
  for (const storyline of storylines.value) {
    const nodeIds = storylineNodes.value.get(storyline.id) || []
    result[storyline.id] = nodeIds
      .map(id => store.getNode(id))
      .filter((n): n is Node => n !== undefined)
  }
  return result
})

const storylineNodeCounts = computed(() => {
  // Touch the version so the computed re-runs when the Map mutates in place
  void storylineNodesVersion.value
  const counts: Record<string, number> = {}
  for (const [id, nodeIds] of storylineNodes.value.entries()) {
    counts[id] = nodeIds.length
  }
  return counts
})

function toggleSection(id: string) {
  const newSet = new Set(expandedStorylineIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
    loadStorylineNodes(id)
  }
  expandedStorylineIds.value = newSet
}

function expandSection(id: string) {
  if (!expandedStorylineIds.value.has(id)) {
    expandedStorylineIds.value = new Set(expandedStorylineIds.value).add(id)
  }
  loadStorylineNodes(id)
}

async function loadStorylineNodes(storylineId: string) {
  try {
    await store.getStorylineNodes(storylineId)
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
    expandSection(storyline.id)
  } catch (e) {
    console.error('Failed to create storyline:', e)
    showToast?.(`Failed to create storyline: ${e}`, 'error')
  }
}

// Drop target: resolve the storyline section under the pointer and the
// insertion index inside its node list
function resolveDropTarget(clientX: number, clientY: number): StorylineDropTarget | null {
  if (!panelRef.value) return null
  const sections = panelRef.value.querySelectorAll<HTMLElement>('[data-storyline-id]')
  for (const section of sections) {
    const rect = section.getBoundingClientRect()
    if (clientY >= rect.top && clientY <= rect.bottom && clientX >= rect.left && clientX <= rect.right) {
      const storylineId = section.dataset.storylineId!
      if (!expandedStorylineIds.value.has(storylineId)) {
        return { storylineId, index: null }
      }
      return { storylineId, index: dropIndexIn(section, clientY) }
    }
  }
  return null
}

function dropIndexIn(sectionEl: HTMLElement, clientY: number): number {
  const nodeItems = sectionEl.querySelectorAll('.node-item')
  for (let i = 0; i < nodeItems.length; i++) {
    const rect = nodeItems[i].getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) {
      return i
    }
  }
  return nodeItems.length
}

function fallbackTarget(): StorylineDropTarget | null {
  const expanded = storylines.value.filter(s => expandedStorylineIds.value.has(s.id))
  const target = expanded.length === 1 ? expanded[0] : storylines.value[0]
  return target ? { storylineId: target.id, index: null } : null
}

const { isDropTarget, dropPreview } = useStorylineDropTarget(panelRef, {
  store,
  storylineService,
  showToast,
  resolveDropTarget,
  fallbackTarget,
  onNodesAdded: expandSection,
})

function dropPreviewIndexFor(storylineId: string): number | null {
  return dropPreview.value?.storylineId === storylineId ? dropPreview.value.index : null
}

// Load storylines when panel mounts
onMounted(() => {
  store.loadStorylines()
})

// Reload storylines when workspace changes
watch(() => store.currentWorkspaceId, () => {
  store.loadStorylines()
  expandedStorylineIds.value = new Set()
})
</script>

<template>
  <aside
    ref="panelRef"
    class="storyline-panel"
    :class="{ 'drop-target': isDropTarget }"
  >
    <header class="panel-header">
      <span class="panel-title">{{ t('toolbar.storylines') }}</span>
      <button
        class="add-btn"
        :data-tooltip="t('storyline.timelines')"
        @click="emit('open-timelines')"
      >
        <Icon name="timeline" :size="14" />
      </button>
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
        :placeholder="t('storyline.titlePlaceholder')"
        class="storyline-input"
        @keydown.enter="createStoryline"
        @keydown.escape="isCreating = false"
      />
      <div class="new-storyline-actions">
        <button class="action-btn cancel" @click="isCreating = false">{{ t('common.cancel') }}</button>
        <button
          class="action-btn create"
          :disabled="!newStorylineTitle.trim()"
          @click="createStoryline"
        >{{ t('storyline.create') }}</button>
      </div>
    </div>

    <!-- Drop hint when dragging with no storyline to receive the nodes -->
    <div v-if="isDropTarget && storylines.length === 0" class="drop-hint">
      <Icon name="plus" :size="24" />
      <span>{{ t('storyline.createFirst') }}</span>
    </div>

    <!-- Accordion of storyline sections -->
    <div class="storylines-list">
      <StorylineSection
        v-for="(storyline, i) in storylines"
        :key="storyline.id"
        :storyline="storyline"
        :nodes="nodesByStoryline[storyline.id] || []"
        :node-count="storylineNodeCounts[storyline.id] || 0"
        :expanded="expandedStorylineIds.has(storyline.id)"
        :drop-preview-index="dropPreviewIndexFor(storyline.id)"
        :class="{
          'drop-target-section': dropPreview?.storylineId === storyline.id,
          'section-dragging': draggingSectionIndex === i,
          'section-drag-over': dragOverSectionIndex === i,
        }"
        @toggle="toggleSection(storyline.id)"
        @open-reader="(id) => emit('open-reader', id)"
        @pointerdown="onSectionPointerDown($event, i)"
      />

      <div v-if="!storylines.length && !isCreating" class="empty-panel">
        <p>{{ t('storyline.noneYet') }}</p>
        <button class="create-first-btn" @click="isCreating = true">
          Create your first storyline
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* Fills the reveal wrapper in App.vue, which controls the actual width */
.storyline-panel {
  width: 100%;
  height: 100%;
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.storyline-panel.drop-target {
  background: rgba(59, 130, 246, 0.06);
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
  min-height: 0;
  overscroll-behavior: contain;
}

.drop-target-section {
  box-shadow: inset 0 0 0 2px var(--primary-color);
  border-radius: 6px;
}

.section-dragging {
  opacity: 0.5;
}

.section-drag-over {
  box-shadow: inset 0 2px 0 var(--primary-color);
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
