<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { useDisplayStore } from '../stores/display'
import { openExternal } from '../lib/tauri'
import {
  renderMarkdown,
  renderPendingContent,
} from '../services/MarkdownRenderService'
import NodePicker from './NodePicker.vue'

const props = defineProps<{
  nodeId: string | null
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'zoom-to-node', nodeId: string): void
  (e: 'render-mermaid'): void
  (e: 'navigate-to-node', title: string): void
}>()

const store = useNodesStore()
const displayStore = useDisplayStore()
const { spellcheckEnabled } = storeToRefs(displayStore)

// Local edit state
const editTitle = ref('')
const editContent = ref('')
const editorRef = ref<HTMLTextAreaElement | null>(null)
const previewRef = ref<HTMLDivElement | null>(null)

// Scroll sync state
let isScrollingSynced = false // Prevents infinite scroll loop
let scrollSyncTimeout: ReturnType<typeof setTimeout> | null = null

// Wikilink autocomplete state
const showLinkPicker = ref(false)
const linkPickerPosition = ref({ top: 0, left: 0 })
const wikilinkStart = ref(-1)

// Track if we have unsaved changes
const hasUnsavedChanges = ref(false)

// Reading mode (hide editor, show only preview) - default to reading mode
const readingMode = ref(true)

// Auto-save timer
let saveTimeout: ReturnType<typeof setTimeout> | null = null

// Load node data when nodeId changes
const node = computed(() => props.nodeId ? store.getNode(props.nodeId) : null)

watch(() => props.nodeId, (id) => {
  if (id && node.value) {
    editTitle.value = node.value.title || ''
    editContent.value = node.value.markdown_content || ''
    hasUnsavedChanges.value = false
  }
}, { immediate: true })

// Reset state when modal closes
watch(() => props.visible, async (visible) => {
  if (!visible) {
    // Save any pending changes
    if (hasUnsavedChanges.value) {
      save()
    }
    // Clear timers
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    showLinkPicker.value = false
  } else {
    // Focus editor when modal opens
    await nextTick()
    editorRef.value?.focus()
    // Render pending math and mermaid (with proper timing)
    await triggerRender()
  }
})

// Helper to check if wikilink target exists
function wikilinkExists(target: string): boolean {
  return store.filteredNodes.some(
    n => n.title.toLowerCase() === target.toLowerCase()
  )
}

// Live preview - render markdown using unified service
const renderedContent = computed(() => {
  if (!editContent.value) return ''
  return renderMarkdown(editContent.value, { wikilinkExists })
})

// Trigger async rendering with proper timing
async function triggerRender() {
  if (!props.visible) return
  await nextTick()
  // Wait for transition/DOM to settle
  await new Promise(resolve => requestAnimationFrame(resolve))
  if (previewRef.value) {
    await renderPendingContent(previewRef.value)
  }
}

// Watch for content changes and trigger async rendering
watch(renderedContent, triggerRender)

// Also watch for when previewRef becomes available
watch(() => previewRef.value, (el) => {
  if (el && props.visible) {
    triggerRender()
  }
})

// Schedule auto-save with debounce
function scheduleSave() {
  hasUnsavedChanges.value = true
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(save, 500)
}

// Save changes to store
async function save() {
  if (!props.nodeId || !node.value) return

  // Only save if there are actual changes
  if (editTitle.value !== node.value.title) {
    await store.updateNodeTitle(props.nodeId, editTitle.value)
  }
  if (editContent.value !== node.value.markdown_content) {
    await store.updateNodeContent(props.nodeId, editContent.value)
  }

  hasUnsavedChanges.value = false
}

// Handle title change
function onTitleInput() {
  scheduleSave()
}

// Handle content change
function onContentInput() {
  scheduleSave()

  // Check for wikilink trigger
  const textarea = editorRef.value
  if (!textarea) return

  const cursorPos = textarea.selectionStart
  const textBeforeCursor = editContent.value.slice(0, cursorPos)

  // Check if we just typed `[[`
  if (textBeforeCursor.endsWith('[[')) {
    wikilinkStart.value = cursorPos - 2
    showLinkPicker.value = true
    nextTick(() => {
      if (editorRef.value) {
        const rect = editorRef.value.getBoundingClientRect()
        const pickerWidth = 260 // NodePicker width + padding
        const pickerHeight = 300 // Approximate height

        // Calculate position, ensuring it stays within viewport
        let top = rect.top + 80
        let left = rect.left + rect.width / 2 - pickerWidth / 2

        // Clamp to viewport bounds
        const maxTop = window.innerHeight - pickerHeight - 20
        const maxLeft = window.innerWidth - pickerWidth - 20
        top = Math.max(20, Math.min(top, maxTop))
        left = Math.max(20, Math.min(left, maxLeft))

        linkPickerPosition.value = { top, left }
      }
    })
  } else if (showLinkPicker.value) {
    const textFromStart = editContent.value.slice(wikilinkStart.value, cursorPos)
    if (textFromStart.includes(']]') || !textFromStart.startsWith('[[')) {
      showLinkPicker.value = false
    }
  }
}

// Handle node selection from picker
function onLinkSelect(_nodeId: string, nodeTitle: string) {
  if (wikilinkStart.value >= 0 && editorRef.value) {
    const cursorPos = editorRef.value.selectionStart
    const before = editContent.value.slice(0, wikilinkStart.value)
    const after = editContent.value.slice(cursorPos)
    editContent.value = before + '[[' + nodeTitle + ']]' + after
    showLinkPicker.value = false
    scheduleSave()

    nextTick(() => {
      if (editorRef.value) {
        editorRef.value.focus()
        const newPos = wikilinkStart.value + nodeTitle.length + 4
        editorRef.value.setSelectionRange(newPos, newPos)
      }
    })
  }
}

function closeLinkPicker() {
  showLinkPicker.value = false
}

function handleLinkPickerSelect(selectedNodeId: string) {
  const selectedNode = store.getNode(selectedNodeId)
  if (selectedNode) onLinkSelect(selectedNodeId, selectedNode.title)
}

// Keyboard handler
function onKeydown(e: KeyboardEvent) {
  // Escape closes modal
  if (e.key === 'Escape') {
    if (showLinkPicker.value) {
      e.stopPropagation()
      showLinkPicker.value = false
    } else {
      save()
      emit('close')
    }
    return
  }

  // Cmd/Ctrl+S saves immediately
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    save()
    return
  }

  // Cmd/Ctrl+C - handle copy manually for Tauri WebView compatibility
  if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
    const selection = window.getSelection()
    if (selection && selection.toString().trim()) {
      e.preventDefault()
      navigator.clipboard.writeText(selection.toString()).catch(err => {
        console.error('Failed to copy:', err)
      })
    }
  }
}

// Scroll sync between editor and preview
function onEditorScroll() {
  if (isScrollingSynced || !editorRef.value || !previewRef.value) return

  const editor = editorRef.value
  const preview = previewRef.value

  // Calculate scroll percentage in editor
  const maxScroll = editor.scrollHeight - editor.clientHeight
  if (maxScroll <= 0) return
  const scrollPercent = editor.scrollTop / maxScroll

  // Apply to preview
  isScrollingSynced = true
  const previewMaxScroll = preview.scrollHeight - preview.clientHeight
  preview.scrollTop = scrollPercent * previewMaxScroll

  // Reset flag after a longer delay to prevent momentum feedback loop
  if (scrollSyncTimeout) clearTimeout(scrollSyncTimeout)
  scrollSyncTimeout = setTimeout(() => {
    isScrollingSynced = false
  }, 150)
}

function onPreviewScroll() {
  if (isScrollingSynced || !editorRef.value || !previewRef.value) return

  const editor = editorRef.value
  const preview = previewRef.value

  // Calculate scroll percentage in preview
  const maxScroll = preview.scrollHeight - preview.clientHeight
  if (maxScroll <= 0) return
  const scrollPercent = preview.scrollTop / maxScroll

  // Apply to editor
  isScrollingSynced = true
  const editorMaxScroll = editor.scrollHeight - editor.clientHeight
  editor.scrollTop = scrollPercent * editorMaxScroll

  // Reset flag after a longer delay to prevent momentum feedback loop
  if (scrollSyncTimeout) clearTimeout(scrollSyncTimeout)
  scrollSyncTimeout = setTimeout(() => {
    isScrollingSynced = false
  }, 150)
}

// Handle clicks in preview content (for external links and wikilinks)
function handlePreviewClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const link = target.closest('a')
  if (link) {
    e.preventDefault()
    e.stopPropagation()
    // Check if it's a wikilink
    if (link.classList.contains('wikilink')) {
      const linkTarget = link.dataset.target
      if (linkTarget) {
        emit('navigate-to-node', linkTarget)
      }
    } else if (link.href) {
      // External link - open in system browser
      openExternal(link.href)
    }
  }
}

// Handle zoom to node action
function handleZoomToNode() {
  if (props.nodeId) {
    save()
    emit('zoom-to-node', props.nodeId)
    emit('close')
  }
}

// Close modal
function handleClose() {
  save()
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  if (scrollSyncTimeout) {
    clearTimeout(scrollSyncTimeout)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible && nodeId"
        class="fullscreen-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fullscreen-node-title"
        @click="handleClose"
        @wheel.stop
      >
        <div class="fullscreen-modal-content" @click.stop>
          <!-- Header -->
          <div class="fullscreen-modal-header">
            <input
              v-model="editTitle"
              class="fullscreen-title-input"
              placeholder="Untitled"
              :spellcheck="spellcheckEnabled"
              :autocorrect="spellcheckEnabled ? 'on' : 'off'"
              :autocapitalize="spellcheckEnabled ? 'sentences' : 'off'"
              @input="onTitleInput"
              @keydown.enter.prevent="editorRef?.focus()"
            />
            <div class="fullscreen-header-actions">
              <span v-if="hasUnsavedChanges" class="unsaved-indicator">Unsaved</span>
              <button class="fullscreen-close-btn" aria-label="Close" @click="handleClose">
                &times;
              </button>
            </div>
          </div>

          <!-- Split view: Editor + Preview -->
          <div class="fullscreen-modal-body" :class="{ 'reading-mode': readingMode }">
            <!-- Editor pane -->
            <div v-if="!readingMode" class="editor-pane">
              <div class="pane-header">Editor (Markdown)</div>
              <textarea
                ref="editorRef"
                v-model="editContent"
                class="fullscreen-editor"
                placeholder="Write your content here..."
                :spellcheck="spellcheckEnabled"
                :autocorrect="spellcheckEnabled ? 'on' : 'off'"
                :autocapitalize="spellcheckEnabled ? 'sentences' : 'off'"
                @input="onContentInput"
                @scroll="onEditorScroll"
              ></textarea>

              <!-- Wikilink picker -->
              <NodePicker
                v-if="showLinkPicker"
                class="wikilink-picker"
                :style="{ position: 'fixed', top: linkPickerPosition.top + 'px', left: linkPickerPosition.left + 'px' }"
                :exclude-node-ids="nodeId ? [nodeId] : []"
                :allow-create="false"
                :show-search="true"
                @select="handleLinkPickerSelect"
                @close="closeLinkPicker"
              />
            </div>

            <!-- Preview pane -->
            <div class="preview-pane">
              <div class="pane-header">Preview</div>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                ref="previewRef"
                class="fullscreen-preview node-content"
                @scroll="onPreviewScroll"
                @click="handlePreviewClick"
                v-html="renderedContent"
              ></div>
            </div>
          </div>

          <!-- Footer -->
          <div class="fullscreen-modal-footer">
            <div class="footer-left">
              <button class="fullscreen-btn-secondary" @click="handleZoomToNode">
                Zoom to Node
              </button>
              <button
                class="fullscreen-btn-secondary mode-toggle"
                :class="{ active: readingMode }"
                @click="readingMode = !readingMode"
              >
                {{ readingMode ? 'Edit Mode' : 'Reading Mode' }}
              </button>
            </div>
            <div class="footer-hint">
              <kbd>Esc</kbd> to close &nbsp;&middot;&nbsp; <kbd>Cmd+S</kbd> to save
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fullscreen-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.fullscreen-modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  box-shadow: 0 16px 64px var(--shadow-lg);
  width: 90vw;
  max-width: 1400px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.fullscreen-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-default);
  gap: 16px;
}

.fullscreen-title-input {
  flex: 1;
  font-size: 1.25rem;
  font-weight: 600;
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface-alt);
  color: var(--text-main);
}

.fullscreen-title-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.fullscreen-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.unsaved-indicator {
  font-size: 12px;
  color: var(--warning-color);
  font-weight: 500;
}

.fullscreen-close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.fullscreen-close-btn:hover {
  color: var(--text-main);
}

/* Body - split view */
.fullscreen-modal-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.editor-pane,
.preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.editor-pane {
  border-right: 1px solid var(--border-default);
  position: relative;
}

.pane-header {
  padding: 8px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  background: var(--bg-surface-alt);
  border-bottom: 1px solid var(--border-subtle);
}

.fullscreen-editor {
  flex: 1;
  padding: 16px;
  font-family: ui-monospace, 'SF Mono', Menlo, Monaco, 'Cascadia Mono', monospace;
  font-size: calc(14px * var(--font-scale, 1));
  line-height: 1.6;
  border: none;
  background: var(--bg-surface);
  color: var(--text-main);
  resize: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
}

.fullscreen-editor:focus {
  outline: none;
}

.fullscreen-preview {
  flex: 1;
  padding: 16px 24px;
  overflow-y: auto;
  font-size: calc(14px * var(--font-scale, 1));
  line-height: 1.7;
  overscroll-behavior: contain;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
  min-height: 0;
}

/* Mermaid diagram text visibility */
.fullscreen-preview :deep(.mermaid) svg text,
.fullscreen-preview :deep(.mermaid) svg .nodeLabel,
.fullscreen-preview :deep(.mermaid) svg .label,
.fullscreen-preview :deep(.mermaid) svg foreignObject div,
.fullscreen-preview :deep(.mermaid) svg foreignObject span {
  fill: var(--text-main, #1a1a1a) !important;
  color: var(--text-main, #1a1a1a) !important;
}

.fullscreen-preview :deep(.mermaid-wrapper) {
  margin: 16px 0;
  overflow-x: auto;
}

.fullscreen-preview :deep(.mermaid) {
  display: flex;
  justify-content: center;
}

.fullscreen-preview :deep(.mermaid) svg {
  max-width: 100%;
  height: auto;
}

/* Reading mode */
.fullscreen-modal-body.reading-mode .preview-pane {
  max-width: 800px;
  margin: 0 auto;
  border-right: none;
}

.fullscreen-modal-body.reading-mode .fullscreen-preview {
  padding: 24px 48px;
  font-size: calc(16px * var(--font-scale, 1));
}

/* Footer */
.fullscreen-modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface-alt);
}

.footer-left {
  display: flex;
  gap: 8px;
}

.fullscreen-btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
}

.fullscreen-btn-secondary:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.mode-toggle.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.mode-toggle.active:hover {
  background: var(--primary-hover);
}

.footer-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.footer-hint kbd {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  background: var(--bg-elevated);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--border-default);
  font-size: 11px;
}

/* Wikilink picker */
.wikilink-picker {
  z-index: 10001;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-active .fullscreen-modal-content,
.fade-leave-active .fullscreen-modal-content {
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-from .fullscreen-modal-content,
.fade-leave-to .fullscreen-modal-content {
  transform: scale(0.95);
  opacity: 0;
}
</style>
