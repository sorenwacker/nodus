<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Edge } from '../../types'

const { t } = useI18n()

const props = defineProps<{
  selectedEdge: string | null
  edges: Edge[]
  edgeColorPalette: Array<{ value: string; label: string }>
  edgeStyles: Array<{ value: string; label: string }>
  getEdgeColor: (edge: { link_type: string | null }) => string
  getEdgeStyle: (edgeId: string) => string
  isEdgeDirected: (edgeId: string) => boolean
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'change-label', value: string): void
  (e: 'change-color', value: string): void
  (e: 'set-style', value: string): void
  (e: 'reverse'): void
  (e: 'make-non-directional'): void
  (e: 'make-directional'): void
  (e: 'insert-node'): void
  (e: 'delete'): void
}>()

const selectedEdgeData = computed(() => {
  if (!props.selectedEdge) return null
  return props.edges.find(e => e.id === props.selectedEdge) || null
})

const currentLabel = computed(() => selectedEdgeData.value?.label || '')

const currentColor = computed(() => {
  if (!selectedEdgeData.value) return ''
  return props.getEdgeColor({ link_type: selectedEdgeData.value.link_type })
})

const currentStyle = computed(() => {
  if (!props.selectedEdge) return ''
  return props.getEdgeStyle(props.selectedEdge)
})

const isDirected = computed(() => {
  if (!props.selectedEdge) return true
  return props.isEdgeDirected(props.selectedEdge)
})
</script>

<template>
  <div v-if="selectedEdge" class="edge-panel" @mousedown.stop @click.stop @dblclick.stop @pointerdown.stop>
    <div class="edge-panel-header">
      <span>{{ t('canvas.edge.edge') }}</span>
      <button @click="$emit('close')">x</button>
    </div>
    <div class="edge-panel-content">
      <label>{{ t('canvas.edge.label') }}</label>
      <input
        type="text"
        :value="currentLabel"
        :placeholder="t('canvas.edge.labelPlaceholder')"
        class="edge-label-input"
        @input="$emit('change-label', ($event.target as HTMLInputElement).value)"
      />
      <label>{{ t('canvas.edge.color') }}</label>
      <div class="edge-color-picker">
        <button
          v-for="color in edgeColorPalette"
          :key="color.value"
          class="edge-color-dot"
          :class="{ active: currentColor === color.value }"
          :style="{ background: color.value }"
          @click.stop="$emit('change-color', color.value)"
        ></button>
      </div>
      <label>{{ t('canvas.edge.style') }}</label>
      <div class="edge-style-picker">
        <button
          v-for="style in edgeStyles"
          :key="style.value"
          class="edge-style-btn"
          :class="{ active: currentStyle === style.value }"
          @click.stop="$emit('set-style', style.value)"
        >{{ style.label }}</button>
      </div>
      <label>{{ t('canvas.edge.direction') }}</label>
      <div class="direction-btns">
        <button :data-tooltip="t('canvas.edge.reverseDirection')" @click.stop="$emit('reverse')">{{ t('canvas.edge.flip') }}</button>
        <button
          v-if="isDirected"
          :data-tooltip="t('canvas.edge.makeNonDirectional')"
          @click.stop="$emit('make-non-directional')"
        >{{ t('canvas.edge.nonDirectional') }}</button>
        <button
          v-else
          :data-tooltip="t('canvas.edge.makeDirectional')"
          @click.stop="$emit('make-directional')"
        >{{ t('canvas.edge.directional') }}</button>
      </div>
      <button class="insert-node-btn" :data-tooltip="t('canvas.edge.insertNodeTooltip')" @click="$emit('insert-node')">{{ t('canvas.edge.insertNode') }}</button>
      <button class="delete-edge-btn" :data-tooltip="t('canvas.edge.deleteEdgeTooltip')" @click="$emit('delete')">{{ t('canvas.edge.deleteEdge') }}</button>
    </div>
  </div>
</template>
