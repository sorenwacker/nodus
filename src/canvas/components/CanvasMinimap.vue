<script setup lang="ts">
import type { Node } from '../../types'

defineProps<{
  visible: boolean
  nodes: Node[]
  minimapSize: number
  getNodePosition: (node: Node) => { x: number; y: number; width: number; height: number }
  isSelected: (nodeId: string) => boolean
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
    v-if="visible && nodes.length > 0"
    class="minimap"
    @click="$emit('click', $event)"
  >
    <svg :width="minimapSize" :height="minimapSize">
      <!-- Nodes -->
      <rect
        v-for="node in nodes"
        :key="'mm-' + node.id"
        :x="getNodePosition(node).x"
        :y="getNodePosition(node).y"
        :width="getNodePosition(node).width"
        :height="getNodePosition(node).height"
        :fill="node.color_theme || 'var(--text-muted)'"
        :opacity="isSelected(node.id) ? 1 : 0.6"
        rx="1"
      />
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
