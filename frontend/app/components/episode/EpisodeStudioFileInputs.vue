<template>
<input
      ref="imageUploadInputRef"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      multiple
      class="sr-only-file-input"
      @change="onImageUploadSelected"
    />
    <input
      ref="shotFolderUploadInputRef"
      type="file"
      multiple
      webkitdirectory
      class="sr-only-file-input"
      @change="onShotFolderUploadSelected"
    />
    <input
      ref="audioUploadInputRef"
      type="file"
      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg"
      multiple
      class="sr-only-file-input"
      @change="onAudioUploadSelected"
    />
    <input
      ref="storyboardDescUploadInputRef"
      type="file"
      accept=".txt,.md,text/plain"
      class="sr-only-file-input"
      @change="onStoryboardDescUploadSelected"
    />
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
