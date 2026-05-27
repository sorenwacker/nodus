<script setup lang="ts">
/**
 * Storyline References Sidebar
 * Shows linked documents at the position where they appear in the text
 */
import { computed, ref, watch, nextTick } from 'vue'
import { useNodesStore } from '../stores/nodes'
import { resolveWikilink } from '../lib/wikilink'
import Icon from './Icon.vue'
import type { Node } from '../types'

interface WikilinkMatch {
  target: string
  index: number
  nodeIndex: number // which storyline node this is from
}

/**
 * Extract wikilinks with their position in the content
 */
function extractWikilinksWithPosition(content: string, nodeIndex: number): WikilinkMatch[] {
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const links: WikilinkMatch[] = []
  let match
  while ((match = wikilinkRegex.exec(content)) !== null) {
    links.push({
      target: match[1].trim(),
      index: match.index,
      nodeIndex,
    })
  }
  return links
}

const props = defineProps<{
  nodes: Node[]
  activeIndex: number
}>()

const emit = defineEmits<{
  (e: 'navigate-to-node', nodeId: string): void
  (e: 'pan-to-canvas', nodeId: string): void
}>()

const store = useNodesStore()
const sidebarRef = ref<HTMLElement | null>(null)

interface LinkedReference {
  key: string // unique key for each occurrence
  id: string | null
  title: string
  target: string
  preview: string
  sectionIndex: number // which section/node this link is in
  charPosition: number // character position within that section
  isInStoryline: boolean
  storylineIndex?: number
  isMissing: boolean
}

// Extract wikilinks from ALL nodes in the storyline
const references = computed<LinkedReference[]>(() => {
  const refs: LinkedReference[] = []

  for (let nodeIdx = 0; nodeIdx < props.nodes.length; nodeIdx++) {
    const node = props.nodes[nodeIdx]
    if (!node?.markdown_content) continue
    // Skip comment nodes - they don't typically have substantive references
    if (node.node_type === 'comment') continue

    const content = node.markdown_content
    const wikilinks = extractWikilinksWithPosition(content, nodeIdx)

    for (let i = 0; i < wikilinks.length; i++) {
      const link = wikilinks[i]

      // Resolve the wikilink to a node
      const linkedNode = resolveWikilink(link.target, {
        nodes: store.filteredNodes,
        frames: store.filteredFrames,
      })

      const isMissing = !linkedNode

      // Check if this node is in the current storyline
      const storylineIndex = linkedNode
        ? props.nodes.findIndex(n => n.id === linkedNode.id)
        : -1
      const isInStoryline = storylineIndex >= 0

      // Get preview text
      const preview = linkedNode?.markdown_content?.slice(0, 150) || ''

      refs.push({
        key: `${nodeIdx}-${i}-${link.target}`,
        id: linkedNode?.id || null,
        title: linkedNode?.title || link.target,
        target: link.target,
        preview: preview.replace(/^#.*\n/, '').trim(),
        sectionIndex: nodeIdx,
        charPosition: link.index,
        isInStoryline,
        storylineIndex: isInStoryline ? storylineIndex : undefined,
        isMissing,
      })
    }
  }

  return refs
})

// Filter to show only references from the active section
const activeReferences = computed(() => {
  return references.value.filter(r => r.sectionIndex === props.activeIndex)
})

// Sync sidebar scroll with content scroll
watch(() => props.activeIndex, () => {
  nextTick(() => {
    // Scroll sidebar to show references for active section
    if (sidebarRef.value) {
      const firstRef = sidebarRef.value.querySelector(`[data-section="${props.activeIndex}"]`)
      if (firstRef) {
        firstRef.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  })
})

function handleRefClick(ref: LinkedReference) {
  if (ref.isMissing) return

  if (ref.isInStoryline && ref.storylineIndex !== undefined) {
    emit('navigate-to-node', ref.id!)
  } else if (ref.id) {
    emit('pan-to-canvas', ref.id)
  }
}
</script>

<template>
  <aside ref="sidebarRef" class="references-sidebar">
    <div class="sidebar-header">
      <h3 class="sidebar-title">References</h3>
      <span class="ref-count">{{ activeReferences.length }}</span>
    </div>

    <div class="references-container">
      <div v-if="activeReferences.length === 0" class="empty-state">
        <Icon name="link" :size="20" />
        <p>No linked documents in this section</p>
      </div>

      <div
        v-for="ref in activeReferences"
        :key="ref.key"
        :data-section="ref.sectionIndex"
        class="reference-card"
        :class="{
          'in-storyline': ref.isInStoryline,
          'is-missing': ref.isMissing
        }"
        @click="handleRefClick(ref)"
      >
        <div class="ref-header">
          <Icon v-if="ref.isMissing" name="alert-circle" :size="12" class="ref-icon missing" />
          <Icon v-else-if="ref.isInStoryline" name="book-open" :size="12" class="ref-icon storyline" />
          <Icon v-else name="external-link" :size="12" class="ref-icon external" />
          <span class="ref-title">{{ ref.title }}</span>
        </div>
        <p v-if="ref.preview && !ref.isMissing" class="ref-preview">
          {{ ref.preview.slice(0, 100) }}{{ ref.preview.length > 100 ? '...' : '' }}
        </p>
        <p v-else-if="ref.isMissing" class="ref-preview missing-hint">
          Node not found: [[{{ ref.target }}]]
        </p>
        <div class="ref-footer">
          <span v-if="ref.isMissing" class="ref-location missing">
            Missing
          </span>
          <span v-else-if="ref.isInStoryline" class="ref-location">
            Section {{ (ref.storylineIndex || 0) + 1 }}
          </span>
          <span v-else class="ref-location">
            On canvas
          </span>
        </div>
      </div>
    </div>

    <!-- Show total reference count across all sections -->
    <div v-if="references.length > 0" class="sidebar-footer">
      <span class="total-refs">{{ references.length }} total references</span>
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

.ref-location.missing {
  color: var(--danger-color, #dc2626);
}

.reference-card.is-missing {
  opacity: 0.7;
  border-color: var(--danger-color, #dc2626);
  cursor: default;
}

.reference-card.is-missing:hover {
  border-color: var(--danger-color, #dc2626);
  box-shadow: none;
}

.ref-icon.missing {
  color: var(--danger-color, #dc2626);
}

.missing-hint {
  font-style: italic;
  color: var(--text-muted);
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.total-refs {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
