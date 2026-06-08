<script setup lang="ts">
/**
 * Unified Markdown Content Component
 *
 * Use this component everywhere you need to display rendered markdown.
 * It handles:
 * - Markdown to HTML conversion
 * - Math (Typst) rendering
 * - Mermaid diagram rendering
 * - Wikilink resolution
 * - Dark theme adaptation
 * - XSS sanitization
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import {
  renderMarkdown,
  renderPendingContent,
} from '../services/MarkdownRenderService'
import { useNodesStore } from '../stores/nodes'

const props = withDefaults(defineProps<{
  /** Raw markdown content to render */
  content: string | null
  /** Additional CSS class for the container */
  contentClass?: string
}>(), {
  content: null,
  contentClass: '',
})

const emit = defineEmits<{
  /** Emitted when a wikilink is clicked */
  (e: 'wikilink-click', target: string): void
  /** Emitted when an external link is clicked */
  (e: 'link-click', href: string): void
}>()

const store = useNodesStore()
const containerRef = ref<HTMLElement | null>(null)

// Check if wikilink target exists
function wikilinkExists(target: string): boolean {
  return store.filteredNodes.some(
    n => n.title.toLowerCase() === target.toLowerCase()
  )
}

// Render markdown to HTML
const renderedHtml = computed(() => {
  if (!props.content) return ''
  return renderMarkdown(props.content, { wikilinkExists })
})

// Trigger async rendering after HTML is in DOM
watch(renderedHtml, async () => {
  await nextTick()
  if (containerRef.value) {
    await renderPendingContent(containerRef.value)
  }
}, { immediate: true })

// Also render on mount
onMounted(async () => {
  await nextTick()
  if (containerRef.value) {
    await renderPendingContent(containerRef.value)
  }
})

// Handle clicks on links
function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const link = target.closest('a')
  if (!link) return

  e.preventDefault()
  e.stopPropagation()

  if (link.classList.contains('wikilink')) {
    const linkTarget = link.dataset.target
    if (linkTarget) {
      emit('wikilink-click', linkTarget)
    }
  } else if (link.href) {
    emit('link-click', link.href)
  }
}
</script>

<template>
  <div
    ref="containerRef"
    class="markdown-content"
    :class="contentClass"
    @click="handleClick"
    v-html="renderedHtml"
  ></div>
</template>

<style>
/* Base markdown content styles */
.markdown-content {
  line-height: 1.6;
  color: var(--text-main);
}

.markdown-content p {
  margin: 0 0 0.75em 0;
}

.markdown-content p:last-child {
  margin-bottom: 0;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  margin: 1em 0 0.5em 0;
  font-weight: 600;
  color: var(--text-main);
}

.markdown-content h1:first-child,
.markdown-content h2:first-child,
.markdown-content h3:first-child {
  margin-top: 0;
}

.markdown-content ul,
.markdown-content ol {
  margin: 0 0 0.75em 0;
  padding-left: 1.5em;
}

.markdown-content li {
  margin-bottom: 0.25em;
}

.markdown-content code {
  background: var(--bg-elevated);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.9em;
}

.markdown-content pre {
  background: var(--bg-elevated);
  padding: 0.75em 1em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.75em 0;
}

.markdown-content pre code {
  background: none;
  padding: 0;
}

.markdown-content a {
  color: var(--primary-color);
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}

.markdown-content a.wikilink {
  cursor: pointer;
  border-bottom: 1px dashed var(--primary-color);
}

.markdown-content a.wikilink:hover {
  border-bottom-style: solid;
}

.markdown-content a.wikilink.missing {
  color: var(--text-muted);
  border-color: var(--text-muted);
}

.markdown-content blockquote {
  border-left: 3px solid var(--border-default);
  margin: 0.75em 0;
  padding-left: 1em;
  color: var(--text-muted);
}

.markdown-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75em 0;
}

.markdown-content th,
.markdown-content td {
  border: 1px solid var(--border-default);
  padding: 0.5em 0.75em;
  text-align: left;
}

.markdown-content th {
  background: var(--bg-elevated);
  font-weight: 600;
}

.markdown-content img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.markdown-content hr {
  border: none;
  border-top: 1px solid var(--border-default);
  margin: 1.5em 0;
}

/* Math rendering */
.markdown-content .typst-display {
  display: block;
  text-align: center;
  margin: 1em 0;
  overflow-x: auto;
}

.markdown-content .typst-inline {
  display: inline;
  vertical-align: middle;
}

.markdown-content .typst-math svg {
  vertical-align: middle;
  max-width: 100%;
  height: auto;
}

.markdown-content .typst-pending {
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}

/* Mermaid diagrams */
.markdown-content .mermaid-wrapper {
  margin: 1em 0;
  overflow-x: auto;
}

.markdown-content .mermaid {
  display: flex;
  justify-content: center;
}

.markdown-content .mermaid svg {
  max-width: 100%;
  height: auto;
}

/* Dark theme math inversion */
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .markdown-content .typst-display svg,
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .markdown-content .typst-inline svg {
  filter: invert(1);
}
</style>
