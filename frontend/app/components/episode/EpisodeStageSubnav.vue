<template>
<div v-if="activeSubSteps.length" class="stage-subnav">
        <button
          v-for="sub in activeSubSteps"
          :key="sub.key"
          :class="['stage-subnav-item', { active: activeSubStepKey === sub.key, done: sub.done }]"
          @click="goSubStep(sub.key)"
        >
          <span>{{ sub.label }}</span>
          <span v-if="sub.done" class="stage-subnav-dot"></span>
        </button>
      </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { useEpisodeStudioInject } from '~/composables/useEpisodeStudio'

export default defineComponent({
  setup() {
    return useEpisodeStudioInject()
  },
})
</script>
