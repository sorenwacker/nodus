<script setup lang="ts">
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import NodePicker from './NodePicker.vue'
import type { Node } from '../types'

const props = defineProps<{
  nodes: Node[]
  storylineId: string
  activeIndex?: number
  compact?: boolean
}>()

// Map legacy color values to current colors
const legacyColorMap: Record<string, string> = {
  '#fecaca': 'rgba(239, 68, 68, 0.08)',
  '#fed7aa': 'rgba(249, 115, 22, 0.08)',
  '#fef08a': 'rgba(234, 179, 8, 0.08)',
  '#bbf7d0': 'rgba(34, 197, 94, 0.08)',
  '#bfdbfe': 'rgba(59, 130, 246, 0.08)',
  '#e9d5ff': 'rgba(168, 85, 247, 0.08)',
  '#fbcfe8': 'rgba(236, 72, 153, 0.08)',
  '#fef2f2': 'rgba(239, 68, 68, 0.08)',
  '#fff7ed': 'rgba(249, 115, 22, 0.08)',
  '#fefce8': 'rgba(234, 179, 8, 0.08)',
  '#f0fdf4': 'rgba(34, 197, 94, 0.08)',
  '#eff6ff': 'rgba(59, 130, 246, 0.08)',
  '#faf5ff': 'rgba(168, 85, 247, 0.08)',
  '#fdf2f8': 'rgba(236, 72, 153, 0.08)',
  'rgba(239, 68, 68, 0.15)': 'rgba(239, 68, 68, 0.08)',
  'rgba(249, 115, 22, 0.15)': 'rgba(249, 115, 22, 0.08)',
  'rgba(234, 179, 8, 0.15)': 'rgba(234, 179, 8, 0.08)',
  'rgba(34, 197, 94, 0.15)': 'rgba(34, 197, 94, 0.08)',
  'rgba(59, 130, 246, 0.15)': 'rgba(59, 130, 246, 0.08)',
  'rgba(168, 85, 247, 0.15)': 'rgba(168, 85, 247, 0.08)',
  'rgba(236, 72, 153, 0.15)': 'rgba(236, 72, 153, 0.08)',
}

function getNodeBackground(colorTheme: string | null | undefined): string | undefined {
  if (!colorTheme) return undefined
  const normalizedColor = legacyColorMap[colorTheme] || colorTheme
  return `linear-gradient(${normalizedColor}, ${normalizedColor}), var(--bg-surface)`
}

const emit = defineEmits<{
  (e: 'node-click', index: number): void
  (e: 'reorder', nodeIds: string[]): void
  (e: 'remove', nodeId: string): void
  (e: 'add', index: number, nodeId: string): void
  (e: 'create', index: number, title: string): void
}>()

const showingInsertPicker = ref<number | null>(null)
const hoveringInsertIndex = ref<number | null>(null)
const draggingNodeIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

const excludedNodeIds = computed(() => props.nodes.map(n => n.id))

function toggleInsertPicker(index: number) {
  showingInsertPicker.value = showingInsertPicker.value === index ? null : index
}

function handleSelect(index: number, nodeId: string) {
  emit('add', index, nodeId)
  showingInsertPicker.value = null
}

function handleCreate(index: number, title: string) {
  emit('create', index, title)
  showingInsertPicker.value = null
}

function handleRemove(nodeId: string) {
  emit('remove', nodeId)
}

function handleNodeClick(index: number) {
  emit('node-click', index)
}

// Drag and drop
function onDragStart(e: DragEvent, index: number) {
  console.log('[StorylineNodeList] onDragStart', index)
  draggingNodeIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(e: DragEvent, targetIndex: number) {
  e.preventDefault()
  dragOverIndex.value = null

  console.log('[StorylineNodeList] onDrop called', { draggingNodeIndex: draggingNodeIndex.value, targetIndex })

  if (draggingNodeIndex.value === null) return
  if (draggingNodeIndex.value === targetIndex) {
    draggingNodeIndex.value = null
    return
  }

  const fromIndex = draggingNodeIndex.value
  const nodesCopy = [...props.nodes]
  const [removed] = nodesCopy.splice(fromIndex, 1)

  // Adjust target index when dragging down (since we removed an element before it)
  const adjustedTarget = targetIndex > fromIndex ? targetIndex - 1 : targetIndex
  nodesCopy.splice(adjustedTarget, 0, removed)

  const newOrder = nodesCopy.map(n => n.id)
  console.log('[StorylineNodeList] Emitting reorder', newOrder)
  emit('reorder', newOrder)
  draggingNodeIndex.value = null
}

function onDragEnd() {
  draggingNodeIndex.value = null
  dragOverIndex.value = null
}
</script>

<template>
  <div class="node-list" :class="{ compact }">
    <!-- Empty state -->
    <div v-if="nodes.length === 0" class="empty-state">
      <p>No nodes yet</p>
      <div class="add-first-wrapper">
        <button class="add-first-btn" @click="toggleInsertPicker(0)">
          <Icon name="plus" :size="14" />
          <span>Add first node</span>
        </button>
        <NodePicker
          v-if="showingInsertPicker === 0"
          :exclude-node-ids="[]"
          @select="handleSelect(0, $event)"
          @create="handleCreate(0, $event)"
          @close="showingInsertPicker = null"
        />
      </div>
    </div>

    <template v-else>
      <template v-for="(node, index) in nodes" :key="node.id">
        <!-- Insert zone before each node -->
        <div
          class="insert-zone"
          :class="{ active: hoveringInsertIndex === index || showingInsertPicker === index }"
          @mouseenter="hoveringInsertIndex = index"
          @mouseleave="hoveringInsertIndex = null"
        >
          <button class="insert-btn" @click="toggleInsertPicker(index)">
            <Icon name="plus" :size="compact ? 10 : 12" />
          </button>
          <NodePicker
            v-if="showingInsertPicker === index"
            :exclude-node-ids="excludedNodeIds"
            @select="handleSelect(index, $event)"
            @create="handleCreate(index, $event)"
            @close="showingInsertPicker = null"
          />
        </div>

        <!-- Node item -->
        <div
          class="node-item"
          :class="{
            active: activeIndex === index,
            dragging: draggingNodeIndex === index,
            'drag-over': dragOverIndex === index
          }"
          :style="node.color_theme ? { background: getNodeBackground(node.color_theme) } : {}"
          draggable="true"
          @click="handleNodeClick(index)"
          @dragstart="onDragStart($event, index)"
          @dragover="onDragOver($event, index)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, index)"
          @dragend="onDragEnd"
        >
          <div class="drag-handle">
            <Icon name="drag" :size="compact ? 10 : 12" />
          </div>
          <span class="node-order">{{ index + 1 }}</span>
          <span class="node-title">{{ node.title }}</span>
          <button class="remove-btn" title="Remove" @click.stop="handleRemove(node.id)">
            <Icon name="close" :size="compact ? 8 : 10" />
          </button>
        </div>
      </template>

      <!-- Insert zone at the end -->
      <div
        class="insert-zone insert-zone-end"
        :class="{ active: hoveringInsertIndex === nodes.length || showingInsertPicker === nodes.length }"
        @mouseenter="hoveringInsertIndex = nodes.length"
        @mouseleave="hoveringInsertIndex = null"
      >
        <button class="insert-btn" @click="toggleInsertPicker(nodes.length)">
          <Icon name="plus" :size="compact ? 10 : 12" />
        </button>
        <NodePicker
          v-if="showingInsertPicker === nodes.length"
          :exclude-node-ids="excludedNodeIds"
          position="above"
          @select="handleSelect(nodes.length, $event)"
          @create="handleCreate(nodes.length, $event)"
          @close="showingInsertPicker = null"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.node-list {
  display: flex;
  flex-direction: column;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.empty-state p {
  margin: 0;
}

.add-first-wrapper {
  position: relative;
}

.add-first-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px dashed var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-first-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--bg-elevated);
}

/* Insert zones */
.insert-zone {
  height: 8px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 8px;
  overflow: visible;
  transition: height 0.15s ease-out;
}

.insert-zone:hover,
.insert-zone.active {
  height: 28px;
}

.insert-zone-end {
  margin-top: 4px;
  height: 20px;
}

.insert-zone-end:hover,
.insert-zone-end.active {
  height: 28px;
}

.insert-zone-end .insert-btn {
  opacity: 0.5;
  transform: scale(1);
}

.insert-btn {
  width: 20px;
  height: 20px;
  border: 1px dashed var(--border-default);
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.5);
  transition: opacity 0.15s, transform 0.15s, border-color 0.15s, color 0.15s, background 0.15s;
}

.insert-zone:hover .insert-btn,
.insert-zone.active .insert-btn {
  opacity: 1;
  transform: scale(1);
}

.insert-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--bg-elevated);
}

/* Node items */
.node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--bg-surface);
  margin-bottom: 2px;
  cursor: grab;
  transition: all 0.1s;
  user-select: none;
  -webkit-user-drag: element;
}

.compact .node-item {
  padding: 8px 10px;
  gap: 6px;
}

.node-item:hover {
  background: var(--bg-elevated);
}

.node-item.active {
  background: var(--primary-color);
  color: white;
}

.node-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.node-item.drag-over {
  border-top: 2px solid var(--primary-color);
  margin-top: -2px;
}

.drag-handle {
  color: var(--text-muted);
  cursor: grab;
  opacity: 0.5;
  flex-shrink: 0;
}

.node-item:hover .drag-handle {
  opacity: 1;
}

.node-item.active .drag-handle {
  color: rgba(255, 255, 255, 0.6);
}

.node-order {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: white;
  background: var(--primary-color);
  border-radius: 50%;
  flex-shrink: 0;
}

.compact .node-order {
  width: 18px;
  height: 18px;
  font-size: 10px;
}

.node-item.active .node-order {
  background: rgba(255, 255, 255, 0.2);
}

.node-title {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact .node-title {
  font-size: 12px;
}

.remove-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.1s, background 0.1s, color 0.1s;
  flex-shrink: 0;
}

.compact .remove-btn {
  width: 16px;
  height: 16px;
}

.node-item:hover .remove-btn {
  opacity: 1;
}

.node-item.active .remove-btn {
  opacity: 0.8;
  color: rgba(255, 255, 255, 0.8);
}

.remove-btn:hover {
  background: var(--danger-bg, rgba(239, 68, 68, 0.1));
  color: var(--danger-color, #ef4444);
}

.node-item.active .remove-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}
</style>
