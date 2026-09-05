<script setup lang="ts">
/**
 * Draws where each edge listens.
 *
 * The handle geometry comes from the same function the gesture uses, so a
 * handle can never be drawn somewhere the gesture is not listening
 * (PRODUCT_DESIGN.md > Edge handles).
 *
 * Left and right only. The bottom edge no longer opens the timelines sheet and
 * the top no longer closes it - that moved to a toolbar button - so drawing
 * either would mark an edge that does nothing (App.vue > edgeStepper).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { edgeHandleRange } from '../lib/edgeGesture'

const height = ref(window.innerHeight)

function measure() {
  height.value = window.innerHeight
}

onMounted(() => window.addEventListener('resize', measure))
onUnmounted(() => window.removeEventListener('resize', measure))

const vertical = computed(() => {
  const { start, size } = edgeHandleRange(height.value)
  return { top: `${start}px`, height: `${size}px` }
})
</script>

<template>
  <div class="edge-handles" aria-hidden="true">
    <span class="edge-handle left" :style="vertical"></span>
    <span class="edge-handle right" :style="vertical"></span>
  </div>
</template>

<style scoped>
.edge-handles {
  position: fixed;
  inset: 0;
  z-index: 40;
  /* A marker, not a control: the canvas underneath stays interactive */
  pointer-events: none;
}

.edge-handle {
  position: fixed;
  border-radius: 3px;
  background: var(--text-muted);
  opacity: 0.28;
  transition: opacity 0.2s ease;
}

.edge-handle.left,
.edge-handle.right {
  width: 3px;
}

.edge-handle.left {
  left: 0;
}

.edge-handle.right {
  right: 0;
}

@media (prefers-reduced-motion: reduce) {
  .edge-handle {
    transition: none;
  }
}
</style>
