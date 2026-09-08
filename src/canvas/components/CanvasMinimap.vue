<script setup lang="ts">
/**
 * The minimap: one mark per node in the workspace, and a rectangle showing
 * where the viewport sits among them.
 *
 * The rectangle moves on every frame of a pan or zoom; the marks do not. The
 * marks are precomputed by useMinimap and drawn by their own component, so a
 * viewport move re-renders the rectangle alone
 * (PRODUCT_DESIGN.md > Minimap redraw).
 */
import CanvasMinimapMarks from './CanvasMinimapMarks.vue'
import type { MinimapMark } from '../composables/viewport/useMinimap'

defineProps<{
  visible: boolean
  marks: MinimapMark[]
  minimapSize: number
  viewportX: number
  viewportY: number
  viewportWidth: number
  viewportHeight: number
}>()

defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()
</script>

<template>
  <div
    v-if="visible && marks.length > 0"
    class="minimap"
    @click="$emit('click', $event)"
  >
    <svg :width="minimapSize" :height="minimapSize">
      <CanvasMinimapMarks :marks="marks" />
      <!-- Viewport indicator -->
      <rect
        :x="viewportX"
        :y="viewportY"
        :width="viewportWidth"
        :height="viewportHeight"
        fill="none"
        stroke="var(--primary-color)"
        stroke-width="2"
        rx="2"
      />
    </svg>
  </div>
</template>
