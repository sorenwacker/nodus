<script setup lang="ts">
/**
 * Chat transcript for the agent bar: the conversation the user sees, growing
 * upward from the input row. Tool activity collapses to one line per turn;
 * errors and raw diagnostics stay in the agent log panel.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatTurn } from '../../llm/chatTranscript'
import { renderMarkdown } from '../../services/MarkdownRenderService'

const props = defineProps<{
  turns: ChatTurn[]
  isRunning: boolean
}>()

const { t } = useI18n()

/**
 * The turn's text as HTML.
 *
 * The model writes markdown, and plain interpolation showed it raw: a reply
 * full of `**emphasis**` and `- ` list markers. Rendered through the same
 * service the canvas uses, so the output passes the sanitisation boundary and
 * the same syntax works in both places
 * (PRODUCT_DESIGN.md > Rendering the conversation).
 */
function renderedTurn(text: string): string {
  return renderMarkdown(text)
}

// A plain template ref, not useTemplateRef: that API needs Vue 3.5 while the
// declared bound allows 3.4
const scroller = ref<HTMLElement | null>(null)
const expanded = ref<Set<string>>(new Set())

function toggleActions(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expanded.value = next
}

// Follow the newest turn as it arrives
watch(
  () => [props.turns.length, props.turns[props.turns.length - 1]?.text, props.isRunning],
  async () => {
    await nextTick()
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  }
)
</script>

<template>
  <div ref="scroller" class="chat-transcript" :class="{ empty: turns.length === 0 }">
    <p v-if="turns.length === 0" class="chat-empty">{{ t('canvas.agent.chatEmpty') }}</p>
    <div
      v-for="turn in turns"
      :key="turn.id"
      class="chat-turn"
      :class="[turn.role, { error: turn.status === 'error' }]"
    >
      <span class="chat-role">{{
        turn.role === 'user' ? t('canvas.agent.chatYou') : t('canvas.agent.chatAgent')
      }}</span>
      <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
      <div class="chat-text" v-html="renderedTurn(turn.text)"></div>
      <template v-if="turn.actions.length > 0">
        <button class="chat-actions-toggle" @click="toggleActions(turn.id)">
          {{ expanded.has(turn.id) ? '&#9662;' : '&#9656;' }}
          {{ t('canvas.agent.chatActions', { count: turn.actions.length }) }}
        </button>
        <ul v-if="expanded.has(turn.id)" class="chat-action-list">
          <li v-for="(action, i) in turn.actions" :key="i" class="chat-action">{{ action }}</li>
        </ul>
      </template>
    </div>
    <div v-if="isRunning" class="chat-pending">{{ t('canvas.agent.chatWorking') }}</div>
  </div>
</template>

<style scoped>
.chat-empty {
  /* auto margins centre it in the empty panel, vertically and horizontally */
  margin: auto;
  padding: 2px 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-style: italic;
  text-align: center;
}

.chat-transcript {
  /* Fills the agent panel; the panel owns the outer height */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 4px;
  font-size: 12px;
  line-height: 1.5;
}

.chat-turn {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
}

.chat-turn.user {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.chat-turn.error {
  border-color: var(--danger-color, #dc2626);
}

.chat-role {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.chat-text {
  color: var(--text-main);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chat-actions-toggle {
  align-self: flex-start;
  margin-top: 2px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}

.chat-actions-toggle:hover {
  color: var(--text-main);
}

.chat-action-list {
  margin: 2px 0 0;
  padding-left: 16px;
  color: var(--text-muted);
  font-size: 11px;
}

.chat-pending {
  color: var(--text-muted);
  font-size: 11px;
  padding-left: 8px;
}
</style>
