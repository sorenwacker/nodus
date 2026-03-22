<script setup lang="ts">
import type { Node } from '../../types'

defineProps<{
  visible: boolean
  position: { x: number; y: number }
  nodes: Node[]
  magnifierSize: number
  magnifierZoom: number
  offsetX: number
  offsetY: number
  scale: number
  nodeDefaults: { WIDTH: number; HEIGHT: number }
  getNodeBackground: (colorTheme: string) => string | undefined
}>()
</script>

<template>
  <div
    v-if="visible && nodes.length > 0"
    class="magnifier"
    :style="{
      left: (position.x - magnifierSize / 2) + 'px',
      top: (position.y - magnifierSize / 2) + 'px',
      width: magnifierSize + 'px',
      height: magnifierSize + 'px',
    }"
  >
    <div class="magnifier-warp">
      <div
        v-for="node in nodes"
        :key="'mag-' + node.id"
        class="magnifier-node"
        :style="[
          {
            left: ((node.canvas_x - (position.x - offsetX) / scale) * magnifierZoom + magnifierSize / 2) + 'px',
            top: ((node.canvas_y - (position.y - offsetY) / scale) * magnifierZoom + magnifierSize / 2) + 'px',
            width: ((node.width || nodeDefaults.WIDTH) * magnifierZoom) + 'px',
            height: ((node.height || nodeDefaults.HEIGHT) * magnifierZoom) + 'px',
          },
          node.color_theme ? { background: getNodeBackground(node.color_theme) } : {}
        ]"
      >
        <span class="magnifier-node-title">{{ node.title || 'Untitled' }}</span>
        <span v-if="node.markdown_content" class="magnifier-node-body">{{ node.markdown_content }}</span>
      </div>
    </div>
  </div>
</template>
