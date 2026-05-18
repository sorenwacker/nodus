<script setup lang="ts">
/**
 * Storyline References Sidebar
 * Shows linked documents at the position where they appear in the text
 */
import { computed } from 'vue'
import { useNodesStore } from '../stores/nodes'
import { resolveWikilink } from '../lib/wikilink'
import { extractWikilinks } from '../lib/contentParser'
import Icon from './Icon.vue'
import type { Node } from '../types'

const props = defineProps<{
  nodes: Node[]
  activeIndex: number
  contentRef: HTMLElement | null
}>()

const emit = defineEmits<{
  (e: 'navigate-to-node', nodeId: string): void
  (e: 'pan-to-canvas', nodeId: string): void
}>()

const store = useNodesStore()

interface LinkedReference {
  id: string
  title: string
  target: string
  preview: string
  position: number // relative position in content (0-1)
  isInStoryline: boolean
  storylineIndex?: number
}

// Extract wikilinks from the current node and resolve them
const references = computed<LinkedReference[]>(() => {
  const node = props.nodes[props.activeIndex]
  if (!node?.markdown_content) return []

  const content = node.markdown_content
  const wikilinks = extractWikilinks(content)
  const refs: LinkedReference[] = []
  const seen = new Set<string>()

  for (const link of wikilinks) {
    // Resolve the wikilink to a node
    const linkedNode = resolveWikilink(link.target, {
      nodes: store.filteredNodes,
      frames: store.filteredFrames,
    })

    if (!linkedNode || seen.has(linkedNode.id)) continue
    seen.add(linkedNode.id)

    // Calculate relative position in content
    const position = link.index / content.length

    // Check if this node is in the current storyline
    const storylineIndex = props.nodes.findIndex(n => n.id === linkedNode.id)
    const isInStoryline = storylineIndex >= 0

    // Get preview text
    const preview = linkedNode.markdown_content?.slice(0, 150) || ''

    refs.push({
      id: linkedNode.id,
      title: linkedNode.title,
      target: link.target,
      preview: preview.replace(/^#.*\n/, '').trim(), // Remove first heading
      position,
      isInStoryline,
      storylineIndex: isInStoryline ? storylineIndex : undefined,
    })
  }

  return refs
})

function handleRefClick(ref: LinkedReference) {
  if (ref.isInStoryline && ref.storylineIndex !== undefined) {
    emit('navigate-to-node', ref.id)
  } else {
    emit('pan-to-canvas', ref.id)
  }
}

function getPositionStyle(position: number) {
  // Map position (0-1) to top offset with some padding
  const topPercent = Math.min(85, Math.max(5, position * 80 + 5))
  return { top: `${topPercent}%` }
}
</script>

<template>
  <aside class="references-sidebar">
    <div class="sidebar-header">
      <h3 class="sidebar-title">References</h3>
      <span class="ref-count">{{ references.length }}</span>
    </div>

    <div class="references-container">
      <div v-if="references.length === 0" class="empty-state">
        <Icon name="link" :size="20" />
        <p>No linked documents in this section</p>
      </div>

      <div
        v-for="ref in references"
        :key="ref.id"
        class="reference-card"
        :class="{ 'in-storyline': ref.isInStoryline }"
        :style="getPositionStyle(ref.position)"
        @click="handleRefClick(ref)"
      >
        <div class="ref-header">
          <Icon v-if="ref.isInStoryline" name="book-open" :size="12" class="ref-icon storyline" />
          <Icon v-else name="external-link" :size="12" class="ref-icon external" />
          <span class="ref-title">{{ ref.title }}</span>
        </div>
        <p v-if="ref.preview" class="ref-preview">{{ ref.preview.slice(0, 100) }}{{ ref.preview.length > 100 ? '...' : '' }}</p>
        <div class="ref-footer">
          <span v-if="ref.isInStoryline" class="ref-location">
            Section {{ (ref.storylineIndex || 0) + 1 }}
          </span>
          <span v-else class="ref-location">
            On canvas
          </span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.references-sidebar {
  width: 280px;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.ref-count {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  padding: 2px 8px;
  border-radius: 10px;
}

.references-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  position: relative;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted);
  text-align: center;
  gap: 12px;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.reference-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.reference-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.reference-card.in-storyline {
  border-left: 3px solid var(--primary-color);
}

.ref-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.ref-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.ref-icon.storyline {
  color: var(--primary-color);
}

.ref-icon.external {
  color: var(--text-muted);
}

.ref-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ref-preview {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  margin: 0 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ref-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ref-location {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
