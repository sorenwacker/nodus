<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Frame } from '../../types'

const { t } = useI18n()

defineProps<{
  frames: Frame[]
  selectedFrameId: string | null
  editingFrameId: string | null
  editFrameTitle: string
  frameBorderWidth: number
  scale: number
  frameColors: Array<{ value: string | null; label: string }>
}>()

defineEmits<{
  (e: 'update:editFrameTitle', value: string): void
  (e: 'pointerdown', event: PointerEvent, frameId: string): void
  (e: 'dblclick', frameId: string): void
  (e: 'save-title'): void
  (e: 'cancel-title'): void
  (e: 'update-color', frameId: string, color: string | null): void
  (e: 'delete'): void
  (e: 'start-resize', event: PointerEvent, frameId: string): void
}>()
</script>

<template>
  <div
    v-for="frame in frames"
    :key="'frame-' + frame.id"
    class="canvas-frame"
    :class="{ selected: selectedFrameId === frame.id }"
    :style="{
      transform: `translate(${frame.canvas_x}px, ${frame.canvas_y}px)`,
      width: frame.width + 'px',
      height: frame.height + 'px',
      borderColor: frame.color || 'var(--border-default)',
      borderWidth: frameBorderWidth + 'px',
      borderStyle: 'dashed',
    }"
    @pointerdown.stop="$emit('pointerdown', $event, frame.id)"
    @dblclick.stop="$emit('dblclick', frame.id)"
  >
    <!-- Title label on top -->
    <div class="frame-header" :style="{ transform: `scale(${1/scale}) translateY(-100%)`, transformOrigin: 'left top' }">
      <input
        v-if="editingFrameId === frame.id"
        :value="editFrameTitle"
        class="frame-title-editor"
        @input="$emit('update:editFrameTitle', ($event.target as HTMLInputElement).value)"
        @blur="$emit('save-title')"
        @keydown.enter="$emit('save-title')"
        @keydown.escape="$emit('cancel-title')"
        @click.stop
        @pointerdown.stop
      />
      <span v-else class="frame-title">{{ frame.title }}</span>
    </div>

    <!-- Delete button top-right (like nodes) -->
    <button
      v-if="selectedFrameId === frame.id && editingFrameId !== frame.id"
      class="frame-delete-btn"
      :style="{ transform: `scale(${1/scale})`, transformOrigin: 'center center' }"
      :title="t('canvas.frame.delete')"
      @click.stop="$emit('delete')"
      @pointerdown.stop
    ></button>

    <!-- Color bar below frame (reuses node color bar styling) -->
    <div
      v-if="selectedFrameId === frame.id && editingFrameId !== frame.id"
      class="node-color-bar"
      :style="{ transform: `scale(${1/scale}) translateY(100%)`, transformOrigin: 'left bottom' }"
      @pointerdown.stop
    >
      <button
        v-for="color in frameColors"
        :key="color.value || 'default'"
        class="color-dot"
        :class="{ active: frame.color === color.value }"
        :style="{ backgroundColor: color.value || 'var(--border-default)' }"
        @click.stop="$emit('update-color', frame.id, color.value)"
      ></button>
    </div>

    <div class="frame-resize-handle" @pointerdown.stop="$emit('start-resize', $event, frame.id)"></div>
  </div>
</template>
