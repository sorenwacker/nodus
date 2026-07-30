<script setup lang="ts">
/**
 * CanvasEdgeFilters - edge/tag layer visibility toggles
 *
 * Lives on the canvas, next to the content it filters, acting as an
 * interactive legend: manual, storyline, wikilink, and tag layers.
 */
import { useNodesStore } from '../../stores/nodes'

const store = useNodesStore()
</script>

<template>
  <div class="edge-filters">
    <button
      class="filter-toggle"
      :class="{ active: store.showManualEdges }"
      data-tooltip="Manual edges"
      @click="store.showManualEdges = !store.showManualEdges"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
    </button>
    <button
      class="filter-toggle"
      :class="{ active: store.showStorylineEdges }"
      data-tooltip="Storyline edges"
      @click="store.showStorylineEdges = !store.showStorylineEdges"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
    </button>
    <button
      class="filter-toggle"
      :class="{ active: store.showWikilinkEdges }"
      data-tooltip="Wikilink edges"
      @click="store.showWikilinkEdges = !store.showWikilinkEdges"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    </button>
    <button
      class="filter-toggle"
      :class="{ active: store.showTagEdges }"
      data-tooltip="Tag nodes and edges"
      @click="store.showTagEdges = !store.showTagEdges"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
    </button>
  </div>
</template>

<style scoped>
.edge-filters {
  position: absolute;
  bottom: calc(52px + var(--canvas-bottom-inset, 0px));
  left: 16px;
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 50;
  transition: bottom var(--step-duration, 0.3s) var(--step-ease, ease);
}

.filter-toggle {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0.55;
}

.filter-toggle:hover {
  background: var(--bg-elevated);
}

.filter-toggle.active {
  color: var(--primary-color);
  opacity: 1;
  background: rgba(59, 130, 246, 0.1);
}
</style>
