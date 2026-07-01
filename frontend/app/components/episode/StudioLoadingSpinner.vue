<template>
  <div class="studio-spinner" :class="{ 'studio-spinner-inline': inline }" role="status" aria-live="polite">
    <div class="studio-spinner-ring" aria-hidden="true" />
    <span v-if="label" class="studio-spinner-label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string
  inline?: boolean
}>()
</script>

<style scoped>
.studio-spinner-inline {
  flex-direction: row;
  gap: 10px;
}
</style>
