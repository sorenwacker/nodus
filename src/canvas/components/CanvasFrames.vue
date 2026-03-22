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
  (e: 'mousedown', event: MouseEvent, frameId: string): void
  (e: 'dblclick', frameId: string): void
  (e: 'save-title'): void
  (e: 'cancel-title'): void
  (e: 'update-color', frameId: string, color: string | null): void
  (e: 'delete'): void
  (e: 'start-resize', event: MouseEvent, frameId: string): void
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
    }"
    @mousedown.stop="$emit('mousedown', $event, frame.id)"
    @dblclick.stop="$emit('dblclick', frame.id)"
  >
    <div class="frame-header" :style="{ transform: `scale(${1/scale})`, transformOrigin: 'left center' }">
      <input
        v-if="editingFrameId === frame.id"
        :value="editFrameTitle"
        class="frame-title-editor"
        @input="$emit('update:editFrameTitle', ($event.target as HTMLInputElement).value)"
        @blur="$emit('save-title')"
        @keydown.enter="$emit('save-title')"
        @keydown.escape="$emit('cancel-title')"
        @click.stop
        @mousedown.stop
      />
      <span v-else class="frame-title">{{ frame.title }}</span>
      <div v-if="selectedFrameId === frame.id && editingFrameId !== frame.id" class="frame-color-picker" @mousedown.stop>
        <button
          v-for="color in frameColors"
          :key="color.value || 'default'"
          class="frame-color-dot"
          :class="{ active: frame.color === color.value }"
          :style="{ background: color.value || 'var(--border-default)' }"
          @click.stop="$emit('update-color', frame.id, color.value)"
        ></button>
      </div>
      <button
        v-if="selectedFrameId === frame.id && editingFrameId !== frame.id"
        class="frame-delete-btn"
        :title="t('canvas.frame.delete')"
        @click.stop="$emit('delete')"
      >x</button>
    </div>
    <div class="frame-resize-handle" @mousedown.stop="$emit('start-resize', $event, frame.id)"></div>
  </div>
</template>
