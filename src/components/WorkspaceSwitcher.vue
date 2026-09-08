<script setup lang="ts">
/**
 * Picks the workspace: a button that opens a searchable list.
 *
 * Recently opened first, then the rest by name, each row carrying its node
 * count. The keyboard alone can reach any workspace
 * (PRODUCT_DESIGN.md > Choosing a workspace).
 */
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceSwitcher } from '../composables/useWorkspaceSwitcher'

const { t } = useI18n()

const props = defineProps<{
  workspaces: Array<{ id: string; name: string }>
  nodes: Array<{ workspace_id: string | null }>
  currentWorkspaceId: string | null
}>()

const emit = defineEmits<{ (e: 'switch', id: string | null): void }>()

const filterInput = ref<HTMLInputElement | null>(null)

const switcher = useWorkspaceSwitcher({
  workspaces: computed(() => props.workspaces),
  nodes: computed(() => props.nodes),
  currentWorkspaceId: computed(() => props.currentWorkspaceId),
})
const { query, isOpen, highlighted, highlightedId, rows, remember, moveHighlight, open, close } =
  switcher

const currentName = computed(
  () => props.workspaces.find(w => w.id === props.currentWorkspaceId)?.name ?? t('workspace.default')
)

function toggle() {
  if (isOpen.value) {
    close()
    return
  }
  open()
  nextTick(() => filterInput.value?.focus())
}

function choose(id: string | null) {
  remember(id)
  emit('switch', id)
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveHighlight(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveHighlight(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (highlightedId.value) choose(highlightedId.value)
  } else if (e.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <div class="switcher">
    <button
      class="switcher-trigger"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :data-tooltip="t('workspace.switch')"
      @click="toggle"
    >
      <span class="switcher-name">{{ currentName }}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <div v-if="isOpen" class="switcher-backdrop" @click="close()"></div>

    <div v-if="isOpen" class="switcher-panel">
      <input
        ref="filterInput"
        v-model="query"
        type="text"
        class="switcher-filter"
        :placeholder="t('workspace.filter')"
        @keydown="onKeydown"
      />
      <ul class="switcher-list" role="listbox">
        <li
          v-for="(row, index) in rows"
          :key="row.id"
          class="switcher-row"
          :class="{ highlighted: index === highlighted, current: row.isCurrent }"
          role="option"
          :aria-selected="row.isCurrent"
          @click="choose(row.id)"
          @mouseenter="highlighted = index"
        >
          <span class="row-name">{{ row.name }}</span>
          <span v-if="row.isRecent" class="row-recent">{{ t('workspace.recent') }}</span>
          <span class="row-count">{{ row.nodeCount }}</span>
        </li>
        <li v-if="rows.length === 0" class="switcher-empty">{{ t('workspace.noMatch') }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.switcher {
  position: relative;
}

.switcher-trigger {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 14rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-main);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.switcher-trigger:hover {
  border-color: var(--primary-color);
}

.switcher-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.switcher-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
}

.switcher-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 91;
  width: 20rem;
  max-width: 80vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 8px 24px var(--shadow-md);
  overflow: hidden;
}

.switcher-filter {
  border: none;
  border-bottom: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-main);
  font: inherit;
  font-size: 0.9rem;
  padding: 0.6rem 0.75rem;
  outline: none;
}

.switcher-filter:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.switcher-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  max-height: 22rem;
  overflow-y: auto;
}

.switcher-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.55rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.88rem;
}

.switcher-row.highlighted {
  background: var(--bg-hover, rgba(127, 127, 127, 0.14));
}

.switcher-row.current .row-name {
  font-weight: 600;
  color: var(--primary-color);
}

.row-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-recent {
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.row-count {
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  color: var(--text-muted);
  min-width: 2.5rem;
  text-align: right;
}

.switcher-empty {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
}
</style>
