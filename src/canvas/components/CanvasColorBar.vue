<script setup lang="ts">
/**
 * CanvasColorBar - Floating color selection bar
 * Shown when nodes or frames are selected
 * Includes preset colors + color picker with recent colors
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface ColorOption {
  value: string | null
  display: string | null
}

interface ColorInUse {
  value: string
  display: string
}

const props = defineProps<{
  colors: ColorOption[]
  colorsInUse: ColorInUse[]
  selectedNodeIds: string[]
  selectedFrameId: string | null
  isCollapsed: boolean
  getNodeColor: (id: string) => string | null | undefined
  getFrameColor: () => string | null | undefined
}>()

const emit = defineEmits<{
  (e: 'update-node-color', color: string | null): void
  (e: 'update-frame-color', color: string | null): void
  (e: 'fit-nodes'): void
}>()

const { t } = useI18n()

const colorPickerRef = ref<HTMLInputElement | null>(null)

function isColorActive(color: ColorOption): boolean {
  if (props.selectedFrameId) {
    return props.getFrameColor() === color.display
  }
  return props.selectedNodeIds.every(id => props.getNodeColor(id) === color.value)
}

function isInUseColorActive(color: ColorInUse): boolean {
  if (props.selectedFrameId) {
    return props.getFrameColor() === color.value
  }
  return props.selectedNodeIds.every(id => props.getNodeColor(id) === color.value)
}

function onInUseColorClick(color: ColorInUse) {
  if (props.selectedFrameId) {
    emit('update-frame-color', color.value)
  } else {
    emit('update-node-color', color.value)
  }
}

function onColorClick(color: ColorOption) {
  if (props.selectedFrameId) {
    emit('update-frame-color', color.display)
  } else {
    emit('update-node-color', color.value)
  }
}

function openColorPicker() {
  colorPickerRef.value?.click()
}

function onColorPickerChange(event: Event) {
  const input = event.target as HTMLInputElement
  const color = input.value
  if (props.selectedFrameId) {
    emit('update-frame-color', color)
  } else {
    emit('update-node-color', color)
  }
}
</script>

<template>
  <div class="collapsed-color-bar" @pointerdown.stop @click.stop>
    <!-- Colors in use (from current nodes and frames) -->
    <template v-if="colorsInUse.length > 0">
      <button
        v-for="color in colorsInUse"
        :key="'inuse-' + color.value"
        class="color-dot in-use-color"
        :class="{ active: isInUseColorActive(color) }"
        :style="{ background: color.display }"
        :title="'In use'"
        @click.stop="onInUseColorClick(color)"
      ></button>
      <span class="color-bar-sep"></span>
    </template>

    <!-- Preset colors -->
    <button
      v-for="color in colors"
      :key="color.value || 'default'"
      class="color-dot"
      :class="{ active: isColorActive(color) }"
      :style="{ background: color.display || 'var(--bg-surface)' }"
      :title="color.display || 'Default'"
      @click.stop="onColorClick(color)"
    ></button>

    <!-- Color picker button -->
    <button
      class="color-dot color-picker-btn"
      title="Custom color"
      @click.stop="openColorPicker"
    >
      <span class="picker-icon">+</span>
    </button>
    <input
      ref="colorPickerRef"
      type="color"
      class="hidden-color-input"
      @input="onColorPickerChange"
    />

    <span v-if="selectedNodeIds.length > 0 && !selectedFrameId" class="color-bar-sep"></span>
    <button
      v-if="selectedNodeIds.length > 0 && !selectedFrameId"
      class="autofit-toggle"
      :class="{ disabled: isCollapsed }"
      :disabled="isCollapsed"
      :title="isCollapsed ? 'Zoom in to fit nodes' : t('canvas.node.fitContent')"
      @click.stop="emit('fit-nodes')"
    >
      Fit
    </button>
  </div>
</template>

<style scoped>
.collapsed-color-bar {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 20px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 60;
}

.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s, border-color 0.1s;
}

.color-dot:hover {
  transform: scale(1.15);
}

.color-dot.active {
  border-color: var(--primary-color);
}

.color-bar-sep {
  width: 1px;
  height: 16px;
  background: var(--border-default);
  margin: 0 4px;
}

.autofit-toggle {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  cursor: pointer;
  color: var(--text-main);
  transition: background 0.1s;
}

.autofit-toggle:hover:not(:disabled) {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.autofit-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Color picker button */
.color-picker-btn {
  background: conic-gradient(
    from 0deg,
    #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444
  ) !important;
  position: relative;
}

.picker-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.hidden-color-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}


/* Colors in use - show with a subtle ring */
.in-use-color {
  box-shadow: 0 0 0 1px var(--border-default);
}
</style>
