<script setup lang="ts">
/**
 * CanvasColorBar - Floating color selection bar
 * Shown when nodes or frames are selected
 */
import { useI18n } from 'vue-i18n'

interface ColorOption {
  value: string | null
  display: string
}

const props = defineProps<{
  colors: ColorOption[]
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

function isColorActive(color: ColorOption): boolean {
  if (props.selectedFrameId) {
    return props.getFrameColor() === color.display
  }
  return props.selectedNodeIds.every(id => props.getNodeColor(id) === color.value)
}

function onColorClick(color: ColorOption) {
  if (props.selectedFrameId) {
    emit('update-frame-color', color.display)
  } else {
    emit('update-node-color', color.value)
  }
}
</script>

<template>
  <div class="collapsed-color-bar" @pointerdown.stop @click.stop>
    <button
      v-for="color in colors"
      :key="color.value || 'default'"
      class="color-dot"
      :class="{ active: isColorActive(color) }"
      :style="{ background: color.display || 'var(--bg-surface)' }"
      @click.stop="onColorClick(color)"
    ></button>
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
</style>
