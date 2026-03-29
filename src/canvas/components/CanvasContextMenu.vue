<script setup lang="ts">
import { computed } from 'vue'
import type { Storyline, Workspace } from '../../types'

const props = defineProps<{
  visible: boolean
  position: { x: number; y: number }
  nodeId: string | null
  nodeCount: number
  storylineSubmenu: boolean
  workspaceSubmenu: boolean
  storylines: Storyline[]
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  hasDOI?: boolean
  doiCount?: number // Number of selected nodes with DOIs
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'fit-to-content', nodeId: string): void
  (e: 'zoom-to-node', nodeId: string): void
  (e: 'open-link-picker'): void
  (e: 'delete-nodes'): void
  (e: 'add-to-storyline', storylineId: string): void
  (e: 'create-storyline'): void
  (e: 'move-to-workspace', workspaceId: string | null): void
  (e: 'update:storylineSubmenu', value: boolean): void
  (e: 'update:workspaceSubmenu', value: boolean): void
  (e: 'fetch-citations'): void
}>()

const otherWorkspaces = computed(() => {
  return props.workspaces.filter(w => w.id !== props.currentWorkspaceId)
})

function handleFitToContent() {
  if (props.nodeId) {
    emit('fit-to-content', props.nodeId)
    emit('close')
  }
}

function handleZoomToNode() {
  if (props.nodeId) {
    emit('zoom-to-node', props.nodeId)
    emit('close')
  }
}

function handleOpenLinkPicker() {
  emit('open-link-picker')
}

function handleDelete() {
  emit('delete-nodes')
  emit('close')
}

function handleAddToStoryline(storylineId: string) {
  emit('add-to-storyline', storylineId)
}

function handleCreateStoryline() {
  emit('create-storyline')
}

function handleMoveToWorkspace(workspaceId: string | null) {
  emit('move-to-workspace', workspaceId)
}

function handleFetchCitations() {
  emit('fetch-citations')
  emit('close')
}
</script>

<template>
  <div
    v-if="visible"
    class="context-menu"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    @click.stop
  >
    <div class="context-menu-item" @click="handleFitToContent">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
      </svg>
      <span>Fit to Content</span>
    </div>

    <div class="context-menu-item" @click="handleZoomToNode">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
      <span>Find on Canvas</span>
    </div>

    <div class="context-menu-item" @click="handleOpenLinkPicker">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      <span>Link to...</span>
    </div>

    <!-- Fetch Citations (for nodes with DOI) -->
    <div v-if="doiCount && doiCount > 0" class="context-menu-item" @click="handleFetchCitations">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
      </svg>
      <span>Fetch Citations{{ doiCount > 1 ? ` (${doiCount})` : '' }}</span>
    </div>

    <div class="context-menu-divider"></div>

    <div
      class="context-menu-item has-submenu"
      @mouseenter="$emit('update:storylineSubmenu', true)"
      @mouseleave="$emit('update:storylineSubmenu', false)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
      <span>Add to Storyline{{ nodeCount > 1 ? ` (${nodeCount})` : '' }}</span>
      <svg class="submenu-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>

      <!-- Storyline submenu -->
      <div v-if="storylineSubmenu" class="context-submenu">
        <div
          v-for="storyline in storylines"
          :key="storyline.id"
          class="context-menu-item"
          @click="handleAddToStoryline(storyline.id)"
        >
          <span>{{ storyline.title }}</span>
        </div>
        <div v-if="storylines.length > 0" class="context-menu-divider"></div>
        <div class="context-menu-item" @click="handleCreateStoryline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>New Storyline...</span>
        </div>
      </div>
    </div>

    <!-- Send to Workspace submenu -->
    <div
      class="context-menu-item has-submenu"
      @mouseenter="$emit('update:workspaceSubmenu', true)"
      @mouseleave="$emit('update:workspaceSubmenu', false)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>Send to Workspace{{ nodeCount > 1 ? ` (${nodeCount})` : '' }}</span>
      <svg class="submenu-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>

      <!-- Workspace submenu -->
      <div v-if="workspaceSubmenu" class="context-submenu">
        <div
          v-if="currentWorkspaceId !== null"
          class="context-menu-item"
          @click="handleMoveToWorkspace(null)"
        >
          <span>Default</span>
        </div>
        <div
          v-for="workspace in otherWorkspaces"
          :key="workspace.id"
          class="context-menu-item"
          @click="handleMoveToWorkspace(workspace.id)"
        >
          <span>{{ workspace.name }}</span>
        </div>
        <div v-if="otherWorkspaces.length === 0 && currentWorkspaceId === null" class="context-menu-item disabled">
          <span>No other workspaces</span>
        </div>
      </div>
    </div>

    <div class="context-menu-divider"></div>

    <div class="context-menu-item danger" @click="handleDelete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      <span>Delete</span>
    </div>
  </div>

  <!-- Click outside to close context menu -->
  <div
    v-if="visible"
    class="context-menu-backdrop"
    @click="$emit('close')"
    @contextmenu.prevent="$emit('close')"
  ></div>
</template>
