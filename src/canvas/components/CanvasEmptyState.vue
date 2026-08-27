<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  visible: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <div v-if="visible" class="empty-state-overlay">
    <div class="empty-state-box">
      <h3>{{ t('canvas.emptyTitle') }}</h3>
      <p>{{ t('canvas.emptyHint') }}</p>
    </div>
  </div>
</template>
