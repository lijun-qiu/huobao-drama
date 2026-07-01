<template>
  <div v-if="!studioReady" class="studio-loading">
    <StudioLoadingSpinner label="加载中…" />
  </div>
  <div v-else class="studio">
    <div v-if="episodeDataLoading" class="studio-loading-overlay" aria-busy="true" aria-live="polite">
      <StudioLoadingSpinner :label="episodeLoadingLabel" />
    </div>

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
import { computed, provide } from 'vue'
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
import StudioLoadingSpinner from '~/components/episode/StudioLoadingSpinner.vue'

definePageMeta({ layout: 'studio' })

const studio = useEpisodeStudio()
provide(EPISODE_STUDIO_KEY, studio)

const { panel, studioReady, episodeDataLoading, episodeNumber } = studio

const episodeLoadingLabel = computed(() => `正在加载第 ${episodeNumber.value} 集…`)
</script>

<style>
@import '~/assets/css/episode-studio.css';
</style>
