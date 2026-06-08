<script setup lang="ts">
/**
 * Storyline References Sidebar
 * Shows linked documents at the position where they appear in the text
 */
import { computed, ref, watch, onMounted } from 'vue'
import { useNodesStore } from '../stores/nodes'
import { resolveWikilink } from '../lib/wikilink'
import { marked } from '../lib/markdown'
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
  contentRef?: HTMLElement | null
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

// Track scroll position and wikilink positions
const scrollTop = ref(0)
const wikilinkPositions = ref<Map<string, number>>(new Map())
let scrollRaf: number | null = null

// Calculate wikilink positions from the rendered content
function updateWikilinkPositions() {
  if (!props.contentRef) return

  const positions = new Map<string, number>()
  const wikilinks = props.contentRef.querySelectorAll('a.wikilink')
  const containerRect = props.contentRef.getBoundingClientRect()

  wikilinks.forEach((link) => {
    const target = (link as HTMLElement).dataset.target
    if (target) {
      const rect = link.getBoundingClientRect()
      // Position relative to container + scroll offset
      const position = rect.top - containerRect.top + props.contentRef!.scrollTop
      // Store position keyed by target (may have multiple links to same target)
      if (!positions.has(target)) {
        positions.set(target, position)
      }
    }
  })

  wikilinkPositions.value = positions
}

// Listen to content scroll with RAF for smooth updates
function syncScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    if (props.contentRef) {
      scrollTop.value = props.contentRef.scrollTop
    }
    scrollRaf = null
  })
}

// Set up scroll listener and calculate positions
watch(() => props.contentRef, (el) => {
  if (el) {
    el.addEventListener('scroll', syncScroll)
    syncScroll()
    // Delay to ensure content is rendered
    setTimeout(updateWikilinkPositions, 100)
  }
}, { immediate: true })

// Recalculate positions when nodes change
watch(() => props.nodes, () => {
  setTimeout(updateWikilinkPositions, 100)
}, { deep: true })

// Recalculate on scroll (links may have moved due to lazy loading etc)
watch(scrollTop, () => {
  updateWikilinkPositions()
})

onMounted(() => {
  if (props.contentRef) {
    props.contentRef.addEventListener('scroll', syncScroll)
    setTimeout(updateWikilinkPositions, 100)
  }
})

// Get position for a reference based on its target
function getRefTop(target: string): number {
  return wikilinkPositions.value.get(target) || 0
}

// Render markdown preview
function renderPreview(markdown: string): string {
  if (!markdown) return ''
  // Take first 200 chars and render
  const truncated = markdown.slice(0, 200)
  return marked.parse(truncated) as string
}

function handleRefClick(refItem: LinkedReference) {
  if (refItem.isMissing) return

  if (refItem.isInStoryline && refItem.storylineIndex !== undefined) {
    // Navigate within the storyline - don't close reader
    emit('navigate-to-node', refItem.id!)
  }
  // For canvas references, don't do anything to avoid closing reader
  // User can use the link in the text to navigate if needed
}
</script>

<template>
  <aside ref="sidebarRef" class="references-sidebar">
    <div class="references-viewport">
      <!-- Position each reference at the exact height of its wikilink -->
      <div
        v-for="refItem in references"
        :key="refItem.key"
        class="reference-card"
        :class="{
          'in-storyline': refItem.isInStoryline,
          'is-missing': refItem.isMissing
        }"
        :style="{ top: (getRefTop(refItem.target) - scrollTop) + 'px' }"
        @click="handleRefClick(refItem)"
      >
        <div class="ref-header">
          <Icon v-if="refItem.isMissing" name="alert-circle" :size="12" class="ref-icon missing" />
          <Icon v-else-if="refItem.isInStoryline" name="book-open" :size="12" class="ref-icon storyline" />
          <Icon v-else name="external-link" :size="12" class="ref-icon external" />
          <span class="ref-title">{{ refItem.title }}</span>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="refItem.preview && !refItem.isMissing" class="ref-preview" v-html="renderPreview(refItem.preview)"></div>
        <p v-else-if="refItem.isMissing" class="ref-preview missing-hint">
          [[{{ refItem.target }}]]
        </p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.references-sidebar {
  width: 220px;
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
}

.references-viewport {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

.reference-card {
  position: absolute;
  left: 8px;
  right: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  will-change: top;
}

.reference-card:hover {
  border-color: var(--primary-color);
  background: var(--bg-elevated);
}

.reference-card.in-storyline {
  border-left: 2px solid var(--primary-color);
}

.ref-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
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
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ref-preview {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  margin: 0 0 6px;
  max-height: 80px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ref-preview :deep(p) {
  margin: 0;
}

.ref-preview :deep(p + p) {
  margin-top: 4px;
}

.ref-preview :deep(code) {
  font-size: 10px;
  background: var(--bg-elevated);
  padding: 1px 3px;
  border-radius: 2px;
}

.ref-preview :deep(a) {
  color: var(--primary-color);
}

.ref-footer {
  display: flex;
  align-items: center;
}

.ref-location {
  font-size: 10px;
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
  background: var(--bg-surface);
}

.ref-icon.missing {
  color: var(--danger-color, #dc2626);
}

.missing-hint {
  font-style: italic;
  color: var(--text-muted);
  font-size: 11px;
}
</style>
