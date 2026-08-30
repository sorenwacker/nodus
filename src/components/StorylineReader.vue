<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, toRef, nextTick, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import { acquireEditLock, releaseEditLock } from '../lib/tauri'
import { extractHeadings } from '../lib/contentParser'
import { uiStorage } from '../lib/storage'
import { usePanelReveal } from '../composables/usePanelReveal'
import type { StorylineService } from '../services/storylineService'
import StorylineNodeList from './StorylineNodeList.vue'
import StorylineReaderHeader from './StorylineReaderHeader.vue'
import StorylineEntitySidebar from './StorylineEntitySidebar.vue'
import StorylineReferencesSidebar from './StorylineReferencesSidebar.vue'
import StorylineReaderFooter from './StorylineReaderFooter.vue'
import ExportDialog from './ExportDialog.vue'
import { useEdgesStore } from '../stores/edges'
import Icon from './Icon.vue'
import { useStorylineNavigation } from '../composables/useStorylineNavigation'
import { useStorylineMarkdownRendering } from '../composables/useStorylineMarkdownRendering'
import { useScrollPositionMemory } from '../composables/useScrollPositionMemory'
import { useScrollObserver } from '../composables/useScrollObserver'
import { createCommentContent } from '../composables/useCommentMeta'
import { commentAnchorTitle, anchorCommentInText } from '../lib/anchoredNodes'
import { useStorylineReaderContent } from '../composables/useStorylineReaderContent'
import { useStorylineReaderComments } from '../composables/useStorylineReaderComments'
import { useStorylineReaderEntities } from '../composables/useStorylineReaderEntities'
import type { Node, Storyline, CommentType } from '../types'
import { COMMENT_STYLES } from '../types'

const { t } = useI18n()

const props = defineProps<{
  /** Empty when reading a single node rather than a storyline */
  storylineId: string
  /**
   * Read this node on its own, using the same reader the storylines use
   * (PRODUCT_DESIGN.md > Reading a single node)
   */
  singleNodeId?: string
  /** Full window width (deepest step); false keeps the graph visible at half */
  fullWidth?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useNodesStore()
const storylineService = inject<StorylineService>('storylineService')

const storyline = ref<Storyline | null>(null)
const nodes = ref<Node[]>([])
const edgesStore = useEdgesStore()
const showExport = ref(false)

// Only the edges between exported nodes belong in the document
const storylineEdges = computed(() => {
  const ids = new Set(nodes.value.map(n => n.id))
  return edgesStore.edges.filter(e => ids.has(e.source_node_id) && ids.has(e.target_node_id))
})
const loading = ref(true)
const contentRef = ref<HTMLElement | null>(null)
// The contents sidebar keeps its state across folding the reader away and
// back, and across sessions
const showToc = ref(uiStorage.getReaderTocVisible())
watch(showToc, value => uiStorage.setReaderTocVisible(value))
const showEntitySidebar = ref(false)
const showReferencesSidebar = ref(false) // Hidden by default - optional

// Open detail modal for editing a node
// Contents sidebar: subheadings under each node, indented as a table of
// contents (PRODUCT_DESIGN.md > Contents sidebar)
function nodeHeadings(node: Node) {
  return extractHeadings(node.markdown_content || '')
}

function goToHeading(sectionIndex: number, headingIndex: number) {
  const section = document.querySelector(`#node-${sectionIndex} .section-content`)
  const heading = section?.querySelectorAll('h1, h2, h3, h4, h5, h6')[headingIndex]
  const container = contentRef.value
  if (!heading || !container) return
  // Scroll the content pane only; see goToNode for why not scrollIntoView
  const top =
    heading.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  container.scrollTo({ top: top - 12, behavior: 'smooth' })
}

// Inline section editing, from a double-click on a section title - not on the
// body, where that gesture selects a word (PRODUCT_DESIGN.md > Editing)
const editingSectionId = ref<string | null>(null)
const editingText = ref('')
const editingLockError = ref<string | null>(null)

async function startSectionEdit(node: Node) {
  if (editingSectionId.value === node.id) return
  // One section edits at a time; starting another saves the current one
  if (editingSectionId.value) await saveSectionEdit()

  editingLockError.value = null
  try {
    // The lock comes first: a locked file must never be silently forked
    await acquireEditLock(node.id)
  } catch (e) {
    editingLockError.value = e instanceof Error ? e.message : String(e)
    return
  }
  editingText.value = node.markdown_content || ''
  editingSectionId.value = node.id
  await nextTick()
  document.querySelector<HTMLTextAreaElement>('.section-editor')?.focus()
}

async function saveSectionEdit() {
  const id = editingSectionId.value
  if (!id) return
  editingSectionId.value = null
  try {
    await store.updateNodeContent(id, editingText.value)
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.markdown_content = editingText.value
      renderNodeContent(node)
    }
  } finally {
    await releaseEditLock(id).catch(() => {})
  }
}

async function cancelSectionEdit() {
  const id = editingSectionId.value
  editingSectionId.value = null
  if (id) await releaseEditLock(id).catch(() => {})
}

function onEditorKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void cancelSectionEdit()
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    void saveSectionEdit()
  }
}

function openNodeDetail(nodeId: string) {
  window.dispatchEvent(new CustomEvent('open-node-detail', { detail: { nodeId } }))
}

// Resizable width through the shared panel composable, so the drag, clamping
// and persistence behave as they do for the storyline panel, agent panel and
// timelines sheet. Full width is a navigation step, not a user size, so it
// overrides the stored width without replacing it: stepping back returns to
// the width the user chose.
const CLOSE_ON_DRAG_BELOW = 100
const halfWindow = () => Math.round(window.innerWidth / 2)
const readerPanel = usePanelReveal({
  side: 'right',
  minSize: 0,
  maxSize: Math.max(window.innerWidth, 1),
  defaultSize: halfWindow(),
  storageKey: 'nodus-reader-width',
})
const isResizing = computed(() => readerPanel.resizing.value)
const readerWidth = computed(() =>
  props.fullWidth ? window.innerWidth : readerPanel.size.value
)

function startResize(e: PointerEvent) {
  readerPanel.beginResize(e)

  const onUp = () => {
    document.removeEventListener('pointerup', onUp)
    // Dragging the reader shut is a close gesture, but an unusable width must
    // not be what gets remembered for next time
    if (readerPanel.size.value < CLOSE_ON_DRAG_BELOW) {
      readerPanel.setSize(halfWindow())
      emit('close')
    }
  }
  document.addEventListener('pointerup', onUp)
}

// Navigation composable
const navigation = useStorylineNavigation({
  contentRef,
  nodeCount: () => nodes.value.length,
  onClose: () => emit('close'),
})
const { activeNodeIndex, goToNode, goToPrevious, goToNext, handleScroll: baseHandleScroll, setupKeyboardListeners, cleanupKeyboardListeners } = navigation

// Comment state composable
const comments = useStorylineReaderComments()
const { getCommentMeta, isCommentCollapsed, toggleCommentCollapsed } = comments

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
function handleScroll() {
  baseHandleScroll()
  schedulePositionSave()
}

// Markdown rendering composable
const markdownRendering = useStorylineMarkdownRendering()
const { renderNodeContent, renderAllNodes, processPendingContent, getRenderedContent } = markdownRendering

// Only the full-width reader has room for anchored callouts; narrower steps
// keep links inline (PRODUCT_DESIGN.md > Anchored nodes)
watch(
  () => props.fullWidth,
  full => {
    markdownRendering.expandAnchors.value = !!full
    markdownRendering.clearCache()
    void renderAllNodes(nodes.value)
  },
  { immediate: true }
)

// Content interaction composable
const contentInteraction = useStorylineReaderContent({
  nodes,
  contentRef,
  goToNode,
  onClose: () => emit('close'),
  renderAllNodes,
  processPendingContent,
})
const { handleContentClick, setupContentRendering } = contentInteraction

// Entity sidebar composable
const entities = useStorylineReaderEntities({
  nodes,
  activeNodeIndex,
  goToNode,
  onClose: () => emit('close'),
})
const { entitiesByType, hasEntities, navigateToEntityNode, panToEntity } = entities

async function loadStoryline() {
  // Keep the current content visible while switching; the loading state is
  // for a reader with nothing to show
  // (PRODUCT_DESIGN.md > Reader opening and switching)
  loading.value = nodes.value.length === 0
  try {
    if (props.singleNodeId) {
      const node = store.nodes.find(n => n.id === props.singleNodeId)
      nodes.value = node ? [node] : []
      storyline.value = node
        ? ({ id: node.id, title: node.title } as typeof storyline.value)
        : null
      return
    }
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

// Set up content rendering watcher
setupContentRendering()

// Node list event handlers
async function handleNodeAdd(index: number, nodeId: string) {
  if (!storyline.value || !storylineService) return
  try {
    await storylineService.addNode(storyline.value.id, nodeId, index)
    nodes.value = await store.getStorylineNodes(props.storylineId)
  } catch (e) {
    console.error('Failed to add node:', e)
  }
}

async function handleNodeCreate(index: number, title: string) {
  if (!storyline.value || !storylineService) return
  try {
    const node = await store.createNode({ title, markdown_content: '', canvas_x: 0, canvas_y: 0 })
    await storylineService.addNode(storyline.value.id, node.id, index)
    nodes.value = await store.getStorylineNodes(props.storylineId)
  } catch (e) {
    console.error('Failed to create node:', e)
  }
}

async function handleCommentCreate(index: number, text: string, commentType: CommentType = 'note') {
  if (!storyline.value || !storylineService) return
  try {
    const content = createCommentContent(text, commentType)
    // The comment is anchored by a wikilink in the text it comments on, so it
    // stays with that passage (PRODUCT_DESIGN.md > Anchored nodes)
    const title = commentAnchorTitle(text, store.nodes.map(n => n.title))
    const node = await store.createNode({
      title,
      node_type: 'comment',
      markdown_content: content,
      canvas_x: 0,
      canvas_y: 0,
    })

    const anchorNode = nodes.value[index - 1] ?? nodes.value[index] ?? nodes.value[0]
    if (anchorNode) {
      await store.updateNodeContent(
        anchorNode.id,
        anchorCommentInText(anchorNode.markdown_content || '', title)
      )
    }

    await storylineService.addNode(storyline.value.id, node.id, index)
    nodes.value = await store.getStorylineNodes(props.storylineId)
    renderNodeContent(node)
    await nextTick()
    setTimeout(async () => {
      await processPendingContent(contentRef.value || undefined)
    }, 100)
  } catch (e) {
    console.error('Failed to create comment:', e)
  }
}

async function handleNodeRemove(nodeId: string) {
  if (!storyline.value || !storylineService) return
  try {
    await storylineService.removeNode(storyline.value.id, nodeId)
    nodes.value = await store.getStorylineNodes(props.storylineId)
  } catch (e) {
    console.error('Failed to remove node:', e)
  }
}

async function handleNodeReorder(nodeIds: string[]) {
  if (!storyline.value || !storylineService) return
  try {
    // Reorder local nodes array to match new order (trust optimistic update)
    const nodeMap = new Map(nodes.value.map(n => [n.id, n]))
    const reorderedNodes = nodeIds.map(id => nodeMap.get(id)).filter((n): n is Node => !!n)
    nodes.value = reorderedNodes
    // Persist with undo support
    await storylineService.reorderNodes(storyline.value.id, nodeIds)
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

watch(() => [props.storylineId, props.singleNodeId], loadStoryline)
</script>

<template>
  <div class="reader-overlay" :class="{ resizing: isResizing }" :style="{ width: readerWidth + 'px' }">
    <!-- Resize handle on left edge -->
    <div
      class="resize-handle"
      @pointerdown="startResize"
    ></div>

    <!-- Skip link for accessibility -->
    <a href="#reader-main-content" class="skip-link">{{ t('reader.skipToContent') }}</a>

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
        :show-references-sidebar="showReferencesSidebar"
        @close="$emit('close')"
        @toggle-toc="showToc = !showToc"
        @toggle-entities="showEntitySidebar = !showEntitySidebar"
        @toggle-references="showReferencesSidebar = !showReferencesSidebar"
        @export="showExport = true"
      />

      <!-- A storyline exports in its own order: the sequence is the argument
           the user built (PRODUCT_DESIGN.md > Document export) -->
      <ExportDialog
        v-if="showExport"
        :nodes="nodes"
        :edges="storylineEdges"
        :default-title="storyline?.title || ''"
        preserve-order
        @close="showExport = false"
      />

      <div class="reader-body">
        <!-- Table of Contents Sidebar -->
        <aside v-if="showToc" class="toc-sidebar" role="navigation" :aria-label="t('reader.tableOfContents')">
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
            >
              <template #after-item="{ node: tocNode, index: tocIndex }">
                <ul v-if="nodeHeadings(tocNode).length" class="toc-subheadings">
                  <li
                    v-for="(heading, hIndex) in nodeHeadings(tocNode)"
                    :key="hIndex"
                    class="toc-subheading"
                    :style="{ paddingLeft: `${8 + (heading.level - 1) * 10}px` }"
                  >
                    <button @click="goToHeading(tocIndex, hIndex)">{{ heading.text }}</button>
                  </li>
                </ul>
              </template>
            </StorylineNodeList>
          </nav>
        </aside>

        <!-- Main Content -->
        <div
          id="reader-main-content"
          ref="contentRef"
          class="reader-content"
          :class="{ 'full-width': !showToc }"
          role="region"
          :aria-label="t('reader.content')"
          @scroll="handleScroll"
        >
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>{{ t('common.loading') }}</span>
          </div>

          <div v-else-if="nodes.length === 0" class="empty-state">
            <p>{{ t('reader.noNodes') }}</p>
            <p class="hint">{{ t('reader.addFromCanvas') }}</p>
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
                  <span
                    class="section-number clickable"
                    :title="t('reader.clickToEdit')"
                    @click="openNodeDetail(node.id)"
                  >
                    <span class="section-num-text">{{ index + 1 }}</span>
                    <Icon name="edit" :size="12" class="edit-hint" />
                  </span>
                  <h2 class="section-title" :title="t('storyline.editHint')" @dblclick="startSectionEdit(node)">{{ node.title }}</h2>
                </header>
                <!-- eslint-disable vue/no-v-html -- content is sanitized by the render service -->
                <textarea
                  v-if="editingSectionId === node.id"
                  v-model="editingText"
                  class="section-editor"
                  :spellcheck="false"
                  @blur="saveSectionEdit"
                  @keydown="onEditorKeydown"
                ></textarea>
                <template v-else>
                  <div
                    class="section-content"
                    :title="t('storyline.editHint')"
                    @click="handleContentClick"
                    v-html="getRenderedContent(node.id) || ''"
                  ></div>
                  <p v-if="editingLockError" class="section-lock-error">
                    {{ t('storyline.locked', { error: editingLockError }) }}
                  </p>
                </template>
                <!-- eslint-enable vue/no-v-html -->
              </article>
            </template>
          </template>
        </div>

        <!-- Entity Sidebar -->
        <aside
          v-if="showEntitySidebar && hasEntities"
          role="complementary"
          :aria-label="t('reader.entitySidebar')"
        >
          <StorylineEntitySidebar
            :entities-by-type="entitiesByType"
            :has-entities="hasEntities"
            @navigate="navigateToEntityNode"
            @pan-to-entity="panToEntity"
          />
        </aside>

        <!-- References Sidebar -->
        <StorylineReferencesSidebar
          v-if="showReferencesSidebar"
          :nodes="nodes"
          :active-index="activeNodeIndex"
          :content-ref="contentRef"
          @navigate-to-node="(nodeId) => {
            const idx = nodes.findIndex(n => n.id === nodeId)
            if (idx >= 0) goToNode(idx)
          }"
          @pan-to-canvas="panToEntity"
        />
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
.toc-subheadings {
  margin: 0 0 2px;
  padding: 0 0 0 26px;
  list-style: none;
}

.toc-subheading button {
  display: block;
  width: 100%;
  padding: 2px 6px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-subheading button:hover {
  color: var(--text-main);
  background: var(--bg-surface-alt);
}

.section-editor {
  width: 100%;
  min-height: 180px;
  padding: 12px;
  border: 1px solid var(--primary-color);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-main);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

.section-lock-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--danger-color, #dc2626);
}

/* Anchored nodes read like comments, at the point in the text that links them
   (PRODUCT_DESIGN.md > Anchored nodes) */
:deep(.anchored-node) {
  display: block;
  margin: 14px 0;
  padding: 12px 16px;
  border-left: 3px solid var(--primary-color);
  border-radius: 0 6px 6px 0;
  background: var(--bg-surface-alt);
}

:deep(.anchored-title) {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

:deep(.anchored-body) {
  display: block;
  font-size: 0.94em;
  color: var(--text-secondary);
}

:deep(.anchored-para) {
  display: block;
  margin: 0 0 8px;
}

:deep(.anchored-para:last-child) {
  margin-bottom: 0;
}

/* Overlays the canvas (no layout reflow); enter/leave slide via App's
   reader-slide transition, half <-> full steps animate width */
.reader-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 62;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
  overflow: hidden;
  flex-shrink: 0;
  border-left: 1px solid var(--border-default);
  /* No explicit height: top plus the (dynamic) bottom offset size the box,
     letting the reader stop above an open timelines sheet */
  overscroll-behavior: contain;
  transition: width var(--step-duration, 0.3s) var(--step-ease, ease);
  will-change: transform;
}

.reader-overlay.resizing {
  transition: none;
}


/* Resize handle */
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  background: transparent;
  z-index: 10;
  transition: background 0.15s;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--primary-color);
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
  position: absolute;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--primary-color);
  z-index: 10;
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
  min-height: 0;
}

.reader-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  overscroll-behavior: contain;
}

/* Contents live on the right, matching the storylines-on-the-right model */
.toc-sidebar {
  width: 260px;
  order: 3;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
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
  min-height: 0;
  overscroll-behavior: contain;
}

.reader-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px 60px;
  max-width: 800px;
  margin: 0 auto;
  min-height: 0;
  overscroll-behavior: contain;
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
  position: relative;
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
  transition: transform 0.15s, box-shadow 0.15s;
}

.section-number.clickable {
  cursor: pointer;
}

.section-number.clickable:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
}

.section-num-text {
  transition: opacity 0.15s;
}

.edit-hint {
  position: absolute;
  opacity: 0;
  transition: opacity 0.15s;
}

.section-number.clickable:hover .section-num-text {
  opacity: 0;
}

.section-number.clickable:hover .edit-hint {
  opacity: 1;
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

.section-content :deep(a.wikilink) {
  color: var(--primary-color);
  cursor: pointer;
}

.section-content :deep(a.wikilink.missing) {
  color: var(--danger-color, #dc2626);
  opacity: 0.7;
}

.comment-text :deep(a.wikilink) {
  color: var(--primary-color);
  cursor: pointer;
}

.comment-text :deep(a.wikilink.missing) {
  color: var(--danger-color, #dc2626);
  opacity: 0.7;
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
  vertical-align: middle;
}

.section-content :deep(.typst-math svg) {
  vertical-align: middle;
}

.section-content :deep(.typst-pending) {
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}

/* Mermaid diagram styles */
.section-content :deep(.mermaid-wrapper) {
  margin: 1em 0;
  overflow-x: auto;
}

.section-content :deep(.mermaid) {
  display: flex;
  justify-content: center;
}

.section-content :deep(.mermaid svg) {
  max-width: 100%;
  height: auto;
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
