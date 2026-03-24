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
  (e: 'start-resize', event: PointerEvent, frameId: string, direction: string): void
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

    <!-- Resize handles - edges -->
    <div class="resize-edge resize-edge-n" @pointerdown.stop="$emit('start-resize', $event, frame.id, 'n')"></div>
    <div class="resize-edge resize-edge-s" @pointerdown.stop="$emit('start-resize', $event, frame.id, 's')"></div>
    <div class="resize-edge resize-edge-e" @pointerdown.stop="$emit('start-resize', $event, frame.id, 'e')"></div>
    <div class="resize-edge resize-edge-w" @pointerdown.stop="$emit('start-resize', $event, frame.id, 'w')"></div>
    <!-- Resize handles - corners -->
    <div class="resize-corner resize-corner-nw" @pointerdown.stop="$emit('start-resize', $event, frame.id, 'nw')"></div>
    <div class="resize-corner resize-corner-ne" @pointerdown.stop="$emit('start-resize', $event, frame.id, 'ne')"></div>
    <div class="resize-corner resize-corner-se" @pointerdown.stop="$emit('start-resize', $event, frame.id, 'se')"></div>
    <div class="resize-corner resize-corner-sw" @pointerdown.stop="$emit('start-resize', $event, frame.id, 'sw')"></div>
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
  z-index: 0;
}

.canvas-frame.selected {
  border-style: solid !important;
  border-color: var(--primary-color) !important;
  border-width: 3px !important;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3), 0 0 20px rgba(59, 130, 246, 0.2);
  background: rgba(59, 130, 246, 0.05);
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
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-surface);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1.5px solid var(--border-subtle);
  white-space: nowrap;
}

/* Title color is set via inline style to match frame color */

.frame-title-editor {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-main);
  background: var(--bg-surface);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--primary-color);
  outline: none;
  min-width: 80px;
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

/* Resize handles */
.resize-edge,
.resize-corner {
  position: absolute;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.canvas-frame:hover .resize-edge,
.canvas-frame:hover .resize-corner,
.canvas-frame.selected .resize-edge,
.canvas-frame.selected .resize-corner {
  pointer-events: auto;
}

.canvas-frame:hover .resize-edge,
.canvas-frame:hover .resize-corner,
.canvas-frame.selected .resize-edge,
.canvas-frame.selected .resize-corner {
  opacity: 0.3;
}

.resize-edge:hover,
.resize-corner:hover {
  opacity: 1 !important;
}

/* Edge handles */
.resize-edge-n,
.resize-edge-s {
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

.resize-edge-n { top: -3px; }
.resize-edge-s { bottom: -3px; }

.resize-edge-e,
.resize-edge-w {
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

.resize-edge-e { right: -3px; }
.resize-edge-w { left: -3px; }

/* Corner handles */
.resize-corner {
  width: 10px;
  height: 10px;
}

.resize-corner-nw { top: -3px; left: -3px; cursor: nwse-resize; }
.resize-corner-ne { top: -3px; right: -3px; cursor: nesw-resize; }
.resize-corner-se { bottom: -3px; right: -3px; cursor: nwse-resize; }
.resize-corner-sw { bottom: -3px; left: -3px; cursor: nesw-resize; }

/* Visual indicator for SE corner */
.resize-corner-se::before,
.resize-corner-se::after {
  content: '';
  position: absolute;
  background: var(--text-muted);
  border-radius: 1px;
}

.resize-corner-se::before {
  bottom: 3px;
  right: 3px;
  width: 6px;
  height: 2px;
}

.resize-corner-se::after {
  bottom: 3px;
  right: 3px;
  width: 2px;
  height: 6px;
}
</style>
