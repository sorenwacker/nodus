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

/**
 * Strip markdown formatting for plain text preview
 */
function stripMarkdown(text: string): string {
  if (!text) return ''
  return text
    // Remove code blocks first (before other processing)
    .replace(/```[\s\S]*?```/g, '')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic (handle nested cases)
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/___([^_]+)___/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove wikilinks [[text]] or [[text|alias]]
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // Remove markdown links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove blockquotes
    .replace(/^>\s*/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '- ')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove math delimiters
    .replace(/\$\$[\s\S]*?\$\$/g, '[math]')
    .replace(/\$([^$]+)\$/g, '$1')
    // Collapse multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Collapse multiple spaces
    .replace(/  +/g, ' ')
    .trim()
}
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
        <span v-if="node.markdown_content" class="magnifier-node-body">{{ stripMarkdown(node.markdown_content) }}</span>
      </div>
    </div>
  </div>
</template>
