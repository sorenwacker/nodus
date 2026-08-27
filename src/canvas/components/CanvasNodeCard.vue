<script setup lang="ts">
/**
 * CanvasNodeCard - Individual node card component
 * Handles rendering of node content, title editing, and resize handles
 */
import { computed, ref, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import EntityBadge from '../../components/EntityBadge.vue'
import { useNodesStore } from '../../stores/nodes'
import { upsertFrontmatterField } from '../../lib/contentParser'
import type { Node as EntityNode, EntityNodeType } from '../../types'
import { ENTITY_NODE_TYPES } from '../../types'
import { nodeDisplayTitle } from '../utils/nodeDisplayTitle'
import { extractFrontmatterField } from '../../lib/timelineDates'

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
  tags?: string | null
}

const props = defineProps<{
  node: Node
  style: Record<string, string>
  isSelected: boolean
  isDragging: boolean
  isResizing: boolean
  isEditing: boolean
  isCollapsed: boolean
  isTextHidden?: boolean
  isNeighborhoodMode: boolean
  isNeighborhoodFocus: boolean
  isNeighborHighlighted: boolean
  showThumbnail: boolean
  thumbnailSrc?: string | null
  renderedContent: string
  editingTitleId: string | null
  editTitle: string
  editContent: string
  spellcheckEnabled?: boolean
  scale: number
  // In-node search
  showNodeSearch: boolean
  nodeSearchQuery: string
  nodeSearchMatchCount: number
  nodeSearchIndex: number
  // Linked entities
  linkedEntities?: EntityNode[]
}>()

/** Supplied by App.vue, so a content write from a card is undoable */
const pushContentUndo = inject<
  ((nodeId: string, oldContent: string | null, oldTitle: string) => void) | undefined
>('pushContentUndo', undefined)

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

const isTagNode = computed(() => props.node.node_type === 'tag')

const classes = computed(() => ({
  selected: props.isSelected,
  dragging: props.isDragging,
  resizing: props.isResizing,
  editing: props.isEditing,
  collapsed: props.isCollapsed && !isTagNode.value, // Tag nodes never collapse
  'text-hidden': props.isTextHidden && !isTagNode.value, // Tag nodes always show text
  'neighborhood-mode': props.isNeighborhoodMode,
  'neighborhood-focus': props.isNeighborhoodFocus,
  'neighbor-highlighted': props.isNeighborHighlighted,
  // Shared hover bus: lights up when this node is hovered anywhere
  // (timelines, storyline panel, canvas)
  'hover-highlighted': nodesStore.hoverHighlightNodeId === props.node.id,
  // An AI task is writing into this node right now
  'ai-working': nodesStore.aiWorkingNodeId === props.node.id,
  'tag-node': isTagNode.value,
}))

// Delete button scales with the node (no counter-scale needed)
// Node renders at native resolution with zoom applied to dimensions
const deleteButtonStyle = computed(() => ({
  // No transform needed - button scales naturally with node
}))

const isEditingTitle = computed(() => props.editingTitleId === props.node.id)
const showDeleteButton = computed(() =>
  props.isSelected && !props.isEditing
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

// Display title: explicit title, ad-hoc title from content, or "Untitled"
const displayTitle = computed(() => nodeDisplayTitle(props.node, t('canvas.node.untitled')))

// Tags from the node's metadata (JSON column), shown as chips
const nodeTags = computed<string[]>(() => {
  if (!props.node.tags) return []
  try {
    const parsed = JSON.parse(props.node.tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

// OKF frontmatter metadata, shown as chips like tags
const nodeDate = computed<string | null>(() => {
  const content = props.node.markdown_content || ''
  const date = extractFrontmatterField(content, 'date')
  if (!date) return null
  const dateEnd = extractFrontmatterField(content, 'date_end')
  return dateEnd ? `${date} – ${dateEnd}` : date
})

// OKF lifecycle: stable is the default and stays silent
const nodeStatus = computed<string | null>(() => {
  const status = extractFrontmatterField(props.node.markdown_content || '', 'status')
  return status && status !== 'stable' ? status : null
})

const showMetaChips = computed(
  () =>
    !isTagNode.value &&
    !props.isCollapsed &&
    !props.isEditing &&
    (nodeTags.value.length > 0 ||
      nodeDate.value !== null ||
      nodeStatus.value !== null ||
      props.isSelected)
)

// Inline date editor: writes date/date_end into the metadata header
const nodesStore = useNodesStore()
const showDateEditor = ref(false)
const dateInput = ref('')
const dateEndInput = ref('')

function openDateEditor() {
  const content = props.node.markdown_content || ''
  dateInput.value = extractFrontmatterField(content, 'date') || ''
  dateEndInput.value = extractFrontmatterField(content, 'date_end') || ''
  showDateEditor.value = true
}

async function saveDate() {
  let content = props.node.markdown_content || ''
  content = upsertFrontmatterField(content, 'date', dateInput.value || null)
  content = upsertFrontmatterField(content, 'date_end', dateEndInput.value || null)
  showDateEditor.value = false
  // Record the baseline first, like every other path that writes content.
  // Without it, setting a date could not be undone
  // (PRODUCT_DESIGN.md > Recording an undo step)
  pushContentUndo?.(props.node.id, props.node.markdown_content, props.node.title)
  await nodesStore.updateNodeContent(props.node.id, content)
}

// Inline tag editor
const showTagInput = ref(false)
const tagInput = ref('')

async function addTag() {
  const tag = tagInput.value.replace(/^#/, '').trim()
  tagInput.value = ''
  showTagInput.value = false
  if (!tag || nodeTags.value.includes(tag)) return
  await nodesStore.updateNodeTags(props.node.id, [...nodeTags.value, tag])
}

async function removeTag(tag: string) {
  await nodesStore.updateNodeTags(
    props.node.id,
    nodeTags.value.filter(existing => existing !== tag)
  )
}
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
    <!-- Tag node title (always visible, simplified display) -->
    <div v-if="isTagNode" class="node-header">
      <span>{{ displayTitle }}</span>
    </div>

    <!-- Image thumbnail when zoomed out (non-tag nodes only) -->
    <div v-else-if="showThumbnail && thumbnailSrc" class="node-thumbnail">
      <img :src="thumbnailSrc" :alt="node.title" />
    </div>

    <!-- Node title header (collapsed, or when has title/editing) -->
    <div
      v-else-if="node.title || isEditing || isEditingTitle || isCollapsed"
      class="node-header"
      tabindex="-1"
      @dblclick.stop="!isCollapsed && emit('start-editing-title')"
      @click.stop="isEditing && !isEditingTitle && emit('start-editing-title')"
    >
      <input
        v-if="isEditingTitle"
        :value="editTitle"
        class="title-editor"
        :spellcheck="spellcheckEnabled"
        :autocorrect="spellcheckEnabled ? 'on' : 'off'"
        :autocapitalize="spellcheckEnabled ? 'sentences' : 'off'"
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

    <!-- In-node search bar (when search is active, works in both edit and view modes) -->
    <div v-if="showNodeSearch && !isCollapsed" class="node-search-bar" @pointerdown.stop @keydown.stop>
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
      :spellcheck="spellcheckEnabled"
      :autocorrect="spellcheckEnabled ? 'on' : 'off'"
      :autocapitalize="spellcheckEnabled ? 'sentences' : 'off'"
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

    <!-- Metadata chips footer (OKF frontmatter surfaces here, not as text) -->
    <div v-if="showMetaChips" class="node-tag-footer" @pointerdown.stop @dblclick.stop>
      <span v-if="nodeStatus" class="node-status-chip" :data-status="nodeStatus">{{ nodeStatus }}</span>
      <button
        v-if="nodeDate || isSelected"
        class="node-date-chip"
        :class="{ ghost: !nodeDate }"
        :data-tooltip="t('canvas.node.setDate')"
        @click.stop="openDateEditor"
      >
        {{ nodeDate || `+ ${t('canvas.node.setDate')}` }}
      </button>
      <span v-for="tag in nodeTags" :key="tag" class="node-tag-chip">
        #{{ tag }}
        <button
          v-if="isSelected"
          class="tag-remove"
          :data-tooltip="t('common.delete')"
          @click.stop="removeTag(tag)"
        >&times;</button>
      </span>
      <input
        v-if="showTagInput"
        v-model.trim="tagInput"
        type="text"
        class="tag-input"
        :placeholder="t('canvas.node.addTagPlaceholder')"
        @keydown.enter="addTag"
        @keydown.escape="showTagInput = false"
        @blur="addTag"
        @click.stop
      />
      <button
        v-else-if="isSelected"
        class="node-tag-chip ghost"
        :data-tooltip="t('canvas.node.addTag')"
        @click.stop="showTagInput = true"
      >
        + #
      </button>
    </div>

    <!-- Inline date editor -->
    <div v-if="showDateEditor" class="date-editor" @pointerdown.stop @dblclick.stop>
      <input
        v-model.trim="dateInput"
        type="text"
        class="date-editor-input"
        :placeholder="t('canvas.node.datePlaceholder')"
        @keydown.enter="saveDate"
        @keydown.escape="showDateEditor = false"
      />
      <input
        v-model.trim="dateEndInput"
        type="text"
        class="date-editor-input"
        :placeholder="t('canvas.node.dateEndPlaceholder')"
        @keydown.enter="saveDate"
        @keydown.escape="showDateEditor = false"
      />
      <button class="date-editor-save" @click.stop="saveDate">{{ t('common.save') }}</button>
    </div>

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
.node-card.hover-highlighted {
  box-shadow: 0 0 0 2px var(--primary-color), 0 0 12px rgba(59, 130, 246, 0.35);
}

/* An AI task is writing into this node: pulse so it is findable on a busy
   canvas, and stop the moment the store flag clears. */
.node-card.ai-working {
  animation: ai-working-pulse 1.6s ease-in-out infinite;
}

@keyframes ai-working-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 2px var(--primary-color), 0 0 10px rgba(59, 130, 246, 0.3);
  }
  50% {
    box-shadow: 0 0 0 3px var(--primary-color), 0 0 22px rgba(59, 130, 246, 0.65);
  }
}

.node-tag-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface-alt, rgba(0, 0, 0, 0.02));
}

.node-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  font-size: 10px;
  color: var(--primary-color);
  background: rgba(59, 130, 246, 0.1);
  border: none;
  border-radius: 8px;
  white-space: nowrap;
}

.node-tag-chip.ghost {
  border: 1px dashed var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.node-tag-chip.ghost:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.tag-remove {
  border: none;
  background: none;
  color: inherit;
  font-size: 11px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  opacity: 0.6;
}

.tag-remove:hover {
  opacity: 1;
}

.tag-input {
  width: 90px;
  padding: 1px 6px;
  font-size: 10px;
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-main);
  outline: none;
}

.node-date-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.node-date-chip:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.node-date-chip.ghost {
  border-style: dashed;
  opacity: 0.7;
}

.date-editor {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-elevated);
}

.date-editor-input {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  font-size: 11px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.date-editor-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.date-editor-save {
  padding: 3px 8px;
  font-size: 11px;
  border: none;
  border-radius: 4px;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
}

.node-status-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 10px;
  border-radius: 8px;
  white-space: nowrap;
  text-transform: capitalize;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px dashed var(--border-default);
}

.node-status-chip[data-status='deprecated'] {
  color: var(--danger-color, #ef4444);
  border-color: var(--danger-color, #ef4444);
  background: var(--danger-bg, rgba(239, 68, 68, 0.08));
}

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
