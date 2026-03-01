<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useNodesStore } from '../stores/nodes'

const store = useNodesStore()

const selectedNode = computed(() => store.selectedNode)
const editContent = ref('')
let saveTimeout: ReturnType<typeof setTimeout> | null = null

// Sync content when node changes
watch(selectedNode, (node) => {
  editContent.value = node?.markdown_content || ''
}, { immediate: true })

const nodeColors = [
  { name: 'Default', value: null },
  { name: 'Red', value: '#fee2e2' },
  { name: 'Orange', value: '#ffedd5' },
  { name: 'Yellow', value: '#fef9c3' },
  { name: 'Green', value: '#dcfce7' },
  { name: 'Blue', value: '#dbeafe' },
  { name: 'Purple', value: '#f3e8ff' },
  { name: 'Pink', value: '#fce7f3' },
]

function updateNodeColor(color: string | null) {
  if (selectedNode.value) {
    const node = store.nodes.find(n => n.id === selectedNode.value!.id)
    if (node) {
      node.color_theme = color
      node.updated_at = Date.now()
    }
  }
}

function updateContent() {
  if (selectedNode.value) {
    // Update locally immediately
    const node = store.nodes.find(n => n.id === selectedNode.value!.id)
    if (node) {
      node.markdown_content = editContent.value
      node.updated_at = Date.now()
    }
    // Debounce save to backend
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (selectedNode.value) {
        store.updateNodeContent(selectedNode.value.id, editContent.value)
      }
    }, 500)
  }
}

function closePanel() {
  store.selectNode(null)
}

async function deleteNode() {
  if (selectedNode.value && confirm('Delete this node?')) {
    await store.deleteNode(selectedNode.value.id)
  }
}
</script>

<template>
  <aside v-if="selectedNode" class="node-panel">
    <header class="panel-header">
      <span class="panel-title">Edit Node</span>
      <div class="color-picker">
        <button
          v-for="color in nodeColors"
          :key="color.name"
          class="color-swatch"
          :class="{ active: selectedNode.color_theme === color.value }"
          :style="{ background: color.value || 'var(--bg-surface)' }"
          :title="color.name"
          @click="updateNodeColor(color.value)"
        ></button>
      </div>
      <button class="close-btn" @click="closePanel">x</button>
    </header>

    <div class="panel-content">
      <textarea
        v-model="editContent"
        @input="updateContent"
        class="markdown-editor"
        placeholder="Write markdown here..."
        spellcheck="false"
      ></textarea>
    </div>

    <footer class="panel-footer">
      <span v-if="selectedNode.file_path" class="file-path">
        {{ selectedNode.file_path.split('/').pop() }}
      </span>
      <button class="delete-btn" @click="deleteNode">Delete</button>
    </footer>
  </aside>
</template>

<style scoped>
.node-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 320px;
  height: 100%;
  background: var(--bg-surface-alt);
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -2px 0 8px var(--shadow-sm);
  animation: slideIn 0.15s ease-out;
}

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.panel-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.color-picker {
  display: flex;
  gap: 3px;
  flex: 1;
}

.color-swatch {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  border: 1.5px solid var(--border-default);
  cursor: pointer;
  padding: 0;
}

.color-swatch:hover {
  border-color: var(--text-muted);
}

.color-swatch.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1.5px rgba(59, 130, 246, 0.3);
}

.close-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
}

.close-btn:hover {
  background: var(--bg-elevated);
}

.panel-content {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.markdown-editor {
  flex: 1;
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 12px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
  background: var(--bg-surface);
  resize: none;
  outline: none;
}

.markdown-editor:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.markdown-editor::placeholder {
  color: var(--text-muted);
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid var(--border-default);
}

.file-path {
  font-size: 11px;
  color: var(--text-muted);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-btn {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--danger-border);
  background: var(--danger-bg);
  color: var(--danger-color);
  cursor: pointer;
  font-size: 12px;
}

.delete-btn:hover {
  opacity: 0.9;
}
</style>
