<template>
  <div v-if="!drama" class="studio-loading">加载中…</div>
  <div v-else class="studio" @paste.window="onStudioImagePaste">
    <EpisodeStudioTopbar />

    <div class="studio-body">
      <EpisodeStudioSidebar />

      <main class="main">
        <EpisodeStageSubnav />

        <EpisodeScriptPanel v-if="panel === 'script'" />
        <EpisodeProductionPanel v-else-if="panel === 'production'" />
        <EpisodeExportPanel v-else />

        <EpisodeStepBubble />
        <EpisodeStudioModals />
      </main>
    </div>

    <EpisodeStudioFileInputs />
  </div>
</template>

<script setup lang="ts">
import { provide } from 'vue'
import { useEpisodeStudio, EPISODE_STUDIO_KEY } from '~/composables/useEpisodeStudio'
import EpisodeStudioTopbar from '~/components/episode/EpisodeStudioTopbar.vue'
import EpisodeStudioSidebar from '~/components/episode/EpisodeStudioSidebar.vue'
import EpisodeStageSubnav from '~/components/episode/EpisodeStageSubnav.vue'
import EpisodeScriptPanel from '~/components/episode/EpisodeScriptPanel.vue'
import EpisodeProductionPanel from '~/components/episode/EpisodeProductionPanel.vue'
import EpisodeExportPanel from '~/components/episode/EpisodeExportPanel.vue'
import EpisodeStepBubble from '~/components/episode/EpisodeStepBubble.vue'
import EpisodeStudioModals from '~/components/episode/EpisodeStudioModals.vue'
import EpisodeStudioFileInputs from '~/components/episode/EpisodeStudioFileInputs.vue'

definePageMeta({ layout: 'studio' })

const studio = useEpisodeStudio()
provide(EPISODE_STUDIO_KEY, studio)

const { drama, panel, onStudioImagePaste } = studio
</script>

<style>
@import '~/assets/css/episode-studio.css';

.studio-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-dim, #64748b);
  font-size: 14px;
}
</style>
