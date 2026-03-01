<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import PixiCanvas from './canvas/PixiCanvas.vue'
import { useNodesStore } from './stores/nodes'

const store = useNodesStore()
const theme = ref<'light' | 'dark'>('light')
const importing = ref(false)

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme.value)
}

async function importVault() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Obsidian Vault',
    })

    if (selected && typeof selected === 'string') {
      importing.value = true
      await store.importVault(selected)
    }
  } catch (e) {
    console.error('Import failed:', e)
  } finally {
    importing.value = false
  }
}

function addNode() {
  const centerX = window.innerWidth / 2 - 100
  const centerY = window.innerHeight / 2 - 60
  store.createNode({
    title: 'New Note',
    node_type: 'note',
    canvas_x: centerX + Math.random() * 100 - 50,
    canvas_y: centerY + Math.random() * 100 - 50,
  })
}

onMounted(() => {
  store.initialize()
})
</script>

<template>
  <div class="app">
    <header class="toolbar">
      <div class="toolbar-left">
        <h1>Nodus</h1>
      </div>
      <div class="toolbar-center">
        <span class="node-count">{{ store.nodes.length }} nodes</span>
        <span class="edge-count">{{ store.edges.length }} edges</span>
      </div>
      <div class="toolbar-right">
        <button title="Add new node" @click="addNode">
          + Node
        </button>
        <button :disabled="importing" title="Import Obsidian vault" @click="importVault">
          {{ importing ? 'Importing...' : 'Import Vault' }}
        </button>
        <button @click="toggleTheme">
          {{ theme === 'light' ? 'Dark' : 'Light' }}
        </button>
      </div>
    </header>
    <main class="canvas-container">
      <PixiCanvas />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-node);
  border-bottom: 1px solid var(--border-node);
  gap: 16px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.toolbar h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.toolbar button {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-node);
  background: var(--bg-canvas);
  color: var(--text-main);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.toolbar button:hover {
  background: var(--bg-node);
}

.toolbar button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.canvas-container {
  flex: 1;
  position: relative;
}
</style>
