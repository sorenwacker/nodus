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
      <span v-else class="frame-title" :style="{ color: frame.color || undefined, borderColor: frame.color || undefined }">{{ frame.title }}</span>
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

    <!-- Color bar below frame -->
    <div
      v-if="selectedFrameId === frame.id && editingFrameId !== frame.id"
      class="frame-color-bar"
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

<style scoped>
.canvas-frame {
  position: absolute;
  top: 0;
  left: 0;
  border: 2px dashed var(--border-default);
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.05);
  pointer-events: auto;
  cursor: move;
  z-index: 2;
}

.canvas-frame:hover {
  z-index: 5;
}

.canvas-frame.selected {
  border-style: solid;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.frame-header {
  position: absolute;
  top: 0;
  left: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}

.frame-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-surface);
  padding: 4px 10px;
  border-radius: 4px;
  border: 2px solid var(--border-subtle);
  white-space: nowrap;
}

/* Title color is set via inline style to match frame color */

.frame-title-editor {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  background: var(--bg-surface);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--primary-color);
  outline: none;
  min-width: 100px;
}

.frame-delete-btn {
  position: absolute;
  top: -16px;
  right: -16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--danger-color);
  cursor: pointer;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.frame-delete-btn::before {
  content: 'x';
  position: absolute;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--danger-border);
  background: var(--danger-bg);
  color: var(--danger-color);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px var(--shadow-sm);
  transition: background 0.1s, color 0.1s;
}

.frame-delete-btn:hover::before {
  background: var(--danger-color);
  color: white;
}

.frame-color-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 10;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--border-default);
  cursor: pointer;
  padding: 0;
}

.color-dot:hover {
  border-color: var(--text-muted);
  transform: scale(1.1);
}

.color-dot.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.frame-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(
    135deg,
    transparent 50%,
    var(--border-default) 50%,
    var(--border-default) 75%,
    transparent 75%
  );
  border-radius: 0 0 10px 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.canvas-frame:hover .frame-resize-handle,
.canvas-frame.selected .frame-resize-handle {
  opacity: 1;
}
</style>
