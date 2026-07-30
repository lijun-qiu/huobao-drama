<template>
<header class="studio-topbar">
      <div class="studio-topbar-primary">
        <div class="studio-topbar-main">
          <button class="back-btn topbar-back" @click="navigateTo(`/drama/${dramaId}`)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            返回项目
          </button>
          <div class="studio-identity">
            <h1 class="studio-title">{{ drama?.title || '加载中…' }}</h1>
            <span class="studio-episode-chip">第 {{ episodeNumber }} 集</span>
            <span v-if="isLocalComicMode" class="studio-episode-chip is-mode">本地短剧</span>
            <span v-else-if="isDialoguePortraitMode" class="studio-episode-chip is-mode">对话立绘</span>
            <span v-else-if="isNovelComicMode" class="studio-episode-chip is-mode">小说漫画讲解</span>
            <span v-else-if="isMotionComicMode" class="studio-episode-chip is-mode">漫画解说</span>
            <span v-else-if="isNarrationMode" class="studio-episode-chip is-mode">解说模式</span>
            <div class="studio-meta-row">
              <span class="studio-meta-pill">{{ currentSubStageLabel }}</span>
              <span class="studio-meta-pill is-progress">{{ pipelineProgress }}/{{ pipelineStepTotal }}</span>
              <span class="studio-meta-inline">{{ chars.length }} 角色 · {{ sbs.length }} 镜头</span>
            </div>
          </div>
        </div>

        <div class="studio-topbar-side">
          <LocalModelBar v-if="usesLocalModelPipeline" />
          <StudioModelBar v-else />
          <div class="studio-actions">
            <button class="btn" @click="refresh">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              刷新
            </button>
            <button class="btn btn-primary" @click="panel = mergeUrl ? 'export' : (sbs.length ? 'production' : 'script')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ mergeUrl ? '查看成片' : (sbs.length ? '继续制作' : '开始制作') }}
            </button>
          </div>
        </div>
      </div>
    </header>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { useEpisodeStudioInject } from '~/composables/useEpisodeStudio'
import LocalModelBar from '~/components/episode/LocalModelBar.vue'
import StudioModelBar from '~/components/episode/StudioModelBar.vue'

export default defineComponent({
  components: { LocalModelBar, StudioModelBar },
  setup() {
    return useEpisodeStudioInject()
  },
})
</script>
