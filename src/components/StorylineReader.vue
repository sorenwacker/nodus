<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import { invoke } from '@tauri-apps/api/core'
import { useNodesStore } from '../stores/nodes'
import { sanitizeHtml, sanitizeSvg } from '../lib/sanitize'
import Icon from './Icon.vue'
import StorylineNodeList from './StorylineNodeList.vue'
import type { Node, Storyline } from '../types'

const { t } = useI18n()

// Configure marked
marked.use({
  breaks: true,
  gfm: true,
})

// Math cache for rendered SVGs
const mathSvgCache = new Map<string, string>()

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
const activeNodeIndex = ref(0)
const contentRef = ref<HTMLElement | null>(null)
const showToc = ref(true)

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

function goToNode(index: number) {
  activeNodeIndex.value = index
  // Scroll to the node section
  nextTick(() => {
    const section = document.getElementById(`node-${index}`)
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
}

function goToPrevious() {
  if (activeNodeIndex.value > 0) {
    goToNode(activeNodeIndex.value - 1)
  }
}

function goToNext() {
  if (activeNodeIndex.value < nodes.value.length - 1) {
    goToNode(activeNodeIndex.value + 1)
  }
}

function handleKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'Escape':
      emit('close')
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault()
      goToPrevious()
      break
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault()
      goToNext()
      break
  }
}

function handleScroll() {
  if (!contentRef.value) return

  // Find which section is most visible
  const sections = contentRef.value.querySelectorAll('.node-section')
  let closestIndex = 0
  let closestDistance = Infinity

  sections.forEach((section, index) => {
    const rect = section.getBoundingClientRect()
    const distance = Math.abs(rect.top - 100) // 100px offset for header
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })

  activeNodeIndex.value = closestIndex
}

// Render math to SVG using Tauri backend
async function renderMathToSvg(math: string, displayMode: boolean): Promise<string> {
  const cacheKey = `${displayMode ? 'd' : 'i'}:${math}`
  if (mathSvgCache.has(cacheKey)) {
    return mathSvgCache.get(cacheKey)!
  }

  try {
    const svg = await invoke<string>('render_typst_math', { math, displayMode })
    mathSvgCache.set(cacheKey, svg)
    return svg
  } catch (e) {
    console.error('[Math] Render error:', e)
    return `<span class="math-error">${math}</span>`
  }
}

// Parse markdown and render math to SVG
async function parseMarkdownAsync(content: string): Promise<string> {
  if (!content) return ''

  // Extract math blocks before markdown processing
  const mathPlaceholders: Map<string, { math: string; isDisplay: boolean }> = new Map()
  let processedContent = content

  // Extract display math first ($$...$$)
  processedContent = processedContent.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const id = `MATH_DISPLAY_${mathPlaceholders.size}`
    mathPlaceholders.set(id, { math: math.trim(), isDisplay: true })
    return id
  })

  // Extract inline math ($...$)
  processedContent = processedContent.replace(/(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g, (_, math) => {
    const id = `MATH_INLINE_${mathPlaceholders.size}`
    mathPlaceholders.set(id, { math: math.trim(), isDisplay: false })
    return id
  })

  // Render markdown
  let html = marked.parse(processedContent) as string

  // Render math to SVG and restore
  for (const [id, { math, isDisplay }] of mathPlaceholders) {
    const svg = sanitizeSvg(await renderMathToSvg(math, isDisplay))
    const wrapper = isDisplay
      ? `<div class="typst-display typst-math">${svg}</div>`
      : `<span class="typst-inline typst-math">${svg}</span>`
    html = html.replace(new RegExp(id, 'g'), wrapper)
  }

  // Sanitize final HTML output
  return sanitizeHtml(html)
}

// Cached rendered content per node
const renderedContent = ref<Map<string, string>>(new Map())

async function renderNodeContent(node: Node) {
  if (!node.markdown_content) {
    renderedContent.value.set(node.id, '')
    return
  }
  const html = await parseMarkdownAsync(node.markdown_content)
  renderedContent.value = new Map(renderedContent.value).set(node.id, html)
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

async function handleCommentCreate(index: number, text: string) {
  if (!storyline.value) return
  try {
    const node = await store.createNode({
      title: 'Comment',
      node_type: 'comment',
      markdown_content: text,
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

onMounted(() => {
  loadStoryline()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

watch(() => props.storylineId, loadStoryline)
</script>

<template>
  <div class="reader-overlay">
    <div class="reader-container">
      <!-- Header -->
      <header class="reader-header">
        <div class="header-left">
          <button class="toc-toggle" :title="t('storyline.toggleContents')" @click="showToc = !showToc">
            <Icon name="menu" :size="18" />
          </button>
          <h1 class="reader-title">{{ storyline?.title || t('storyline.loading') }}</h1>
        </div>
        <div class="header-right">
          <span class="page-indicator">{{ activeNodeIndex + 1 }} / {{ nodes.length }}</span>
          <button class="close-btn" :data-tooltip="t('storyline.closeEsc')" @click="$emit('close')">
            <Icon name="close" :size="20" />
          </button>
        </div>
      </header>

      <div class="reader-body">
        <!-- Table of Contents Sidebar -->
        <aside v-if="showToc" class="toc-sidebar">
          <div class="toc-header">
            <h2 class="toc-title">{{ t('storyline.contents') }}</h2>
          </div>
          <div class="toc-nav">
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
          </div>
        </aside>

        <!-- Main Content -->
        <main
          ref="contentRef"
          class="reader-content"
          :class="{ 'full-width': !showToc }"
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
                class="comment-callout"
              >
                <div class="comment-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="comment-text" v-html="renderedContent.get(node.id) || node.markdown_content || ''"></div>
              </aside>

              <!-- Regular nodes render as sections -->
              <article
                v-else
                :id="`node-${index}`"
                class="node-section"
              >
                <header class="section-header">
                  <span class="section-number">{{ index + 1 }}</span>
                  <h2 class="section-title">{{ node.title }}</h2>
                </header>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="section-content" v-html="renderedContent.get(node.id) || ''"></div>
              </article>
            </template>
          </template>
        </main>
      </div>

      <!-- Navigation Footer -->
      <footer v-if="nodes.length > 0" class="reader-footer">
        <button
          class="nav-btn prev"
          :disabled="activeNodeIndex === 0"
          @click="goToPrevious"
        >
          <Icon name="back" :size="16" />
          <span>Previous</span>
        </button>

        <div class="nav-dots">
          <button
            v-for="(_, index) in nodes"
            :key="index"
            class="nav-dot"
            :class="{ active: activeNodeIndex === index }"
            @click="goToNode(index)"
          ></button>
        </div>

        <button
          class="nav-btn next"
          :disabled="activeNodeIndex === nodes.length - 1"
          @click="goToNext"
        >
          <span>Next</span>
          <Icon name="forward" :size="16" />
        </button>
      </footer>
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

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.reader-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toc-toggle {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toc-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.reader-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-indicator {
  font-size: 13px;
  color: var(--text-muted);
}

.close-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
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

.toc-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  margin-bottom: 2px;
}

.toc-item:hover {
  background: var(--bg-elevated);
}

.toc-item.active {
  background: var(--primary-color);
  color: white;
}

.toc-number {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-surface-alt);
  border-radius: 6px;
  flex-shrink: 0;
}

.toc-item.active .toc-number {
  background: rgba(255, 255, 255, 0.2);
}

.toc-text {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toc-item.active .toc-text {
  color: white;
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
  border-left: 3px solid var(--text-muted);
  border-radius: 0 8px 8px 0;
}

.comment-icon {
  flex-shrink: 0;
  color: var(--text-muted);
  margin-top: 2px;
}

.comment-text {
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

.reader-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  min-width: 100px;
}

.nav-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-btn.prev {
  justify-content: flex-start;
}

.nav-btn.next {
  justify-content: flex-end;
}

.nav-dots {
  display: flex;
  gap: 6px;
}

.nav-dot {
  width: 8px;
  height: 8px;
  border: none;
  border-radius: 50%;
  background: var(--border-default);
  cursor: pointer;
  padding: 0;
}

.nav-dot:hover {
  background: var(--text-muted);
}

.nav-dot.active {
  background: var(--primary-color);
}

/* Add node button */
.add-node-wrapper {
  display: flex;
  justify-content: center;
  position: relative;
  margin: 16px 0;
}

.add-node-btn {
  width: 32px;
  height: 32px;
  border: 2px dashed var(--border-default);
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: all 0.15s;
}

.add-node-btn:hover {
  opacity: 1;
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--bg-elevated);
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
</style>
