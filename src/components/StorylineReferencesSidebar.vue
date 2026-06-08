<script setup lang="ts">
/**
 * Storyline References Sidebar
 * Shows linked documents at the position where they appear in the text
 */
import { computed, ref, watch, onMounted } from 'vue'
import { useNodesStore } from '../stores/nodes'
import { resolveWikilink } from '../lib/wikilink'
import { renderMarkdown } from '../services/MarkdownRenderService'
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

// Lazy loading: only process sections near the active index
const SECTION_BUFFER = 2

const visibleSections = computed(() => {
  const start = Math.max(0, props.activeIndex - SECTION_BUFFER)
  const end = Math.min(props.nodes.length - 1, props.activeIndex + SECTION_BUFFER)
  return { start, end }
})

// Extract wikilinks only from visible sections for performance
const references = computed<LinkedReference[]>(() => {
  const refs: LinkedReference[] = []
  const { start, end } = visibleSections.value

  for (let nodeIdx = start; nodeIdx <= end; nodeIdx++) {
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
  const containerRect = props.contentRef.getBoundingClientRect()

  // Process each section to match how references are built
  const sections = props.contentRef.querySelectorAll('[data-node-index]')

  sections.forEach((section) => {
    const nodeIdx = parseInt(section.getAttribute('data-node-index') || '0', 10)
    const wikilinks = section.querySelectorAll('a.wikilink')

    wikilinks.forEach((link, linkIdx) => {
      const target = (link as HTMLElement).dataset.target
      if (target) {
        const rect = link.getBoundingClientRect()
        // Position relative to container + scroll offset
        const position = rect.top - containerRect.top + props.contentRef!.scrollTop
        // Key format matches references: nodeIdx-linkIdx-target
        const key = `${nodeIdx}-${linkIdx}-${target}`
        positions.set(key, position)
      }
    })
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

// Card heights
const CARD_HEIGHT_FULL = 90
const CARD_HEIGHT_COLLAPSED = 28
const CARD_GAP = 4
const COLLAPSE_THRESHOLD = 100 // Collapse if natural positions are within this distance

// Track which card is hovered for expansion
const hoveredKey = ref<string | null>(null)

// Determine which cards should be collapsed based on proximity
const collapsedCards = computed(() => {
  const collapsed = new Set<string>()

  const sortedRefs = [...references.value].sort((a, b) => {
    const posA = wikilinkPositions.value.get(a.key) || 0
    const posB = wikilinkPositions.value.get(b.key) || 0
    return posA - posB
  })

  for (let i = 1; i < sortedRefs.length; i++) {
    const prevPos = wikilinkPositions.value.get(sortedRefs[i - 1].key) || 0
    const currPos = wikilinkPositions.value.get(sortedRefs[i].key) || 0

    // If too close to previous, collapse both
    if (currPos - prevPos < COLLAPSE_THRESHOLD) {
      collapsed.add(sortedRefs[i - 1].key)
      collapsed.add(sortedRefs[i].key)
    }
  }

  return collapsed
})

// Calculate positions with collision avoidance
const adjustedPositions = computed(() => {
  const positions = new Map<string, number>()

  const sortedRefs = [...references.value].sort((a, b) => {
    const posA = wikilinkPositions.value.get(a.key) || 0
    const posB = wikilinkPositions.value.get(b.key) || 0
    return posA - posB
  })

  let lastBottom = -Infinity

  for (const ref of sortedRefs) {
    const naturalTop = wikilinkPositions.value.get(ref.key) || 0
    const isCollapsed = collapsedCards.value.has(ref.key) && hoveredKey.value !== ref.key
    const cardHeight = isCollapsed ? CARD_HEIGHT_COLLAPSED : CARD_HEIGHT_FULL

    // Push down if would overlap
    const adjustedTop = Math.max(naturalTop, lastBottom + CARD_GAP)
    positions.set(ref.key, adjustedTop)
    lastBottom = adjustedTop + cardHeight
  }

  return positions
})

function isCollapsed(key: string): boolean {
  return collapsedCards.value.has(key) && hoveredKey.value !== key
}

// Get position for a reference based on its unique key
function getRefTop(key: string): number {
  return adjustedPositions.value.get(key) || 0
}

// Render markdown preview using unified service
function renderPreview(markdown: string): string {
  if (!markdown) return ''
  // Take first 200 chars and render
  const truncated = markdown.slice(0, 200)
  return renderMarkdown(truncated)
}

function handleRefClick(refItem: LinkedReference) {
  if (refItem.isMissing || !refItem.id) return
  // Open detail modal for this node via global event
  window.dispatchEvent(new CustomEvent('open-node-detail', { detail: { nodeId: refItem.id } }))
}

function handleRefNavigate(e: Event, refItem: LinkedReference) {
  e.stopPropagation()
  if (refItem.isMissing) return

  if (refItem.isInStoryline && refItem.storylineIndex !== undefined) {
    // Navigate within the storyline - don't close reader
    emit('navigate-to-node', refItem.id!)
  }
}
</script>

<template>
  <aside class="references-sidebar">
    <div class="references-viewport">
      <!-- Position each reference at the exact height of its wikilink -->
      <div
        v-for="refItem in references"
        :key="refItem.key"
        class="reference-card"
        :class="{
          'in-storyline': refItem.isInStoryline,
          'is-missing': refItem.isMissing,
          'is-collapsed': isCollapsed(refItem.key)
        }"
        :style="{ top: (getRefTop(refItem.key) - scrollTop) + 'px' }"
        @click="handleRefClick(refItem)"
      >
        <div
          class="ref-header"
          @mouseenter="hoveredKey = refItem.key"
          @mouseleave="hoveredKey = null"
        >
          <Icon v-if="refItem.isMissing" name="alert-circle" :size="12" class="ref-icon missing" />
          <Icon v-else-if="refItem.isInStoryline" name="book-open" :size="12" class="ref-icon storyline" />
          <Icon v-else name="external-link" :size="12" class="ref-icon external" />
          <span class="ref-title">{{ refItem.title }}</span>
          <button
            v-if="refItem.isInStoryline && !refItem.isMissing"
            class="ref-goto-btn"
            title="Go to section"
            @click="handleRefNavigate($event, refItem)"
          >
            <Icon name="arrow-right" :size="10" />
          </button>
        </div>
        <!-- Only show preview when not collapsed -->
        <template v-if="!isCollapsed(refItem.key)">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-if="refItem.preview && !refItem.isMissing" class="ref-preview" v-html="renderPreview(refItem.preview)"></div>
          <p v-else-if="refItem.isMissing" class="ref-preview missing-hint">
            [[{{ refItem.target }}]]
          </p>
        </template>
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
  transition: padding 0.15s ease-out, box-shadow 0.15s ease-out;
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
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ref-goto-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.reference-card:hover .ref-goto-btn {
  opacity: 1;
}

.ref-goto-btn:hover {
  background: var(--primary-color);
  color: white;
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

/* Collapsed state */
.reference-card.is-collapsed {
  padding: 4px 10px;
}

.reference-card.is-collapsed .ref-header {
  margin-bottom: 0;
}

/* Expand on hover with higher z-index */
.reference-card:has(.ref-header:hover) {
  z-index: 10;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}
</style>
