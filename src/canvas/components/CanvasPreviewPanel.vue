<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import NodePicker from '../../components/NodePicker.vue'
import { useNodesStore } from '../../stores/nodes'
import { useDisplayStore } from '../../stores/display'

const store = useNodesStore()
const displayStore = useDisplayStore()
const { spellcheckEnabled } = storeToRefs(displayStore)

const props = defineProps<{
  visible: boolean
  title: string
  content: string
  rawContent: string
  nodeId: string
}>()

const emit = defineEmits<{
  close: []
  zoomToNode: []
  openFullscreen: []
  save: [nodeId: string, content: string]
  saveTitle: [nodeId: string, title: string]
  renderMermaid: []
}>()

const isEditing = ref(false)
const editContent = ref('')
const editTitle = ref('')
const editorRef = ref<HTMLTextAreaElement | null>(null)

// Wikilink autocomplete state
const showLinkPicker = ref(false)
const linkPickerPosition = ref({ top: 0, left: 0 })
const wikilinkStart = ref(-1)

// Reset edit state when panel closes or node changes
watch(() => props.visible, (visible) => {
  if (!visible) {
    isEditing.value = false
  }
})

watch(() => props.nodeId, () => {
  isEditing.value = false
})

// Request mermaid rendering when content with diagrams is displayed
watch(
  () => props.content,
  (content) => {
    if (content && content.includes('class="mermaid"') && props.visible && !isEditing.value) {
      emit('renderMermaid')
    }
  },
  { immediate: true }
)

watch(
  () => props.visible,
  (visible) => {
    if (visible && props.content?.includes('class="mermaid"') && !isEditing.value) {
      emit('renderMermaid')
    }
  }
)

function startEditing() {
  editContent.value = props.rawContent
  editTitle.value = props.title
  isEditing.value = true
}

function saveAndClose() {
  if (editTitle.value !== props.title) {
    emit('saveTitle', props.nodeId, editTitle.value)
  }
  if (editContent.value !== props.rawContent) {
    emit('save', props.nodeId, editContent.value)
  }
  isEditing.value = false
}

function cancelEditing() {
  isEditing.value = false
  showLinkPicker.value = false
}

// Handle editor input for wikilink detection
function onEditorInput(e: Event) {
  const textarea = e.target as HTMLTextAreaElement
  const cursorPos = textarea.selectionStart
  const textBeforeCursor = editContent.value.slice(0, cursorPos)

  // Check if we just typed `[[`
  if (textBeforeCursor.endsWith('[[')) {
    wikilinkStart.value = cursorPos - 2
    showLinkPicker.value = true
    // Position the picker near the cursor
    nextTick(() => {
      if (editorRef.value) {
        const rect = editorRef.value.getBoundingClientRect()
        // Approximate position based on cursor
        linkPickerPosition.value = {
          top: rect.top + 60,
          left: rect.left + 20
        }
      }
    })
  } else if (showLinkPicker.value) {
    // Check if we're still inside a wikilink
    const textFromStart = editContent.value.slice(wikilinkStart.value, cursorPos)
    if (textFromStart.includes(']]') || !textFromStart.startsWith('[[')) {
      showLinkPicker.value = false
    }
  }
}

// Handle node selection from picker
function onLinkSelect(nodeId: string, nodeTitle: string) {
  if (wikilinkStart.value >= 0 && editorRef.value) {
    const cursorPos = editorRef.value.selectionStart
    const before = editContent.value.slice(0, wikilinkStart.value)
    const after = editContent.value.slice(cursorPos)
    editContent.value = before + '[[' + nodeTitle + ']]' + after
    showLinkPicker.value = false

    // Restore focus and cursor position
    nextTick(() => {
      if (editorRef.value) {
        editorRef.value.focus()
        const newPos = wikilinkStart.value + nodeTitle.length + 4 // [[ + title + ]]
        editorRef.value.setSelectionRange(newPos, newPos)
      }
    })
  }
}

function closeLinkPicker() {
  showLinkPicker.value = false
}

function handleLinkPickerSelect(nodeId: string) {
  const node = store.getNode(nodeId)
  if (node) onLinkSelect(nodeId, node.title)
}

// Handle keyboard in editor
function onEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showLinkPicker.value) {
      e.stopPropagation()
      showLinkPicker.value = false
    } else {
      cancelEditing()
    }
  }
}
</script>

<template>
  <Transition name="slide-in">
    <div
      v-if="visible"
      class="node-preview-panel"
      :class="{ 'is-editing': isEditing }"
      @wheel.stop
      @pointerdown.stop
      @pointerup.stop
      @click.stop
      @dblclick.stop
    >
      <div class="preview-header">
        <input
          v-if="isEditing"
          v-model="editTitle"
          class="preview-title-input"
          :spellcheck="spellcheckEnabled"
          :autocorrect="spellcheckEnabled ? 'on' : 'off'"
          :autocapitalize="spellcheckEnabled ? 'sentences' : 'off'"
          @keydown.enter="saveAndClose"
          @keydown.escape="cancelEditing"
        />
        <h3 v-else @dblclick="startEditing">{{ title }}</h3>
        <button class="preview-close" @click="emit('close')">&times;</button>
      </div>

      <!-- Edit mode -->
      <div v-if="isEditing" class="editor-wrapper">
        <textarea
          ref="editorRef"
          v-model="editContent"
          class="preview-editor"
          :spellcheck="spellcheckEnabled"
          :autocorrect="spellcheckEnabled ? 'on' : 'off'"
          :autocapitalize="spellcheckEnabled ? 'sentences' : 'off'"
          @input="onEditorInput"
          @keydown="onEditorKeydown"
        ></textarea>

        <!-- Wikilink picker -->
        <NodePicker
          v-if="showLinkPicker"
          class="wikilink-picker"
          :style="{ position: 'fixed', top: linkPickerPosition.top + 'px', left: linkPickerPosition.left + 'px' }"
          :exclude-node-ids="[nodeId]"
          :allow-create="false"
          :show-search="true"
          @select="handleLinkPickerSelect"
          @close="closeLinkPicker"
        />
      </div>

      <!-- View mode -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else class="preview-content" @dblclick="startEditing" v-html="content"></div>

      <div class="preview-actions">
        <template v-if="isEditing">
          <button class="preview-btn-secondary" @click="cancelEditing">Cancel</button>
          <button class="preview-btn-primary" @click="saveAndClose">Save</button>
        </template>
        <template v-else>
          <button @click="emit('openFullscreen')">Edit</button>
          <button @click="emit('zoomToNode')">Zoom to Node</button>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.preview-title-input {
  flex: 1;
  font-size: 1rem;
  font-weight: 600;
  padding: 4px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.preview-title-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.preview-editor {
  flex: 1;
  min-height: 300px;
  padding: 16px;
  font-family: inherit;
  font-size: calc(13px * var(--font-scale, 1));
  line-height: 1.6;
  border: none;
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-main);
  resize: none;
  overflow-y: auto;
}

.preview-editor:focus {
  outline: none;
}

.preview-btn-primary {
  background: var(--primary-color);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.preview-btn-primary:hover {
  opacity: 0.9;
}

.preview-btn-secondary {
  background: transparent !important;
  color: var(--text-muted) !important;
  border: 1px solid var(--border-default) !important;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.preview-btn-secondary:hover {
  background: var(--bg-surface-alt) !important;
  color: var(--text-main) !important;
}

.preview-content {
  cursor: text;
}

.preview-header h3 {
  cursor: text;
}

.editor-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.wikilink-picker {
  z-index: 3000;
}
</style>
