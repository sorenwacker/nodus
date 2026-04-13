<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, toRef, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import { openExternal } from '../lib/tauri'
import StorylineNodeList from './StorylineNodeList.vue'
import StorylineReaderHeader from './StorylineReaderHeader.vue'
import StorylineEntitySidebar from './StorylineEntitySidebar.vue'
import StorylineReaderFooter from './StorylineReaderFooter.vue'
import Icon from './Icon.vue'
import { useStorylineNavigation } from '../composables/useStorylineNavigation'
import { useStorylineMarkdownRendering } from '../composables/useStorylineMarkdownRendering'
import { useScrollPositionMemory } from '../composables/useScrollPositionMemory'
import { useScrollObserver } from '../composables/useScrollObserver'
import { parseCommentMeta, createCommentContent } from '../composables/useCommentMeta'
import type { Node, Storyline, EntityNodeType, CommentType } from '../types'
import { ENTITY_NODE_TYPES, COMMENT_STYLES } from '../types'

const { t } = useI18n()

const props = defineProps<{
  storylineId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useNodesStore()

const storyline = ref<Storyline | null>(null)
const nodes = ref<Node[]>([])
const loading = ref(true)
const contentRef = ref<HTMLElement | null>(null)
const showToc = ref(true)
const showEntitySidebar = ref(false)
const collapsedComments = ref<Set<string>>(new Set())

// Navigation composable
const navigation = useStorylineNavigation({
  contentRef,
  nodeCount: () => nodes.value.length,
  onClose: () => emit('close'),
})
const { activeNodeIndex, goToNode, goToPrevious, goToNext, handleScroll: baseHandleScroll, setupKeyboardListeners, cleanupKeyboardListeners } = navigation

// Scroll position memory
const storylineIdRef = toRef(props, 'storylineId')
const { schedulePositionSave, restorePosition } = useScrollPositionMemory(
  storylineIdRef,
  contentRef,
  activeNodeIndex
)

// Scroll observer for active section tracking
const { activeIndex: observedActiveIndex, initObserver, refreshObserver } = useScrollObserver({
  root: contentRef,
  selector: '[data-node-index]',
  rootMargin: '-20% 0px -60% 0px',
})

// Sync observed active index with navigation
watch(observedActiveIndex, (index) => {
  if (index !== activeNodeIndex.value) {
    activeNodeIndex.value = index
  }
})

// Reading progress (0-100)
const readingProgress = computed(() => {
  if (nodes.value.length <= 1) return 100
  return Math.round((activeNodeIndex.value / (nodes.value.length - 1)) * 100)
})

// Handle scroll with position saving
function handleScroll(e: Event) {
  baseHandleScroll(e)
  schedulePositionSave()
}

// Comment helpers
function getCommentMeta(node: Node) {
  return parseCommentMeta(node.markdown_content)
}

function isCommentCollapsed(nodeId: string): boolean {
  return collapsedComments.value.has(nodeId)
}

function toggleCommentCollapsed(nodeId: string) {
  if (collapsedComments.value.has(nodeId)) {
    collapsedComments.value.delete(nodeId)
  } else {
    collapsedComments.value.add(nodeId)
  }
}

// Handle clicks in rendered content (for external links)
function handleContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const link = target.closest('a')
  if (link) {
    e.preventDefault()
    e.stopPropagation()
    if (link.href && !link.classList.contains('wikilink')) {
      // External link - open in system browser
      openExternal(link.href)
    }
  }
}

// Markdown rendering composable
const markdownRendering = useStorylineMarkdownRendering()
const { renderedContent, renderNodeContent, getRenderedContent } = markdownRendering

async function loadStoryline() {
  loading.value = true
  try {
    // Find storyline
    const found = store.storylines.find(s => s.id === props.storylineId)
    if (found) {
      storyline.value = found
    }
    // Load nodes
    nodes.value = await store.getStorylineNodes(props.storylineId)
  } catch (e) {
    console.error('Failed to load storyline:', e)
  } finally {
    loading.value = false
  }
}

// Render all node content when nodes change
watch(nodes, async (newNodes) => {
  for (const node of newNodes) {
    if (!renderedContent.value.has(node.id)) {
      await renderNodeContent(node)
    }
  }
}, { immediate: true })

// Node list event handlers
async function handleNodeAdd(index: number, nodeId: string) {
  if (!storyline.value) return
  try {
    await store.addNodeToStoryline(storyline.value.id, nodeId, index)
    nodes.value = await store.getStorylineNodes(props.storylineId)
  } catch (e) {
    console.error('Failed to add node:', e)
  }
}

async function handleNodeCreate(index: number, title: string) {
  if (!storyline.value) return
  try {
    const node = await store.createNode({ title, markdown_content: '' })
    await store.addNodeToStoryline(storyline.value.id, node.id, index)
    nodes.value = await store.getStorylineNodes(props.storylineId)
  } catch (e) {
    console.error('Failed to create node:', e)
  }
}

async function handleCommentCreate(index: number, text: string, commentType: CommentType = 'note') {
  if (!storyline.value) return
  try {
    const content = createCommentContent(text, commentType)
    const node = await store.createNode({
      title: 'Comment',
      node_type: 'comment',
      markdown_content: content,
    })
    await store.addNodeToStoryline(storyline.value.id, node.id, index)
    nodes.value = await store.getStorylineNodes(props.storylineId)
    await renderNodeContent(node)
  } catch (e) {
    console.error('Failed to create comment:', e)
  }
}

async function handleNodeRemove(nodeId: string) {
  if (!storyline.value) return
  try {
    await store.removeNodeFromStoryline(storyline.value.id, nodeId)
    nodes.value = await store.getStorylineNodes(props.storylineId)
  } catch (e) {
    console.error('Failed to remove node:', e)
  }
}

async function handleNodeReorder(nodeIds: string[]) {
  if (!storyline.value) return
  try {
    await store.reorderStorylineNodes(storyline.value.id, nodeIds)
    nodes.value = await store.getStorylineNodes(props.storylineId)
  } catch (e) {
    console.error('Failed to reorder nodes:', e)
  }
}

onMounted(async () => {
  await loadStoryline()
  setupKeyboardListeners()

  // Restore scroll position after content loads
  nextTick(() => {
    setTimeout(() => {
      restorePosition()
      initObserver()
    }, 100)
  })
})

onUnmounted(() => {
  cleanupKeyboardListeners()
})

// Refresh observer when nodes change
watch(nodes, () => {
  nextTick(() => {
    refreshObserver()
  })
})

watch(() => props.storylineId, loadStoryline)

// Get entities for the current active node
const currentNodeEntities = computed(() => {
  const node = nodes.value[activeNodeIndex.value]
  if (!node) return []
  return store.getLinkedEntities(node.id)
})

// Group entities by type for display
const entitiesByType = computed(() => {
  const grouped: Record<EntityNodeType, Node[]> = {
    character: [],
    location: [],
    citation: [],
    term: [],
    item: [],
  }

  for (const entity of currentNodeEntities.value) {
    const type = entity.node_type as EntityNodeType
    if (ENTITY_NODE_TYPES.includes(type)) {
      grouped[type].push(entity)
    }
  }

  return grouped
})

const hasEntities = computed(() => currentNodeEntities.value.length > 0)

// Navigate to the previous/next node containing a specific entity
function navigateToEntityNode(entityId: string, direction: 'prev' | 'next') {
  const currentIndex = activeNodeIndex.value
  const startIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

  if (direction === 'next') {
    for (let i = startIndex; i < nodes.value.length; i++) {
      const nodeEntities = store.getLinkedEntities(nodes.value[i].id)
      if (nodeEntities.some(e => e.id === entityId)) {
        goToNode(i)
        return
      }
    }
  } else {
    for (let i = startIndex; i >= 0; i--) {
      const nodeEntities = store.getLinkedEntities(nodes.value[i].id)
      if (nodeEntities.some(e => e.id === entityId)) {
        goToNode(i)
        return
      }
    }
  }
}

function panToEntity(entityId: string) {
  store.selectNode(entityId)
  emit('close')
  window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: entityId } }))
}
</script>

<template>
  <div class="reader-overlay">
    <!-- Skip link for accessibility -->
    <a href="#main-content" class="skip-link">Skip to content</a>

    <!-- Reading progress bar -->
    <div class="reading-progress" :style="{ width: `${readingProgress}%` }"></div>

    <div class="reader-container">
      <!-- Header -->
      <StorylineReaderHeader
        :title="storyline?.title || ''"
        :active-index="activeNodeIndex"
        :node-count="nodes.length"
        :has-entities="hasEntities"
        :show-entity-sidebar="showEntitySidebar"
        @close="$emit('close')"
        @toggle-toc="showToc = !showToc"
        @toggle-entities="showEntitySidebar = !showEntitySidebar"
      />

      <div class="reader-body">
        <!-- Table of Contents Sidebar -->
        <aside v-if="showToc" class="toc-sidebar" role="navigation" aria-label="Table of Contents">
          <div class="toc-header">
            <h2 class="toc-title">{{ t('storyline.contents') }}</h2>
          </div>
          <nav class="toc-nav">
            <StorylineNodeList
              :nodes="nodes"
              :storyline-id="storylineId"
              :active-index="activeNodeIndex"
              compact
              @node-click="goToNode"
              @reorder="handleNodeReorder"
              @remove="handleNodeRemove"
              @add="handleNodeAdd"
              @create="handleNodeCreate"
              @create-comment="handleCommentCreate"
            />
          </nav>
        </aside>

        <!-- Main Content -->
        <main
          id="main-content"
          ref="contentRef"
          class="reader-content"
          :class="{ 'full-width': !showToc }"
          role="main"
          aria-label="Storyline content"
          @scroll="handleScroll"
        >
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>Loading...</span>
          </div>

          <div v-else-if="nodes.length === 0" class="empty-state">
            <p>This storyline has no nodes yet.</p>
            <p class="hint">Add nodes from the canvas to build your narrative.</p>
          </div>

          <template v-else>
            <template v-for="(node, index) in nodes" :key="node.id">
              <!-- Comment nodes render as callouts -->
              <aside
                v-if="node.node_type === 'comment'"
                :id="`node-${index}`"
                :data-node-index="index"
                class="comment-callout"
                :class="[
                  `comment-${getCommentMeta(node).meta.type}`,
                  {
                    'is-resolved': getCommentMeta(node).meta.resolved,
                    'is-collapsed': isCommentCollapsed(node.id)
                  }
                ]"
                :style="{ '--comment-color': COMMENT_STYLES[getCommentMeta(node).meta.type].color }"
              >
                <button
                  class="comment-collapse-toggle"
                  :aria-expanded="!isCommentCollapsed(node.id)"
                  :aria-label="isCommentCollapsed(node.id) ? 'Expand comment' : 'Collapse comment'"
                  @click="toggleCommentCollapsed(node.id)"
                >
                  <Icon :name="isCommentCollapsed(node.id) ? 'chevron-right' : 'chevron-down'" :size="12" />
                </button>
                <div class="comment-icon">
                  <Icon :name="COMMENT_STYLES[getCommentMeta(node).meta.type].icon" :size="16" />
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div v-show="!isCommentCollapsed(node.id)" class="comment-text" @click="handleContentClick" v-html="getRenderedContent(node.id) || ''"></div>
                <span v-if="isCommentCollapsed(node.id)" class="comment-preview">
                  {{ getCommentMeta(node).text.slice(0, 50) }}{{ getCommentMeta(node).text.length > 50 ? '...' : '' }}
                </span>
              </aside>

              <!-- Regular nodes render as sections -->
              <article
                v-else
                :id="`node-${index}`"
                :data-node-index="index"
                class="node-section"
              >
                <header class="section-header">
                  <span class="section-number">{{ index + 1 }}</span>
                  <h2 class="section-title">{{ node.title }}</h2>
                </header>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="section-content" @click="handleContentClick" v-html="getRenderedContent(node.id) || ''"></div>
              </article>
            </template>
          </template>
        </main>

        <!-- Entity Sidebar -->
        <aside
          v-if="showEntitySidebar && hasEntities"
          role="complementary"
          aria-label="Entity sidebar"
        >
          <StorylineEntitySidebar
            :entities-by-type="entitiesByType"
            :has-entities="hasEntities"
            @navigate="navigateToEntityNode"
            @pan-to-entity="panToEntity"
          />
        </aside>
      </div>

      <!-- Navigation Footer -->
      <StorylineReaderFooter
        v-if="nodes.length > 0"
        :active-index="activeNodeIndex"
        :total-nodes="nodes.length"
        @previous="goToPrevious"
        @next="goToNext"
        @goto="goToNode"
      />
    </div>
  </div>
</template>

<style scoped>
.reader-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-canvas);
  z-index: 500;
  animation: fadeIn 0.2s ease;
}

/* Skip link for accessibility */
.skip-link {
  position: absolute;
  top: -100px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: var(--primary-color);
  color: white;
  border-radius: 0 0 8px 8px;
  text-decoration: none;
  font-weight: 600;
  z-index: 1000;
  transition: top 0.2s;
}

.skip-link:focus {
  top: 0;
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* Reading progress bar */
.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--primary-color);
  z-index: 600;
  transition: width 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.reader-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.reader-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.toc-sidebar {
  width: 260px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.toc-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 16px 16px 8px;
  margin: 0;
}

.toc-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 16px;
}

.reader-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px 60px;
  max-width: 800px;
  margin: 0 auto;
}

.reader-content.full-width {
  max-width: 900px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-muted);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-default);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state p {
  margin: 0 0 8px;
  font-size: 14px;
}

.empty-state .hint {
  font-size: 12px;
}

/* Comment callouts */
.comment-callout {
  display: flex;
  gap: 12px;
  margin: 24px 0;
  padding: 16px 20px;
  background: var(--bg-surface-alt);
  border-left: 3px solid var(--comment-color, var(--text-muted));
  border-radius: 0 8px 8px 0;
  transition: opacity 0.15s, border-color 0.15s;
}

.comment-callout.is-resolved {
  opacity: 0.6;
}

.comment-callout.is-resolved .comment-text {
  text-decoration: line-through;
}

.comment-callout.is-collapsed {
  padding: 12px 20px;
}

.comment-collapse-toggle {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  transition: background 0.1s, color 0.1s;
}

.comment-collapse-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.comment-icon {
  flex-shrink: 0;
  color: var(--comment-color, var(--text-muted));
  margin-top: 2px;
}

.comment-preview {
  flex: 1;
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.comment-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  font-style: italic;
}

.comment-text :deep(p) {
  margin: 0;
}

.comment-text :deep(p + p) {
  margin-top: 0.5em;
}

.node-section {
  margin-bottom: 60px;
  padding-bottom: 40px;
  border-bottom: 1px solid var(--border-default);
}

.node-section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.section-number {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: white;
  background: var(--primary-color);
  border-radius: 8px;
  flex-shrink: 0;
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.section-content {
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.section-content :deep(h1),
.section-content :deep(h2),
.section-content :deep(h3) {
  color: var(--text-main);
  margin: 1.5em 0 0.5em;
}

.section-content :deep(h1) { font-size: 1.5em; }
.section-content :deep(h2) { font-size: 1.3em; }
.section-content :deep(h3) { font-size: 1.1em; }

.section-content :deep(p) {
  margin: 0 0 1em;
}

.section-content :deep(ul),
.section-content :deep(ol) {
  margin: 0 0 1em;
  padding-left: 1.5em;
}

.section-content :deep(li) {
  margin-bottom: 0.5em;
}

.section-content :deep(code) {
  background: var(--bg-surface-alt);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.9em;
}

.section-content :deep(pre) {
  background: var(--bg-surface-alt);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
}

.section-content :deep(pre code) {
  background: none;
  padding: 0;
}

.section-content :deep(a) {
  color: var(--primary-color);
  text-decoration: none;
}

.section-content :deep(a:hover) {
  text-decoration: underline;
}

.section-content :deep(strong) {
  color: var(--text-main);
  font-weight: 600;
}

/* Math rendering styles */
.section-content :deep(.typst-display) {
  display: block;
  text-align: center;
  margin: 1em 0;
  overflow-x: auto;
}

.section-content :deep(.typst-inline) {
  display: inline;
}

.section-content :deep(.typst-pending) {
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}

/* Blockquote styles */
.section-content :deep(blockquote) {
  border-left: 3px solid var(--primary-color);
  margin: 1em 0;
  padding: 0.5em 1em;
  background: var(--bg-surface-alt);
  border-radius: 0 4px 4px 0;
}

.section-content :deep(blockquote p) {
  margin: 0;
}

/* Table styles */
.section-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}

.section-content :deep(th),
.section-content :deep(td) {
  border: 1px solid var(--border-default);
  padding: 8px 12px;
  text-align: left;
}

.section-content :deep(th) {
  background: var(--bg-surface-alt);
  font-weight: 600;
}

.section-content :deep(tr:nth-child(even)) {
  background: var(--bg-surface-alt);
}

/* Horizontal rule */
.section-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-default);
  margin: 2em 0;
}

/* Image styles */
.section-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 1em 0;
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .reading-progress,
  .comment-callout,
  .node-section,
  .skip-link {
    transition: none;
  }

  @keyframes fadeIn {
    from { opacity: 1; }
    to { opacity: 1; }
  }
}
</style>
