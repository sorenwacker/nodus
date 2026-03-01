<script setup lang="ts">
import { computed } from 'vue'
import { useNodesStore } from '../stores/nodes'

const store = useNodesStore()

const selectedNode = computed(() => store.selectedNode)

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
      <h2>{{ selectedNode.title }}</h2>
      <button class="close-btn" @click="closePanel">x</button>
    </header>

    <div class="panel-meta">
      <span class="meta-item">
        <strong>Type:</strong> {{ selectedNode.node_type }}
      </span>
      <span v-if="selectedNode.file_path" class="meta-item">
        <strong>File:</strong>
        <code>{{ selectedNode.file_path.split('/').pop() }}</code>
      </span>
    </div>

    <div class="panel-content">
      <pre v-if="selectedNode.markdown_content">{{ selectedNode.markdown_content }}</pre>
      <p v-else class="empty-content">No content</p>
    </div>

    <footer class="panel-footer">
      <button class="delete-btn" @click="deleteNode">Delete Node</button>
    </footer>
  </aside>
</template>

<style scoped>
.node-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 360px;
  height: 100%;
  background: var(--bg-node);
  border-left: 1px solid var(--border-node);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.05);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-node);
}

.panel-header h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-muted);
}

.close-btn:hover {
  background: var(--bg-canvas);
}

.panel-meta {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-node);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.meta-item {
  color: var(--text-muted);
}

.meta-item strong {
  color: var(--text-main);
}

.meta-item code {
  background: var(--bg-canvas);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.panel-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.panel-content pre {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: var(--text-main);
}

.empty-content {
  color: var(--text-muted);
  font-style: italic;
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-node);
}

.delete-btn {
  width: 100%;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #fca5a5;
  background: #fef2f2;
  color: #dc2626;
  cursor: pointer;
  font-size: 13px;
}

.delete-btn:hover {
  background: #fee2e2;
}
</style>
