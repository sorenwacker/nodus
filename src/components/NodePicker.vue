<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import Icon from './Icon.vue'
import type { CommentType } from '../types'
import { COMMENT_STYLES } from '../types'

const { t } = useI18n()

const props = defineProps<{
  excludeNodeIds?: string[]
  maxItems?: number
  position?: 'above' | 'below'
  allowCreate?: boolean
  showSearch?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', nodeId: string): void
  (e: 'create', title: string): void
  (e: 'create-comment', text: string, commentType: CommentType): void
  (e: 'close'): void
}>()

const isCreating = ref(false)
const isCreatingComment = ref(false)
const newNodeTitle = ref('')
const newCommentText = ref('')
const selectedCommentType = ref<CommentType>('note')
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

const commentTypes: { type: CommentType; label: string }[] = [
  { type: 'note', label: 'Note' },
  { type: 'question', label: 'Question' },
  { type: 'todo', label: 'Todo' },
  { type: 'important', label: 'Important' },
]

const store = useNodesStore()

const maxItems = computed(() => props.maxItems ?? 10)

const availableNodes = computed(() => {
  const excluded = new Set(props.excludeNodeIds || [])
  let nodes = store.filteredNodes.filter(n => !excluded.has(n.id))

  // Apply search filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    nodes = nodes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      (n.content && n.content.toLowerCase().includes(q))
    )
  }

  return nodes
})

const displayedNodes = computed(() => availableNodes.value.slice(0, maxItems.value))
const hasMore = computed(() => availableNodes.value.length > maxItems.value)
const moreCount = computed(() => availableNodes.value.length - maxItems.value)

// Focus search input when mounted
onMounted(() => {
  if (props.showSearch) {
    nextTick(() => searchInputRef.value?.focus())
  }
})

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

function startCreatingComment() {
  isCreatingComment.value = true
  newCommentText.value = ''
  selectedCommentType.value = 'note'
}

function cancelCreateComment() {
  isCreatingComment.value = false
  newCommentText.value = ''
  selectedCommentType.value = 'note'
}

function createComment() {
  if (newCommentText.value.trim()) {
    emit('create-comment', newCommentText.value.trim(), selectedCommentType.value)
    isCreatingComment.value = false
    newCommentText.value = ''
    selectedCommentType.value = 'note'
  }
}
</script>

<template>
  <div class="node-picker" :class="{ 'position-above': position === 'above' }">
    <div class="node-picker-header">
      <span>{{ isCreating ? t('nodePicker.newNode') : isCreatingComment ? t('nodePicker.newComment') : t('nodePicker.selectNode') }}</span>
      <button class="close-btn" :data-tooltip="t('common.close')" @click="$emit('close')">
        <Icon name="close" :size="10" />
      </button>
    </div>

    <!-- Create new comment form -->
    <div v-if="isCreatingComment" class="node-picker-create">
      <div class="comment-type-selector">
        <button
          v-for="ct in commentTypes"
          :key="ct.type"
          class="comment-type-btn"
          :class="{ active: selectedCommentType === ct.type }"
          :style="{ '--type-color': COMMENT_STYLES[ct.type].color }"
          :title="ct.label"
          @click="selectedCommentType = ct.type"
        >
          <Icon :name="COMMENT_STYLES[ct.type].icon" :size="14" />
        </button>
      </div>
      <textarea
        v-model="newCommentText"
        :placeholder="t('nodePicker.commentPlaceholder')"
        class="create-input comment-input"
        rows="3"
        autofocus
        @keydown.enter.ctrl="createComment"
        @keydown.escape="cancelCreateComment"
      ></textarea>
      <div class="create-actions">
        <button class="action-btn cancel" @click="cancelCreateComment">{{ t('common.cancel') }}</button>
        <button class="action-btn create" :disabled="!newCommentText.trim()" @click="createComment">{{ t('common.add') }}</button>
      </div>
    </div>

    <!-- Create new node form -->
    <div v-else-if="isCreating" class="node-picker-create">
      <input
        v-model="newNodeTitle"
        type="text"
        :placeholder="t('nodePicker.nodeTitlePlaceholder')"
        class="create-input"
        autofocus
        @keydown.enter="createNode"
        @keydown.escape="cancelCreate"
      />
      <div class="create-actions">
        <button class="action-btn cancel" @click="cancelCreate">{{ t('common.cancel') }}</button>
        <button class="action-btn create" :disabled="!newNodeTitle.trim()" @click="createNode">{{ t('nodePicker.create') }}</button>
      </div>
    </div>

    <!-- Node selection list -->
    <template v-else>
      <!-- Search box -->
      <div v-if="showSearch" class="node-picker-search">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          :placeholder="t('nodePicker.searchPlaceholder')"
          class="search-input"
          @keydown.escape="$emit('close')"
        />
      </div>

      <!-- Create new options -->
      <div v-if="allowCreate !== false" class="create-options">
        <button class="node-picker-item create-option" @click="startCreating">
          <Icon name="plus" :size="14" />
          <span>{{ t('nodePicker.createNode') }}</span>
        </button>
        <button class="node-picker-item create-option comment-option" @click="startCreatingComment">
          <Icon name="comment" :size="14" />
          <span>{{ t('nodePicker.addComment') }}</span>
        </button>
      </div>

      <div v-if="availableNodes.length === 0" class="node-picker-empty">
        {{ searchQuery ? t('nodePicker.noMatchingNodes') : t('nodePicker.noAvailableNodes') }}
      </div>
      <div v-else class="node-picker-list">
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

.node-picker-search {
  padding: 8px;
  border-bottom: 1px solid var(--border-default);
}

.node-picker-search .search-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.node-picker-search .search-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.node-picker-search .search-input::placeholder {
  color: var(--text-muted);
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

.create-options {
  border-bottom: 1px solid var(--border-default);
}

.create-option {
  gap: 8px;
  color: var(--primary-color);
}

.create-option:hover {
  background: var(--bg-elevated);
}

.create-option.comment-option {
  color: var(--text-secondary);
}

.create-option.comment-option:hover {
  color: var(--primary-color);
}

.comment-input {
  resize: none;
  font-family: inherit;
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

.comment-type-selector {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.comment-type-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.comment-type-btn:hover {
  border-color: var(--type-color);
  color: var(--type-color);
  background: var(--bg-elevated);
}

.comment-type-btn.active {
  border-color: var(--type-color);
  background: var(--type-color);
  color: white;
}
</style>
