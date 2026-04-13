<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { marked } from 'marked'
import { useNodesStore } from '../stores/nodes'
import { useDisplayStore } from '../stores/display'
import NodePicker from './NodePicker.vue'

const props = defineProps<{
  nodeId: string | null
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'zoom-to-node', nodeId: string): void
  (e: 'render-mermaid'): void
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

// Wikilink autocomplete state
const showLinkPicker = ref(false)
const linkPickerPosition = ref({ top: 0, left: 0 })
const wikilinkStart = ref(-1)

// Track if we have unsaved changes
const hasUnsavedChanges = ref(false)

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
watch(() => props.visible, (visible) => {
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
    nextTick(() => {
      editorRef.value?.focus()
    })
    // Render mermaid diagrams when modal opens with content
    if (editContent.value?.includes('```mermaid')) {
      nextTick(() => emit('render-mermaid'))
    }
  }
})

// Live preview - render markdown
const renderedContent = computed(() => {
  if (!editContent.value) return ''

  // Configure marked inline
  marked.use({
    gfm: true,
    breaks: true,
    async: false,
  })

  let html = marked.parse(editContent.value) as string

  // Convert [[link]] and [[link|display]] wikilinks to clickable elements
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  html = html.replace(wikilinkRegex, (_match, target, display) => {
    const displayText = display || target
    const targetTrimmed = target.trim()
    const targetExists = store.filteredNodes.some(
      n => n.title.toLowerCase() === targetTrimmed.toLowerCase()
    )
    const missingClass = targetExists ? '' : ' missing'
    return `<a class="wikilink${missingClass}" data-target="${targetTrimmed}">${displayText}</a>`
  })

  return html
})

// Watch for mermaid content changes and trigger rendering
watch(renderedContent, (content) => {
  if (content && content.includes('class="mermaid"') && props.visible) {
    nextTick(() => emit('render-mermaid'))
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
        linkPickerPosition.value = {
          top: rect.top + 100,
          left: rect.left + 50
        }
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
}

// Scroll sync between editor and preview
function onEditorScroll() {
  if (isScrollingSynced || !editorRef.value || !previewRef.value) return

  const editor = editorRef.value
  const preview = previewRef.value

  // Calculate scroll percentage in editor
  const scrollPercent = editor.scrollTop / (editor.scrollHeight - editor.clientHeight)

  // Apply to preview
  isScrollingSynced = true
  preview.scrollTop = scrollPercent * (preview.scrollHeight - preview.clientHeight)

  // Reset flag after a short delay to allow the scroll to complete
  requestAnimationFrame(() => {
    isScrollingSynced = false
  })
}

function onPreviewScroll() {
  if (isScrollingSynced || !editorRef.value || !previewRef.value) return

  const editor = editorRef.value
  const preview = previewRef.value

  // Calculate scroll percentage in preview
  const scrollPercent = preview.scrollTop / (preview.scrollHeight - preview.clientHeight)

  // Apply to editor
  isScrollingSynced = true
  editor.scrollTop = scrollPercent * (editor.scrollHeight - editor.clientHeight)

  // Reset flag after a short delay
  requestAnimationFrame(() => {
    isScrollingSynced = false
  })
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
          <div class="fullscreen-modal-body">
            <!-- Editor pane -->
            <div class="editor-pane">
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
                v-html="renderedContent"
              ></div>
            </div>
          </div>

          <!-- Footer -->
          <div class="fullscreen-modal-footer">
            <button class="fullscreen-btn-secondary" @click="handleZoomToNode">
              Zoom to Node
            </button>
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
