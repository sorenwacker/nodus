<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Node } from '../../types'

const { t } = useI18n()

defineProps<{
  visible: boolean
  position: { x: number; y: number }
  node: Node | null
  content: string
}>()
</script>

<template>
  <div
    v-if="visible && node"
    class="hover-tooltip"
    :style="{
      left: (position.x + 16) + 'px',
      top: (position.y + 16) + 'px',
    }"
  >
    <div class="hover-tooltip-title">{{ node.title || t('canvas.node.untitled') }}</div>
    <div v-if="content" class="hover-tooltip-content">
      {{ content }}{{ content.length >= 200 ? '...' : '' }}
    </div>
  </div>
</template>
