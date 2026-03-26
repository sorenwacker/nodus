<script setup lang="ts">
/**
 * CanvasNodeCard - Individual node card component
 * Handles rendering of node content, title editing, and resize handles
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface Node {
  id: string
  title: string
  node_type: string
  markdown_content: string | null
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  color_theme?: string | null
}

const props = defineProps<{
  node: Node
  style: Record<string, string>
  isSelected: boolean
  isDragging: boolean
  isResizing: boolean
  isEditing: boolean
  isCollapsed: boolean
  isNeighborhoodMode: boolean
  isNeighborhoodFocus: boolean
  isNeighborHighlighted: boolean
  showThumbnail: boolean
  thumbnailSrc?: string
  renderedContent: string
  editingTitleId: string | null
  editTitle: string
  editContent: string
  scale: number
  // In-node search props
  showNodeSearch?: boolean
  nodeSearchQuery?: string
  nodeSearchIndex?: number
  nodeSearchMatchCount?: number
}>()

const emit = defineEmits<{
  (e: 'pointerdown', event: PointerEvent): void
  (e: 'pointerenter', event: PointerEvent): void
  (e: 'pointermove', event: PointerEvent): void
  (e: 'pointerleave'): void
  (e: 'dblclick'): void
  (e: 'start-editing-title'): void
  (e: 'save-title'): void
  (e: 'cancel-title'): void
  (e: 'update:edit-title', value: string): void
  (e: 'update:edit-content', value: string): void
  (e: 'save-editing', event: FocusEvent): void
  (e: 'editor-keydown', event: KeyboardEvent): void
  (e: 'content-click', event: MouseEvent): void
  (e: 'delete'): void
  (e: 'resize-start', event: PointerEvent, direction: string): void
  // In-node search events
  (e: 'search-input', value: string): void
  (e: 'search-next'): void
  (e: 'search-prev'): void
  (e: 'search-close'): void
}>()

const { t } = useI18n()

const classes = computed(() => ({
  selected: props.isSelected,
  dragging: props.isDragging,
  resizing: props.isResizing,
  editing: props.isEditing,
  collapsed: props.isCollapsed,
  'neighborhood-mode': props.isNeighborhoodMode,
  'neighborhood-focus': props.isNeighborhoodFocus,
  'neighbor-highlighted': props.isNeighborHighlighted,
}))

const deleteButtonStyle = computed(() => ({
  transform: `scale(${1 / props.scale})`,
  transformOrigin: 'center center',
}))

const isEditingTitle = computed(() => props.editingTitleId === props.node.id)
const showDeleteButton = computed(() =>
  props.isSelected && !props.isEditing && !props.isCollapsed
)
</script>

<template>
  <div
    :data-node-id="node.id"
    :data-node-type="node.node_type"
    class="node-card"
    :class="classes"
    :style="style"
    @pointerdown="emit('pointerdown', $event)"
    @pointerenter="emit('pointerenter', $event)"
    @pointermove="emit('pointermove', $event)"
    @pointerleave="emit('pointerleave')"
    @dblclick.stop="emit('dblclick')"
  >
    <!-- Image thumbnail when zoomed out -->
    <div v-if="showThumbnail && thumbnailSrc" class="node-thumbnail">
      <img :src="thumbnailSrc" :alt="node.title" />
    </div>

    <!-- Node title header (hidden when showing thumbnail) -->
    <div v-else class="node-header" @dblclick.stop="emit('start-editing-title')">
      <input
        v-if="isEditingTitle"
        :value="editTitle"
        class="title-editor"
        @input="emit('update:edit-title', ($event.target as HTMLInputElement).value)"
        @blur="emit('save-title')"
        @keydown.enter="emit('save-title')"
        @keydown.escape="emit('cancel-title')"
        @click.stop
        @pointerdown.stop
        @pointerup.stop
      />
      <span v-else>{{ node.title || t('canvas.node.untitled') }}</span>
    </div>

    <!-- In-node search bar -->
    <div v-if="isEditing && showNodeSearch && !isCollapsed" class="node-search-bar">
      <input
        :value="nodeSearchQuery"
        class="node-search-input"
        :placeholder="t('canvas.node.searchPlaceholder', 'Find...')"
        @input="emit('search-input', ($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="emit('search-next')"
        @keydown.escape.prevent="emit('search-close')"
        @pointerdown.stop
      />
      <span v-if="nodeSearchMatchCount !== undefined && nodeSearchMatchCount > 0" class="node-search-count">
        {{ (nodeSearchIndex ?? 0) + 1 }}/{{ nodeSearchMatchCount }}
      </span>
      <span v-else-if="nodeSearchQuery && nodeSearchMatchCount === 0" class="node-search-count no-match">
        0/0
      </span>
      <button class="node-search-btn" :title="t('canvas.node.searchPrev', 'Previous')" @click="emit('search-prev')" @pointerdown.stop>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      </button>
      <button class="node-search-btn" :title="t('canvas.node.searchNext', 'Next')" @click="emit('search-next')" @pointerdown.stop>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <button class="node-search-btn node-search-close" :title="t('common.close', 'Close')" @click="emit('search-close')" @pointerdown.stop>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Editing mode (disabled when collapsed) -->
    <textarea
      v-if="isEditing && !isCollapsed"
      :value="editContent"
      class="inline-editor"
      :placeholder="t('canvas.node.writePlaceholder')"
      spellcheck="false"
      autocorrect="off"
      autocapitalize="off"
      @input="emit('update:edit-content', ($event.target as HTMLTextAreaElement).value)"
      @pointerdown.stop
      @pointerup.stop
      @blur="emit('save-editing', $event)"
      @keydown="emit('editor-keydown', $event)"
    ></textarea>

    <!-- View mode - hidden when collapsed for performance, v-html required for markdown -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-else-if="!isCollapsed"
      class="node-content"
      @click="emit('content-click', $event)"
      v-html="renderedContent"
    ></div>
    <!-- eslint-enable vue/no-v-html -->

    <!-- Delete button (shown when selected but not editing, hidden when collapsed) -->
    <button
      v-if="showDeleteButton"
      class="delete-node-btn"
      :style="deleteButtonStyle"
      @pointerdown.stop="emit('delete')"
    ></button>

    <!-- Resize handles - edges -->
    <div class="resize-edge resize-edge-n" @pointerdown.stop="emit('resize-start', $event, 'n')"></div>
    <div class="resize-edge resize-edge-s" @pointerdown.stop="emit('resize-start', $event, 's')"></div>
    <div class="resize-edge resize-edge-e" @pointerdown.stop="emit('resize-start', $event, 'e')"></div>
    <div class="resize-edge resize-edge-w" @pointerdown.stop="emit('resize-start', $event, 'w')"></div>

    <!-- Resize handles - corners -->
    <div class="resize-corner resize-corner-nw" @pointerdown.stop="emit('resize-start', $event, 'nw')"></div>
    <div class="resize-corner resize-corner-ne" @pointerdown.stop="emit('resize-start', $event, 'ne')"></div>
    <div class="resize-corner resize-corner-se" @pointerdown.stop="emit('resize-start', $event, 'se')"></div>
    <div class="resize-corner resize-corner-sw" @pointerdown.stop="emit('resize-start', $event, 'sw')"></div>
  </div>
</template>
