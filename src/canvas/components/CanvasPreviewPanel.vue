<script setup lang="ts">
import { ref, watch } from 'vue'

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
  save: [nodeId: string, content: string]
  saveTitle: [nodeId: string, title: string]
}>()

const isEditing = ref(false)
const editContent = ref('')
const editTitle = ref('')

// Reset edit state when panel closes or node changes
watch(() => props.visible, (visible) => {
  if (!visible) {
    isEditing.value = false
  }
})

watch(() => props.nodeId, () => {
  isEditing.value = false
})

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
          @keydown.enter="saveAndClose"
          @keydown.escape="cancelEditing"
        />
        <h3 v-else @dblclick="startEditing">{{ title }}</h3>
        <button class="preview-close" @click="emit('close')">&times;</button>
      </div>

      <!-- Edit mode -->
      <textarea
        v-if="isEditing"
        v-model="editContent"
        class="preview-editor"
        @keydown.escape="cancelEditing"
      ></textarea>

      <!-- View mode -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else class="preview-content" @dblclick="startEditing" v-html="content"></div>

      <div class="preview-actions">
        <template v-if="isEditing">
          <button class="preview-btn-secondary" @click="cancelEditing">Cancel</button>
          <button class="preview-btn-primary" @click="saveAndClose">Save</button>
        </template>
        <template v-else>
          <button @click="startEditing">Edit</button>
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
</style>
