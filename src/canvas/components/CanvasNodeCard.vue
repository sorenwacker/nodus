<script setup lang="ts">
/**
 * CanvasNodeCard - Individual node card component
 * Handles rendering of node content, title editing, and resize handles
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EntityBadge from '../../components/EntityBadge.vue'
import type { Node as EntityNode, EntityNodeType } from '../../types'
import { ENTITY_NODE_TYPES } from '../../types'

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
  // In-node search
  showNodeSearch: boolean
  nodeSearchQuery: string
  nodeSearchMatchCount: number
  nodeSearchIndex: number
  // Linked entities
  linkedEntities?: EntityNode[]
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
  // In-node search
  (e: 'update:node-search-query', value: string): void
  (e: 'find-next'): void
  (e: 'find-prev'): void
  (e: 'close-search'): void
  (e: 'entity-click', entityId: string): void
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

// Delete button scales with the node (no counter-scale needed)
// Node renders at native resolution with zoom applied to dimensions
const deleteButtonStyle = computed(() => ({
  // No transform needed - button scales naturally with node
}))

const isEditingTitle = computed(() => props.editingTitleId === props.node.id)
const showDeleteButton = computed(() =>
  props.isSelected && !props.isEditing && !props.isCollapsed
)

// Entity badges - only show for non-entity nodes that have linked entities
const isEntityNode = computed(() =>
  ENTITY_NODE_TYPES.includes(props.node.node_type as EntityNodeType)
)
const showEntityBadges = computed(() =>
  !isEntityNode.value &&
  !props.isCollapsed &&
  !props.isEditing &&
  props.linkedEntities &&
  props.linkedEntities.length > 0
)
const displayEntities = computed(() => {
  // Show max 3 entities, with indication of more
  return props.linkedEntities?.slice(0, 3) || []
})
const hasMoreEntities = computed(() =>
  (props.linkedEntities?.length || 0) > 3
)
const moreEntitiesCount = computed(() =>
  (props.linkedEntities?.length || 0) - 3
)

// Display title: use title, or first line of content, or fallback to "Untitled"
const displayTitle = computed(() => {
  if (props.node.title) return props.node.title

  // Extract first meaningful line from markdown content
  const content = props.node.markdown_content?.trim()
  if (content) {
    // Remove markdown formatting and get first line
    const firstLine = content
      .split('\n')[0]
      .replace(/^#+\s*/, '') // Remove heading markers
      .replace(/\*\*/g, '')  // Remove bold
      .replace(/\*/g, '')    // Remove italic
      .replace(/`/g, '')     // Remove code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract link text
      .trim()

    if (firstLine) {
      // Truncate if too long
      return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine
    }
  }

  return t('canvas.node.untitled')
})
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

    <!-- Node title header (always show when collapsed, or when has title/editing) -->
    <div
      v-else-if="node.title || isEditing || isEditingTitle || isCollapsed"
      class="node-header"
      tabindex="-1"
      @dblclick.stop="emit('start-editing-title')"
      @click.stop="isEditing && !isEditingTitle && emit('start-editing-title')"
    >
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
      <span v-else>{{ displayTitle }}</span>
    </div>

    <!-- In-node search bar (when editing and search is active) -->
    <div v-if="showNodeSearch && isEditing && !isCollapsed" class="node-search-bar" @pointerdown.stop @keydown.stop>
      <input
        class="node-search-input"
        :value="nodeSearchQuery"
        placeholder="Find..."
        @input="emit('update:node-search-query', ($event.target as HTMLInputElement).value)"
        @keydown.enter.exact.prevent="emit('find-next')"
        @keydown.enter.shift.prevent="emit('find-prev')"
        @keydown.escape.prevent="emit('close-search')"
      />
      <span class="node-search-count" :class="{ 'no-match': nodeSearchMatchCount === 0 && nodeSearchQuery }">
        {{ nodeSearchMatchCount > 0 ? `${nodeSearchIndex + 1}/${nodeSearchMatchCount}` : (nodeSearchQuery ? '0/0' : '') }}
      </span>
      <button class="node-search-btn" title="Previous (Shift+Enter)" @click="emit('find-prev')">&#x25B2;</button>
      <button class="node-search-btn" title="Next (Enter)" @click="emit('find-next')">&#x25BC;</button>
      <button class="node-search-btn node-search-close" title="Close (Esc)" @click="emit('close-search')">&times;</button>
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

    <!-- Entity badges footer -->
    <div v-if="showEntityBadges" class="node-entity-footer">
      <EntityBadge
        v-for="entity in displayEntities"
        :key="entity.id"
        :entity="entity"
        size="small"
        @click="emit('entity-click', entity.id)"
      />
      <span v-if="hasMoreEntities" class="more-entities">
        +{{ moreEntitiesCount }}
      </span>
    </div>

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

<style scoped>
.node-entity-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface-alt, rgba(0, 0, 0, 0.02));
}

.more-entities {
  display: inline-flex;
  align-items: center;
  padding: 1px 5px;
  font-size: 10px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

:global([data-theme='dark']) .more-entities {
  background: rgba(255, 255, 255, 0.08);
}
</style>
