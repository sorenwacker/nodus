<script setup lang="ts">
import NodePicker from '../../components/NodePicker.vue'

defineProps<{
  visible: boolean
  excludeNodeIds: string[]
}>()

const emit = defineEmits<{
  select: [nodeId: string]
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="link-picker-overlay" @click="emit('close')">
      <div class="link-picker-modal" @click.stop>
        <NodePicker
          :exclude-node-ids="excludeNodeIds"
          :show-search="true"
          :allow-create="false"
          :max-items="20"
          @select="emit('select', $event)"
          @close="emit('close')"
        />
      </div>
    </div>
  </Teleport>
</template>
