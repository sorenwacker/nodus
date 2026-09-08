<script setup lang="ts">
/**
 * The node marks of the minimap.
 *
 * Their own component so that the viewport rectangle beside them, which moves
 * on every frame of a pan or zoom, cannot re-render them: the marks arrive as
 * one precomputed list, and while that list keeps its identity Vue skips this
 * component entirely (PRODUCT_DESIGN.md > Minimap redraw).
 */
import type { MinimapMark } from '../composables/viewport/useMinimap'

defineProps<{ marks: MinimapMark[] }>()
</script>

<template>
  <g>
    <rect
      v-for="mark in marks"
      :key="mark.id"
      class="minimap-mark"
      :x="mark.x"
      :y="mark.y"
      :width="mark.width"
      :height="mark.height"
      :fill="mark.fill"
      :opacity="mark.opacity"
      rx="1"
    />
  </g>
</template>
