<template>
  <div class="studio" v-if="drama">
    <header class="studio-topbar">
      <div class="studio-topbar-main">
        <button class="back-btn topbar-back" @click="navigateTo(`/drama/${dramaId}`)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          返回项目
        </button>
        <div class="studio-identity">
          <h1 class="studio-title">{{ drama.title }}</h1>
          <span class="studio-episode-chip">第 {{ episodeNumber }} 集</span>
          <span v-if="isNarrationMode" class="studio-episode-chip is-mode">解说模式</span>
          <div class="studio-meta-row">
            <span class="studio-meta-pill">{{ currentSubStageLabel }}</span>
            <span class="studio-meta-pill is-progress">{{ pipelineProgress }}/{{ pipelineStepTotal }}</span>
            <span class="studio-meta-inline">{{ chars.length }} 角色 · {{ sbs.length }} 镜头</span>
          </div>
        </div>
      </div>

      <div class="studio-topbar-side">
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
    </header>

    <div class="studio-body">
    <!-- ========== LEFT SIDEBAR ========== -->
    <aside class="sidebar">
      <nav class="pipeline">
        <div
          v-for="section in sidebarSections"
          :key="section.id"
          class="pipe-section"
        >
          <div class="pipe-section-label">{{ section.label }}</div>
          <button
            v-for="item in section.items"
            :key="item.key"
            :class="['pipe-item pipe-item-sub', { active: activeSubStepKey === item.key, done: item.done }]"
            @click="goSubStep(item.key)"
          >
            <span class="pipe-icon" :class="item.done ? 'icon-done' : activeSubStepKey === item.key ? 'icon-active' : ''">
              <svg v-if="item.done" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <component v-else :is="item.icon" :size="11" />
            </span>
            <span class="pipe-copy">
              <span class="pipe-label">{{ item.label }}</span>
              <span v-if="item.desc" class="pipe-sub">{{ item.desc }}</span>
            </span>
          </button>
        </div>
      </nav>

      <!-- Bottom: Progress + Refresh -->
      <div class="sidebar-bottom">
        <div class="progress-wrap">
          <div class="progress-head">
            <span class="progress-label">制作进度</span>
            <span class="progress-val">{{ pipelineProgress }}/{{ pipelineStepTotal }}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: (pipelineProgress / pipelineStepTotal * 100) + '%' }"></div>
          </div>
        </div>
        <div class="sidebar-jumper" v-if="sidebarJumpSteps.length">
          <button
            v-for="step in sidebarJumpSteps"
            :key="step.key"
            :class="['sidebar-jump-dot', { active: activeSubStepKey === step.key, done: step.done }]"
            @click="goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>
        <button class="refresh-btn" @click="refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          刷新数据
        </button>
      </div>
    </aside>

    <!-- ========== MAIN CONTENT ========== -->
    <main class="main">
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

      <!-- ===== SCRIPT PANEL ===== -->
      <div v-if="panel === 'script'" class="content-panel">
        <!-- Step 0: Raw Content -->
        <div v-if="scriptStep === 0" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">01</span>
                <span class="step-name">{{ isNarrationMode ? '解说文案' : '原始内容' }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="rawLen" class="char-count">{{ rawLen }} 字</span>
              <button class="btn btn-sm" @click="saveRaw(); toast.success('已保存')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                保存
              </button>
            </div>
          </div>
          <textarea
            class="fill-textarea"
            v-model="localRaw"
            placeholder="粘贴小说原文、故事大纲或分镜描述..."
          />
          <div v-if="isNarrationMode" class="narration-hint" style="margin-top:12px">
            <strong>解说模式：</strong>片头按标点逐句拆镜（与正文相同），<strong>共用 1 张无字背景图</strong>；合成时<strong>剧中红字居中</strong>逐句叠加。正文为旁白白字底栏。
          </div>
        </div>

        <!-- Step 1: Rewrite (drama only) -->
        <div v-else-if="!isNarrationMode && scriptStep === 1" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">02</span>
                <span class="step-name">AI 改写</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="scriptLen" class="char-count">{{ scriptLen }} 字</span>
              <button v-if="rawContent" class="btn btn-sm" @click="skipRewrite">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                跳过改写
              </button>
              <button v-if="scriptContent" class="btn btn-sm" @click="doRewrite" :disabled="rn">
                <Loader2 v-if="rn && rt === 'script_rewriter'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                重新改写
              </button>
            </div>
          </div>

          <div v-if="!scriptContent && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div class="empty-title">AI 改写为格式化剧本</div>
            <div class="empty-desc">你可以先用 AI 把原始内容整理成格式化剧本，也可以跳过这一步，直接使用原始内容继续提取角色与场景。</div>
            <div class="step-empty-actions">
              <button class="btn btn-primary" @click="doRewrite">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                开始改写
              </button>
              <button class="btn" @click="skipRewrite">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                跳过改写
              </button>
            </div>
          </div>
          <div v-else-if="rn && rt === 'script_rewriter'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">正在改写剧本...</div>
          </div>
          <textarea v-else class="fill-textarea" v-model="localScript" placeholder="格式化剧本内容..." />
        </div>

        <!-- Step 2: Extract -->
        <div v-else-if="!isNarrationMode && scriptStep === 2" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">03</span>
                <span class="step-name">提取角色与场景</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="chars.length" class="char-count">{{ chars.length }} 角色 · {{ scenes.length }} 场景</span>
              <button v-if="chars.length" class="btn btn-sm" @click="doExtract" :disabled="rn">
                <Loader2 v-if="rn && rt === 'extractor'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                重新提取
              </button>
            </div>
          </div>

          <div v-if="!chars.length && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <div class="empty-title">从剧本提取角色与场景</div>
            <div class="empty-desc">AI 自动分析剧本，提取角色信息和场景列表，与项目已有数据智能去重合并</div>
            <button class="btn btn-primary" @click="doExtract">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              开始提取
            </button>
          </div>
          <div v-else-if="rn && rt === 'extractor'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">正在提取角色和场景...</div>
          </div>
          <div v-else class="extract-stage">
            <aside class="card extract-summary">
              <div class="extract-summary-kicker">Extraction Board</div>
              <div class="extract-summary-title">角色与场景结果</div>
              <div class="extract-summary-desc">从剧本里提取出的角色和场景已经入库。这里先确认命名、定位和描述是否可直接进入后续制作。</div>
              <div class="extract-summary-stats">
                <div class="extract-summary-stat">
                  <span>角色</span>
                  <strong>{{ chars.length }}</strong>
                </div>
                <div class="extract-summary-stat">
                  <span>场景</span>
                  <strong>{{ scenes.length }}</strong>
                </div>
              </div>
              <div class="extract-summary-note">如果角色描述过于简短，后续分配音色和生成形象时建议先补充人物特征。</div>
            </aside>

            <div class="card extract-card">
              <div class="extract-card-head">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>角色</span>
                <span class="tag tag-accent">{{ chars.length }}</span>
              </div>
              <div class="extract-list">
                <div v-for="c in chars" :key="c.id" class="extract-row">
                  <div class="char-avatar">{{ c.name?.[0] || '?' }}</div>
                  <div class="extract-info">
                    <div class="extract-name-row">
                      <div class="extract-name">{{ c.name }}</div>
                      <span class="tag">{{ c.role || '角色' }}</span>
                    </div>
                    <div class="extract-meta wrap">{{ c.description || c.appearance || c.personality || '暂无描述' }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card extract-card" v-if="scenes.length">
              <div class="extract-card-head">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>场景</span>
                <span class="tag tag-accent">{{ scenes.length }}</span>
              </div>
              <div class="extract-list">
                <div v-for="s in scenes" :key="s.id" class="extract-row">
                  <div class="scene-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <div class="extract-info">
                    <div class="extract-name-row">
                      <div class="extract-name">{{ s.location }}</div>
                      <span v-if="s.time" class="tag">{{ s.time }}</span>
                    </div>
                    <div class="extract-meta wrap">{{ s.description || s.time || '等待补充场景描述' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Voice Assignment -->
        <div v-else-if="!isNarrationMode && scriptStep === 3" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">04</span>
                <span class="step-name">分配音色</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="charsVoiced" class="char-count">{{ charsVoiced }}/{{ chars.length }} 已分配</span>
              <span v-if="voiceSampleCount" class="char-count">{{ voiceSampleCount }}/{{ charsVoiced }} 试听文件</span>
              <button v-if="charsVoiced" class="btn btn-sm" @click="doVoice" :disabled="rn">
                <Loader2 v-if="rn && rt === 'voice_assigner'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                重新分配
              </button>
              <button v-if="charsVoiced" class="btn btn-sm" :disabled="isBatchRunning('voiceSamples')" @click="batchGenSamples">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19 5v14"/></svg>
                生成试听文件
              </button>
            </div>
          </div>

          <div v-if="!charsVoiced && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
            </div>
            <div class="empty-title">为角色分配合适的音色</div>
            <div class="empty-desc">AI 根据角色特征自动分配最匹配的 TTS 音色</div>
            <button class="btn btn-primary" @click="doVoice">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              AI 自动分配
            </button>
          </div>
          <div v-else-if="rn && rt === 'voice_assigner'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">正在分配音色...</div>
          </div>
          <div v-else class="voice-stage">
            <aside class="card voice-stage-panel">
              <div class="voice-stage-kicker">Voice Casting</div>
              <div class="voice-stage-title">角色声音分配台</div>
              <div class="voice-stage-desc">先为每个角色选择合适音色，再生成试听。音色标签会帮助你快速区分旁白、主角、反派和配角的表达方向。</div>
              <div class="voice-stage-stats">
                <div class="voice-stage-stat">
                  <span class="voice-stage-stat-label">已分配</span>
                  <strong>{{ charsVoiced }}/{{ chars.length }}</strong>
                </div>
                <div class="voice-stage-stat">
                  <span class="voice-stage-stat-label">试听文件</span>
                  <strong>{{ voiceSampleCount }}/{{ charsVoiced }}</strong>
                </div>
              </div>
              <div class="voice-library-meta">
                <span>音色库</span>
                <span>{{ voiceProfiles.length }} 条</span>
              </div>
              <div class="voice-library">
                <div v-for="voice in voiceProfiles" :key="voice.id" class="voice-library-item">
                  <div class="voice-library-head">
                    <span class="voice-library-name">{{ voice.label }}</span>
                    <span class="tag">{{ voice.gender }}</span>
                  </div>
                  <div class="voice-library-traits">{{ voice.traits }}</div>
                  <div class="voice-library-fit">{{ voice.suitable }}</div>
                </div>
              </div>
            </aside>

            <div class="voice-grid">
              <div v-for="c in chars" :key="c.id" class="card voice-card">
                <div class="voice-card-head">
                  <div class="voice-char">
                    <div class="char-avatar lg">{{ c.name?.[0] || '?' }}</div>
                    <div class="voice-name">
                      <div class="voice-name-row">
                        <div class="extract-name">{{ c.name }}</div>
                        <span class="tag" :class="(c.voice_style || c.voiceStyle) ? 'tag-success' : ''">{{ (c.voice_style || c.voiceStyle) ? '已分配' : '待分配' }}</span>
                      </div>
                      <div class="extract-meta">{{ c.role || '角色' }}</div>
                    </div>
                  </div>
                </div>

                <div class="voice-card-copy">
                  <div class="voice-card-text">{{ c.description || c.personality || c.appearance || '暂无角色描述，可根据人物定位手动挑选音色。' }}</div>
                </div>

                <div class="voice-select-block">
                  <span class="voice-block-label">选择音色</span>
                  <BaseSelect
                    :model-value="c.voice_style || c.voiceStyle || ''"
                    :options="voiceSelectOptions"
                    placeholder="选择音色"
                    searchable
                    style="width:100%"
                    @update:model-value="updateCharVoice(c.id, $event)"
                  />
                </div>

                <div v-if="getVoiceProfile(c.voice_style || c.voiceStyle)" class="voice-profile-card">
                  <div class="voice-profile-head">
                    <span class="voice-profile-name">{{ getVoiceProfile(c.voice_style || c.voiceStyle)?.label }}</span>
                    <span class="tag">{{ getVoiceProfile(c.voice_style || c.voiceStyle)?.gender }}</span>
                  </div>
                  <div class="voice-profile-traits">{{ getVoiceProfile(c.voice_style || c.voiceStyle)?.traits }}</div>
                  <div class="voice-profile-fit">{{ getVoiceProfile(c.voice_style || c.voiceStyle)?.suitable }}</div>
                </div>

                <div class="voice-actions-row">
                  <button class="btn btn-sm" :disabled="!(c.voice_style || c.voiceStyle)" @click="genSample(c.id)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    {{ (c.voice_sample_url || c.voiceSampleUrl) ? '重新试听' : '生成试听' }}
                  </button>
                  <span class="dim" style="font-size:11px">{{ (c.voice_sample_url || c.voiceSampleUrl) ? '已生成声音样本，可直接播放' : '生成后可快速确认角色声音' }}</span>
                </div>

                <div v-if="c.voice_sample_url || c.voiceSampleUrl" class="voice-player">
                  <audio :src="'/' + (c.voice_sample_url || c.voiceSampleUrl)" controls preload="none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Storyboard -->
        <div v-else-if="scriptStep === storyboardStep" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">{{ isNarrationMode ? '02' : '05' }}</span>
                <span class="step-name">{{ isNarrationMode ? '旁白分镜' : '分镜列表' }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="sbs.length" class="char-count">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
              <button v-if="sbs.length" class="btn btn-sm" @click="addShot">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                添加
              </button>
              <template v-if="!sbs.length && !isNarrationMode">
                <span class="locked-config">视频模型 · {{ lockedVideoConfigLabel }}</span>
              </template>
              <template v-if="isNarrationMode">
                <span class="tag dim" style="font-size:11px">旁白 TTS 分镜</span>
              </template>
              <button
                v-if="isNarrationMode"
                class="btn btn-sm"
                :disabled="narrationStoryboardDescUploading || narrationBreaking"
                title="上传 .txt 分镜描述：全文案按规则拆分，或【#01】格式逐镜填充"
                @click="triggerNarrationStoryboardDescUpload"
              >
                <Loader2 v-if="narrationStoryboardDescUploading" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                上传分镜描述
              </button>
              <button class="btn btn-sm" :disabled="rn || narrationBreaking" @click="isNarrationMode ? doNarrationBreakdown() : doBreakdown()">
                <Loader2 v-if="(rn && rt === 'storyboard_breaker') || narrationBreaking" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ sbs.length ? '重新分镜' : (isNarrationMode ? '旁白分镜' : 'AI 拆解分镜') }}
              </button>
            </div>
          </div>

          <div v-if="isNarrationMode && sbs.length && narrationStoryboardBreakdownPanel" class="narration-breakdown-panel">
            <div class="narration-breakdown-head">
              <div>
                <strong>旁白分镜结果</strong>
                <span v-if="narrationStoryboardBreakdownPanel.generatedAt" class="dim" style="font-size:11px;margin-left:8px">{{ formatBreakdownTime(narrationStoryboardBreakdownPanel.generatedAt) }}</span>
              </div>
              <span class="tag dim">旁白 TTS 分镜</span>
            </div>
            <div class="narration-breakdown-stats">
              <span class="tag mono">{{ narrationStoryboardBreakdownPanel.sentenceCount }} 句旁白</span>
              <span class="tag mono">{{ narrationStoryboardBreakdownPanel.count }} 镜</span>
              <span class="tag mono">约 {{ narrationStoryboardBreakdownPanel.totalDur }}s</span>
              <span v-if="narrationStoryboardBreakdownPanel.titleCount" class="tag">
                片头 {{ narrationStoryboardBreakdownPanel.titleCount }} 镜 · {{ narrationStoryboardBreakdownPanel.titleImageCount }} 张标题图
                <template v-if="narrationStoryboardBreakdownPanel.titleHook">（{{ narrationStoryboardBreakdownPanel.titleHook }}）</template>
              </span>
            </div>
            <div class="narration-breakdown-steps">
              <strong>下一步：</strong>
              ① 制作阶段完成「定妆参考」
              → ② 生成配音 → ③ <strong>配图分镜</strong> → ④ 生成配图 → ⑤ 镜头合成 → ⑥ 导出
            </div>
          </div>

          <div v-if="sbs.length" class="split-layout">
            <!-- Shot List -->
            <div class="shot-list">
              <div class="shot-list-head">
                <div>
                  <div class="shot-list-title">镜头序列</div>
                  <div class="shot-list-sub">点击镜头编辑台词；片头可「按标点拆成多镜」分成四段剧中红字</div>
                </div>
                <span class="tag mono">{{ totalDuration }}s</span>
              </div>
              <div class="shot-list-body">
                <div
                  v-for="(sb, i) in sbs"
                  :key="sb.id"
                  :class="['shot-item', { active: selectedSb?.id === sb.id }]"
                  @click="selectedSb = sb"
                >
                  <div class="shot-item-header">
                    <div class="shot-num">#{{ String(i+1).padStart(2,'0') }}</div>
                    <span v-if="isNarrationMode && isNarrationTitleShot(sb)" class="tag tag-title" style="font-size:10px">片头</span>
                    <span class="tag" style="font-size:10px">{{ sb.shot_type || sb.shotType || '—' }}</span>
                    <span v-if="getStoryboardCharacterIds(sb).length" class="tag" style="font-size:10px">{{ getStoryboardCharacterIds(sb).length }} 角色</span>
                    <div class="shot-status">
                      <div v-if="getStoryboardCover(sb)" class="shot-dot has-img" title="已生成图片"></div>
                      <div v-if="sb.videoUrl || sb.composedVideoUrl" class="shot-dot has-video" title="已生成视频"></div>
                      <div v-if="sb.dialogue" class="shot-dot has-dialogue" title="有对白"></div>
                    </div>
                  </div>
                  <div class="shot-body">
                    <div class="shot-desc">{{ sb.description || sb.title || '无描述' }}</div>
                  </div>
                  <div class="shot-meta">
                    <span class="mono dim" style="font-size:10px">{{ sb.duration || 10 }}s</span>
                    <span v-if="sb.location" class="shot-location">{{ sb.location }}</span>
                    <span v-if="getStoryboardCharacterNames(sb).length" class="shot-location">{{ getStoryboardCharacterNames(sb).join(' / ') }}</span>
                    <span v-if="sb.dialogue" class="shot-dialogue">{{ sb.dialogue }}</span>
                    <button v-if="isNarrationMode" class="btn btn-ghost btn-sm shot-edit-btn" @click.stop="openShotEditor(sb)">编辑</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Detail Panel -->
            <div class="detail-panel" v-if="selectedSb">
                <div class="detail-head">
                  <div class="detail-head-copy">
                    <span class="detail-head-title">镜头 #{{ sbs.indexOf(selectedSb) + 1 }}</span>
                  <span class="detail-head-sub">{{ selectedSb.title || `镜头 ${sbs.indexOf(selectedSb) + 1}` }} · {{ selectedSb.shot_type || selectedSb.shotType || '未设置景别' }}</span>
                  </div>
                  <span class="tag mono">{{ (selectedSb.duration || 10) }}s</span>
                  <button class="btn btn-ghost btn-icon ml-auto" style="color:var(--error)" @click="deleteShot(selectedSb)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                  </button>
                  <button v-if="isNarrationMode" class="btn btn-sm" @click="openShotEditor(selectedSb)">编辑镜头</button>
              </div>
              <div class="detail-body">
                <div v-if="isNarrationMode" class="detail-section narration-shot-edit">
                  <div class="detail-section-head">
                    <span class="detail-section-title">编辑镜头</span>
                    <span v-if="isNarrationTitleShot(selectedSb)" class="tag tag-title">片头 · 剧中红字</span>
                    <span v-else class="tag">旁白镜头</span>
                  </div>
                  <label class="field">
                    <span class="field-label">{{ isNarrationTitleShot(selectedSb) ? '剧中台词（合成红字）' : '旁白台词' }}</span>
                    <textarea v-model="narrationEditDialogue" class="textarea" rows="4" :placeholder="isNarrationTitleShot(selectedSb) ? '多句用逗号或换行分隔，可点下方拆成多镜' : '旁白：…'" />
                  </label>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">时长（秒）</span>
                      <input v-model.number="narrationEditDuration" class="input" type="number" min="1" max="60" />
                    </label>
                    <label class="field">
                      <span class="field-label">类型</span>
                      <select v-model="narrationEditAsTitle" class="input">
                        <option :value="true">片头（剧中红字）</option>
                        <option :value="false">正文旁白</option>
                      </select>
                    </label>
                  </div>
                  <div class="narration-shot-edit-actions">
                    <button class="btn btn-sm btn-primary" :disabled="narrationEditBusy" @click="saveNarrationShotDetail(false)">保存</button>
                    <button class="btn btn-sm" :disabled="narrationEditBusy" @click="splitShotByPunctuation(selectedSb)">按标点拆成多镜</button>
                    <button class="btn btn-sm" :disabled="narrationEditBusy" @click="insertShotAfter(selectedSb)">后插镜头</button>
                  </div>
                  <p class="dim" style="font-size:11px;margin:0">
                    例：把片头一句拆四镜 — 台词写「今天体验的人生剧本是，18岁职高辍学打工，省吃俭用五年，结果越来越穷」→ 点「按标点拆成多镜」。
                  </p>
                </div>
                <template v-if="!isNarrationMode">
                <div class="detail-hero">
                  <div class="detail-hero-copy">
                    <div class="detail-hero-label">镜头概览</div>
                    <div class="detail-hero-text">{{ selectedSb.description || selectedSb.title || '当前镜头还没有画面描述，建议先补充核心动作和构图。' }}</div>
                    <div class="detail-status-row">
                      <span class="tag">{{ getSceneName(selectedSb) }}</span>
                      <span class="tag">{{ selectedSb.angle || '未设角度' }}</span>
                      <span class="tag">{{ selectedSb.movement || '未设运镜' }}</span>
                      <span class="tag" :class="getFirstFrame(selectedSb) ? 'tag-success' : ''">首帧 {{ getFirstFrame(selectedSb) ? '已生成' : '待生成' }}</span>
                      <span class="tag" :class="getLastFrame(selectedSb) ? 'tag-success' : ''">尾帧 {{ getLastFrame(selectedSb) ? '已生成' : '待生成' }}</span>
                      <span class="tag" :class="hasVid(selectedSb) ? 'tag-success' : ''">视频 {{ hasVid(selectedSb) ? '已生成' : '待生成' }}</span>
                    </div>
                  </div>
                  <div class="detail-preview-grid">
                    <div class="detail-preview-card">
                      <div class="detail-preview-title">首帧</div>
                      <div class="detail-preview-media">
                        <img
                          v-if="getFirstFrame(selectedSb)"
                          :src="'/' + getFirstFrame(selectedSb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getFirstFrame(selectedSb), `镜头 #${sbs.indexOf(selectedSb) + 1} 首帧`)"
                        />
                        <div v-else class="detail-preview-empty">待生成</div>
                      </div>
                    </div>
                    <div class="detail-preview-card">
                      <div class="detail-preview-title">尾帧</div>
                      <div class="detail-preview-media">
                        <img
                          v-if="getLastFrame(selectedSb)"
                          :src="'/' + getLastFrame(selectedSb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getLastFrame(selectedSb), `镜头 #${sbs.indexOf(selectedSb) + 1} 尾帧`)"
                        />
                        <div v-else class="detail-preview-empty">待生成</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">镜头结构</span>
                    <span class="detail-section-copy">景别、角度、运镜、场景绑定和时长</span>
                  </div>
                  <div class="field-grid field-grid-4">
                    <label class="field">
                      <span class="field-label">标题</span>
                      <input :value="selectedSb.title || ''" class="input"
                        @blur="updateField(selectedSb, 'title', $event.target.value)" placeholder="如：雪地逼近" />
                    </label>
                    <label class="field">
                      <span class="field-label">景别</span>
                      <input
                        list="shot-type-list"
                        :value="selectedSb.shot_type || selectedSb.shotType || ''"
                        class="input"
                        placeholder="选择或输入景别"
                        @change="updateField(selectedSb, 'shot_type', $event.target.value)"
                      />
                      <datalist id="shot-type-list">
                        <option v-for="t in shotTypes" :key="t" :value="t" />
                      </datalist>
                    </label>
                    <label class="field">
                      <span class="field-label">角度</span>
                      <input
                        list="shot-angle-list"
                        :value="selectedSb.angle || ''"
                        class="input"
                        placeholder="选择或输入角度"
                        @change="updateField(selectedSb, 'angle', $event.target.value)"
                      />
                      <datalist id="shot-angle-list">
                        <option v-for="t in shotAngles" :key="t" :value="t" />
                      </datalist>
                    </label>
                    <label class="field">
                      <span class="field-label">运镜</span>
                      <input
                        list="shot-movement-list"
                        :value="selectedSb.movement || ''"
                        class="input"
                        placeholder="选择或输入运镜"
                        @change="updateField(selectedSb, 'movement', $event.target.value)"
                      />
                      <datalist id="shot-movement-list">
                        <option v-for="t in shotMovements" :key="t" :value="t" />
                      </datalist>
                    </label>
                  </div>
                  <div class="field-grid field-grid-4">
                    <label class="field">
                      <span class="field-label">绑定角色</span>
                      <div class="role-pills">
                        <button
                          v-for="char in chars"
                          :key="char.id"
                          type="button"
                          :class="['role-pill', { active: isStoryboardCharacterSelected(selectedSb, char.id) }]"
                          @click="toggleStoryboardCharacter(selectedSb, char.id)"
                        >
                          {{ char.name }}
                        </button>
                        <span v-if="!chars.length" class="dim" style="font-size:12px">当前集还没有角色</span>
                      </div>
                    </label>
                    <label class="field">
                      <span class="field-label">绑定场景</span>
                      <select class="input" :value="selectedSb.scene_id || selectedSb.sceneId || ''"
                        @change="updateField(selectedSb, 'scene_id', $event.target.value ? Number($event.target.value) : null)">
                        <option value="">未绑定场景</option>
                        <option v-for="scene in scenes" :key="scene.id" :value="scene.id">
                          {{ scene.location }} · {{ scene.time || '未设时间' }}
                        </option>
                      </select>
                    </label>
                    <label class="field">
                      <span class="field-label">地点</span>
                      <input :value="selectedSb.location || ''" class="input"
                        @blur="updateField(selectedSb, 'location', $event.target.value)" placeholder="场景地点" />
                    </label>
                    <label class="field">
                      <span class="field-label">时间</span>
                      <input :value="selectedSb.time || ''" class="input"
                        @blur="updateField(selectedSb, 'time', $event.target.value)" placeholder="如：深夜 / 清晨" />
                    </label>
                    <label class="field">
                      <span class="field-label">时长</span>
                      <input :value="selectedSb.duration || 10" class="input" type="number" min="1" max="60"
                        @blur="updateField(selectedSb, 'duration', Number($event.target.value))" />
                    </label>
                  </div>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">画面语义</span>
                    <span class="detail-section-copy">动作、结果、氛围和对白</span>
                  </div>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">动作</span>
                      <textarea :value="selectedSb.action || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'action', $event.target.value)" placeholder="谁在做什么，表情和动作细节是什么" />
                    </label>
                    <label class="field">
                      <span class="field-label">结果</span>
                      <textarea :value="selectedSb.result || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'result', $event.target.value)" placeholder="镜头结束时的状态变化或画面结果" />
                    </label>
                  </div>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">画面描述</span>
                      <textarea :value="selectedSb.description || ''" class="textarea" rows="4"
                        @blur="updateField(selectedSb, 'description', $event.target.value)" placeholder="描述画面内容..." />
                    </label>
                    <label class="field">
                      <span class="field-label">氛围</span>
                      <textarea :value="selectedSb.atmosphere || ''" class="textarea" rows="4"
                        @blur="updateField(selectedSb, 'atmosphere', $event.target.value)" placeholder="光线、色调、空气感、环境氛围" />
                    </label>
                  </div>
                  <label class="field">
                    <span class="field-label">对白 / 旁白</span>
                    <textarea :value="selectedSb.dialogue || ''" class="textarea" rows="3"
                      @blur="updateField(selectedSb, 'dialogue', $event.target.value)" placeholder="角色名：台词内容 或 旁白：内容" />
                  </label>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">生成提示</span>
                    <span class="detail-section-copy">分别服务图片、视频、配乐和音效生成</span>
                  </div>
                  <label class="field">
                    <span class="field-label">静态画面提示词</span>
                    <textarea :value="selectedSb.image_prompt || selectedSb.imagePrompt || ''" class="textarea" rows="4"
                      @blur="updateField(selectedSb, 'image_prompt', $event.target.value)" placeholder="用于首帧、尾帧和镜头图片的单帧画面提示词" />
                  </label>
                  <label class="field">
                    <span class="field-label">视频提示词</span>
                    <textarea :value="selectedSb.video_prompt || selectedSb.videoPrompt || ''" class="textarea" rows="5"
                      @blur="updateField(selectedSb, 'video_prompt', $event.target.value)" placeholder="按 3 秒分段的视频提示词..." />
                  </label>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">配乐提示词</span>
                      <textarea :value="selectedSb.bgm_prompt || selectedSb.bgmPrompt || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'bgm_prompt', $event.target.value)" placeholder="如：压抑低频弦乐，缓慢推进" />
                    </label>
                    <label class="field">
                      <span class="field-label">音效提示词</span>
                      <textarea :value="selectedSb.sound_effect || selectedSb.soundEffect || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'sound_effect', $event.target.value)" placeholder="如：风雪声、脚踩积雪、衣料摩擦声" />
                    </label>
                  </div>
                </div>
                </template>
              </div>
            </div>
          </div>

          <div v-else-if="(rn && rt === 'storyboard_breaker') || narrationBreaking" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">{{ isNarrationMode ? '正在按规则拆分旁白分镜...' : '正在拆解分镜并生成提示词...' }}</div>
          </div>

          <div v-else class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/>
              </svg>
            </div>
            <div class="empty-title">{{ isNarrationMode ? '将解说文案拆解为旁白镜头' : '将剧本拆解为分镜序列' }}</div>
            <div class="empty-desc">{{ isNarrationMode ? '按标点拆分旁白（。，、；等）；片头写「标题：」后按句拆镜，合成时剧中红字逐句显示' : 'AI 自动分析剧本，生成镜头列表和视频提示词' }}</div>
            <div v-if="!isNarrationMode" class="locked-config-banner">当前集视频模型：{{ lockedVideoConfigLabel }}</div>
            <div v-if="isNarrationMode" class="narration-hint" style="margin:10px 0">
              <strong>旁白分镜：</strong>按标点拆分旁白，一句一镜（TTS 粒度）。配图段落与配图文案请在制作阶段单独执行「配图分镜」。
            </div>
            <div v-if="isNarrationMode" style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              <span class="tag">旁白 TTS 分镜</span>
            </div>
            <div v-if="isNarrationMode" class="step-empty-actions" style="margin-bottom:10px">
              <button class="btn" :disabled="narrationStoryboardDescUploading || narrationBreaking" @click="triggerNarrationStoryboardDescUpload">
                <Loader2 v-if="narrationStoryboardDescUploading" :size="13" class="animate-spin" />
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                上传分镜描述
              </button>
            </div>
            <button class="btn btn-primary" :disabled="narrationBreaking" @click="isNarrationMode ? doNarrationBreakdown() : doBreakdown()">
              <Loader2 v-if="(rn && rt === 'storyboard_breaker') || narrationBreaking" :size="13" class="animate-spin" />
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ isNarrationMode ? (sbs.length ? '重新分镜' : '旁白分镜') : 'AI 拆解分镜' }}
            </button>
          </div>
        </div>

      </div>

      <!-- ===== PRODUCTION PANEL ===== -->
      <div v-else-if="panel === 'production'" class="content-panel">
        <!-- Guard: need script -->
        <div v-if="!scriptContent || !sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <div class="empty-title">尚未准备就绪</div>
          <div class="empty-desc">{{ !scriptContent ? '请先完成剧本编写' : '请先完成分镜拆解' }}</div>
          <button class="btn btn-primary" @click="panel = 'script'">前往剧本</button>
        </div>

        <template v-else>
          <div class="step-toolbar prod-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <span class="step-name">制作工作台</span>
              </div>
            </div>
            <div class="prod-tabs">
              <button
                v-for="t in prodTabDefs"
                :key="t.id"
                :class="['prod-tab', { active: prodTab === t.id }]"
                @click="prodTab = t.id"
              >
                <component :is="t.icon" :size="11" />
                {{ t.label }}
                <span v-if="t.badge" class="prod-tab-badge">{{ t.badge }}</span>
              </button>
            </div>
          </div>

          <div v-if="showTextModelPicker" class="prod-image-model-bar">
            <span class="dim" style="font-size:12px">文本模型</span>
            <BaseSelect
              :model-value="episodeTextModel"
              :options="textModelOptions"
              placeholder="选择文本模型"
              searchable
              style="width:360px"
              @update:model-value="onEpisodeTextModelChange"
            />
            <div v-if="episodeTextModelSupportsThinking" class="text-thinking-toggle">
              <span class="dim" style="font-size:12px">思考模式</span>
              <div class="prod-tabs text-thinking-tabs">
                <button
                  type="button"
                  class="prod-tab"
                  :class="{ active: episodeTextThinking }"
                  @click="setEpisodeTextThinking(true)"
                >开</button>
                <button
                  type="button"
                  class="prod-tab"
                  :class="{ active: !episodeTextThinking }"
                  @click="setEpisodeTextThinking(false)"
                >关</button>
              </div>
            </div>
            <div v-if="showReferPreviousEpisodeToggle" class="text-thinking-toggle">
              <span class="dim" style="font-size:12px">参照上集</span>
              <div class="prod-tabs text-thinking-tabs">
                <button
                  type="button"
                  class="prod-tab"
                  :class="{ active: referPreviousEpisode }"
                  @click="setReferPreviousEpisode(true)"
                >开</button>
                <button
                  type="button"
                  class="prod-tab"
                  :class="{ active: !referPreviousEpisode }"
                  @click="setReferPreviousEpisode(false)"
                >关</button>
              </div>
            </div>
            <span class="tag">拆镜 / 配图文案 / 角色提取</span>
          </div>

          <div v-if="showImageModelPicker" class="prod-image-model-bar">
            <span class="dim" style="font-size:12px">{{ prodTab === 'chars' ? '定妆/配图模型' : '配图模型' }}</span>
            <BaseSelect
              :model-value="episodeImageModel"
              :options="imageModelOptions"
              placeholder="选择配图模型"
              searchable
              style="width:300px"
              @update:model-value="onEpisodeImageModelChange"
            />
            <span class="tag">{{ lockedImageConfigLabel }}</span>
            <span v-if="imageModelSupportsReferenceImages(episodeImageModel)" class="tag tag-success">支持定妆参考图</span>
          </div>

          <div v-if="showBgmModelPicker" class="prod-image-model-bar">
            <span class="dim" style="font-size:12px">BGM 模型</span>
            <BaseSelect
              :model-value="bgmModel"
              :options="bgmModelOptions"
              placeholder="选择 BGM 模型"
              style="width:320px"
              @update:model-value="bgmModel = $event"
            />
            <span class="tag">{{ bgmModelLabel(bgmModel) }}</span>
            <span v-if="bgmModel === 'pixverse-sound-effect'" class="tag tag-accent">需关联已合成镜头</span>
          </div>

          <!-- Sub: Narrator Voice (narration mode) -->
          <div v-if="prodTab === 'voice'" class="prod-content">
            <div class="narration-hint">
              <strong>旁白音色：</strong>使用 MiniMax 等 API 时需在此选择旁白音色。若已在「生成配音」勾选<strong>本地配音（Edge TTS）</strong>，可直接跳过本步。
            </div>
            <div class="card" style="padding:16px;max-width:520px">
              <label class="field">
                <span class="field-label">旁白音色</span>
                <BaseSelect :model-value="narratorVoiceId" :options="voiceSelectOptions" placeholder="选择旁白音色" searchable style="width:100%" @update:model-value="onNarratorVoiceChange" />
              </label>
              <div v-if="getVoiceProfile(narratorVoiceId)" class="voice-profile-card" style="margin-top:12px">
                <div class="voice-profile-head">
                  <span class="voice-profile-name">{{ getVoiceProfile(narratorVoiceId)?.label }}</span>
                  <span class="tag">{{ getVoiceProfile(narratorVoiceId)?.gender }}</span>
                </div>
                <div class="voice-profile-traits">{{ getVoiceProfile(narratorVoiceId)?.traits }}</div>
              </div>
              <button class="btn btn-primary" style="margin-top:14px" :disabled="!narratorVoiceId" @click="saveNarratorVoice">
                保存旁白音色
              </button>
            </div>
          </div>

          <!-- Sub: Characters -->
          <div v-else-if="prodTab === 'chars'" class="prod-content">
            <div v-if="isNarrationMode" class="narration-hint">
              <strong>定妆参考：</strong>从解说文案提取会在画面出现的角色；若文案含不同年龄/时期，会<strong>自动拆成多条定妆</strong>。中年/老年会以青年定妆作参考。顶部可<strong>一键复制/上传全部</strong>定妆。
            </div>
            <div v-if="isNarrationMode" class="prod-image-model-bar" style="margin-bottom:12px">
              <span class="dim" style="font-size:12px">项目画风</span>
              <span class="tag tag-success">{{ artStyleLabel(drama?.style) }}</span>
            </div>
            <div v-if="isNarrationMode && !visualChars.length && !narrationExtracting" class="step-empty">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div class="empty-title">从解说文案提取主角定妆</div>
              <div class="empty-desc">解说素体模式只需主人公的多阶段定妆（青年/中年/老年等），配角无需单独提取</div>
              <div class="step-empty-actions">
                <button class="btn btn-primary" :disabled="!localRaw.trim() && !rawContent" @click="doExtractNarrationCharacters">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  提取主角定妆
                </button>
                <button class="btn" @click="addNarrationCharacter">手动添加</button>
              </div>
            </div>
            <div v-else-if="isNarrationMode && narrationExtracting" class="step-loading">
              <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
              <div class="loading-text">正在从文案提取角色设定...</div>
            </div>
            <template v-else>
            <div v-if="isNarrationMode" class="prod-image-model-bar" style="margin-bottom:12px">
              <span class="dim" style="font-size:12px">文本模型</span>
              <BaseSelect
                :model-value="episodeTextModel"
                :options="textModelOptions"
                placeholder="选择文本模型"
                searchable
                style="width:360px"
                @update:model-value="onEpisodeTextModelChange"
              />
              <div v-if="episodeTextModelSupportsThinking" class="text-thinking-toggle">
                <span class="dim" style="font-size:12px">思考模式</span>
                <div class="prod-tabs text-thinking-tabs">
                  <button
                    type="button"
                    class="prod-tab"
                    :class="{ active: episodeTextThinking }"
                    @click="setEpisodeTextThinking(true)"
                  >开</button>
                  <button
                    type="button"
                    class="prod-tab"
                    :class="{ active: !episodeTextThinking }"
                    @click="setEpisodeTextThinking(false)"
                  >关</button>
                </div>
              </div>
              <span class="tag">角色提取 / AI 外貌描述</span>
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ visualChars.length }} 个需生成形象角色</span>
              <span v-if="chars.length > visualChars.length" class="tag">旁白仅保留声音</span>
              <div class="ml-auto flex gap-1">
                <button v-if="isNarrationMode && visualChars.length" class="btn btn-sm" :disabled="narrationExtracting" @click="doExtractNarrationCharacters">重新提取</button>
                <button v-if="isNarrationMode" class="btn btn-sm" @click="addNarrationCharacter">添加角色</button>
                <button class="btn btn-sm" :disabled="!visualChars.length" @click="copyAllCharPortraitPrompts">一键复制全部描述词</button>
                <button class="btn btn-sm" :disabled="!visualChars.length" @click="triggerAllCharImageUpload">一键上传全部（{{ visualChars.length }}）</button>
                <button class="btn btn-sm" :disabled="isBatchRunning('charImages') || !charImagesPendingCount" @click="batchCharImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  生成剩余{{ charImagesPendingCount ? ` (${charImagesPendingCount})` : '' }}
                </button>
              </div>
            </div>
            <div class="asset-grid">
              <div v-for="c in visualChars" :key="c.id" class="card asset-card">
                <div class="asset-cover">
                  <img
                    v-if="c.image_url || c.imageUrl"
                    :src="'/' + (c.image_url || c.imageUrl)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + (c.image_url || c.imageUrl), `${c.name} 角色形象`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (isPendingCharImage(c.id) ? 'is-pending' : '')">{{ (c.image_url || c.imageUrl) ? '已生成' : (isPendingCharImage(c.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="asset-body">
                  <div class="asset-name">{{ formatCharacterDisplayName(c) }}</div>
                  <div class="asset-meta dim">{{ c.role || '角色' }}</div>
                  <textarea
                    class="textarea"
                    rows="3"
                    style="margin-top:8px;font-size:11px"
                    :value="c.appearance || ''"
                    placeholder="外貌描述：年龄、发型、服装、体型…"
                    @change="updateCharacterAppearance(c.id, $event.target.value)"
                  />
                  <button
                    class="btn btn-sm"
                    style="margin-top:6px"
                    :disabled="isPendingCharAppearance(c.id)"
                    @click="generateCharAppearance(c.id)"
                  >{{ isPendingCharAppearance(c.id) ? 'AI 生成中…' : 'AI 生成描述' }}</button>
                  <button
                    v-if="imageModelSupportsReferenceImages(episodeImageModel)"
                    class="btn btn-sm"
                    style="margin-top:6px"
                    :class="{ 'btn-primary': isCharPortraitUseReference(c.id) }"
                    :title="isCharPortraitUseReference(c.id) ? '使用同角色已有定妆作参考（自动选最合适形态）' : '纯文生图，不使用参考图'"
                    @click="toggleCharPortraitUseReference(c.id)"
                  >{{ isCharPortraitUseReference(c.id) ? '✓ 参考图' : '参考图' }}</button>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (c.image_url || c.imageUrl) && 'ok', isPendingCharImage(c.id) && 'pending']" />
                  <span class="dim" style="font-size:10px">{{ (c.image_url || c.imageUrl) ? '已生成' : (isPendingCharImage(c.id) ? '生成中' : '待生成') }}</span>
                  <button class="btn btn-sm ml-auto" :disabled="isPendingCharImage(c.id)" @click="genCharImg(c.id)">{{ isPendingCharImage(c.id) ? '生成中' : '生成' }}</button>
                  <button
                    v-if="c.image_url || c.imageUrl"
                    class="btn btn-sm"
                    :disabled="isPendingCharRecognize(c.id)"
                    @click="recognizeCharPortrait(c.id)"
                  >{{ isPendingCharRecognize(c.id) ? '识图中' : '识图' }}</button>
                </div>
              </div>
            </div>
            </template>
          </div>

          <!-- Sub: Scenes -->
          <div v-else-if="prodTab === 'scenes'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ scenes.length }} 个场景</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="isBatchRunning('sceneImages') || !sceneImagesPendingCount" @click="batchSceneImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  生成剩余{{ sceneImagesPendingCount ? ` (${sceneImagesPendingCount})` : '' }}
                </button>
              </div>
            </div>
            <div class="asset-grid">
              <div v-for="s in scenes" :key="s.id" class="card asset-card">
                <div class="asset-cover wide">
                  <img
                    v-if="s.image_url || s.imageUrl"
                    :src="'/' + (s.image_url || s.imageUrl)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + (s.image_url || s.imageUrl), `${s.location} 场景图`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(s.image_url || s.imageUrl) ? 'is-ready' : (isPendingSceneImage(s.id) ? 'is-pending' : '')">{{ (s.image_url || s.imageUrl) ? '已生成' : (isPendingSceneImage(s.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="asset-body">
                  <div class="asset-name">{{ s.location }}</div>
                  <div class="asset-meta dim">{{ s.time || '—' }}</div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (s.image_url || s.imageUrl) && 'ok', isPendingSceneImage(s.id) && 'pending']" />
                  <span class="dim" style="font-size:10px">{{ (s.image_url || s.imageUrl) ? '已生成' : (isPendingSceneImage(s.id) ? '生成中' : '待生成') }}</span>
                  <button class="btn btn-sm ml-auto" :disabled="isPendingSceneImage(s.id)" @click="genSceneImg(s.id)">{{ isPendingSceneImage(s.id) ? '生成中' : '生成' }}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Dubbing -->
          <div v-else-if="prodTab === 'dubbing'" class="prod-content">
            <div v-if="isNarrationMode" class="narration-hint">
              <strong>配音策略：</strong>先<strong>上传 MP3</strong>（可多段），确认无误后点<strong>按文案裁剪</strong>。Whisper 字幕仅作预览参考（常有错字）；<strong>裁剪按分镜旁白字数在音频总时长上比例切分</strong>，相同音频再次裁剪将复用已生成的 SRT。
            </div>
            <div v-else class="narration-hint">
              <strong>配音策略：</strong>先上传 MP3，再点「按文案裁剪」分配到各镜台词；或逐镜上传 / TTS 生成。
            </div>
            <div class="uploaded-audio-panel" :class="{ 'is-empty': !uploadedEpisodeAudio.length }">
              <div class="uploaded-audio-head">
                <span class="tag mono">已上传 {{ uploadedEpisodeAudio.length }} 段</span>
                <span v-if="ttsEligibleCount" class="dim" style="font-size:11px">
                  可多选或分多次添加 · 裁剪按字数比例切分时长
                </span>
                <div class="ml-auto flex gap-1">
                  <button
                    class="btn btn-sm"
                    type="button"
                    :disabled="narrationAudioUploading || !ttsEligibleCount"
                    @click="triggerEpisodeNarrationAudioUpload(false)"
                  >
                    {{ narrationAudioUploading ? '上传中…' : (uploadedEpisodeAudio.length ? '继续添加 MP3' : '添加 MP3（可多选）') }}
                  </button>
                  <button
                    v-if="uploadedEpisodeAudio.length"
                    class="btn btn-sm"
                    type="button"
                    @click="clearUploadedEpisodeAudio"
                  >
                    清空
                  </button>
                </div>
              </div>
              <div v-if="!uploadedEpisodeAudio.length" class="uploaded-audio-empty dim">
                尚未添加音频。可一次多选或分多次追加；裁剪时按各镜旁白字数占全文比例划分音频时间轴。
              </div>
              <div v-else class="uploaded-audio-list">
                <div v-for="(file, idx) in uploadedEpisodeAudio" :key="file.path" class="uploaded-audio-item">
                  <span class="uploaded-audio-idx">#{{ String(idx + 1).padStart(2, '0') }}</span>
                  <div class="uploaded-audio-copy">
                    <div class="uploaded-audio-name" :title="file.name">{{ file.name }}</div>
                    <audio
                      :src="getUploadedAudioUrl(file.path)"
                      controls
                      preload="metadata"
                      class="uploaded-audio-player"
                    />
                  </div>
                  <button class="btn btn-sm" type="button" title="移除" @click="removeUploadedEpisodeAudio(idx)">移除</button>
                </div>
              </div>
            </div>
            <div v-if="uploadedEpisodeAudio.length" class="narration-srt-panel">
              <div class="narration-srt-head">
                <button
                  class="narration-srt-panel-toggle"
                  type="button"
                  :title="narrationSrtPanelOpen ? '收起字幕预览' : '展开字幕预览'"
                  @click="narrationSrtPanelOpen = !narrationSrtPanelOpen"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: narrationSrtPanelOpen ? 'rotate(90deg)' : 'rotate(0deg)' }">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <span class="tag mono">Whisper 字幕 · {{ narrationSrtFiles.length ? `${narrationSrtFiles.length} 份` : '未生成' }}</span>
                <span v-if="narrationSrtFiles.length" class="dim" style="font-size:11px">
                  共 {{ narrationSrtCueCount }} 条 · 裁剪前可先核对转写内容
                </span>
                <div class="ml-auto flex gap-1">
                  <button
                    class="btn btn-sm"
                    type="button"
                    :disabled="narrationSrtPreviewing || narrationAudioSplitting"
                    @click="previewNarrationSrt"
                  >
                    {{ narrationSrtPreviewing ? '转写中…' : (narrationSrtFiles.length ? '重新转写' : '预览转写字幕') }}
                  </button>
                  <button
                    v-if="narrationSrtFiles.length"
                    class="btn btn-sm"
                    type="button"
                    @click="clearNarrationSrtFiles"
                  >
                    清空字幕
                  </button>
                </div>
              </div>
              <div v-if="narrationSrtPanelOpen">
              <div v-if="!narrationSrtFiles.length" class="narration-srt-empty dim">
                上传 MP3 后点「预览转写字幕」查看 Whisper 转写（常有错字，仅供参考）；列表中「分镜文案」列为按字数比例对应的正确旁白。
              </div>
              <div v-else class="narration-srt-list">
                <div
                  v-for="(file, fi) in narrationSrtFiles"
                  :key="file.srt_path || file.srtPath || fi"
                  class="narration-srt-file"
                  :class="{ 'is-expanded': expandedSrtIndex === fi }"
                >
                  <button class="narration-srt-file-head" type="button" @click="toggleSrtExpand(fi)">
                    <span class="narration-srt-file-title">
                      #{{ String(fi + 1).padStart(2, '0') }} · {{ getSrtAudioName(file) }}
                    </span>
                    <span class="tag">{{ file.subtitle_count ?? file.subtitleCount ?? (file.cues?.length || 0) }} 条</span>
                    <span v-if="file.cached" class="tag tag-success">缓存</span>
                    <a
                      class="btn btn-sm"
                      :href="getSrtDownloadUrl(file.srt_path || file.srtPath)"
                      download
                      @click.stop
                    >
                      下载 SRT
                    </a>
                  </button>
                  <div v-if="expandedSrtIndex === fi" class="narration-srt-body">
                    <div class="narration-srt-view-tabs">
                      <button
                        class="btn btn-sm"
                        type="button"
                        :class="{ 'btn-primary': srtViewMode === 'table' }"
                        @click="srtViewMode = 'table'"
                      >
                        列表
                      </button>
                      <button
                        class="btn btn-sm"
                        type="button"
                        :class="{ 'btn-primary': srtViewMode === 'raw' }"
                        @click="srtViewMode = 'raw'"
                      >
                        原始 SRT
                      </button>
                    </div>
                    <div v-if="file.spoken_text || file.spokenText" class="narration-srt-spoken dim">
                      全文：{{ file.spoken_text || file.spokenText }}
                    </div>
                    <table v-if="srtViewMode === 'table'" class="narration-srt-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>时间</th>
                          <th>Whisper 转写</th>
                          <th v-if="hasSrtScriptColumn(file)">分镜文案</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="cue in file.cues || []" :key="`${cue.index}-${cue.start}`">
                          <td class="mono">{{ cue.index }}</td>
                          <td class="mono narration-srt-time">
                            {{ cue.start_label || cue.startLabel }} → {{ cue.end_label || cue.endLabel }}
                          </td>
                          <td class="narration-srt-whisper">{{ cue.text }}</td>
                          <td v-if="hasSrtScriptColumn(file)" class="narration-srt-script">
                            {{ cue.script_text || cue.scriptText || '—' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <pre v-else class="narration-srt-raw">{{ formatSrtRaw(file) }}</pre>
                  </div>
                </div>
              </div>
              </div>
            </div>
            <div v-if="isNarrationMode" class="local-tts-bar">
              <label class="local-tts-toggle">
                <input v-model="localTtsEnabled" type="checkbox" />
                <span>本地配音（免 API）</span>
              </label>
              <BaseSelect
                v-if="localTtsEnabled"
                :model-value="localTtsEngine"
                :options="localTtsEngineOptions"
                placeholder="选择引擎"
                style="min-width:160px"
                @update:model-value="localTtsEngine = $event"
              />
              <BaseSelect
                v-if="localTtsEnabled"
                :model-value="localTtsSpeed"
                :options="localTtsSpeedOptions"
                placeholder="语速"
                style="min-width:120px"
                @update:model-value="localTtsSpeed = Number($event) || DEFAULT_TTS_SPEED"
              />
              <BaseSelect
                v-if="localTtsEnabled"
                :model-value="localEdgeVoiceId"
                :options="edgeVoiceSelectOptions"
                :placeholder="localTtsEngine === 'voicebox' ? '选择 Voicebox 音色' : '选择本地音色'"
                searchable
                style="min-width:220px"
                @update:model-value="localEdgeVoiceId = $event"
              />
              <BaseSelect
                v-if="localTtsEnabled && localTtsEngine === 'voicebox'"
                :model-value="localVoiceboxModelSize"
                :options="voiceboxModelSizeOptions"
                placeholder="模型规格"
                style="min-width:150px"
                @update:model-value="localVoiceboxModelSize = $event"
              />
              <BaseSelect
                v-if="localTtsEnabled && localTtsEngine === 'voicebox'"
                :model-value="localVoiceboxInstructPreset"
                :options="voiceboxInstructOptions"
                placeholder="风格/感情"
                style="min-width:140px"
                @update:model-value="localVoiceboxInstructPreset = $event"
              />
              <input
                v-if="localTtsEnabled && localTtsEngine === 'voicebox' && localVoiceboxInstructPreset === VOICEBOX_INSTRUCT_CUSTOM"
                v-model="localVoiceboxInstructCustom"
                class="input"
                type="text"
                placeholder="如：沉稳有感情，语速适中"
                style="min-width:200px;max-width:280px"
                @change="persistLocalTtsPrefs"
              />
              <button
                v-if="localTtsEnabled"
                class="btn btn-sm"
                type="button"
                :disabled="localTtsPreviewing || !localEdgeVoiceId || (localTtsEngine === 'voicebox' && !voiceboxAvailable) || (localTtsEngine === 'voicebox' && !selectedVoiceboxVoiceReady())"
                @click="previewLocalTtsVoice()"
              >
                {{ localTtsPreviewing ? '试听生成中…' : '试听' }}
              </button>
              <audio
                v-if="localTtsEnabled && localTtsPreviewSrc"
                :key="localTtsPreviewSrc"
                :src="localTtsPreviewSrc"
                controls
                preload="metadata"
                class="local-tts-preview-player"
              />
              <span v-if="localTtsEnabled && localTtsEngine === 'voicebox' && voiceboxAvailable" class="tag ok">Voicebox 已连接</span>
              <span v-else-if="localTtsEnabled && localTtsEngine === 'voicebox' && !voiceboxAvailable" class="tag warn">Voicebox 未运行</span>
              <span v-else-if="!localTtsEnabled" class="tag warn">将使用付费 API：{{ lockedAudioConfigLabel }}</span>
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ ttsEligibleCount }} 条旁白</span>
              <span class="tag mono">{{ ttsGeneratedCount }}/{{ ttsEligibleCount }} 已就绪</span>
              <span v-if="localTtsEnabled" class="tag">{{ localTtsEngineLabel }} · {{ localTtsSpeedLabel }}{{ localVoiceboxModelSizeLabel ? ` · ${localVoiceboxModelSizeLabel}` : '' }}{{ localVoiceboxInstructLabel ? ` · ${localVoiceboxInstructLabel}` : '' }}</span>
              <span v-else class="tag">{{ lockedAudioConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="narrationAudioSplitting || !uploadedEpisodeAudio.length || !ttsEligibleCount"
                  @click="splitEpisodeNarrationAudio"
                >
                  {{ narrationAudioSplitting ? '裁剪中…' : `按文案裁剪（${uploadedEpisodeAudio.length} 段）` }}
                </button>
                <button class="btn btn-sm btn-primary" :disabled="isBatchRunning('tts') || !ttsPendingCount" @click="batchShotTTS">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                  生成剩余{{ ttsPendingCount ? ` (${ttsPendingCount})` : '' }}
                </button>
                <button class="btn btn-sm" :disabled="isBatchRunning('tts') || !ttsEligibleCount" @click="batchShotTTSAll">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  全部生成
                </button>
              </div>
            </div>

            <div v-if="!ttsEligibleCount" class="step-empty" style="min-height:260px">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              </div>
              <div class="empty-title">当前没有可生成的配音</div>
              <div class="empty-desc">先在分镜里填写“角色名：台词”或“旁白：文案”，这里就会出现待生成的语音镜头。</div>
            </div>

            <div v-else class="dub-grid">
                <div v-for="(sb, i) in sbs.filter(hasDialogue)" :key="sb.id" class="card dub-card">
                  <div class="dub-head">
                    <div class="dub-copy">
                    <div class="dub-title">
                      <span class="frame-num">#{{ String(sb.storyboard_number || sb.storyboardNumber || i + 1).padStart(2, '0') }}</span>
                      <span class="frame-badge">{{ getDialogueSpeaker(sb) }}</span>
                    </div>
                    <div class="dub-desc">{{ getDialogueText(sb) || '未填写文本' }}</div>
                    </div>
                    <span class="tag" :class="hasEffectiveTTS(sb) ? 'tag-success' : ''">{{ narrationTtsStatusLabel(sb) }}</span>
                  </div>
                <div class="dub-meta">
                  <span class="dim">{{ sb.shot_type || sb.shotType || '未设景别' }}</span>
                  <span class="dim">{{ sb.duration || 10 }}s</span>
                  <span class="dim">{{ sb.location || '未设地点' }}</span>
                </div>
                <div class="dub-foot">
                  <audio v-if="getEffectiveTTSUrl(sb)" :src="'/' + getEffectiveTTSUrl(sb)" controls preload="none" class="dub-audio" />
                  <div v-else class="dim" style="font-size:12px">尚未生成语音文件</div>
                  <div class="ml-auto flex gap-1">
                    <button class="btn btn-sm" @click="triggerShotTtsUpload(sb.id)">上传 MP3</button>
                    <button class="btn btn-sm" @click="genShotTTS(sb, hasNarrationShotOwnTts(sb))">
                      {{ hasNarrationShotOwnTts(sb) ? '重新生成' : '生成配音' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: BGM -->
          <div v-else-if="prodTab === 'bgm'" class="prod-content">
            <div class="narration-hint">
              <strong>BGM 策略：</strong>默认 <code>suno_music_open</code>（纯器乐）；可选 <code>pixverse-sound-effect</code>（按画面生成环境音，需关联已合成镜头）；也可<strong>上传本地音频</strong>直接使用。BGM 库按<strong>项目</strong>共享。合成时自动与旁白混音（BGM 音量约 12%）。
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 镜头 · {{ bgmAppliedCount }} 已配 BGM</span>
              <span class="tag mono">{{ bgmCompletedCount }} 首可用</span>
              <span v-if="bgmPendingCount" class="tag">{{ bgmPendingCount }} 生成中</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="bgmUploading" @click="triggerBgmUpload">
                  {{ bgmUploading ? '上传中…' : '上传 BGM' }}
                </button>
                <button class="btn btn-sm" :disabled="bgmGenerating" @click="refreshBgmLibrary">刷新库</button>
              </div>
              <input
                ref="bgmUploadInput"
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                hidden
                @change="onBgmFileSelected"
              />
            </div>

            <div class="card" style="padding:14px;margin-bottom:14px">
              <div class="field-label" style="margin-bottom:8px">上传本地 BGM</div>
              <div class="dim" style="font-size:12px;margin-bottom:10px">支持 mp3 / wav / m4a / aac / ogg，上传后立即进入曲库，可应用到镜头或整集成片。</div>
              <button class="btn btn-sm" :disabled="bgmUploading" @click="triggerBgmUpload">
                {{ bgmUploading ? '上传中…' : '选择音频文件' }}
              </button>
            </div>

            <div class="card" style="padding:14px;margin-bottom:14px">
              <div class="field-label" style="margin-bottom:8px">AI 生成 BGM</div>
              <div class="flex gap-2" style="flex-wrap:wrap;margin-bottom:10px">
                <BaseSelect
                  :model-value="bgmTargetSbId"
                  :options="[{ label: '整集通用（不绑定镜头）', value: null }, ...sbs.map((sb, i) => ({ label: `#${String(sb.storyboard_number || sb.storyboardNumber || i + 1).padStart(2,'0')} ${getDialogueText(sb).slice(0,24) || sb.title || '镜头'}`, value: sb.id }))]"
                  placeholder="关联镜头（可选）"
                  style="min-width:240px"
                  @update:model-value="bgmTargetSbId = $event"
                />
              </div>
              <textarea v-model="bgmDesc" class="textarea" rows="3" :placeholder="bgmModel === 'pixverse-sound-effect' ? '音效描述，如：雨夜街道环境音，远处车流，低频悬疑氛围' : 'BGM 描述，如：轻柔钢琴与弦乐，悬疑氛围，无人声，适合解说旁白'" />
              <div class="flex gap-1" style="margin-top:8px">
                <button class="btn btn-sm" :disabled="bgmDescGenerating" @click="generateBgmDescription">
                  {{ bgmDescGenerating ? 'AI 生成中…' : 'AI 生成描述' }}
                </button>
              </div>
              <div v-if="bgmModel === 'pixverse-sound-effect'" class="dim" style="font-size:12px;margin-top:8px">
                PixVerse 需关联已合成/有视频的镜头，将按画面生成环境音与音效（4022 网关要求上传 video_media_id）。
              </div>
              <div class="flex gap-1" style="margin-top:10px">
                <button class="btn btn-sm btn-primary" :disabled="bgmGenerating || !bgmDesc.trim()" @click="generateEpisodeBgm">
                  {{ bgmGenerating ? '提交中…' : '生成 BGM' }}
                </button>
                <span v-if="bgmTargetSbId" class="dim" style="font-size:12px;align-self:center">生成后可一键应用到所选镜头</span>
              </div>
            </div>

            <div v-if="!visibleBgmLibrary.length && !bgmPendingCount" class="step-empty" style="min-height:220px">
              <div class="empty-title">暂无 BGM 记录</div>
              <div class="empty-desc">上传本地音频，或填写描述点击「生成 BGM」（通常需 1–3 分钟）。也可在分镜详情里填写 BGM 描述后在此生成。</div>
            </div>

            <div v-else-if="!visibleBgmLibrary.length && bgmPendingCount" class="step-empty" style="min-height:180px">
              <div class="empty-title">BGM 生成中…</div>
              <div class="empty-desc">Suno 通常需 1–3 分钟，完成后会自动出现在下方。也可点「刷新库」手动同步。</div>
            </div>

            <div v-else class="dub-grid">
              <div v-for="item in visibleBgmLibrary" :key="item.id" class="card dub-card">
                <div class="dub-head">
                  <div class="dub-copy">
                    <div class="dub-title">
                      <span class="frame-num">#{{ item.id }}</span>
                      <span class="frame-badge">{{ item.title || 'BGM' }}</span>
                    </div>
                    <div class="dub-desc">{{ item.description || item.prompt }}</div>
                    <div v-if="item.model" class="dim" style="font-size:11px;margin-top:4px">{{ formatBgmModelLabel(item.model) }}</div>
                  </div>
                  <span class="tag" :class="item.status === 'completed' ? 'tag-success' : item.status === 'failed' ? 'tag-danger' : ''">
                    {{ item.status === 'completed' ? '就绪' : item.status === 'failed' ? '失败' : '生成中' }}
                  </span>
                </div>
                <div class="dub-foot">
                  <audio v-if="item.local_path || item.localPath" :src="'/' + (item.local_path || item.localPath)" controls preload="none" class="dub-audio" />
                  <div v-else class="dim" style="font-size:12px">{{ item.error_msg || item.errorMsg || '等待生成…' }}</div>
                  <div v-if="item.status === 'completed'" class="ml-auto flex gap-1" style="flex-wrap:wrap;justify-content:flex-end">
                    <button
                      class="btn btn-sm btn-primary"
                      :disabled="!!bgmApplyingAllId"
                      @click="applyBgmToAllShots(item.id)"
                    >
                      {{ bgmApplyingAllId === item.id ? '应用中…' : `应用到全部 (${sbs.length})` }}
                    </button>
                    <BaseSelect
                      :model-value="null"
                      :options="sbs.map((sb, i) => ({ label: `#${String(sb.storyboard_number || sb.storyboardNumber || i + 1).padStart(2,'0')}`, value: sb.id }))"
                      placeholder="单镜应用"
                      style="min-width:100px"
                      @update:model-value="val => val && applyBgmToShot(item.id, val)"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-if="sbs.length" class="card" style="padding:14px;margin-top:14px">
              <div class="field-label" style="margin-bottom:10px">镜头 BGM 状态</div>
              <div class="dub-grid">
                <div v-for="(sb, i) in sbs" :key="sb.id" class="card dub-card" style="padding:10px">
                  <div class="dub-title" style="margin-bottom:6px">
                    <span class="frame-num">#{{ String(sb.storyboard_number || sb.storyboardNumber || i + 1).padStart(2, '0') }}</span>
                    <span class="dim" style="font-size:12px;margin-left:8px">{{ getDialogueText(sb).slice(0, 40) || '—' }}</span>
                  </div>
                  <audio v-if="sb.bgm_audio_url || sb.bgmAudioUrl" :src="'/' + (sb.bgm_audio_url || sb.bgmAudioUrl)" controls preload="none" class="dub-audio" />
                  <div v-else class="dim" style="font-size:12px">未设置 BGM</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Shots (Narration) -->
          <div v-else-if="prodTab === 'shots' && isNarrationMode" class="prod-content">
            <div class="narration-hint">
              <strong>配图策略：</strong>先点「配图分镜」按场景换图并生成配图文案，再批量生成配图。同场景可沿用；默认完整单图，可手动切两宫格。上传配图用「上传下一张」，同段 inherit 镜头自动沿用，<strong>不会跨到下一个需配图镜头</strong>。
            </div>
            <div class="prod-image-model-bar" style="margin-bottom:12px">
              <span class="dim" style="font-size:12px">文本模型</span>
              <BaseSelect
                :model-value="episodeTextModel"
                :options="textModelOptions"
                placeholder="选择文本模型"
                searchable
                style="width:360px"
                @update:model-value="onEpisodeTextModelChange"
              />
              <div v-if="episodeTextModelSupportsThinking" class="text-thinking-toggle">
                <span class="dim" style="font-size:12px">思考模式</span>
                <div class="prod-tabs text-thinking-tabs">
                  <button
                    type="button"
                    class="prod-tab"
                    :class="{ active: episodeTextThinking }"
                    @click="setEpisodeTextThinking(true)"
                  >开</button>
                  <button
                    type="button"
                    class="prod-tab"
                    :class="{ active: !episodeTextThinking }"
                    @click="setEpisodeTextThinking(false)"
                  >关</button>
                </div>
              </div>
              <span class="tag">配图分镜 / AI 配图文案</span>
              <button
                class="btn btn-sm"
                :disabled="narrationImageDescUploading || !sbs.length"
                title="上传 .txt 配图描述：【#01】格式或逐行对应需配图镜头"
                @click="triggerNarrationImageDescUpload"
              >
                <Loader2 v-if="narrationImageDescUploading" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                上传分镜描述
              </button>
              <div class="narration-breakdown-actions">
                <button
                  v-if="narrationMissingPromptCount"
                  class="btn btn-sm btn-retry-missing-prompts"
                  :disabled="narrationImageBreaking"
                  title="仅对缺 AI 配图文案的镜头重新调用模型，不重新换镜检测"
                  @click="doRetryMissingNarrationImagePrompts"
                >
                  <Loader2 v-if="narrationImageBreaking" :size="11" class="animate-spin" />
                  补全缺失文案 ({{ narrationMissingPromptCount }})
                </button>
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="narrationImageBreaking || !sbs.length"
                  @click="doNarrationImageBreakdown"
                >
                  <Loader2 v-if="narrationImageBreaking" :size="11" class="animate-spin" />
                  <template v-if="narrationImageBreaking">
                    {{ narrationImageBreakdownProgressMessage }}
                  </template>
                  <template v-else>
                    {{ hasNarrationImageBreakdown ? '重新配图分镜' : '配图分镜' }}
                  </template>
                </button>
              </div>
            </div>
            <div
              v-if="narrationImageBreaking"
              class="progress-wrap"
              style="margin-bottom:12px"
            >
              <div class="progress-head">
                <span class="progress-label">{{ narrationImageBreakdownProgressMessage }}</span>
                <span class="progress-val">{{ narrationImageBreakdownProgressPercent }}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: narrationImageBreakdownProgressPercent + '%' }"></div>
              </div>
            </div>
            <div v-if="narrationImageBreakdownPanel" class="narration-breakdown-panel" style="margin-bottom:12px">
              <div class="narration-breakdown-head">
                <div>
                  <strong>配图分镜结果</strong>
                  <span v-if="narrationImageBreakdownPanel.generatedAt" class="dim" style="font-size:11px;margin-left:8px">{{ formatBreakdownTime(narrationImageBreakdownPanel.generatedAt) }}</span>
                </div>
                <span v-if="narrationImageBreakdownPanel.detectLabel" class="tag">{{ narrationImageBreakdownPanel.detectLabel }}</span>
              </div>
              <div class="narration-breakdown-stats">
                <span v-if="narrationImageBreakdownPanel.paragraphCount != null" class="tag mono">{{ narrationImageBreakdownPanel.paragraphCount }} 段配图</span>
                <span class="tag">{{ narrationImageBreakdownPanel.imageNeeded }} 张需生成</span>
                <span v-if="narrationImageBreakdownPanel.diptychCount" class="tag">含 {{ narrationImageBreakdownPanel.diptychCount }} 张两宫格</span>
                <span v-if="narrationImageBreakdownPanel.promptLabel" class="tag">{{ narrationImageBreakdownPanel.promptLabel }}</span>
                <span v-if="narrationImageBreakdownPanel.imageNeeded" class="tag dim">约 ¥{{ narrationImageBreakdownPanel.estImageCost }}（{{ narrationImageBreakdownPanel.priceLabel }}）</span>
              </div>
              <div class="narration-breakdown-steps">
                <strong>下一步：</strong>
                批量生成或上传配图 → 镜头合成 → 导出
              </div>
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ shotImgCount }}/{{ narrationNeedImageCount }} 需配图</span>
              <span
                v-if="narrationImagesPendingCount"
                class="tag mono"
                style="max-width:min(100%, 420px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                :title="`未生成配图：${narrationImagesPendingLabel}`"
              >
                待生成 {{ narrationImagesPendingHint }}
              </span>
              <div class="ml-auto flex gap-1 items-center">
                <BaseSelect
                  v-if="narrationCopyBatchOptions.length > 1"
                  :options="narrationCopyBatchOptions"
                  :model-value="narrationCopyBatchIndex"
                  placeholder="批次"
                  style="min-width:96px"
                  @update:model-value="narrationCopyBatchIndex = Number($event) || 1"
                />
                <button class="btn btn-sm" :disabled="!narrationImagesPendingCount" @click="triggerNextShotImageUpload" title="上传一张配图到下一个待配图镜头，同段 inherit 镜头自动沿用">
                  上传下一张{{ nextPendingNarrationShot ? ` (#${getNarrationShotDisplayNo(nextPendingNarrationShot)})` : '' }}
                </button>
                <button
                  v-if="uploadedNarrationImageCount"
                  class="btn btn-sm"
                  title="清除所有手动上传的配图（不影响 AI 生成）"
                  @click="clearUploadedNarrationShotImages"
                >
                  清除已上传配图 ({{ uploadedNarrationImageCount }})
                </button>
                <button class="btn btn-sm" :disabled="!narrationNeedImageCount" @click="copyNarrationShotPromptsBatch">
                  {{ narrationCopyBatchOptions.length > 1 ? `复制描述词 (${narrationCopyBatchOptions.find(o => o.value === narrationCopyBatchIndex)?.label || '#01-#10'})` : `一键复制描述词（${narrationNeedImageCount}）` }}
                </button>
                <button class="btn btn-sm" :disabled="!narrationNeedImageCount" @click="triggerAllShotImageUpload">一键上传全部（{{ narrationNeedImageCount }}）</button>
                <button class="btn btn-sm" :disabled="!narrationNeedImageCount" @click="triggerShotFolderUpload" title="文件夹上传：无后缀→第1镜，(1)→第2镜，(2)→第3镜…">文件夹上传</button>
                <button
                  class="btn btn-sm"
                  :disabled="!narrationCropImageCount || narrationCropWatermarkProcessing"
                  title="去除每张配图右下角水印区（宽 1/8 × 高 1/18，用相邻像素覆盖）；已合成镜头需重新合成"
                  @click="cropNarrationImageWatermarks"
                >
                  {{ narrationCropWatermarkProcessing ? '处理中…' : `去右下角水印 (${narrationCropImageCount})` }}
                </button>
                <button
                  class="btn btn-sm"
                  :disabled="!narrationWmCroppedImageCount || narrationRestoreWatermarkProcessing || narrationCropWatermarkProcessing"
                  title="恢复为去水印前的原图（优先同名原图，其次从配图生成记录找回）"
                  @click="restoreNarrationImageWatermarks"
                >
                  {{ narrationRestoreWatermarkProcessing ? '恢复中…' : `恢复原图 (${narrationWmCroppedImageCount})` }}
                </button>
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="isBatchRunning('narrationImages') || !narrationImagesPendingCount"
                  :title="narrationImagesPendingCount ? `将生成：${narrationImagesPendingLabel}` : ''"
                  @click="batchNarrationShotImages"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  生成剩余{{ narrationImagesPendingCount ? ` (${narrationImagesPendingHint})` : '' }}
                </button>
              </div>
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <img
                    v-if="getNarrationDisplayImage(sb)"
                    :src="narrationShotImageSrc(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer(narrationShotImageSrc(sb), `镜头 #${String(i + 1).padStart(2, '0')} 配图`)"
                  />
                  <div v-else-if="isPendingNarrationShot(sb.id)" class="prod-cover-empty">
                    <Loader2 :size="20" class="animate-spin" style="color:var(--accent)" />
                  </div>
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                  <span class="prod-idx">#{{ getNarrationShotDisplayNo(sb) }}</span>
                  <span v-if="isNarrationTitleShot(sb)" class="prod-overlay-badge is-title">片头</span>
                  <span v-else-if="narrationShotNeedsOwnImage(sb) && parseNarrationImageMeta(sb).paragraph_layout === 'diptych'" class="prod-overlay-badge">两宫格</span>
                  <span v-else-if="narrationShotNeedsOwnImage(sb) && !hasNarrationShotImage(sb)" class="prod-overlay-badge is-pending">待生成</span>
                  <span v-else-if="narrationShotInherited(sb)" class="prod-overlay-badge">复用</span>
                  <span v-else-if="!narrationShotNeedsOwnImage(sb)" class="prod-overlay-badge">沿用</span>
                </div>
                <div class="prod-info">
                  <div class="prod-desc truncate">{{ extractNarrationSentence(sb) || '—' }}</div>
                  <div class="prod-meta-line dim" style="font-size:11px">{{ narrationShotImageLabel(sb) }}</div>
                  <label v-if="narrationShotNeedsOwnImage(sb)" class="narration-shot-prompt-field" @click.stop>
                    <div class="narration-shot-prompt-head">
                      <span class="dim">配图文案</span>
                      <button
                        type="button"
                        class="btn btn-sm narration-shot-prompt-copy"
                        :disabled="!getNarrationImagePromptText(sb)"
                        @click="copyNarrationShotPrompt(sb)"
                      >
                        复制文案
                      </button>
                    </div>
                    <textarea
                      class="textarea narration-shot-prompt-textarea"
                      rows="3"
                      :value="getNarrationImagePromptText(sb)"
                      placeholder="配图提示词…"
                      @blur="updateNarrationImagePrompt(sb, $event.target.value)"
                    />
                  </label>
                  <div
                    v-if="narrationShotNeedsOwnImage(sb) && !isNarrationTitleShot(sb)"
                    class="narration-shot-layout-row"
                    @click.stop
                  >
                    <span class="dim">版式</span>
                    <button
                      type="button"
                      class="btn btn-sm"
                      :class="{ 'btn-primary': resolveNarrationParagraphLayout(sb) === 'single' }"
                      @click="setNarrationShotLayout(sb, 'single')"
                    >
                      完整单图
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm"
                      :class="{ 'btn-primary': resolveNarrationParagraphLayout(sb) === 'diptych' }"
                      @click="setNarrationShotLayout(sb, 'diptych')"
                    >
                      两宫格
                    </button>
                  </div>
                </div>
                <div class="prod-actions">
                  <button
                    v-if="narrationShotNeedsOwnImage(sb)"
                    class="btn btn-sm"
                    :disabled="isPendingNarrationShot(sb.id)"
                    @click="genNarrationShotImage(sb)"
                  >
                    {{ isPendingNarrationShot(sb.id) ? '生成中' : (hasNarrationShotImage(sb) ? '重新生成' : '生成配图') }}
                  </button>
                  <button v-else class="btn btn-sm" @click="markNarrationShotNeedImage(sb)">改为需配图</button>
                  <button
                    class="btn btn-sm"
                    :disabled="isPendingNarrationShot(sb.id)"
                    @click="triggerShotImageUpload(sb.id)"
                  >
                    上传图片
                  </button>
                  <button
                    v-if="!hasNarrationShotImage(sb)"
                    class="btn btn-sm"
                    :disabled="!findPrevNarrationShotWithImage(sb)"
                    @click="reuseNarrationShotImage(sb)"
                  >
                    复用上一镜
                  </button>
                  <button
                    v-if="hasNarrationShotImage(sb) && !narrationShotNeedsOwnImage(sb)"
                    class="btn btn-sm"
                    @click="clearNarrationShotImage(sb)"
                  >
                    取消复用
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Shots (Drama) -->
          <div v-else-if="prodTab === 'shots'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ shotImgCount }}/{{ sbs.length }} 已有帧图</span>
              <div class="ml-auto flex gap-1">
                <BaseSelect v-model="frameMode" :options="frameModeOptions" placeholder="帧模式" searchable style="width:100px" />
                <button v-if="gridImagePath" class="btn btn-sm" @click="reopenGridPreview">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  查看当前宫格图
                </button>
                <button class="btn btn-primary btn-sm" @click="openGridTool">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  宫格图工具
                </button>
              </div>
            </div>

            <div v-if="gridHistory.length" class="grid-history-panel">
              <div v-if="gridImagePath" class="latest-grid-strip">
                <button class="latest-grid-strip-thumb" @click="openImageViewer('/' + gridImagePath, '当前宫格图')">
                  <img :src="'/' + gridImagePath" class="previewable-image" />
                </button>
                <div class="latest-grid-strip-copy">
                  <div class="latest-grid-strip-head">
                    <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }}</span>
                    <span class="tag" v-if="gridRecoveredMode">{{ gridRecoveredMode }}</span>
                  </div>
                  <div class="latest-grid-strip-title">当前宫格图</div>
                  <div class="latest-grid-strip-meta">
                    <span v-if="gridRecoveredAt">{{ gridRecoveredAt }}</span>
                    <span>可继续切割并分配</span>
                  </div>
                </div>
                <div class="latest-grid-strip-actions">
                  <button class="btn btn-sm" @click="reopenGridPreview">预览</button>
                  <button class="btn btn-primary btn-sm" @click="continueGridSplit">继续切割</button>
                </div>
              </div>
              <div class="grid-history-head">
                <div>
                  <div class="grid-history-title">历史宫格图</div>
                  <div class="grid-history-subtitle">按需展开切换不同宫格图，不默认占用第一屏</div>
                </div>
                <button class="btn btn-sm" @click="showAllGridHistory = !showAllGridHistory">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline :points="showAllGridHistory ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/></svg>
                  {{ showAllGridHistory ? '收起历史宫格图' : `展开全部 (${gridHistory.length})` }}
                </button>
              </div>
              <div v-if="showAllGridHistory" class="grid-history-list">
                <button
                  v-for="item in gridHistory"
                  :key="item.id"
                  :class="['grid-history-item', { active: item.localPath === gridImagePath }]"
                  @click="selectGridHistory(item)"
                >
                  <div class="grid-history-thumb">
                    <img :src="'/' + item.localPath" class="previewable-image" />
                  </div>
                  <div class="grid-history-copy">
                    <div class="grid-history-tags">
                      <span class="tag mono">#{{ item.id }}</span>
                      <span class="tag mono">{{ item.layout.rows }}x{{ item.layout.cols }}</span>
                      <span class="tag">{{ item.modeLabel }}</span>
                    </div>
                    <div class="grid-history-meta">{{ item.createdAtLabel }}</div>
                  </div>
                </button>
              </div>
            </div>

            <div class="frame-scroll">
              <div class="frame-grid">
                <div v-for="(sb, i) in sbs" :key="sb.id"
                  :class="['frame-row', 'card', { active: selectedSb?.id === sb.id }]"
                  @click="selectedSb = sb">
                  <!-- Info: number + type + desc -->
                  <div class="frame-info">
                    <div class="frame-top">
                      <span class="frame-num">#{{ String(i+1).padStart(2,'0') }}</span>
                      <span class="frame-badge">{{ sb.shot_type || sb.shotType || '—' }}</span>
                    </div>
                    <div class="frame-desc">{{ sb.description || sb.title || '—' }}</div>
                    <div class="frame-meta">
                      <span :class="['dot', getFirstFrame(sb) && 'ok', isPendingShotFrame(sb.id, 'first_frame') && 'pending']" />
                      <span class="dim" style="font-size:11px">首帧</span>
                      <span v-if="frameMode === 'first_last'" style="display:flex;align-items:center;gap:4px">
                        <span :class="['dot', getLastFrame(sb) && 'ok', isPendingShotFrame(sb.id, 'last_frame') && 'pending']" />
                        <span class="dim" style="font-size:11px">尾帧</span>
                      </span>
                    </div>
                  </div>
                  <!-- Thumbnails -->
                  <div class="frame-thumbs">
                    <div class="frame-thumb-wrap">
                      <div class="frame-thumb" @click.stop="!isPendingShotFrame(sb.id, 'first_frame') && genShotFrame(sb, 'first_frame')">
                        <img
                          v-if="getFirstFrame(sb)"
                          :src="'/' + getFirstFrame(sb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getFirstFrame(sb), `镜头 #${String(i + 1).padStart(2, '0')} 首帧`)"
                        />
                        <div v-else class="frame-thumb-empty">
                          <Loader2 v-if="isPendingShotFrame(sb.id, 'first_frame')" :size="14" class="animate-spin" />
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <span v-if="getFirstFrame(sb)" class="frame-re">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </span>
                      </div>
                      <span class="frame-thumb-label">{{ isPendingShotFrame(sb.id, 'first_frame') ? '首帧生成中' : '首帧' }}</span>
                    </div>
                    <div v-if="frameMode === 'first_last'" class="frame-thumb-wrap">
                      <div class="frame-thumb" @click.stop="!isPendingShotFrame(sb.id, 'last_frame') && genShotFrame(sb, 'last_frame')">
                        <img
                          v-if="getLastFrame(sb)"
                          :src="'/' + getLastFrame(sb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getLastFrame(sb), `镜头 #${String(i + 1).padStart(2, '0')} 尾帧`)"
                        />
                        <div v-else class="frame-thumb-empty">
                          <Loader2 v-if="isPendingShotFrame(sb.id, 'last_frame')" :size="14" class="animate-spin" />
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <span v-if="getLastFrame(sb)" class="frame-re">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </span>
                      </div>
                      <span class="frame-thumb-label">{{ isPendingShotFrame(sb.id, 'last_frame') ? '尾帧生成中' : '尾帧' }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Grid Tool Dialog -->
            <div v-if="gridDialog" class="overlay" @click.self="gridDialog = false">
              <div class="card grid-tool">
                <div class="grid-tool-head">
                  <span style="font-size:15px;font-weight:600;font-family:var(--font-display)">宫格图工具</span>
                  <button class="btn btn-ghost btn-icon ml-auto" @click="gridDialog = false">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <!-- Step 0: Config -->
                <div v-if="gridStep === 0" class="grid-tool-body">
                  <div class="grid-mode-tabs">
                    <button v-for="m in gridModes" :key="m.id"
                      :class="['grid-mode-tab', { active: gridMode === m.id }]"
                      @click="gridMode = m.id; gridSelected = []; gridSingleTarget = null; gridAssignmentsState = []">
                      <span style="font-weight:600">{{ m.label }}</span>
                      <span class="dim" style="font-size:11px">{{ m.desc }}</span>
                    </button>
                  </div>

                  <div class="grid-config">
                    <label class="field" style="flex:0 0 auto" v-if="gridMode !== 'multi_ref'">
                      <span class="field-label">宫格</span>
                      <BaseSelect v-model="gridLayout" :options="gridLayoutOptions" placeholder="宫格" style="width:90px" />
                    </label>
                    <div class="field" style="flex:1">
                      <span class="field-label">
                        {{ gridMode === 'multi_ref' ? '选择目标镜头' : '选择镜头' }}
                        <span class="dim" v-if="gridMode !== 'multi_ref'">(已选 {{ gridSelected.length }})</span>
                      </span>
                    </div>
                    <div style="align-self:flex-end" v-if="gridMode !== 'multi_ref'">
                      <button class="btn btn-sm" @click="gridSelectAll">{{ gridSelected.length === sbs.length ? '取消全选' : '全选' }}</button>
                    </div>
                  </div>

                  <div class="grid-pick-list">
                    <label v-for="(sb, i) in sbs" :key="sb.id"
                      :class="['grid-pick-item', { selected: gridMode === 'multi_ref' ? gridSingleTarget === sb.id : gridSelected.includes(sb.id) }]">
                      <input v-if="gridMode === 'multi_ref'" type="radio" :value="sb.id" v-model="gridSingleTarget" name="grid-target" />
                      <input v-else type="checkbox" :value="sb.id" v-model="gridSelected" />
                      <span class="mono" style="font-size:11px;width:28px">#{{ String(i+1).padStart(2,'0') }}</span>
                      <span class="truncate" style="flex:1;font-size:12px">{{ sb.description || sb.title || '—' }}</span>
                    </label>
                  </div>

                  <div class="grid-tool-foot">
                    <span v-if="gridCanStart" class="tag mono">{{ gridAutoLayout.rows }}x{{ gridAutoLayout.cols }} = {{ gridAutoLayout.rows * gridAutoLayout.cols }}格</span>
                    <span class="dim" style="font-size:11px">{{ gridPromptLoading ? gridPromptStatus : gridSummary }}</span>
                    <button class="btn btn-primary ml-auto" :disabled="!gridCanStart || gridPromptLoading" @click="generateGridPrompt">
                      <Loader2 v-if="gridPromptLoading" :size="12" class="animate-spin" />
                      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      {{ gridPromptLoading ? '生成中' : '生成提示词' }}
                    </button>
                  </div>
                </div>

                <!-- Step 1: Prompt Preview -->
                <div v-else-if="gridStep === 1" class="grid-tool-body">
                  <div class="grid-prompt-summary">
                    <div class="grid-prompt-label">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      宫格图提示词
                      <span v-if="gridPromptSource" class="tag ml-8">{{ gridPromptSource === 'agent' ? 'AI生成' : '模板兜底' }}</span>
                    </div>
                    <div class="grid-prompt-text">{{ gridPromptText || '（等待生成）' }}</div>
                  </div>

                  <div class="grid-blank-preview" :style="gridBlankStyle">
                    <div v-for="(cell, i) in gridCellPrompts" :key="i" class="grid-blank-cell">
                      <div class="grid-blank-cell-index">#{{ cell.shot_number }} {{ {first_frame:'首帧',last_frame:'尾帧',reference:'参考'}[cell.frame_type] || '' }}</div>
                      <div class="grid-blank-cell-desc">{{ cell.prompt }}</div>
                    </div>
                    <div v-for="i in Math.max(0, (gridAutoLayout.rows * gridAutoLayout.cols) - gridCellPrompts.length)" :key="'empty-'+i" class="grid-blank-cell empty">
                      <div class="grid-blank-cell-index">空</div>
                      <div class="grid-blank-cell-desc">—</div>
                    </div>
                  </div>

                  <div class="grid-tool-foot">
                    <button class="btn" @click="gridStep = 0">上一步</button>
                    <button class="btn ml-auto" @click="generateGridPrompt" :disabled="gridPromptLoading">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      重新生成
                    </button>
                    <button class="btn btn-primary" @click="startGridGen">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      生成宫格图
                    </button>
                  </div>
                </div>

                <!-- Step 2: Generating -->
                <div v-else-if="gridStep === 2" class="grid-tool-body" style="align-items:center;justify-content:center;min-height:300px">
                  <Loader2 :size="28" class="animate-spin" style="color:var(--accent)" />
                  <div class="loading-text" style="margin-top:12px">宫格图生成中...</div>
                  <div class="dim" style="font-size:11px;margin-top:6px">{{ gridStatusText }}</div>
                </div>

                <!-- Step 3: Preview -->
                <div v-else-if="gridStep === 3" class="grid-tool-body grid-tool-body-preview">
                  <div class="grid-preview-layout">
                    <div class="grid-preview-pane">
                      <div class="grid-preview-wrap">
                        <div class="grid-preview-stage">
                          <img
                            :src="'/' + gridImagePath"
                            class="grid-preview-img previewable-image"
                            @click.stop="openImageViewer('/' + gridImagePath, '宫格图预览')"
                          />
                          <div class="grid-overlay" :style="gridOverlayStyle">
                            <button
                              v-for="(a, i) in gridAssignments"
                              :key="i"
                              type="button"
                              :class="['grid-overlay-cell', activeGridCell === i && 'active']"
                              @click="focusGridCell(i)"
                            >
                              <span class="grid-cell-label">{{ gridCellLabel(a) }}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="grid-adjust-summary">
                        <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }} = {{ gridActualLayout.rows * gridActualLayout.cols }}格</span>
                        <span class="dim" style="font-size:12px">{{ gridAssignedCount }}/{{ gridAssignments.length }} 格已分配</span>
                        <span class="tag" v-if="gridAssignedCount < gridAssignments.length">未分配格子会被忽略，不会写回分镜</span>
                      </div>
                    </div>
                    <div class="grid-assignment-pane">
                      <div class="grid-assign-head">
                        <div class="grid-assign-title">格子分配</div>
                        <div class="grid-assign-subtitle">切分后由你自己决定每格对应哪个分镜</div>
                      </div>
                      <div v-if="gridAssignmentTotalPages > 1" class="grid-assign-pagination">
                        <button class="btn btn-sm" :disabled="gridAssignmentPage === 0" @click="gridAssignmentPage--">上一页</button>
                        <span class="dim">第 {{ gridAssignmentPage + 1 }}/{{ gridAssignmentTotalPages }} 页</span>
                        <span class="dim">{{ gridAssignmentPageStart + 1 }}-{{ gridAssignmentPageEnd }} / {{ gridAssignments.length }}</span>
                        <button class="btn btn-sm ml-auto" :disabled="gridAssignmentPage >= gridAssignmentTotalPages - 1" @click="gridAssignmentPage++">下一页</button>
                      </div>
                      <div class="grid-assign-columns">
                        <span>格</span>
                        <span>镜头</span>
                        <span>类型</span>
                        <span>当前绑定</span>
                      </div>
                      <div class="grid-assign-info">
                        <div v-for="item in pagedGridAssignments" :key="item.index" :class="['grid-assign-row', activeGridCell === item.index && 'active']">
                          <span class="grid-assign-index">格{{ item.index + 1 }}</span>
                          <BaseSelect
                            :model-value="item.assignment.storyboard_id"
                            :options="gridAssignmentShotOptions"
                            placeholder="选择镜头"
                            @update:model-value="updateGridAssignment(item.index, 'storyboard_id', $event)"
                          />
                          <BaseSelect
                            :model-value="item.assignment.frame_type"
                            :options="gridFrameTypeOptions"
                            placeholder="帧类型"
                            style="width:100%"
                            @update:model-value="updateGridAssignment(item.index, 'frame_type', $event)"
                          />
                          <span class="grid-assign-bind">{{ gridCellTitle(item.assignment.storyboard_id) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="grid-tool-foot">
                    <button class="btn" @click="gridStep = 1">返回</button>
                    <button class="btn btn-primary ml-auto" @click="doGridSplit">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      切分并分配
                    </button>
                  </div>
                </div>

                <!-- Step 4: Done -->
                <div v-else-if="gridStep === 4" class="grid-tool-body" style="align-items:center;justify-content:center;min-height:200px">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <div style="font-size:17px;font-weight:700;font-family:var(--font-display);margin-top:8px">分配完成</div>
                  <div class="dim" style="font-size:13px;margin-top:4px">{{ gridAssignedCount }} 格已分配</div>
                  <button class="btn btn-primary" style="margin-top:16px" @click="gridDialog = false; refresh()">关闭</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Videos -->
          <div v-else-if="!isNarrationMode && prodTab === 'videos'" class="prod-content">
            <div class="narration-hint">
              <strong>解说模式可跳过本步：</strong>若每镜已有「配图 + 旁白配音」，无需 AI 视频，直接去「镜头合成」即可（配图保持静止画面）。
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ shotVidCount }}/{{ sbs.length }} 已生成</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="isBatchRunning('videos') || !videosPendingCount" @click="batchVideos">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  生成剩余{{ videosPendingCount ? ` (${videosPendingCount})` : '' }}
                </button>
              </div>
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <video
                    v-if="hasVid(sb)"
                    :src="'/' + getVideoUrl(sb)"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="hasImg(sb)"
                    :src="'/' + getStoryboardCover(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getStoryboardCover(sb), `镜头 #${String(i + 1).padStart(2, '0')} 参考图`)"
                  />
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </div>
                  <span class="prod-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="hasComposed(sb)" class="prod-overlay-badge">已合成</span>
                </div>
                <div class="prod-info">
                  <div class="prod-desc truncate">{{ sb.description || sb.title || '—' }}</div>
                  <div class="prod-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
                  <div class="prod-dots">
                    <span :class="['dot', hasImg(sb) && 'ok']" /><span style="font-size:10px">图</span>
                    <span :class="['dot', hasVid(sb) && 'ok', isPendingVideo(sb.id) && 'pending']" /><span style="font-size:10px">{{ isPendingVideo(sb.id) ? '视频生成中' : '视频' }}</span>
                  </div>
                  <div v-if="videoFailMessage(sb.id)" class="prod-error">{{ videoFailMessage(sb.id) }}</div>
                </div>
                <div class="prod-actions">
                  <button class="btn btn-sm" :disabled="isPendingVideo(sb.id)" @click="genVid(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    {{ isPendingVideo(sb.id) ? '生成中' : '生成视频' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Compose -->
          <div v-else-if="prodTab === 'compose'" class="prod-content">
            <div class="narration-hint">
              <strong>配图合成已启用：</strong>有镜头图 + 旁白即可合成。改片头红字或旁白：点某镜「编辑镜头」→ 保存并重新制作 → 再去导出重新拼接。
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ composedCount }}/{{ sbs.length }} 已合成</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm btn-primary" :disabled="isBatchRunning('compose') || anyMergeProcessing || !composePendingCount" @click="batchCompose">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  生成剩余{{ composePendingCount ? ` (${composePendingCount})` : '' }}
                </button>
                <button class="btn btn-sm" :disabled="isBatchRunning('compose') || anyMergeProcessing || !composableCount" @click="regenerateAllComposeAndMerge">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  重新生成全部并导出
                </button>
                <input
                  v-model.number="mergeTestClipLimit"
                  type="number"
                  min="1"
                  max="50"
                  class="input input-sm"
                  style="width:52px"
                  title="测试导出镜头数"
                />
                <button class="btn btn-sm" :disabled="!canTestMerge() || anyMergeProcessing || isBatchRunning('compose')" @click="doTestMerge">
                  测试导出
                </button>
              </div>
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <video
                    v-if="hasComposed(sb)"
                    :src="'/' + getComposedVideoUrl(sb)"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <video
                    v-else-if="hasVid(sb)"
                    :src="'/' + getVideoUrl(sb)"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="hasImg(sb)"
                    :src="'/' + getStoryboardCover(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getStoryboardCover(sb), `镜头 #${String(i + 1).padStart(2, '0')} 参考图`)"
                  />
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </div>
                  <span class="prod-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="hasComposed(sb)" class="prod-overlay-badge">已合成</span>
                </div>
                <div class="prod-info">
                  <div class="prod-desc truncate">{{ sb.description || sb.title || '—' }}</div>
                  <div class="prod-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
                  <div class="prod-dots">
                    <span :class="['dot', hasImg(sb) && 'ok']" /><span style="font-size:10px">配图</span>
                    <span :class="['dot', hasComposeTts(sb) && 'ok']" /><span style="font-size:10px">配音</span>
                    <span :class="['dot', hasVid(sb) && 'ok']" /><span style="font-size:10px">AI视频</span>
                    <span :class="['dot', hasComposed(sb) && 'ok', isPendingCompose(sb.id) && 'pending']" /><span style="font-size:10px">{{ isPendingCompose(sb.id) ? '合成中' : '合成' }}</span>
                  </div>
                  <div v-if="composeFailMessage(sb.id)" class="prod-error">{{ composeFailMessage(sb.id) }}</div>
                </div>
                <div class="prod-actions">
                  <button v-if="isNarrationMode" class="btn btn-sm" @click="openShotEditor(sb)">编辑镜头</button>
                  <button class="btn btn-sm" :disabled="!canCompose(sb) || isPendingCompose(sb.id)" @click="doCompose(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    {{ isPendingCompose(sb.id) ? '合成中' : (hasComposed(sb) ? '重新合成' : '开始合成') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Production Navigator -->
        </template>
      </div>

      <!-- ===== EXPORT PANEL ===== -->
      <div v-else class="content-panel">
        <div v-if="!sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="empty-title">尚未准备就绪</div>
          <div class="empty-desc">请先完成分镜和制作流程</div>
          <button class="btn btn-primary" @click="panel = 'script'">前往剧本</button>
        </div>
        <div v-else-if="exportTab === 'opening'" class="export-opening-page">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">01</span>
                <span class="step-name">开幕视频</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span class="tag dim" style="font-size:11px">可用配图 {{ illustrationImageCount }} 张</span>
            </div>
          </div>
          <div class="export-opening-body">
            <div class="narration-hint" style="margin-bottom:16px">
              从本集已生成/上传的配图中<strong>随机选 8 张</strong>合成翻页片头（每页自左上角卷曲下落转场，叠加书本翻页音效）。可用 <strong>Voicebox</strong> 生成或上传 MP3 配音，按配音时长生成并叠加<strong>屏幕正中红色字幕</strong>（字号 100）；未配音时为 3 秒片头 + 翻页音效。
            </div>
            <div class="opening-audio-panel" style="margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:8px">
              <div style="font-size:13px;font-weight:600;margin-bottom:8px">开幕配音</div>
              <label class="field-label" style="display:block;font-size:12px;color:var(--text-2);margin-bottom:4px">字幕文案（屏幕水平垂直居中，亦作配音文本）</label>
              <input
                v-model="openingSubtitleText"
                class="input"
                type="text"
                placeholder="体验365个人生副本"
                style="width:100%;max-width:480px;margin-bottom:10px"
                @change="saveOpeningSubtitle"
              />
              <div class="export-bar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
                <BaseSelect
                  :model-value="localTtsEngine"
                  :options="localTtsEngineOptions"
                  placeholder="选择引擎"
                  style="min-width:160px"
                  @update:model-value="localTtsEngine = $event"
                />
                <BaseSelect
                  :model-value="localTtsSpeed"
                  :options="localTtsSpeedOptions"
                  placeholder="语速"
                  style="min-width:120px"
                  @update:model-value="localTtsSpeed = Number($event) || DEFAULT_TTS_SPEED"
                />
                <BaseSelect
                  :model-value="localEdgeVoiceId"
                  :options="edgeVoiceSelectOptions"
                  :placeholder="localTtsEngine === 'voicebox' ? '选择 Voicebox 音色' : '选择本地音色'"
                  searchable
                  style="min-width:220px"
                  @update:model-value="localEdgeVoiceId = $event"
                />
                <BaseSelect
                  v-if="localTtsEngine === 'voicebox'"
                  :model-value="localVoiceboxModelSize"
                  :options="voiceboxModelSizeOptions"
                  placeholder="模型规格"
                  style="min-width:150px"
                  @update:model-value="localVoiceboxModelSize = $event"
                />
                <BaseSelect
                  v-if="localTtsEngine === 'voicebox'"
                  :model-value="localVoiceboxInstructPreset"
                  :options="voiceboxInstructOptions"
                  placeholder="风格/感情"
                  style="min-width:140px"
                  @update:model-value="localVoiceboxInstructPreset = $event"
                />
                <input
                  v-if="localTtsEngine === 'voicebox' && localVoiceboxInstructPreset === VOICEBOX_INSTRUCT_CUSTOM"
                  v-model="localVoiceboxInstructCustom"
                  class="input"
                  type="text"
                  placeholder="如：沉稳有感情，语速适中"
                  style="min-width:200px;max-width:280px"
                  @change="persistLocalTtsPrefs"
                />
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="localTtsPreviewing || !localEdgeVoiceId || (localTtsEngine === 'voicebox' && !voiceboxAvailable) || (localTtsEngine === 'voicebox' && !selectedVoiceboxVoiceReady())"
                  @click="previewLocalTtsVoice(openingSubtitleText)"
                >
                  {{ localTtsPreviewing ? '试听生成中…' : '试听' }}
                </button>
                <button
                  class="btn btn-primary"
                  :disabled="openingAudioGenerating || (localTtsEngine === 'voicebox' && !voiceboxAvailable)"
                  @click="generateOpeningAudio"
                >
                  {{ openingAudioGenerating ? '生成中…' : (openingAudioUrl ? '重新生成配音' : `${localTtsEngineLabel} 生成配音`) }}
                </button>
                <span v-if="localTtsEngine === 'voicebox' && voiceboxAvailable" class="tag ok">Voicebox 已连接</span>
                <span v-else-if="localTtsEngine === 'voicebox' && !voiceboxAvailable" class="tag warn">Voicebox 未运行</span>
              </div>
              <div class="export-bar" style="margin-bottom:0">
                <button class="btn" :disabled="openingAudioUploading" @click="triggerOpeningAudioUpload">
                  {{ openingAudioUploading ? '上传中…' : (openingAudioUrl ? '更换 MP3' : '或上传 MP3') }}
                </button>
                <audio v-if="openingAudioSrc" :src="openingAudioSrc" controls style="height:32px;max-width:280px" />
                <span v-if="openingAudioUrl" class="tag tag-success">配音已就绪</span>
              </div>
            </div>
            <template v-if="openingVideoProcessing">
              <div class="step-empty">
                <Loader2 :size="32" class="animate-spin" style="color:var(--accent)" />
                <div class="empty-title" style="margin-top:12px">正在生成开幕视频</div>
                <div class="empty-desc">随机选取配图并合成翻页片头…</div>
              </div>
            </template>
            <template v-else-if="openingVideoUrl">
              <video :key="openingVideoSrc" :src="openingVideoSrc" controls class="export-video" />
              <div v-if="openingVideoError" class="narration-hint" style="margin-top:12px;color:var(--danger)">
                上次生成失败：{{ openingVideoError }}（下方为旧版本，请重新生成）
              </div>
              <div class="export-bar">
                <span class="tag tag-success">已生成</span>
                <button class="btn" :disabled="!illustrationImageCount" @click="generateOpeningVideo">重新生成</button>
                <button
                  v-if="mergeUrl && !mergeHasOpening"
                  class="btn btn-primary"
                  :disabled="mergeProcessing"
                  @click="mergeOpeningIntoMain"
                >
                  合并进主片
                </button>
                <span v-else-if="mergeHasOpening" class="tag tag-success">主片已含开幕</span>
                <a :href="openingVideoSrc" download class="btn ml-auto">下载开幕视频</a>
              </div>
            </template>
            <template v-else>
              <div class="step-empty">
                <div class="empty-visual">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div class="empty-title">生成开幕视频</div>
                <div v-if="openingVideoError" class="empty-desc" style="color:var(--danger)">{{ openingVideoError }}</div>
                <div v-else class="empty-desc">需要至少 1 张镜头配图；建议完成「生成配图」后再生成</div>
                <button
                  class="btn btn-primary"
                  style="margin-top:12px"
                  :disabled="!illustrationImageCount || openingVideoProcessing"
                  @click="generateOpeningVideo"
                >
                  生成开幕视频
                </button>
              </div>
            </template>
          </div>
        </div>
        <div v-else-if="exportTab === 'title'" class="export-opening-page">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">02</span>
                <span class="step-name">片头视频</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span class="tag dim" style="font-size:11px">{{ titleShots.length }} 个片头镜</span>
            </div>
          </div>
          <div class="export-opening-body">
            <div class="narration-hint" style="margin-bottom:16px">
              将本集所有<strong>剧中红字片头镜</strong>按顺序合成并拼接为独立 MP4（含双层叠字字幕、自下而上滑入动画）。需各片头镜已具备<strong>配图 + 配音</strong>；生成时会自动重新合成各片头镜再拼接。
            </div>
            <template v-if="titleVideoProcessing">
              <div class="step-empty">
                <Loader2 :size="32" class="animate-spin" style="color:var(--accent)" />
                <div class="empty-title" style="margin-top:12px">正在生成片头视频</div>
                <div class="empty-desc">合成 {{ titleShots.length }} 个片头镜并拼接…</div>
              </div>
            </template>
            <template v-else-if="titleVideoUrl">
              <video :key="titleVideoSrc" :src="titleVideoSrc" controls class="export-video" />
              <div v-if="titleVideoError" class="narration-hint" style="margin-top:12px;color:var(--danger)">
                上次生成失败：{{ titleVideoError }}（下方为旧版本，请重新生成）
              </div>
              <div class="export-bar" style="margin-top:12px">
                <button class="btn" :disabled="!titleShotsReady" @click="generateTitleVideo">重新生成</button>
                <a :href="titleVideoSrc" download class="btn ml-auto">下载片头视频</a>
              </div>
            </template>
            <template v-else>
              <div class="step-empty">
                <div class="empty-visual">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div class="empty-title">生成片头视频</div>
                <div v-if="!titleShots.length" class="empty-desc">本集暂无片头镜，请先完成旁白分镜</div>
                <div v-else-if="titleVideoError" class="empty-desc" style="color:var(--danger)">{{ titleVideoError }}</div>
                <div v-else-if="!titleShotsReady" class="empty-desc">请为全部 {{ titleShots.length }} 个片头镜完成配图与配音</div>
                <div v-else class="empty-desc">就绪：{{ titleShots.length }} 个片头镜可导出</div>
                <button
                  class="btn btn-primary"
                  style="margin-top:12px"
                  :disabled="!titleShotsReady || titleVideoProcessing"
                  @click="generateTitleVideo"
                >
                  生成片头视频
                </button>
              </div>
            </template>
          </div>
        </div>
        <div v-else class="export-split">
          <div class="export-main">
            <template v-if="mergeProcessing">
              <div class="step-empty">
                <Loader2 :size="32" class="animate-spin" style="color:var(--accent)" />
                <div class="empty-title" style="margin-top:12px">正在生成全集视频</div>
                <div class="empty-desc">{{ mergeProgressMessage }}</div>
                <div class="progress-wrap" style="margin-top:16px;width:min(360px,100%);margin-left:auto;margin-right:auto">
                  <div class="progress-head">
                    <span class="progress-label">拼接进度</span>
                    <span class="progress-val">{{ mergeProgressPercent }}%</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" :style="{ width: mergeProgressPercent + '%' }"></div>
                  </div>
                </div>
                <div class="empty-desc" style="margin-top:8px">将 {{ composedCount }} 个已合成镜头拼接为完整视频</div>
                <div style="display:flex;gap:8px;margin-top:16px;justify-content:center">
                  <button class="btn btn-ghost" @click="cancelMerge">取消</button>
                  <button class="btn btn-primary" @click="regenerateMerge">重新生成</button>
                </div>
              </div>
            </template>
            <template v-else-if="testMergeProcessing || testExportActive">
              <div class="step-empty">
                <Loader2 :size="32" class="animate-spin" style="color:var(--accent)" />
                <div class="empty-title" style="margin-top:12px">{{ testExportActive && !testMergeProcessing ? '正在重新合成测试镜头' : '正在测试导出' }}</div>
                <div class="empty-desc">{{ testExportActive && !testMergeProcessing ? `重新合成前 ${normalizedMergeTestClipLimit()} 镜…` : testMergeProgressMessage }}</div>
                <div v-if="testMergeProcessing" class="progress-wrap" style="margin-top:16px;width:min(360px,100%);margin-left:auto;margin-right:auto">
                  <div class="progress-head">
                    <span class="progress-label">测试拼接</span>
                    <span class="progress-val">{{ testMergeProgressPercent }}%</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" :style="{ width: testMergeProgressPercent + '%' }"></div>
                  </div>
                </div>
                <div class="empty-desc" style="margin-top:8px">重新合成并拼接前 {{ normalizedMergeTestClipLimit() }} 镜</div>
                <button v-if="testMergeProcessing" class="btn btn-ghost" style="margin-top:16px" @click="cancelMerge">取消</button>
              </div>
            </template>
            <template v-else-if="mergeUrl">
              <video :key="mergeVideoSrc" :src="mergeVideoSrc" controls class="export-video" />
              <div class="export-bar">
                <span class="tag tag-success">拼接完成</span>
                <span class="dim" style="font-size:12px">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
                <button class="btn" :disabled="composedCount === 0 || isBatchRunning('compose') || anyMergeProcessing" @click="regenerateAllComposeAndMerge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  全部重合成并导出
                </button>
                <button class="btn" :disabled="composedCount === 0 || anyMergeProcessing" @click="regenerateMerge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  重新拼接
                </button>
                <input
                  v-model.number="mergeTestClipLimit"
                  type="number"
                  min="1"
                  max="50"
                  class="input input-sm"
                  style="width:52px"
                  title="测试导出镜头数"
                />
                <button class="btn" :disabled="!canTestMerge() || anyMergeProcessing || isBatchRunning('compose')" @click="doTestMerge">
                  测试导出
                </button>
                <button
                  v-if="openingVideoUrl && !mergeHasOpening"
                  class="btn btn-primary"
                  :disabled="mergeProcessing"
                  @click="mergeOpeningIntoMain"
                >
                  合并开幕视频
                </button>
                <span v-else-if="mergeHasOpening" class="tag tag-success">已含开幕片头</span>
                <a :href="mergeVideoSrc" download class="btn btn-primary ml-auto">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="12" x2="12" y2="3"/></svg>
                  下载视频
                </a>
              </div>
            </template>
            <template v-else-if="mergeFailed">
              <div class="step-empty">
                <div class="empty-title" style="color:var(--danger)">拼接失败</div>
                <div class="empty-desc">{{ mergeFailedMessage }}</div>
                <video v-if="previousMergeUrl" :src="'/' + previousMergeUrl" controls class="export-video" style="margin-top:16px;opacity:0.72" />
                <div v-if="previousMergeUrl" class="dim" style="font-size:12px;margin-top:8px">上方为上次成功成片（仅供参考）</div>
                <div style="display:flex;gap:8px;margin-top:16px;justify-content:center;flex-wrap:wrap">
                  <button class="btn btn-primary" :disabled="composedCount === 0 || isBatchRunning('compose') || anyMergeProcessing" @click="regenerateAllComposeAndMerge">全部重合成并导出</button>
                  <button class="btn" :disabled="composedCount === 0 || anyMergeProcessing" @click="regenerateMerge">仅重新拼接</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="step-empty">
                <div class="empty-visual">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div class="empty-title">生成全集视频</div>
                <div class="empty-desc">将 {{ composedCount }}/{{ sbs.length }} 个已合成镜头拼接为主片（不含开幕视频）{{ composedCount < sbs.length ? '（需全部镜头合成完成）' : '' }}{{ exportMixBgm && exportBgmMusicId ? '，并混入所选 BGM' : '' }}；开幕片头可在生成后单独合并。</div>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;justify-content:center;align-items:center">
                  <button class="btn btn-primary" :disabled="composedCount === 0 || composedCount < sbs.length || anyMergeProcessing" @click="doMerge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    开始生成
                  </button>
                  <span class="dim" style="font-size:12px">或</span>
                  <input
                    v-model.number="mergeTestClipLimit"
                    type="number"
                    min="1"
                    max="50"
                    class="input input-sm"
                    style="width:52px"
                    title="测试导出镜头数"
                  />
                  <button class="btn" :disabled="!canTestMerge() || anyMergeProcessing || isBatchRunning('compose')" @click="doTestMerge">
                    测试导出
                  </button>
                </div>
                <div class="dim" style="font-size:11px;margin-top:8px;text-align:center">测试导出会先重新合成前 N 镜，再拼接导出（无需全部完成）</div>
              </div>
            </template>
          </div>
          <div class="export-list">
            <div class="export-list-head">导出选项</div>
            <div class="export-list-options">
            <div class="export-bgm-panel export-bgm-panel-primary">
              <div class="export-list-head" style="margin:0;padding:0 0 6px;border:none;text-transform:none;letter-spacing:0;font-size:12px;color:var(--text-1)">成片 BGM</div>
              <label class="export-bgm-toggle">
                <input v-model="exportMixBgm" type="checkbox" />
                <span>拼接时混入 BGM</span>
              </label>
              <div class="dim" style="font-size:11px;line-height:1.5">
                默认使用各镜头「镜头合成」时已混入的 BGM；勾选后会在整集成片上再铺一层（与镜头 BGM 可叠加）。
              </div>
              <div v-if="exportMixBgm" class="export-bgm-fields">
                <BaseSelect
                  :model-value="exportBgmMusicId"
                  :options="exportBgmOptions"
                  placeholder="选择 BGM 曲目"
                  searchable
                  style="width:100%"
                  @update:model-value="exportBgmMusicId = $event"
                />
                <div v-if="!exportBgmOptions.length" class="dim" style="font-size:11px;line-height:1.5">
                  暂无可用 BGM，请在本项目任意集的「BGM 配乐」步骤生成，或
                  <button class="btn btn-ghost btn-sm" style="padding:0 4px;font-size:11px" @click="panel = 'production'; prodTab = 'bgm'">前往生成</button>
                </div>
                <div v-else class="export-bgm-volume">
                  <span class="dim" style="font-size:11px">BGM 音量 {{ exportBgmVolume }}%</span>
                  <input v-model.number="exportBgmVolume" type="range" min="3" max="25" step="1" class="export-bgm-slider" />
                </div>
                <audio
                  v-if="exportBgmPreviewUrl"
                  :src="exportBgmPreviewUrl"
                  controls
                  preload="none"
                  class="dub-audio"
                  style="width:100%;margin-top:4px"
                />
                <button
                  class="btn btn-sm"
                  style="width:100%;margin-top:4px"
                  :disabled="!exportBgmMusicId || exportBgmApplying"
                  @click="applyExportBgmToAllShots"
                >
                  {{ exportBgmApplying ? '应用中…' : '应用到全部镜头（需重合成）' }}
                </button>
              </div>
            </div>
            <div v-if="testMergeUrl || testMergeProcessing || testMergeFailed" class="export-bgm-panel" style="margin-bottom:12px">
              <div class="field-label" style="margin-bottom:6px">测试导出</div>
              <div class="dim" style="font-size:11px;line-height:1.5;margin-bottom:8px">
                先重新合成前 N 镜，再快速拼接测试片，不影响正式成片。
              </div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
                <input
                  v-model.number="mergeTestClipLimit"
                  type="number"
                  min="1"
                  max="50"
                  class="input input-sm"
                  style="width:56px"
                  title="测试导出镜头数"
                />
                <span class="dim" style="font-size:11px">镜</span>
                <button class="btn btn-sm" :disabled="!canTestMerge() || anyMergeProcessing || isBatchRunning('compose')" @click="doTestMerge">
                  {{ testMergeProcessing ? '测试中…' : '测试导出' }}
                </button>
              </div>
              <template v-if="testMergeProcessing">
                <div class="dim" style="font-size:11px;margin-bottom:4px">{{ testMergeProgressMessage }}</div>
                <div class="progress-track" style="height:6px">
                  <div class="progress-fill" :style="{ width: testMergeProgressPercent + '%' }"></div>
                </div>
              </template>
              <template v-else-if="testMergeUrl">
                <video :key="testMergeVideoSrc" :src="testMergeVideoSrc" controls class="export-video" style="max-height:220px;margin-top:8px" />
                <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
                  <span class="tag tag-success">测试完成</span>
                  <span class="dim" style="font-size:11px">{{ testMergeClipCount }} 镜 · {{ testMergeBlock?.duration || '—' }}s</span>
                  <a :href="testMergeVideoSrc" download class="btn btn-sm ml-auto">下载测试片</a>
                </div>
              </template>
              <div v-else-if="testMergeFailed" class="prod-error" style="margin-top:6px">{{ testMergeFailedMessage }}</div>
            </div>
            <div class="export-bgm-panel">
              <label class="field-label" style="margin-bottom:4px">成片水印</label>
              <input
                v-model="exportWatermarkText"
                class="input input-sm"
                type="text"
                placeholder="留空则不添加水印"
                @change="saveWatermarkText"
              />
              <label class="export-bgm-toggle" style="margin-top:8px">
                <input v-model="exportWatermarkAnimated" type="checkbox" />
                <span>水印左右缓慢浮动</span>
              </label>
              <div class="dim" style="font-size:11px;line-height:1.5">
                默认「顺拾人间」，固定于画面右上角（距顶、距右各 10%）；勾选浮动后在右上区域左右缓慢漂移。修改后请重新「镜头合成」与「开幕视频」。
              </div>
            </div>
            <div class="export-bgm-panel">
              <div class="field-label" style="margin-bottom:4px">开幕片头</div>
              <div class="dim" style="font-size:11px;line-height:1.5">
                默认拼接<strong>不含</strong>开幕视频。主片生成后，在左侧预览区或「开幕视频」页点击「合并开幕视频」。
              </div>
              <button
                v-if="mergeUrl && openingVideoUrl && !mergeHasOpening"
                class="btn btn-sm"
                style="margin-top:8px"
                :disabled="mergeProcessing"
                @click="mergeOpeningIntoMain"
              >
                合并开幕视频进主片
              </button>
              <div v-else-if="mergeHasOpening" class="tag tag-success" style="margin-top:8px">当前成片已含开幕片头</div>
              <div v-else-if="!openingVideoUrl" class="dim" style="font-size:11px;margin-top:6px">
                尚未生成开幕视频，请先在「开幕视频」步骤生成。
              </div>
            </div>
            </div>
            <div class="export-list-head">镜头概览</div>
            <div class="export-list-body">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="exp-row">
                <span class="mono dim" style="font-size:10px">#{{ String(i+1).padStart(2,'0') }}</span>
                <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
                <button v-if="isNarrationMode" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px" @click="openShotEditor(sb)">编辑</button>
                <span :class="['dot', hasComposed(sb) && 'ok']" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showBottomBubble" class="step-bubble">
        <button
          v-if="panel === 'script'"
          class="bubble-btn"
          :disabled="scriptStep === 0"
          @click="goPrevStep"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ prevStepLabel || '上一步' }}
        </button>
        <button
          v-else-if="panel === 'production'"
          class="bubble-btn"
          :disabled="prodTabIdx === 0"
          @click="prodTabIdx = Math.max(0, prodTabIdx - 1)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ prodTabDefs[Math.max(0, prodTabIdx - 1)]?.label || '上一步' }}
        </button>

        <div class="bubble-dots">
          <button
            v-for="step in bubbleSteps"
            :key="step.key"
            :class="['bubble-dot', { done: step.done, current: step.key === activeBubbleKey }]"
            @click="goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>

        <button
          v-if="panel === 'script'"
          class="bubble-btn primary"
          :disabled="!canGoNext"
          @click="goNextStep"
        >
          {{ nextStepLabel || '下一步' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <button
          v-else-if="panel === 'production'"
          class="bubble-btn primary"
          :disabled="panel === 'production' && prodTab === 'compose' && !canExport"
          @click="goNextProd"
        >
          {{ prodTabIdx < prodTabDefs.length - 1 ? (prodTabDefs[prodTabIdx + 1]?.label || '下一步') : '进入导出' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

      <div v-if="shotEditor.open && shotEditor.sb" class="overlay shot-editor-overlay" @click.self="closeShotEditor">
        <div class="card shot-editor-dialog" @click.stop>
          <div class="shot-editor-head">
            <div>
              <div class="shot-editor-title">编辑镜头 #{{ shotEditor.number }}</div>
              <div class="shot-editor-sub">
                <span v-if="shotEditor.isTitle" class="tag tag-title">片头 · 剧中红字</span>
                <span v-else class="tag">旁白镜头</span>
                <span class="dim" style="font-size:11px;margin-left:6px">{{ shotEditor.shotType || '未设景别' }} · {{ shotEditor.duration }}s</span>
              </div>
            </div>
            <button class="btn btn-ghost btn-icon" @click="closeShotEditor">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="shot-editor-body">
            <label class="field">
              <span class="field-label">{{ shotEditor.isTitle ? '剧中台词（合成红字）' : '旁白台词' }}</span>
              <textarea v-model="shotEditor.dialogue" class="textarea" rows="3" :placeholder="shotEditor.isTitle ? '剧中：今天体验的人生剧本是，' : '旁白：职高读到第二年六月，'" />
              <span class="dim" style="font-size:11px;margin-top:4px;display:block">
                {{ shotEditor.isTitle ? '片头改字后点「保存并重新制作」：将重新配音并合成全部片头镜。' : '改台词后需重新配音并重新合成该镜。' }}
              </span>
            </label>
            <label class="field">
              <span class="field-label">画面描述（列表展示用）</span>
              <textarea v-model="shotEditor.description" class="textarea" rows="2" placeholder="可选，默认与台词一致" />
            </label>
            <div class="field-grid field-grid-2">
              <label class="field">
                <span class="field-label">时长（秒）</span>
                <input v-model.number="shotEditor.duration" class="input" type="number" min="1" max="60" />
              </label>
              <label class="field">
                <span class="field-label">镜头标题</span>
                <input v-model="shotEditor.title" class="input" placeholder="可选" />
              </label>
            </div>
          </div>
          <div class="shot-editor-foot">
            <button class="btn" :disabled="shotEditor.busy" @click="closeShotEditor">取消</button>
            <button class="btn" :disabled="shotEditor.busy" @click="splitShotByPunctuation(shotEditor.sb)">按标点拆成多镜</button>
            <button class="btn" :disabled="shotEditor.busy" @click="saveShotEditor(false)">仅保存</button>
            <button class="btn btn-primary" :disabled="shotEditor.busy" @click="saveShotEditor(true)">
              <Loader2 v-if="shotEditor.busy" :size="12" class="animate-spin" />
              {{ shotEditor.busy ? '处理中…' : '保存并重新制作' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="imageViewer.open && imageViewer.src" class="overlay image-viewer-overlay" @click.self="closeImageViewer">
        <div class="card image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ imageViewer.title || '图片预览' }}</div>
            <button class="btn btn-ghost btn-icon" @click="closeImageViewer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="image-viewer-body">
            <img :src="imageViewer.src" :alt="imageViewer.title || '图片预览'" class="image-viewer-img" />
          </div>
        </div>
      </div>
    </main>
    </div>
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
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { toast } from 'vue-sonner'
import {
  Users, MapPin, Video, ImageIcon, Layers, Mic2, Music, FileText, FolderKanban, Clapperboard, Download, Film,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, imageAPI, videoAPI, composeAPI, mergeAPI, gridAPI, aiConfigAPI, voicesAPI, musicAPI, uploadAPI } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'
import {
  parseProductionMode,
  buildSidebarSections,
  workflowProgress,
  workflowStepTotal,
  resolveScriptStep,
  resolveActiveSubStepKey,
  inferNarrationScriptStep,
  buildNarrationImagePrompt,
  buildNarrationImageGeneratePayload,
  imageModelSupportsReferenceImages,
  resolveSceneContentForShot,
  extractNarrationSentence,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TEXT_MODEL,
  DEFAULT_TEXT_THINKING,
  IMAGE_MODEL_OPTIONS,
  TEXT_MODEL_OPTIONS,
  resolveEpisodeTextModel,
  resolveEpisodeTextThinking,
  textModelSupportsThinking,
  BGM_MODEL_OPTIONS,
  DEFAULT_BGM_MODEL,
  bgmModelLabel,
  imageModelUnitPrice,
  imageModelPriceLabel,
  resolveEpisodeImageModel,
  narrationShotNeedsOwnImage,
  resolveNarrationParagraphLayout,
  isNarrationTitleShot,
  getNarrationShotOwnImage,
  resolveNarrationEffectiveImage,
  narrationShotsNeedingImage,
  narrationShotsPendingImage,
  narrationShotsWithUploadedImage,
  getNarrationShotDisplayNo,
  formatNarrationShotDisplayList,
  formatNarrationPendingImageHint,
  narrationShotImageReady,
  narrationImagesReady,
  narrationTtsReady as narrationTtsAllReady,
  getNarrationShotOwnTts,
  resolveNarrationEffectiveTts,
  parseNarrationImageMeta,
  sortStoryboards,
  hasDuplicateStoryboardNumbers,
  hasEffectiveNarrationTts,
  formatCharacterDisplayName,
  normalizeVariantLabel,
  variantNeedsYouthPortraitReference,
  getVariantAgeGroup,
  findYouthBaseCharacter,
  findPortraitReferenceCharacter,
  findDramaStyleAnchorCharacter,
  sortCharactersForPortraitGeneration,
  dramaStoryboardStep,
  narrationStoryboardStep,
} from '~/composables/useEpisodeWorkflow'
import { artStyleLabel } from '~/composables/useArtStyles'
import { buildFolderUploadSlots, isImageUploadFile, parseShotImageFilename } from '~/utils/shotImageFilename'
import BaseSelect from '~/components/BaseSelect.vue'

definePageMeta({ layout: 'studio' })

const route = useRoute()
const dramaId = Number(route.params.id)
const episodeNumber = Number(route.params.episodeNumber)

const drama = ref(null), episode = ref(null), chars = ref([]), scenes = ref([]), sbs = ref([]), mergeData = ref(null)

function findNarratorChar(list = chars.value) {
  const candidates = list.filter(c => c.name === '旁白'
    || /^(旁白|画外音|narrator)$/i.test(String(c.name || '').trim())
    || (c.role === '旁白' && /旁白|画外音|narrator/i.test(`${c.name || ''} ${c.role || ''}`)))
  if (!candidates.length) return undefined
  return candidates.find(c => c.voice_style || c.voiceStyle) || candidates[0]
}

const productionMode = computed(() => parseProductionMode(drama.value))
const isNarrationMode = computed(() => productionMode.value === 'narration')
const storyboardStep = computed(() => isNarrationMode.value ? narrationStoryboardStep() : dramaStoryboardStep())
const narratorChar = computed(() => findNarratorChar(chars.value))
const narratorReady = computed(() => localTtsEnabled.value || !!(narratorChar.value?.voice_style || narratorChar.value?.voiceStyle))
const narratorVoiceId = ref('')
const narratorVoiceDirty = ref(false)
const DEFAULT_LOCAL_EDGE_VOICE = 'zh-CN-YunxiNeural'
const localTtsEnabled = ref(true)
const localTtsEngine = ref('voicebox')
const localEdgeVoiceId = ref(DEFAULT_LOCAL_EDGE_VOICE)
const edgeVoiceProfiles = ref([])
const voiceboxAvailable = ref(false)
const localTtsEngineOptions = [
  { label: 'Voicebox（声音克隆）', value: 'voicebox' },
  { label: 'Edge TTS（系统音色）', value: 'edge' },
]
const DEFAULT_TTS_SPEED = 0.75
const localTtsSpeedOptions = [
  { label: '0.5x', value: 0.5 },
  { label: '0.6x', value: 0.6 },
  { label: '0.75x（默认）', value: 0.75 },
  { label: '0.8x', value: 0.8 },
  { label: '0.85x', value: 0.85 },
  { label: '1.0x', value: 1 },
  { label: '1.25x', value: 1.25 },
]
const localTtsSpeed = ref(DEFAULT_TTS_SPEED)
const VOICEBOX_INSTRUCT_CUSTOM = '__custom__'
const voiceboxInstructOptions = [
  { label: '默认（自然）', value: '' },
  { label: '沉稳叙述', value: '沉稳、清晰，适合纪录片旁白' },
  { label: '温暖亲切', value: '温暖亲切，带有微笑感' },
  { label: '略带感慨', value: '略带感慨，语速适中，有感情' },
  { label: '紧张悬疑', value: '紧张、悬疑，压低声音' },
  { label: '激昂有力', value: '激昂有力，广播质感' },
  { label: '轻声低语', value: '轻声、亲密，如同在耳边诉说' },
  { label: '自定义…', value: VOICEBOX_INSTRUCT_CUSTOM },
]
const DEFAULT_VOICEBOX_MODEL_SIZE = '0.6B'
const localVoiceboxModelSize = ref(DEFAULT_VOICEBOX_MODEL_SIZE)
const voiceboxModelSizeOptions = [
  { label: '0.6B（默认·更快）', value: '0.6B' },
  { label: '1.7B（更高质量）', value: '1.7B' },
]
const localVoiceboxInstructPreset = ref('略带感慨，语速适中，有感情')
const localVoiceboxInstructCustom = ref('')
const LOCAL_TTS_PREVIEW_DEFAULT = '这是一段旁白试听，用于感受当前音色、语速和感情效果。'
const localTtsPreviewing = ref(false)
const localTtsPreviewUrl = ref('')
const localTtsPreviewSrc = computed(() => {
  if (!localTtsPreviewUrl.value) return ''
  const path = localTtsPreviewUrl.value.replace(/^\//, '')
  return `/${path}?v=${encodeURIComponent(localTtsPreviewBump.value)}`
})
const localTtsPreviewBump = ref(0)
const localTtsSpeedLabel = computed(() => {
  const opt = localTtsSpeedOptions.find(o => o.value === localTtsSpeed.value)
  return opt?.label || `${localTtsSpeed.value}x`
})
const localTtsEngineLabel = computed(() => {
  if (!localTtsEnabled.value) return lockedAudioConfigLabel.value
  return localTtsEngine.value === 'voicebox' ? '本地 Voicebox' : '本地 Edge TTS'
})
function resolveVoiceboxInstructText() {
  if (localVoiceboxInstructPreset.value === VOICEBOX_INSTRUCT_CUSTOM) {
    return String(localVoiceboxInstructCustom.value || '').trim()
  }
  return String(localVoiceboxInstructPreset.value || '').trim()
}
const localVoiceboxInstructLabel = computed(() => {
  if (localTtsEngine.value !== 'voicebox') return ''
  const instruct = resolveVoiceboxInstructText()
  if (!instruct) return ''
  if (localVoiceboxInstructPreset.value === VOICEBOX_INSTRUCT_CUSTOM) {
    return instruct.length > 12 ? `${instruct.slice(0, 12)}…` : instruct
  }
  const opt = voiceboxInstructOptions.find(o => o.value === localVoiceboxInstructPreset.value)
  return opt?.label || instruct
})
const localVoiceboxModelSizeLabel = computed(() => {
  if (localTtsEngine.value !== 'voicebox') return ''
  const opt = voiceboxModelSizeOptions.find(o => o.value === localVoiceboxModelSize.value)
  return opt?.label || localVoiceboxModelSize.value
})
const pipelineStepTotal = computed(() => workflowStepTotal(productionMode.value))
const panel = ref('script')
const { running: rn, runningType: rt, run: runAgent } = useAgent()
const narrationBreaking = ref(false)
const narrationImageBreaking = ref(false)
const narrationImageBreakdownProgress = ref(null)
const narrationStoryboardDescUploading = ref(false)
const narrationImageDescUploading = ref(false)
const storyboardDescUploadTarget = ref(null)
const storyboardDescUploadInputRef = ref(null)
const narrationExtracting = ref(false)
const narrationBreakdownSummary = ref(null)
const imageDetectMode = ref('paragraph')

const localRaw = ref(''), localScript = ref('')
const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const charsVoiced = computed(() => chars.value.filter(c => c.voice_style || c.voiceStyle).length)
const voiceSampleCount = computed(() => chars.value.filter(c => c.voice_sample_url || c.voiceSampleUrl).length)
const composedCount = computed(() => sbs.value.filter(s => s.composed_video_url || s.composedVideoUrl).length)
const mergeUrl = computed(() => {
  if (mergeData.value?.status !== 'completed') return null
  return mergeData.value?.merged_url || mergeData.value?.mergedUrl || null
})
const mergeFailed = computed(() => mergeData.value?.status === 'failed')
const mergeFailedMessage = computed(() =>
  mergeData.value?.error_msg || mergeData.value?.errorMsg || '拼接失败，请重试',
)
const previousMergeUrl = computed(() =>
  mergeData.value?.previous_merged_url || mergeData.value?.previousMergedUrl || null,
)
const mergeProcessing = computed(() => ['processing', 'pending'].includes(mergeData.value?.status))
const mergeTestClipLimit = ref(20)
const pendingMergeKind = ref(null)
const testMergeBlock = computed(() => mergeData.value?.test || null)
const testMergeUrl = computed(() => {
  if (testMergeBlock.value?.status !== 'completed') return null
  return testMergeBlock.value.merged_url || testMergeBlock.value.mergedUrl || null
})
const testMergeProcessing = computed(() => ['processing', 'pending'].includes(testMergeBlock.value?.status))
const testMergeFailed = computed(() => testMergeBlock.value?.status === 'failed')
const testMergeFailedMessage = computed(() =>
  testMergeBlock.value?.error_msg || testMergeBlock.value?.errorMsg || '测试导出失败',
)
const testMergeProgressPercent = computed(() => {
  const p = testMergeBlock.value?.progress_percent ?? testMergeBlock.value?.progressPercent
  return typeof p === 'number' ? Math.min(100, Math.max(0, Math.round(p))) : 0
})
const testMergeProgressMessage = computed(() =>
  testMergeBlock.value?.progress_message || testMergeBlock.value?.progressMessage || '正在测试拼接…',
)
const testExportActive = computed(() =>
  pendingMergeKind.value === 'test' && (testMergeProcessing.value || batchRunning.value.has('compose')),
)
const anyMergeProcessing = computed(() => mergeProcessing.value || testMergeProcessing.value || testExportActive.value)
const mergeProgressPercent = computed(() => {
  const p = mergeData.value?.progress_percent ?? mergeData.value?.progressPercent
  return typeof p === 'number' ? Math.min(100, Math.max(0, Math.round(p))) : 0
})
const mergeProgressMessage = computed(() =>
  mergeData.value?.progress_message || mergeData.value?.progressMessage || '正在拼接镜头…',
)
const narrationImageBreakdownProgressPercent = computed(() => {
  const p = narrationImageBreakdownProgress.value?.percent
  return typeof p === 'number' ? Math.min(100, Math.max(0, Math.round(p))) : 0
})
const narrationImageBreakdownProgressMessage = computed(() => {
  const progress = narrationImageBreakdownProgress.value
  if (!progress) return '正在启动配图分镜…'
  const batch = progress.batch ?? progress.batchCount
  const batchCount = progress.batch_count ?? progress.batchCount
  if (batch && batchCount && progress.phase === 'prompts') {
    return progress.message || `正在生成配图文案（第 ${batch}/${batchCount} 批）…`
  }
  return progress.message || '配图分镜进行中…'
})
let mergePollTimer = null
let narrationImageBreakdownPollTimer = null
const mergeVideoSrc = computed(() => {
  if (!mergeUrl.value) return ''
  const v = mergeData.value?.id || mergeData.value?.completed_at || mergeData.value?.completedAt || Date.now()
  return `/${mergeUrl.value}?v=${encodeURIComponent(String(v))}`
})
const testMergeVideoSrc = computed(() => {
  if (!testMergeUrl.value) return ''
  const v = testMergeBlock.value?.id || testMergeBlock.value?.completed_at || testMergeBlock.value?.completedAt || Date.now()
  return `/${testMergeUrl.value}?v=${encodeURIComponent(String(v))}`
})
const testMergeClipCount = computed(() => {
  const raw = testMergeBlock.value?.scenes
  if (raw && typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.clips)) return parsed.clips.length
      if (Array.isArray(parsed)) return parsed.length
    } catch {}
  }
  return normalizedMergeTestClipLimit()
})
const mergeHasOpening = computed(() => {
  const raw = mergeData.value?.scenes
  if (!raw || typeof raw !== 'string') return false
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed.with_opening === true || parsed.withOpening === true)
  } catch {
    return false
  }
})

const illustrationImageCount = computed(() => {
  const urls = new Set()
  for (const sb of sbs.value) {
    const img = sb.composed_image || sb.composedImage || sb.first_frame_image || sb.firstFrameImage
    if (img) urls.add(img)
  }
  return urls.size
})
const openingVideoUrl = computed(() => episode.value?.opening_video_url || episode.value?.openingVideoUrl || null)
const openingVideoError = computed(() => episode.value?.opening_video_error || episode.value?.openingVideoError || '')
const titleVideoUrl = computed(() => episode.value?.title_video_url || episode.value?.titleVideoUrl || null)
const titleVideoError = computed(() => episode.value?.title_video_error || episode.value?.titleVideoError || '')
const titleShots = computed(() => sbs.value.filter(sb => isNarrationTitleShot(sb)))
const titleShotsReady = computed(() => {
  if (!titleShots.value.length) return false
  return titleShots.value.every(sb =>
    hasDialogue(sb)
    && hasNarrationShotOwnTts(sb)
    && !!getStoryboardCover(sb),
  )
})
const openingAudioUrl = computed(() => episode.value?.opening_audio_url || episode.value?.openingAudioUrl || '')
const openingAudioSrc = computed(() => openingAudioUrl.value ? `/${openingAudioUrl.value.replace(/^\//, '')}` : '')
const OPENING_SUBTITLE_DEFAULT = '体验365个人生副本'
const OPENING_SUBTITLE_LEGACY = '今天要体验的人生是'
function resolveOpeningSubtitleText(stored) {
  const trimmed = String(stored || '').trim()
  if (!trimmed || trimmed === OPENING_SUBTITLE_LEGACY) return OPENING_SUBTITLE_DEFAULT
  return trimmed
}
const openingSubtitleText = ref(OPENING_SUBTITLE_DEFAULT)
const openingAudioUploading = ref(false)
const openingAudioGenerating = ref(false)
const openingVideoProcessing = ref(false)
const titleVideoProcessing = ref(false)
let openingPollTimer = null
const openingVideoSrc = computed(() => {
  if (!openingVideoUrl.value) return ''
  const v = openingVideoUrl.value.split('/').pop() || episode.value?.updated_at || episode.value?.updatedAt || Date.now()
  return `/${openingVideoUrl.value}?v=${encodeURIComponent(String(v))}`
})
const titleVideoSrc = computed(() => {
  if (!titleVideoUrl.value) return ''
  const v = titleVideoUrl.value.split('/').pop() || episode.value?.updated_at || episode.value?.updatedAt || Date.now()
  return `/${titleVideoUrl.value}?v=${encodeURIComponent(String(v))}`
})

const scriptStep = ref(0)
const prodTab = ref('chars')
const exportTab = ref('merge')
const bgmLibrary = ref([])
const bgmGenerating = ref(false)
const bgmUploading = ref(false)
const bgmUploadInput = ref(null)
const narrationCropWatermarkProcessing = ref(false)
const narrationRestoreWatermarkProcessing = ref(false)
const bgmDescGenerating = ref(false)
const bgmDesc = ref('')
const bgmTargetSbId = ref(null)
const bgmModel = ref(DEFAULT_BGM_MODEL)
const musicConfigs = ref([])
let bgmPollTimer = null
let bgmPollTick = 0
const bgmAppliedCount = computed(() => sbs.value.filter(s => s.bgm_audio_url || s.bgmAudioUrl).length)
const bgmCompletedCount = computed(() => bgmLibrary.value.filter(m => m.status === 'completed').length)
const bgmPendingCount = computed(() => bgmLibrary.value.filter(m => ['pending', 'processing'].includes(m.status)).length)
const exportMixBgm = ref(false)
const exportWatermarkText = ref('顺拾人间')
const exportWatermarkAnimated = ref(false)
let watermarkSaveTimer = null
const exportBgmMusicId = ref(null)
const exportBgmVolume = ref(12)
const exportBgmApplying = ref(false)
const bgmApplyingAllId = ref(null)
const visibleBgmLibrary = computed(() => {
  const items = bgmLibrary.value.filter(m => m.status !== 'deleted')
  const completedTaskIds = new Set(
    items.filter(m => m.status === 'completed' && (m.task_id || m.taskId)).map(m => String(m.task_id || m.taskId)),
  )
  return items
    .filter(m => !(m.status === 'processing' && (m.task_id || m.taskId) && completedTaskIds.has(String(m.task_id || m.taskId))))
    .sort((a, b) => {
      const rank = s => s.status === 'completed' ? 0 : s.status === 'processing' ? 1 : 2
      const diff = rank(a.status) - rank(b.status)
      return diff !== 0 ? diff : Number(b.id || 0) - Number(a.id || 0)
    })
})
const exportBgmOptions = computed(() =>
  visibleBgmLibrary.value
    .filter(m => m.status === 'completed' && (m.local_path || m.localPath))
    .map(m => {
      const fromOtherEpisode = m.episode_id && epId.value && m.episode_id !== epId.value
      return {
        value: m.id,
        label: `${m.title || 'BGM'} #${m.id}${fromOtherEpisode ? ' · 其他集' : ''}`,
      }
    }),
)
const exportBgmPreviewUrl = computed(() => {
  if (!exportBgmMusicId.value) return ''
  const item = bgmLibrary.value.find(m => m.id === exportBgmMusicId.value)
  const path = item?.local_path || item?.localPath
  return path ? `/${path}` : ''
})
const bgmModelOptions = computed(() => {
  const models = new Map(BGM_MODEL_OPTIONS.map(o => [o.value, o.label]))
  for (const cfg of musicConfigs.value) {
    const m = cfg.model
    if (Array.isArray(m)) m.forEach(x => { if (!models.has(x)) models.set(x, x) })
    else if (m && !models.has(m)) models.set(m, m)
  }
  return [...models.entries()].map(([value, label]) => ({ value, label }))
})
const prodTabIdx = computed({
  get: () => prodTabDefs.value.findIndex(t => t.id === prodTab.value),
  set: (v) => { prodTab.value = prodTabDefs.value[v]?.id || 'chars' },
})
const frameMode = ref('first')
const fallbackVoiceProfiles = [
  { id: 'alloy', label: 'Alloy', gender: '中性', traits: '平衡、自然、克制', suitable: '通用叙述、旁白、需要稳定输出的角色' },
  { id: 'echo', label: 'Echo', gender: '男声', traits: '低沉、稳重、冷静', suitable: '成熟男性、父辈、旁白、压迫感角色' },
  { id: 'fable', label: 'Fable', gender: '男声', traits: '温暖、讲述感、表现力强', suitable: '男主、成长型角色、叙事担当' },
  { id: 'onyx', label: 'Onyx', gender: '男声', traits: '深沉、有力、权威', suitable: '反派、强势角色、掌控型人物' },
  { id: 'nova', label: 'Nova', gender: '女声', traits: '温柔、甜润、亲和', suitable: '女主、母亲、柔和配角' },
  { id: 'shimmer', label: 'Shimmer', gender: '女声', traits: '明亮、活泼、年轻', suitable: '少女、轻快角色、跳脱配角' },
]
const voiceProfiles = ref(fallbackVoiceProfiles)
const voiceSelectOptions = computed(() => voiceProfiles.value.map(v => ({ label: `${v.label} · ${v.traits}`, value: v.id })))
const edgeVoiceSelectOptions = computed(() => edgeVoiceProfiles.value.map(v => ({ label: v.label, value: v.id })))

function buildLocalTtsPreviewPayload(textOverride) {
  const text = String(textOverride || '').trim() || LOCAL_TTS_PREVIEW_DEFAULT
  const payload = {
    local_tts_engine: localTtsEngine.value === 'voicebox' ? 'voicebox' : 'edge',
    local_voice: localEdgeVoiceId.value,
    tts_speed: localTtsSpeed.value,
    text,
  }
  if (localTtsEngine.value === 'voicebox') {
    const instruct = resolveVoiceboxInstructText()
    if (instruct) payload.voicebox_instruct = instruct
    payload.voicebox_model_size = localVoiceboxModelSize.value
  }
  return payload
}

function selectedVoiceboxVoiceReady() {
  if (localTtsEngine.value !== 'voicebox') return true
  const row = edgeVoiceProfiles.value.find(p => p.id === localEdgeVoiceId.value)
  return row?.modelReady !== false
}

async function previewLocalTtsVoice(textOverride) {
  if (!localEdgeVoiceId.value) {
    toast.warning(localTtsEngine.value === 'voicebox' ? '请选择 Voicebox 音色' : '请选择本地音色')
    return
  }
  if (localTtsEngine.value === 'voicebox' && !voiceboxAvailable.value) {
    toast.warning('Voicebox 未运行，请先启动 Voicebox')
    return
  }
  if (!selectedVoiceboxVoiceReady()) {
    const row = edgeVoiceProfiles.value.find(p => p.id === localEdgeVoiceId.value)
    toast.warning(row?.modelHint || '该预设音色所需模型尚未下载完成，请先在 Voicebox → Models 中下载，或改用克隆音色「111」')
    return
  }
  try {
    localTtsPreviewing.value = true
    const res = await voicesAPI.previewLocal(buildLocalTtsPreviewPayload(textOverride))
    const path = res?.audio_url || res?.audioUrl
    if (!path) throw new Error('试听生成失败')
    localTtsPreviewUrl.value = path
    localTtsPreviewBump.value = Date.now()
    toast.success('试听已生成，可直接播放')
  } catch (e) {
    toast.error(e.message)
  } finally {
    localTtsPreviewing.value = false
  }
}

function ttsGenerateOptions(force = false) {
  const opts = {}
  if (force) opts.force = true
  if (isNarrationMode.value && localTtsEnabled.value !== false) {
    opts.local_tts = true
    opts.local_tts_engine = localTtsEngine.value === 'voicebox' ? 'voicebox' : 'edge'
    opts.local_voice = localEdgeVoiceId.value
    opts.tts_speed = localTtsSpeed.value
    if (localTtsEngine.value === 'voicebox') {
      const instruct = resolveVoiceboxInstructText()
      if (instruct) opts.voicebox_instruct = instruct
      opts.voicebox_model_size = localVoiceboxModelSize.value
    }
  } else if (!isNarrationMode.value) {
    // drama mode: never send local_tts
  } else {
    opts.local_tts = false
  }
  return opts
}

function persistLocalTtsPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  window.localStorage.setItem(`episode-${epId.value}-local-tts`, localTtsEnabled.value ? '1' : '0')
  window.localStorage.setItem(`episode-${epId.value}-local-tts-engine`, localTtsEngine.value)
  window.localStorage.setItem(`episode-${epId.value}-local-voice`, localEdgeVoiceId.value)
  window.localStorage.setItem(`episode-${epId.value}-local-tts-speed`, String(localTtsSpeed.value))
  window.localStorage.setItem(`episode-${epId.value}-voicebox-instruct-preset`, localVoiceboxInstructPreset.value)
  window.localStorage.setItem(`episode-${epId.value}-voicebox-instruct-custom`, localVoiceboxInstructCustom.value)
  window.localStorage.setItem(`episode-${epId.value}-voicebox-model-size`, localVoiceboxModelSize.value)
}

function restoreLocalTtsPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const stored = window.localStorage.getItem(`episode-${epId.value}-local-tts`)
  localTtsEnabled.value = stored === null ? true : stored === '1'
  const engine = window.localStorage.getItem(`episode-${epId.value}-local-tts-engine`)
  if (engine === 'edge' || engine === 'voicebox') localTtsEngine.value = engine
  const voice = window.localStorage.getItem(`episode-${epId.value}-local-voice`)
  if (voice) localEdgeVoiceId.value = voice
  const speed = Number(window.localStorage.getItem(`episode-${epId.value}-local-tts-speed`))
  if (Number.isFinite(speed) && speed >= 0.5 && speed <= 2) localTtsSpeed.value = speed
  const instructPreset = window.localStorage.getItem(`episode-${epId.value}-voicebox-instruct-preset`)
  if (instructPreset !== null) {
    const known = voiceboxInstructOptions.some(o => o.value === instructPreset)
    localVoiceboxInstructPreset.value = known ? instructPreset : ''
  }
  const instructCustom = window.localStorage.getItem(`episode-${epId.value}-voicebox-instruct-custom`)
  if (instructCustom) localVoiceboxInstructCustom.value = instructCustom
  const modelSize = window.localStorage.getItem(`episode-${epId.value}-voicebox-model-size`)
  if (modelSize === '0.6B' || modelSize === '1.7B') localVoiceboxModelSize.value = modelSize
}

function persistExportBgmPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  window.localStorage.setItem(`episode-${epId.value}-export-mix-bgm`, exportMixBgm.value ? '1' : '0')
  window.localStorage.setItem(`episode-${epId.value}-export-watermark`, exportWatermarkText.value)
  window.localStorage.setItem(`episode-${epId.value}-export-watermark-animated`, exportWatermarkAnimated.value ? '1' : '0')
  window.localStorage.setItem(`drama-${dramaId}-export-bgm-id`, exportBgmMusicId.value ? String(exportBgmMusicId.value) : '')
  window.localStorage.setItem(`drama-${dramaId}-export-bgm-vol`, String(exportBgmVolume.value))
}

function restoreExportBgmPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const mix = window.localStorage.getItem(`episode-${epId.value}-export-mix-bgm`)
  exportMixBgm.value = mix === null ? false : mix === '1'
  const wm = window.localStorage.getItem(`episode-${epId.value}-export-watermark`)
  if (wm != null) exportWatermarkText.value = wm
  const wmAnim = window.localStorage.getItem(`episode-${epId.value}-export-watermark-animated`)
  if (wmAnim != null) exportWatermarkAnimated.value = wmAnim === '1'
  let id = window.localStorage.getItem(`drama-${dramaId}-export-bgm-id`)
  if (id == null) id = window.localStorage.getItem(`episode-${epId.value}-export-bgm-id`)
  exportBgmMusicId.value = id ? Number(id) : null
  let vol = window.localStorage.getItem(`drama-${dramaId}-export-bgm-vol`)
  if (vol == null) vol = window.localStorage.getItem(`episode-${epId.value}-export-bgm-vol`)
  if (vol) exportBgmVolume.value = Number(vol) || 12
}

function formatBgmModelLabel(model) {
  if (model === 'upload') return '用户上传'
  return bgmModelLabel(model)
}

function triggerBgmUpload() {
  const el = bgmUploadInput.value
  if (el) {
    el.value = ''
    el.click()
  }
}

async function onBgmFileSelected(event) {
  const file = event?.target?.files?.[0]
  if (!file) return
  bgmUploading.value = true
  try {
    const uploaded = await uploadAPI.audio(file)
    const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
    if (!path) throw new Error('上传失败，未返回文件路径')
    const result = await musicAPI.upload({
      drama_id: dramaId,
      episode_id: epId.value,
      path,
      title: file.name.replace(/\.[^.]+$/, '') || file.name,
    })
    const created = normalizeBgmLibraryRows([result?.item]).filter(Boolean)
    if (created.length) {
      bgmLibrary.value = mergeBgmLibraryRows(bgmLibrary.value, created)
    } else {
      await loadBgmLibrary({ resumePoll: false })
    }
    toast.success('BGM 已上传，可应用到镜头或整集成片')
  } catch (e) {
    toast.error(e.message || 'BGM 上传失败')
  } finally {
    bgmUploading.value = false
    if (event?.target) event.target.value = ''
  }
}

function syncExportWatermarkFromEpisode(ep) {
  if (!ep) return
  const fromEp = ep.watermark_text ?? ep.watermarkText
  if (fromEp != null && fromEp !== '') {
    exportWatermarkText.value = fromEp
  } else if (fromEp === '') {
    exportWatermarkText.value = ''
  } else {
    exportWatermarkText.value = '顺拾人间'
  }
  const anim = ep.watermark_animated ?? ep.watermarkAnimated
  exportWatermarkAnimated.value = anim === true || anim === 1 || anim === '1'
}

async function saveWatermarkText() {
  if (!epId.value) return
  persistExportBgmPrefs()
  try {
    await episodeAPI.update(epId.value, {
      watermark_text: exportWatermarkText.value.trim(),
      watermark_animated: exportWatermarkAnimated.value,
    })
    if (episode.value) {
      episode.value.watermark_text = exportWatermarkText.value.trim()
      episode.value.watermarkText = exportWatermarkText.value.trim()
      episode.value.watermark_animated = exportWatermarkAnimated.value
      episode.value.watermarkAnimated = exportWatermarkAnimated.value
    }
  } catch (e) {
    toast.error(e.message || '水印设置保存失败')
  }
}

function scheduleWatermarkSave() {
  if (watermarkSaveTimer) clearTimeout(watermarkSaveTimer)
  watermarkSaveTimer = setTimeout(() => { saveWatermarkText() }, 600)
}

function buildMergePayload(extra = {}) {
  const payload = {
    cancel_running: true,
    include_opening_video: false,
    ...extra,
  }
  if (exportMixBgm.value && exportBgmMusicId.value) {
    payload.bgm_music_id = exportBgmMusicId.value
    payload.bgm_volume = Math.max(0.03, Math.min(0.25, exportBgmVolume.value / 100))
  }
  return payload
}

function normalizedMergeTestClipLimit() {
  return Math.max(1, Math.min(50, Number(mergeTestClipLimit.value) || 20))
}

function getTestMergeTargets(limit = normalizedMergeTestClipLimit()) {
  return sbs.value.slice(0, limit)
}

function canTestMerge(limit = normalizedMergeTestClipLimit()) {
  const targets = getTestMergeTargets(limit)
  return targets.length > 0 && targets.every(sb => canCompose(sb))
}

async function applyBgmToAllShots(musicId) {
  if (!musicId || !epId.value) return
  if (!sbs.value.length) {
    toast.error('暂无镜头')
    return
  }
  bgmApplyingAllId.value = musicId
  exportBgmApplying.value = true
  try {
    const res = await musicAPI.applyAll(musicId, epId.value)
    const count = res?.applied ?? sbs.value.length
    toast.success(`已应用到全部 ${count} 个镜头，请重新「镜头合成」后 BGM 才会进入各镜`)
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message)
  } finally {
    bgmApplyingAllId.value = null
    exportBgmApplying.value = false
  }
}

async function applyExportBgmToAllShots() {
  if (!exportBgmMusicId.value) {
    toast.error('请先选择 BGM')
    return
  }
  await applyBgmToAllShots(exportBgmMusicId.value)
}
const videoConfigSelectOptions = computed(() => videoConfigs.value.map(c => {
  let modelName = ''
  try { const m = JSON.parse(c.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = c.model || '' }
  const label = modelName ? `${modelName} (${c.provider})` : `${c.name} (${c.provider})`
  return { label, value: c.id }
}))
const frameModeOptions = [{ label: '仅首帧', value: 'first' }, { label: '首尾帧', value: 'first_last' }]
const gridLayoutOptions = [
  { label: '2x2', value: '2x2' },
  { label: '3x3', value: '3x3' },
  { label: '4x4', value: '4x4' },
  { label: '5x5', value: '5x5' },
]
const imageConfigs = ref([])
const videoConfigs = ref([])
const audioConfigs = ref([])
const pendingCharImageIds = ref([])
const charPortraitUseReferenceById = ref({})
const pendingCharRecognizeIds = ref([])
const pendingCharAppearanceIds = ref([])
const pendingSceneImageIds = ref([])
const pendingShotFrameKeys = ref([])
const pendingNarrationShotIds = ref([])
const pendingVideoIds = ref([])
const pendingComposeIds = ref([])
const batchRunning = ref(new Set())
const failedVideoMessages = ref({})
const failedComposeMessages = ref({})
const imageViewer = ref({ open: false, src: '', title: '' })
const shotEditor = ref({
  open: false,
  sb: null,
  number: 0,
  isTitle: false,
  dialogue: '',
  description: '',
  title: '',
  duration: 10,
  shotType: '',
  busy: false,
})

function normalizeNarrationDialogue(sb, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  if (/^[^:：]+[:：]/.test(trimmed)) return trimmed
  if (isNarrationTitleShot(sb)) return `剧中：${trimmed}`
  return `旁白：${trimmed}`
}

const narrationEditDialogue = ref('')
const narrationEditDuration = ref(10)
const narrationEditAsTitle = ref(false)
const narrationEditBusy = ref(false)

/** 分镜/TTS：遇标点（含逗号顿号）即拆 */
const STORYBOARD_PUNCT_BOUNDARY_RE = /(?<=[。！？；，、,.!?;])\s*/

function splitNarrationLines(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const lines = []
  for (const block of normalized.split(/\n+/)) {
    const flat = block.replace(/\s+/g, ' ').trim()
    if (!flat) continue
    const parts = flat.split(STORYBOARD_PUNCT_BOUNDARY_RE).map(s => s.replace(/^[，,、\s]+|[，,、\s]+$/g, '').trim()).filter(Boolean)
    lines.push(...(parts.length ? parts : [flat]))
  }
  return lines
}

function estimateNarrationDurationLocal(sentence, isTitle = false) {
  const chars = sentence.replace(/\s/g, '').length
  if (isTitle) return Math.max(6, Math.min(12, Math.ceil(chars / 3.5)))
  return Math.max(3, Math.min(12, Math.ceil(chars / 4.5)))
}

function buildNarrationMetaForShot(options) {
  const {
    isTitle,
    inheritImage,
    titleFull,
    titleHook,
    baseMeta = {},
  } = options
  if (isTitle) {
    return JSON.stringify({
      narration_image_mode: inheritImage ? 'inherit' : 'new',
      narration_shot_type: 'title',
      narration_tts_mode: 'new',
      title_full: titleFull || baseMeta.title_full || undefined,
      title_hook: titleHook || baseMeta.title_hook || undefined,
    })
  }
  const meta = {
    narration_image_mode: inheritImage ? 'inherit' : 'new',
    narration_tts_mode: 'new',
  }
  if (baseMeta.paragraph_index != null) meta.paragraph_index = baseMeta.paragraph_index
  meta.paragraph_layout = baseMeta.paragraph_layout === 'diptych' ? 'diptych' : 'single'
  if (baseMeta.scene_content) meta.scene_content = baseMeta.scene_content
  return JSON.stringify(meta)
}

function getNarrationEditContext(sb) {
  if (shotEditor.value?.open && shotEditor.value.sb?.id === sb?.id) {
    return {
      dialogue: String(shotEditor.value.dialogue || '').trim(),
      duration: shotEditor.value.duration || 10,
      asTitle: !!shotEditor.value.isTitle,
    }
  }
  return {
    dialogue: String(narrationEditDialogue.value || '').trim(),
    duration: narrationEditDuration.value,
    asTitle: narrationEditAsTitle.value,
  }
}

function splitShotInheritImage(sb, isTitle, isFirst) {
  if (!isFirst) return true
  if (isTitle) return false
  const meta = parseNarrationImageMeta(sb)
  return meta.narration_image_mode === 'inherit'
}

function syncNarrationEditFromShot(sb) {
  if (!sb) {
    narrationEditDialogue.value = ''
    narrationEditDuration.value = 10
    narrationEditAsTitle.value = false
    return
  }
  narrationEditDialogue.value = stripNarrationDialoguePrefix(sb.dialogue) || extractNarrationSentence(sb)
  narrationEditDuration.value = sb.duration || 10
  narrationEditAsTitle.value = isNarrationTitleShot(sb)
}

async function renumberStoryboards() {
  await refreshStoryboardsOnly()
  const ordered = sortStoryboards(sbs.value)
  for (let i = 0; i < ordered.length; i++) {
    const num = i + 1
    if ((ordered[i].storyboard_number || ordered[i].storyboardNumber) !== num) {
      await storyboardAPI.update(ordered[i].id, { storyboard_number: num })
    }
  }
  await refreshStoryboardsOnly()
}

async function shiftStoryboardNumbersFrom(fromNumber, delta) {
  if (!delta) return
  const victims = sortStoryboards(sbs.value)
    .filter(sb => (sb.storyboard_number || sb.storyboardNumber || 0) >= fromNumber)
    .sort((a, b) => (b.storyboard_number || b.storyboardNumber || 0) - (a.storyboard_number || a.storyboardNumber || 0))
  for (const sb of victims) {
    const current = sb.storyboard_number || sb.storyboardNumber || 0
    await storyboardAPI.update(sb.id, { storyboard_number: current + delta })
  }
}

async function fixDuplicateStoryboardNumbers() {
  const ordered = sortStoryboards(sbs.value)
  let changed = false
  for (let i = 0; i < ordered.length; i++) {
    const num = i + 1
    if ((ordered[i].storyboard_number || ordered[i].storyboardNumber) !== num) {
      await storyboardAPI.update(ordered[i].id, { storyboard_number: num })
      changed = true
    }
  }
  if (changed) await refreshStoryboardsOnly()
}

async function saveNarrationShotDetail(closeEditor = false) {
  const sb = selectedSb.value
  if (!sb || narrationEditBusy.value) return
  const isTitle = narrationEditAsTitle.value
  const draft = { ...sb, reference_images: sb.reference_images || sb.referenceImages }
  if (isTitle && !isNarrationTitleShot(sb)) {
    draft.reference_images = buildNarrationMetaForShot({ isTitle: true, inheritImage: false })
  } else if (!isTitle && isNarrationTitleShot(sb)) {
    draft.reference_images = buildNarrationMetaForShot({ isTitle: false, inheritImage: false })
  }
  const dialogue = isTitle ? normalizeNarrationDialogue({ ...sb, reference_images: draft.reference_images }, narrationEditDialogue.value) : normalizeNarrationDialogue(draft, narrationEditDialogue.value)
  if (!dialogue) {
    toast.warning('请填写台词')
    return
  }
  const pureText = stripNarrationDialoguePrefix(dialogue)
  const duration = Math.max(1, Math.min(60, Number(narrationEditDuration.value) || 10))
  narrationEditBusy.value = true
  try {
    const payload = {
      dialogue,
      description: pureText,
      title: isTitle ? '片头标题' : pureText.slice(0, 12),
      duration,
      shot_type: isTitle ? '标题' : (sb.shot_type || sb.shotType || '中景'),
    }
    if (draft.reference_images !== (sb.reference_images || sb.referenceImages)) {
      payload.reference_images = typeof draft.reference_images === 'string' ? draft.reference_images : JSON.stringify(draft.reference_images)
    }
    await storyboardAPI.update(sb.id, payload)
    toast.success('镜头已保存')
    await refresh()
    if (closeEditor) closeShotEditor()
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationEditBusy.value = false
  }
}

async function splitShotByPunctuation(sb) {
  if (!sb || narrationEditBusy.value) return
  const ctx = getNarrationEditContext(sb)
  const text = ctx.dialogue || stripNarrationDialoguePrefix(sb.dialogue) || extractNarrationSentence(sb)
  const lines = splitNarrationLines(text)
  if (lines.length <= 1) {
    toast.warning('至少要有 2 句才能拆分。用逗号、顿号或换行分隔多句后再试。')
    return
  }

  const isTitle = ctx.asTitle || isNarrationTitleShot(sb)
  const meta = parseNarrationImageMeta(sb)
  const titleFull = meta.title_full || lines.join('')
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  if (idx < 0) return

  narrationEditBusy.value = true
  try {
    const firstDialogue = isTitle ? `剧中：${lines[0]}` : `旁白：${lines[0]}`
    await storyboardAPI.update(sb.id, {
      dialogue: firstDialogue,
      description: lines[0],
      title: isTitle ? '片头标题' : lines[0].slice(0, 12),
      duration: estimateNarrationDurationLocal(lines[0], isTitle),
      shot_type: isTitle ? '标题' : (sb.shot_type || sb.shotType || '中景'),
      reference_images: buildNarrationMetaForShot({
        isTitle,
        inheritImage: splitShotInheritImage(sb, isTitle, true),
        titleFull,
        titleHook: lines[0].slice(0, 20),
        baseMeta: meta,
      }),
    })

    const insertNumber = (sb.storyboard_number || sb.storyboardNumber || 1) + 1
    const newCount = lines.length - 1
    await shiftStoryboardNumbersFrom(insertNumber, newCount)
    await refreshStoryboardsOnly()

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const dialogue = isTitle ? `剧中：${line}` : `旁白：${line}`
      await storyboardAPI.create({
        episode_id: epId.value,
        storyboard_number: insertNumber + i - 1,
        title: isTitle ? '片头标题' : line.slice(0, 12),
        description: line,
        dialogue,
        duration: estimateNarrationDurationLocal(line, isTitle),
        shot_type: isTitle ? '标题' : '中景',
        angle: '平视',
        movement: '固定',
        reference_images: buildNarrationMetaForShot({
          isTitle,
          inheritImage: splitShotInheritImage(sb, isTitle, false),
          titleFull,
          titleHook: line.slice(0, 20),
          baseMeta: meta,
        }),
      })
    }

    await renumberStoryboards()
    toast.success(`已拆成 ${lines.length} 镜${isTitle ? '（片头 · 剧中红字）' : ''}`)
    closeShotEditor()
    const first = sbs.value.find(item => item.id === sb.id) || sbs.value[0]
    if (first) selectedSb.value = first
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationEditBusy.value = false
  }
}

async function insertShotAfter(sb) {
  if (!sb || narrationEditBusy.value) return
  const isTitle = narrationEditAsTitle.value || isNarrationTitleShot(sb)
  const meta = parseNarrationImageMeta(sb)
  narrationEditBusy.value = true
  try {
    const insertNumber = (sb.storyboard_number || sb.storyboardNumber || 0) + 1
    await shiftStoryboardNumbersFrom(insertNumber, 1)
    await refreshStoryboardsOnly()
    await storyboardAPI.create({
      episode_id: epId.value,
      storyboard_number: insertNumber,
      title: isTitle ? '片头标题' : `镜头${num}`,
      description: '',
      dialogue: isTitle ? '剧中：' : '旁白：',
      duration: 6,
      shot_type: isTitle ? '标题' : '中景',
      angle: '平视',
      movement: '固定',
      reference_images: buildNarrationMetaForShot({
        isTitle,
        inheritImage: isTitle,
        titleFull: meta.title_full,
      }),
    })
    await renumberStoryboards()
    toast.success('已插入镜头')
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationEditBusy.value = false
  }
}

function stripNarrationDialoguePrefix(text) {
  return String(text || '')
    .replace(/^旁白[:：]\s*/, '')
    .replace(/^剧中[:：]\s*/, '')
    .trim()
}

function openShotEditor(sb) {
  if (!sb) return
  selectedSb.value = sb
  syncNarrationEditFromShot(sb)
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  shotEditor.value = {
    open: true,
    sb,
    number: idx >= 0 ? idx + 1 : (sb.storyboard_number || sb.storyboardNumber || 0),
    isTitle: isNarrationTitleShot(sb),
    dialogue: stripNarrationDialoguePrefix(sb.dialogue) || extractNarrationSentence(sb),
    description: sb.description || '',
    title: sb.title || '',
    duration: sb.duration || 10,
    shotType: sb.shot_type || sb.shotType || '',
    busy: false,
  }
}

function closeShotEditor() {
  if (shotEditor.value.busy) return
  shotEditor.value.open = false
  shotEditor.value.sb = null
}

async function saveShotEditor(remake = false) {
  const editor = shotEditor.value
  const sb = editor.sb
  if (!sb || editor.busy) return

  const dialogue = normalizeNarrationDialogue(
    editor.isTitle ? { ...sb, reference_images: sb.reference_images || sb.referenceImages } : sb,
    editor.dialogue,
  )
  if (!dialogue) {
    toast.warning('请填写台词')
    return
  }

  const pureText = stripNarrationDialoguePrefix(dialogue)
  const description = String(editor.description || '').trim() || pureText
  const duration = Math.max(1, Math.min(60, Number(editor.duration) || 10))
  const title = String(editor.title || '').trim() || (editor.isTitle ? '片头标题' : pureText.slice(0, 12))

  const prevDialogue = String(sb.dialogue || '').trim()
  const dialogueChanged = dialogue !== prevDialogue

  editor.busy = true
  try {
    const payload = {
      dialogue,
      description,
      title,
      duration,
    }
    if (editor.isTitle) {
      const meta = parseNarrationImageMeta(sb)
      const titleShots = sortStoryboards(sbs.value).filter(isNarrationTitleShot)
      const isFirstTitle = titleShots[0]?.id === sb.id
      payload.reference_images = buildNarrationMetaForShot({
        isTitle: true,
        inheritImage: !isFirstTitle,
        titleFull: meta.title_full,
        titleHook: meta.title_hook || pureText.slice(0, 20),
        baseMeta: meta,
      })
    } else if (isNarrationTitleShot(sb)) {
      payload.reference_images = buildNarrationMetaForShot({
        isTitle: false,
        inheritImage: false,
        baseMeta: parseNarrationImageMeta(sb),
      })
    }

    await storyboardAPI.update(sb.id, payload)
    sb.dialogue = dialogue
    sb.description = description
    sb.title = title
    sb.duration = duration
    if (payload.reference_images) {
      sb.reference_images = payload.reference_images
      sb.referenceImages = payload.reference_images
    }
    if (dialogueChanged) {
      sb.tts_audio_url = null
      sb.ttsAudioUrl = null
      sb.composed_video_url = null
      sb.composedVideoUrl = null
    }

    if (!remake) {
      toast.success('镜头已保存')
      closeShotEditor()
      return
    }

    const titleShotsToRemake = editor.isTitle
      ? sortStoryboards(sbs.value).filter(isNarrationTitleShot)
      : [sb]

    if (editor.isTitle && titleShotsToRemake.length > 1) {
      toast.info(`正在重新制作全部 ${titleShotsToRemake.length} 个片头镜…`)
    } else {
      toast.info('正在重新配音…')
    }

    for (const shot of titleShotsToRemake) {
      if (shot.id !== sb.id && dialogueChanged) {
        shot.tts_audio_url = null
        shot.ttsAudioUrl = null
        shot.composed_video_url = null
        shot.composedVideoUrl = null
      }
      await storyboardAPI.generateTTS(shot.id, ttsGenerateOptions(true))
      delete failedComposeMessages.value[shot.id]
      if (!isPendingCompose(shot.id)) pendingComposeIds.value.push(shot.id)
      await composeAPI.shot(shot.id)
      pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== shot.id)
    }

    toast.success(editor.isTitle && titleShotsToRemake.length > 1
      ? `已重新制作 ${titleShotsToRemake.length} 个片头镜`
      : `镜头 #${editor.number} 已重新制作`)
    closeShotEditor()
    await refresh()
  } catch (e) {
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    toast.error(e.message)
  } finally {
    editor.busy = false
  }
}

function configLabel(config) {
  if (!config) return '未配置'
  let modelName = ''
  try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

function isPendingCharImage(id) {
  return pendingCharImageIds.value.includes(id)
}
function isPendingCharRecognize(id) {
  return pendingCharRecognizeIds.value.includes(id)
}
function isPendingCharAppearance(id) {
  return pendingCharAppearanceIds.value.includes(id)
}

function isCharPortraitUseReference(id) {
  return charPortraitUseReferenceById.value[id] !== false
}

function toggleCharPortraitUseReference(id) {
  charPortraitUseReferenceById.value = {
    ...charPortraitUseReferenceById.value,
    [id]: !isCharPortraitUseReference(id),
  }
}

function openImageViewer(src, title = '') {
  if (!src) return
  imageViewer.value = { open: true, src, title }
}

function closeImageViewer() {
  imageViewer.value = { open: false, src: '', title: '' }
}

function handleImageViewerKeydown(event) {
  if (event.key === 'Escape' && shotEditor.value.open) closeShotEditor()
  if (event.key === 'Escape' && imageViewer.value.open) closeImageViewer()
}

onMounted(() => {
  window.addEventListener('keydown', handleImageViewerKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImageViewerKeydown)
  stopBgmPoll()
  stopOpeningPoll()
  stopTitlePoll()
})

function isPendingSceneImage(id) {
  return pendingSceneImageIds.value.includes(id)
}

function framePendingKey(id, frameType) {
  return `${id}:${frameType}`
}

function isPendingShotFrame(id, frameType) {
  return pendingShotFrameKeys.value.includes(framePendingKey(id, frameType))
}

function isPendingVideo(id) {
  return pendingVideoIds.value.includes(id)
}

function videoFailMessage(id) {
  return failedVideoMessages.value[id] || ''
}

function isPendingCompose(id) {
  return pendingComposeIds.value.includes(id)
}

function composeFailMessage(id) {
  return failedComposeMessages.value[id] || ''
}

function isNarratorCharacter(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

const visualChars = computed(() => {
  const list = chars.value.filter(c => !isNarratorCharacter(c))
  return [...list].sort((a, b) => {
    const byName = String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    if (byName !== 0) return byName
    return normalizeVariantLabel(a.variant_label || a.variantLabel)
      .localeCompare(normalizeVariantLabel(b.variant_label || b.variantLabel), 'zh-CN')
  })
})
const visualCharNameCount = computed(() => new Set(visualChars.value.map(c => c.name)).size)

const lockedImageConfigId = computed(() => episode.value?.image_config_id || episode.value?.imageConfigId || null)
const lockedVideoConfigId = computed(() => episode.value?.video_config_id || episode.value?.videoConfigId || null)
const lockedAudioConfigId = computed(() => episode.value?.audio_config_id || episode.value?.audioConfigId || null)
const lockedAudioProvider = computed(() => audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)?.provider || '')
const lockedImageConfigLabel = computed(() => configLabel(imageConfigs.value.find(c => c.id === lockedImageConfigId.value)))
const episodeImageModel = ref(DEFAULT_IMAGE_MODEL)
const episodeTextModel = ref(DEFAULT_TEXT_MODEL)
const episodeTextThinking = ref(DEFAULT_TEXT_THINKING)
const referPreviousEpisode = ref(false)
const imageModelOptions = computed(() => IMAGE_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value })))
const textModelOptions = computed(() => TEXT_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value })))
const episodeTextModelSupportsThinking = computed(() => textModelSupportsThinking(episodeTextModel.value))
const showReferPreviousEpisodeToggle = computed(() => episodeNumber > 1 && showTextModelPicker.value)
const showImageModelPicker = computed(() => ['chars', 'scenes', 'shots'].includes(prodTab.value))
const showTextModelPicker = computed(() => ['chars', 'shots'].includes(prodTab.value))
const showBgmModelPicker = computed(() => prodTab.value === 'bgm')

function syncEpisodeImageModel(ep) {
  episodeImageModel.value = resolveEpisodeImageModel(ep)
}

function syncEpisodeTextModel(ep) {
  episodeTextModel.value = resolveEpisodeTextModel(ep)
}

function syncEpisodeTextThinking(ep) {
  episodeTextThinking.value = resolveEpisodeTextThinking(ep)
}

function syncReferPreviousEpisode(ep) {
  referPreviousEpisode.value = !!(ep?.refer_previous_episode ?? ep?.referPreviousEpisode)
}

async function setReferPreviousEpisode(enabled) {
  if (enabled === referPreviousEpisode.value) return
  referPreviousEpisode.value = enabled
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { refer_previous_episode: enabled })
    if (episode.value) {
      episode.value.refer_previous_episode = enabled
      episode.value.referPreviousEpisode = enabled
    }
    toast.success(enabled ? `已开启参照第 ${episodeNumber - 1} 集` : '已关闭参照上集')
  } catch (e) {
    syncReferPreviousEpisode(episode.value)
    toast.error(e.message)
  }
}

async function setEpisodeTextThinking(enabled) {
  if (enabled === episodeTextThinking.value) return
  episodeTextThinking.value = enabled
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { text_thinking: enabled })
    if (episode.value) {
      episode.value.text_thinking = enabled
      episode.value.textThinking = enabled
    }
    toast.success(enabled ? '思考模式已开启' : '思考模式已关闭')
  } catch (e) {
    syncEpisodeTextThinking(episode.value)
    toast.error(e.message)
  }
}

async function onEpisodeTextModelChange(model) {
  if (!model || model === episodeTextModel.value) return
  episodeTextModel.value = model
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { text_model: model })
    if (episode.value) {
      episode.value.text_model = model
      episode.value.textModel = model
    }
    toast.success('文本模型已保存')
  } catch (e) {
    syncEpisodeTextModel(episode.value)
    toast.error(e.message)
  }
}

async function onEpisodeImageModelChange(model) {
  if (!model || model === episodeImageModel.value) return
  episodeImageModel.value = model
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { image_model: model })
    if (episode.value) {
      episode.value.image_model = model
      episode.value.imageModel = model
    }
    toast.success('配图模型已保存')
  } catch (e) {
    syncEpisodeImageModel(episode.value)
    toast.error(e.message)
  }
}

function buildImagePayload(extra = {}) {
  return { ...extra, model: episodeImageModel.value }
}
const lockedVideoConfigLabel = computed(() => configLabel(videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)))
const lockedAudioConfigLabel = computed(() => configLabel(audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)))

// Grid tool state
const gridDialog = ref(false)
const gridStep = ref(0)
const gridLayout = ref('3x3')
const gridMode = ref('first_frame')
const gridSelected = ref([])
const gridSingleTarget = ref(null)
const gridGenId = ref(null)
const gridImagePath = ref('')
const gridStatusText = ref('')
const gridActualLayout = ref({ rows: 3, cols: 3 })
const gridRecoveredAt = ref('')
const gridRecoveredMode = ref('')
const gridPromptText = ref('')
const gridCellPrompts = ref([])
const gridPromptSource = ref('')
const gridPromptLoading = ref(false)
const gridPromptStatus = ref('')
const gridAssignmentsState = ref([])
const gridActiveShotIds = ref([])
const gridHistory = ref([])
const showAllGridHistory = ref(false)
const activeGridCell = ref(0)
const gridAssignmentPage = ref(0)
const gridStorageKey = computed(() => `huobao:grid:${dramaId}:${epId.value || episodeNumber}`)

const gridModes = [
  { id: 'first_frame', label: '首帧', desc: '每格=一个镜头的首帧' },
  { id: 'first_last', label: '首尾帧', desc: '每镜头占一行：左首帧，右尾帧' },
  { id: 'multi_ref', label: '多参考', desc: '所有格子=同一镜头的参考图' },
]

const gridLayoutShape = computed(() => {
  const [rows, cols] = String(gridLayout.value || '3x3').split('x').map(Number)
  return {
    rows: rows || 3,
    cols: cols || 3,
  }
})
const gridTotalCells = computed(() => {
  return gridLayoutShape.value.rows * gridLayoutShape.value.cols
})

const gridCanStart = computed(() => {
  if (gridMode.value === 'multi_ref') return !!gridSingleTarget.value
  return gridSelected.value.length > 0
})

const gridSummary = computed(() => {
  if (gridMode.value === 'multi_ref') {
    const idx = sbs.value.findIndex(s => s.id === gridSingleTarget.value) + 1
    return gridSingleTarget.value ? `${gridLayoutShape.value.rows}x${gridLayoutShape.value.cols} 参考图 → 镜头 #${idx}` : '请选择一个镜头'
  }
  if (!gridSelected.value.length) return '请选择镜头'
  const count = gridSelected.value.length
  if (gridMode.value === 'first_last') {
    const { rows, cols } = gridLayoutShape.value
    return `${count} 个镜头 → ${rows}x${cols} 宫格（按首尾帧风格生成，切分后再手动分配）`
  }
  const { rows, cols } = gridLayoutShape.value
  const cells = rows * cols
  return `${count} 个镜头 → ${rows}x${cols} 宫格（先生成宫格图，切分后再手动分配）`
})

function createGridAssignments() {
  return Array.from({ length: gridActualLayout.value.rows * gridActualLayout.value.cols }, () => ({
    storyboard_id: null,
    frame_type: 'first_frame',
  }))
}

const gridAssignments = computed(() => gridAssignmentsState.value)
const gridAssignableShotIds = computed(() => {
  const assignedIds = [...new Set(gridAssignments.value.map(item => item?.storyboard_id).filter(Boolean))]
  const ids = Array.isArray(gridActiveShotIds.value) && gridActiveShotIds.value.length
    ? gridActiveShotIds.value
    : assignedIds.length
      ? assignedIds
    : gridMode.value === 'multi_ref'
      ? (gridSingleTarget.value ? [gridSingleTarget.value] : [])
      : gridSelected.value.length
        ? [...gridSelected.value]
        : sbs.value.map(s => s.id)
  return ids.filter(id => sbs.value.some(s => s.id === id))
})
const gridAssignmentShotOptions = computed(() => [
  { label: '未分配', value: null },
  ...gridAssignableShotIds.value.map((id) => {
    const index = sbs.value.findIndex(s => s.id === id) + 1
    const sb = sbs.value.find(s => s.id === id)
    return {
      label: `#${String(index).padStart(2, '0')} ${sb?.title || sb?.description || '镜头'}`,
      value: id,
    }
  }),
])
const gridFrameTypeOptions = computed(() => {
  return [
    { label: '首帧', value: 'first_frame' },
    { label: '尾帧', value: 'last_frame' },
    { label: '参考图', value: 'reference' },
  ]
})
const gridAssignedCount = computed(() => gridAssignments.value.filter(item => !!item.storyboard_id).length)
const gridAssignmentPageSize = computed(() => {
  if (gridAssignments.value.length >= 25) return 8
  if (gridAssignments.value.length >= 16) return 10
  if (gridAssignments.value.length >= 9) return 9
  return Math.max(1, gridAssignments.value.length || 1)
})
const gridAssignmentTotalPages = computed(() => Math.max(1, Math.ceil(gridAssignments.value.length / gridAssignmentPageSize.value)))
const gridAssignmentPageStart = computed(() => gridAssignmentPage.value * gridAssignmentPageSize.value)
const gridAssignmentPageEnd = computed(() => Math.min(gridAssignments.value.length, gridAssignmentPageStart.value + gridAssignmentPageSize.value))
const pagedGridAssignments = computed(() => {
  return gridAssignments.value
    .slice(gridAssignmentPageStart.value, gridAssignmentPageEnd.value)
    .map((assignment, offset) => ({
      assignment,
      index: gridAssignmentPageStart.value + offset,
    }))
})

function resetGridAssignments() {
  gridAssignmentsState.value = createGridAssignments()
  activeGridCell.value = 0
  gridAssignmentPage.value = 0
}

function gridCellLabel(a) {
  if (!a?.storyboard_id) return '未分配'
  const idx = sbs.value.findIndex(s => s.id === a.storyboard_id) + 1
  const suffix = { first_frame: '首', last_frame: '尾', reference: '参' }[a.frame_type] || ''
  return `#${idx}${suffix ? ` ${suffix}` : ''}`
}

function gridCellTitle(id) {
  if (!id) return '未分配'
  const idx = sbs.value.findIndex(s => s.id === id) + 1
  const sb = sbs.value.find(s => s.id === id)
  return `#${String(idx).padStart(2, '0')} ${sb?.title || sb?.description || '镜头'}`
}

function updateGridAssignment(index, field, value) {
  const next = [...gridAssignmentsState.value]
  next[index] = { ...next[index], [field]: value }
  gridAssignmentsState.value = next
  activeGridCell.value = index
  if (gridImagePath.value) persistGridImagePath(gridImagePath.value)
}

function focusGridCell(index) {
  activeGridCell.value = index
  gridAssignmentPage.value = Math.floor(index / gridAssignmentPageSize.value)
}

const gridOverlayStyle = computed(() => {
  const { rows, cols } = gridActualLayout.value
  return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
})

const gridAutoLayout = computed(() => {
  return gridLayoutShape.value
})

const gridBlankStyle = computed(() => {
  const { rows, cols } = gridAutoLayout.value
  return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
})

// Production step helpers
function prodStepDone(id) {
  if (id === 'voice') return narratorReady.value
  if (id === 'chars') return !visualCharTotal.value || charImgCount.value === visualCharTotal.value
  if (id === 'scenes') return !!scenes.value.length && sceneImgCount.value === scenes.value.length
  if (id === 'dubbing') {
    const ready = isNarrationMode.value ? narrationTtsReady.value : (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value)
    return !!sbs.value.length && ready
  }
  if (id === 'bgm') return !!sbs.value.length && bgmAppliedCount.value > 0
  if (id === 'shots') return !!sbs.value.length && (isNarrationMode.value ? narrationImageReady.value : shotImgCount.value === sbs.value.length)
  if (id === 'videos') {
    const narrationReady = !!sbs.value.length
      && (isNarrationMode.value ? narrationImageReady.value : shotImgCount.value === sbs.value.length)
      && (isNarrationMode.value ? narrationTtsReady.value : (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value))
    return narrationReady || (!!sbs.value.length && shotVidCount.value === sbs.value.length)
  }
  if (id === 'compose') return !!sbs.value.length && composedCount.value === sbs.value.length
  return false
}
const canExport = computed(() => !!sbs.value.length && composedCount.value === sbs.value.length)
function goNextProd() {
  if (prodTabIdx.value < prodTabDefs.value.length - 1) {
    prodTabIdx.value++
  } else {
    panel.value = 'export'
    exportTab.value = 'merge'
  }
}

// Script step navigation
const stepLabels = computed(() => isNarrationMode.value
  ? ['解说文案', '旁白分镜']
  : ['原始内容', 'AI 改写', '提取', '音色', '分镜'])
const prevStepLabel = computed(() => scriptStep.value > 0 ? stepLabels.value[scriptStep.value - 1] : '')
const nextStepLabel = computed(() => {
  if (scriptStep.value === storyboardStep.value) return '进入制作'
  return stepLabels.value[scriptStep.value + 1] || ''
})
const canGoNext = computed(() => {
  if (scriptStep.value === 0) return !!localRaw.value.trim()
  if (isNarrationMode.value && scriptStep.value === 1) return sbs.value.length > 0
  if (scriptStep.value === 1) return !!localScript.value.trim() || !!scriptContent.value
  if (scriptStep.value === 2) return chars.value.length > 0
  if (scriptStep.value === 3) return charsVoiced.value > 0
  if (scriptStep.value === storyboardStep.value) return sbs.value.length > 0
  return false
})
function goPrevStep() { if (scriptStep.value > 0) scriptStep.value-- }
function goNextStep() {
  if (scriptStep.value === 0 && localRaw.value.trim()) {
    saveRaw()
    if (isNarrationMode.value) {
      localScript.value = localRaw.value
      saveScr()
    }
  }
  if (!isNarrationMode.value && scriptStep.value === 1 && localScript.value.trim()) { saveScr() }
  if (scriptStep.value === storyboardStep.value) {
    panel.value = 'production'
    prodTab.value = isNarrationMode.value
      ? (visualCharTotal.value && charImgCount.value < visualCharTotal.value ? 'chars' : 'voice')
      : 'chars'
    return
  }
  if (canGoNext.value) scriptStep.value++
}

function gridSelectAll() {
  if (gridSelected.value.length === sbs.value.length) gridSelected.value = []
  else gridSelected.value = sbs.value.map(s => s.id)
}

function openGridTool() {
  gridStep.value = 0
  gridSelected.value = []
  gridSingleTarget.value = null
  gridActiveShotIds.value = []
  gridPromptText.value = ''
  gridCellPrompts.value = []
  gridPromptSource.value = ''
  gridPromptStatus.value = ''
  gridAssignmentsState.value = []
  gridDialog.value = true
}

function persistGridImagePath(value) {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(gridStorageKey.value)
    return
  }
  const current = restoreGridState() || {}
  const entries = current.entries || {}
  entries[value] = {
    generationId: gridGenId.value,
    layout: gridActualLayout.value,
    shotIds: gridActiveShotIds.value,
    assignments: gridAssignmentsState.value,
    recoveredAt: gridRecoveredAt.value,
    recoveredMode: gridRecoveredMode.value,
  }
  const payload = {
    activeImagePath: value,
    entries,
  }
  window.localStorage.setItem(gridStorageKey.value, JSON.stringify(payload))
}

function restoreGridState() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(gridStorageKey.value)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return { activeImagePath: raw, entries: { [raw]: {} } }
  }
}

function applyGridState(imagePath, meta = {}) {
  gridImagePath.value = imagePath || ''
  gridGenId.value = meta.generationId || meta.id || null
  if (meta.layout?.rows && meta.layout?.cols) gridActualLayout.value = meta.layout
  if (Array.isArray(meta.shotIds)) gridActiveShotIds.value = meta.shotIds
  else gridActiveShotIds.value = []
  if (Array.isArray(meta.assignments)) gridAssignmentsState.value = meta.assignments
  else gridAssignmentsState.value = []
  gridRecoveredAt.value = meta.recoveredAt || meta.createdAtLabel || ''
  gridRecoveredMode.value = meta.recoveredMode || meta.modeLabel || ''
}

function selectGridHistory(item) {
  const cached = restoreGridState()
  const cachedEntry = cached?.entries?.[item.localPath] || {}
  applyGridState(item.localPath, {
    ...item,
    ...cachedEntry,
    generationId: cachedEntry.generationId || item.id,
    recoveredAt: cachedEntry.recoveredAt || item.createdAtLabel,
    recoveredMode: cachedEntry.recoveredMode || item.modeLabel,
  })
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  persistGridImagePath(item.localPath)
}

function reopenGridPreview() {
  if (!gridImagePath.value) {
    openGridTool()
    return
  }
  gridDialog.value = true
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridStep.value = 3
}

function parseGridLayoutFromFrameType(value) {
  const match = String(value || '').match(/grid_[^_]+_(\d+)x(\d+)$/)
  if (!match) return null
  return { rows: Number(match[1]) || 3, cols: Number(match[2]) || 3 }
}

function continueGridSplit() {
  if (!gridImagePath.value) {
    toast.warning('还没有可继续切割的宫格图')
    return
  }
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridDialog.value = true
  gridStep.value = 3
}

function getGridPromptShotIds() {
  if (gridMode.value === 'multi_ref') return gridSingleTarget.value ? [gridSingleTarget.value] : []
  if (gridMode.value === 'first_last') return [...gridSelected.value]
  return gridSelected.value.slice(0, gridTotalCells.value)
}

async function generateGridPrompt() {
  if (!gridCanStart.value) {
    toast.warning('请先选择镜头')
    return
  }
  gridPromptLoading.value = true
  gridPromptStatus.value = '正在调用 AI 生成宫格提示词...'
  gridPromptText.value = ''
  gridCellPrompts.value = []
  gridPromptSource.value = ''
  try {
    const shotIds = getGridPromptShotIds()
    const { rows, cols } = gridAutoLayout.value

    const res = await gridAPI.prompt({
      storyboard_ids: shotIds,
      drama_id: dramaId,
      episode_id: epId.value,
      rows,
      cols,
      mode: gridMode.value,
    })

    gridPromptText.value = res?.grid_prompt || ''
    gridCellPrompts.value = Array.isArray(res?.cell_prompts) ? res.cell_prompts : []
    gridPromptSource.value = res?.source || ''

    if (gridPromptText.value) {
      resetGridAssignments()
      gridPromptStatus.value = gridPromptSource.value === 'agent' ? 'AI 提示词已生成' : '已使用模板提示词'
      gridStep.value = 1
    } else {
      gridPromptStatus.value = ''
      toast.error('提示词生成失败')
    }
  } catch (e) {
    gridPromptStatus.value = ''
    toast.error(e?.message || '生成提示词失败')
  } finally {
    gridPromptLoading.value = false
  }
}

async function startGridGen() {
  let rows, cols, ids
  if (gridMode.value === 'multi_ref') {
    rows = gridAutoLayout.value.rows; cols = gridAutoLayout.value.cols; ids = [gridSingleTarget.value]
  } else {
    rows = gridAutoLayout.value.rows; cols = gridAutoLayout.value.cols; ids = gridSelected.value.slice(0, gridTotalCells.value)
    if (gridMode.value === 'first_last') ids = [...gridSelected.value]
  }
  gridActiveShotIds.value = ids.filter(Boolean)
  gridActualLayout.value = { rows, cols }
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridStep.value = 2
  gridStatusText.value = '提交生成请求...'
  try {
    const res = await gridAPI.generate({
      storyboard_ids: ids,
      drama_id: dramaId,
      rows,
      cols,
      mode: gridMode.value,
      custom_prompt: gridPromptText.value || undefined,
    })
    gridGenId.value = res.image_generation_id
    gridActualLayout.value = res.grid || { rows, cols }
    gridStatusText.value = '等待图片生成...'
    pollGridStatus()
  } catch (e) {
    toast.error(e.message)
    gridStep.value = 0
  }
}

async function pollGridStatus() {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const res = await gridAPI.status(gridGenId.value)
      gridStatusText.value = `状态: ${res.status}`
      if (res.status === 'completed' && res.local_path) {
        gridImagePath.value = res.local_path
        gridGenId.value = gridGenId.value || res.id || null
        persistGridImagePath(res.local_path)
        gridStep.value = 3
        return
      }
      if (res.status === 'failed') {
        toast.error(res.error_msg || '生成失败')
        gridStep.value = 0
        return
      }
    } catch {}
  }
  toast.error('生成超时'); gridStep.value = 0
}

async function loadLatestGridImage() {
  try {
    const rows = await imageAPI.list({ drama_id: dramaId })
    const list = Array.isArray(rows) ? rows : []
    const grids = list
      .filter((row) => row?.status === 'completed' && String(row?.frame_type || row?.frameType || '').startsWith('grid_') && (row?.local_path || row?.localPath))
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
      .map((row) => {
        const frameType = String(row?.frame_type || row?.frameType || '')
        const parsedLayout = parseGridLayoutFromFrameType(frameType) || { rows: 3, cols: 3 }
        return {
          id: row.id,
          localPath: row?.local_path || row?.localPath || '',
          layout: parsedLayout,
          modeLabel: frameType.replace(/^grid_/, '').replace(/_/g, ' · '),
          createdAtLabel: row?.created_at || row?.createdAt || '',
        }
      })

    gridHistory.value = grids

    const cached = restoreGridState()
    const preferredPath = cached?.activeImagePath && grids.some(item => item.localPath === cached.activeImagePath)
      ? cached.activeImagePath
      : grids[0]?.localPath
    const current = grids.find(item => item.localPath === preferredPath)
    if (current) {
      const cachedEntry = cached?.entries?.[current.localPath] || {}
      applyGridState(current.localPath, {
        ...current,
        ...cachedEntry,
        generationId: cachedEntry.generationId || current.id,
        recoveredAt: cachedEntry.recoveredAt || current.createdAtLabel,
        recoveredMode: cachedEntry.recoveredMode || current.modeLabel,
      })
      if (!gridAssignmentsState.value.length) resetGridAssignments()
      persistGridImagePath(current.localPath)
      return
    }
  } catch {}

  const cached = restoreGridState()
  if (cached?.activeImagePath) {
    const cachedEntry = cached?.entries?.[cached.activeImagePath] || {}
    applyGridState(cached.activeImagePath, {
      ...cachedEntry,
      recoveredAt: cachedEntry.recoveredAt || '',
      recoveredMode: cachedEntry.recoveredMode || '',
    })
  }
}

async function doGridSplit() {
  const { rows, cols } = gridActualLayout.value
  try {
    const assignments = gridAssignments.value
      .filter(item => !!item.storyboard_id)
      .map(item => ({ storyboard_id: item.storyboard_id, frame_type: item.frame_type }))
    if (!assignments.length) {
      toast.warning('请至少分配一个格子')
      return
    }
    await gridAPI.split({ image_generation_id: gridGenId.value, rows, cols, assignments })
    persistGridImagePath(gridImagePath.value)
    gridStep.value = 4
    toast.success('切分分配完成')
  } catch (e) {
    toast.error(e.message)
  }
}

const charImgCount = computed(() => visualChars.value.filter(c => c.image_url || c.imageUrl).length)
const sceneImgCount = computed(() => scenes.value.filter(s => s.image_url || s.imageUrl).length)
const ttsEligibleCount = computed(() => sbs.value.filter(s => hasDialogue(s)).length)
const ttsGeneratedCount = computed(() => {
  if (isNarrationMode.value) return sbs.value.filter(s => hasDialogue(s) && hasNarrationShotOwnTts(s)).length
  return sbs.value.filter(s => hasDialogue(s) && hasTTS(s)).length
})
const narrationTtsReady = computed(() => narrationTtsAllReady(sbs.value))
const shotImgCount = computed(() => {
  if (isNarrationMode.value) {
    return sbs.value.filter(s => narrationShotNeedsOwnImage(s) && hasNarrationShotImage(s)).length
  }
  return sbs.value.filter(s => s.first_frame_image || s.firstFrameImage || s.last_frame_image || s.lastFrameImage || s.composed_image || s.composedImage).length
})
const narrationNeedImageCount = computed(() => narrationShotsNeedingImage(sbs.value).length)
const narrationMissingPromptCount = computed(() =>
  sbs.value.filter(sb =>
    narrationShotNeedsOwnImage(sb) && !String(sb?.image_prompt || sb?.imagePrompt || '').trim(),
  ).length,
)
const NARRATION_PROMPT_COPY_BATCH_SIZE = 10
const narrationCopyBatchIndex = ref(1)
const narrationCopyBatchOptions = computed(() => {
  const list = narrationShotsNeedingImage(sbs.value)
  const total = list.length
  if (!total) return []
  const batchCount = Math.ceil(total / NARRATION_PROMPT_COPY_BATCH_SIZE)
  return Array.from({ length: batchCount }, (_, idx) => {
    const batchItems = list.slice(idx * NARRATION_PROMPT_COPY_BATCH_SIZE, (idx + 1) * NARRATION_PROMPT_COPY_BATCH_SIZE)
    const firstNo = getNarrationShotDisplayNo(batchItems[0])
    const lastNo = getNarrationShotDisplayNo(batchItems[batchItems.length - 1])
    return { value: idx + 1, label: `#${firstNo}-#${lastNo}` }
  })
})
watch(narrationCopyBatchOptions, (opts) => {
  if (!opts.length) {
    narrationCopyBatchIndex.value = 1
    return
  }
  if (!opts.some(opt => opt.value === narrationCopyBatchIndex.value)) {
    narrationCopyBatchIndex.value = opts[0].value
  }
})

const ttsPendingCount = computed(() => {
  if (isNarrationMode.value) {
    return sbs.value.filter(sb => hasDialogue(sb) && !hasNarrationShotOwnTts(sb)).length
  }
  return sbs.value.filter(sb => hasDialogue(sb) && !hasTTS(sb)).length
})
const narrationImagesPendingCount = computed(() =>
  narrationShotsPendingImage(sbs.value).length,
)
const nextPendingNarrationShot = computed(() => narrationShotsPendingImage(sbs.value)[0] || null)
const uploadedNarrationImageCount = computed(() => narrationShotsWithUploadedImage(sbs.value).length)
const narrationCropImageCount = computed(() => {
  const paths = new Set()
  for (const sb of sbs.value) {
    const p = getNarrationShotOwnImage(sb)
    if (p) paths.add(p)
  }
  return paths.size
})
const narrationWmCroppedImageCount = computed(() => {
  const paths = new Set()
  for (const sb of sbs.value) {
    const p = getNarrationShotOwnImage(sb)
    if (!p) continue
    if (p.includes('-wm9')) {
      paths.add(p)
      continue
    }
    try {
      const meta = JSON.parse(sb.referenceImages || '{}')
      if (meta?.wm_crop_applied) paths.add(p)
    } catch {}
  }
  return paths.size
})
const narrationImagesPendingShots = computed(() => narrationShotsPendingImage(sbs.value))
const narrationImagesPendingLabel = computed(() => formatNarrationShotDisplayList(narrationImagesPendingShots.value))
const narrationImagesPendingHint = computed(() => formatNarrationPendingImageHint(sbs.value))
const composePendingCount = computed(() =>
  sbs.value.filter(sb => canCompose(sb) && !hasComposed(sb)).length,
)
const composableCount = computed(() => sbs.value.filter(sb => canCompose(sb)).length)
const charImagesPendingCount = computed(() =>
  visualChars.value.filter(c => !(c.image_url || c.imageUrl)).length,
)
const sceneImagesPendingCount = computed(() =>
  scenes.value.filter(s => !(s.image_url || s.imageUrl)).length,
)
const videosPendingCount = computed(() => sbs.value.filter(s => !hasVid(s)).length)

function getNarrationImagePromptText(sb, style = drama.value?.style || 'comic') {
  const stored = String(sb?.image_prompt || sb?.imagePrompt || '').trim()
  if (stored) return stored
  return buildNarrationImagePrompt(sb, style, sbs.value)
}

function getNarrationImagePromptForCopy(sb, style = drama.value?.style || 'comic') {
  const text = getNarrationImagePromptText(sb, style)
  if (text) return text
  const meta = parseNarrationImageMeta(sb)
  return String(meta.scene_content || extractNarrationSentence(sb) || '').trim()
}

function updateNarrationImagePrompt(sb, value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return
  updateField(sb, 'image_prompt', trimmed)
}

function updateNarrationImagePromptById(id, value) {
  const sb = sbs.value.find(item => item.id === id)
  if (sb) updateNarrationImagePrompt(sb, value)
}

function buildNarrationImageDetectLabel(detectSource, detectMode) {
  if (detectMode === 'paragraph' || detectSource === 'balanced' || detectSource === 'conservative') {
    if (detectSource === 'llm') return '按场景配图 · AI识别'
    if (detectSource === 'balanced' || detectSource === 'conservative') return '按场景配图 · 规则识别'
    return '按场景配图'
  }
  if (detectMode === 'conservative') {
    return detectSource === 'llm' ? '省钱 · AI识别' : '省钱 · 规则识别'
  }
  if (detectSource === 'llm') return '标准 · AI识别'
  if (detectSource === 'heuristic' || detectSource === 'balanced') return '标准 · 规则识别'
  return '标准'
}

function buildNarrationImagePromptLabel(promptSource) {
  if (promptSource === 'llm') return 'AI 配图文案'
  if (promptSource === 'template' || promptSource === 'rule' || promptSource === 'heuristic') return '规则配图文案'
  return null
}

const hasNarrationImageBreakdown = computed(() => {
  const s = narrationBreakdownSummary.value
  if (!s) return false
  if (s.image_breakdown_at ?? s.imageBreakdownAt) return true
  const detectSource = s.image_detect_source ?? s.imageDetectSource
  const paragraphCount = s.paragraph_count ?? s.paragraphCount
  return !!(detectSource || (paragraphCount != null && paragraphCount > 0))
})

const narrationStoryboardBreakdownPanel = computed(() => {
  if (!isNarrationMode.value || !sbs.value.length) return null
  const s = narrationBreakdownSummary.value
  const count = s?.count ?? sbs.value.length
  const sentenceCount = s?.sentence_count ?? s?.sentenceCount ?? sbs.value.filter(sb => !isNarrationTitleShot(sb)).length
  const titleCount = s?.title_count ?? s?.titleCount ?? sbs.value.filter(sb => isNarrationTitleShot(sb)).length
  const titleImageCount = s?.title_image_count ?? s?.titleImageCount ?? (titleCount ? 1 : 0)
  const titleHook = s?.title_hook ?? s?.titleHook ?? null
  const totalDur = s?.total_duration ?? s?.totalDuration ?? totalDuration.value
  const generatedAt = s?.storyboard_breakdown_at ?? s?.storyboardBreakdownAt ?? s?.generated_at ?? s?.generatedAt ?? null
  return {
    count,
    sentenceCount,
    titleCount,
    titleImageCount,
    titleHook,
    totalDur,
    generatedAt,
  }
})

const narrationImageBreakdownPanel = computed(() => {
  if (!isNarrationMode.value || !sbs.value.length || !hasNarrationImageBreakdown.value) return null
  const s = narrationBreakdownSummary.value
  const paragraphCount = s?.paragraph_count ?? s?.paragraphCount ?? null
  const diptychCount = s?.diptych_count ?? s?.diptychCount ?? 0
  const imageNeeded = narrationNeedImageCount.value
  const unitPrice = imageModelUnitPrice(episodeImageModel.value)
  const estImageCost = Math.round(imageNeeded * unitPrice * 100) / 100
  const priceLabel = imageModelPriceLabel(episodeImageModel.value)
  const detectSource = s?.image_detect_source ?? s?.imageDetectSource
  const detectMode = s?.image_detect_mode ?? s?.imageDetectMode ?? imageDetectMode.value
  const promptSource = s?.image_prompt_source ?? s?.imagePromptSource
  return {
    paragraphCount,
    diptychCount,
    imageNeeded,
    estImageCost,
    priceLabel,
    detectLabel: buildNarrationImageDetectLabel(detectSource, detectMode),
    promptLabel: buildNarrationImagePromptLabel(promptSource),
    generatedAt: s?.image_breakdown_at ?? s?.imageBreakdownAt ?? null,
  }
})

function syncNarrationBreakdownImageCount() {
  if (!epId.value || !isNarrationMode.value || !narrationBreakdownSummary.value || !sbs.value.length) return
  const live = narrationNeedImageCount.value
  const cached = narrationBreakdownSummary.value.image_needed_count ?? narrationBreakdownSummary.value.imageNeededCount ?? 0
  if (live === cached) return
  persistNarrationBreakdownSummary({ ...narrationBreakdownSummary.value, image_needed_count: live })
}

function persistNarrationBreakdownSummary(res) {
  if (!epId.value) return
  const prev = narrationBreakdownSummary.value || {}
  const liveImageNeeded = sbs.value.length ? narrationNeedImageCount.value : null
  const storyboardAt = res?.storyboard_breakdown_at ?? res?.storyboardBreakdownAt ?? res?.generatedAt ?? prev.storyboard_breakdown_at ?? prev.storyboardBreakdownAt ?? prev.generated_at ?? prev.generatedAt ?? null
  const imageAt = res?.image_breakdown_at ?? res?.imageBreakdownAt ?? prev.image_breakdown_at ?? prev.imageBreakdownAt ?? null
  const payload = {
    ...prev,
    count: res?.count ?? prev.count ?? 0,
    sentence_count: res?.sentence_count ?? res?.sentenceCount ?? prev.sentence_count ?? prev.sentenceCount ?? 0,
    title_count: res?.title_count ?? res?.titleCount ?? prev.title_count ?? prev.titleCount ?? 0,
    title_image_count: res?.title_image_count ?? res?.titleImageCount ?? prev.title_image_count ?? prev.titleImageCount ?? 0,
    title_hook: res?.title_hook ?? res?.titleHook ?? prev.title_hook ?? prev.titleHook ?? null,
    image_needed_count: liveImageNeeded ?? res?.image_needed_count ?? res?.imageNeededCount ?? prev.image_needed_count ?? prev.imageNeededCount ?? 0,
    paragraph_count: res?.paragraph_count ?? res?.paragraphCount ?? prev.paragraph_count ?? prev.paragraphCount ?? 0,
    diptych_count: res?.diptych_count ?? res?.diptychCount ?? prev.diptych_count ?? prev.diptychCount ?? 0,
    image_detect_source: res?.image_detect_source ?? res?.imageDetectSource ?? prev.image_detect_source ?? prev.imageDetectSource ?? null,
    image_prompt_source: res?.image_prompt_source ?? res?.imagePromptSource ?? prev.image_prompt_source ?? prev.imagePromptSource ?? null,
    image_detect_mode: res?.image_detect_mode ?? res?.imageDetectMode ?? prev.image_detect_mode ?? prev.imageDetectMode ?? imageDetectMode.value,
    total_duration: res?.total_duration ?? res?.totalDuration ?? prev.total_duration ?? prev.totalDuration ?? 0,
    storyboard_breakdown_at: storyboardAt,
    image_breakdown_at: imageAt,
    generated_at: storyboardAt,
  }
  narrationBreakdownSummary.value = payload
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`episode-${epId.value}-narration-breakdown`, JSON.stringify(payload))
  }
}

function restoreNarrationBreakdownSummary() {
  if (typeof window === 'undefined' || !epId.value) return
  try {
    const raw = window.localStorage.getItem(`episode-${epId.value}-narration-breakdown`)
    narrationBreakdownSummary.value = raw ? JSON.parse(raw) : null
  } catch {
    narrationBreakdownSummary.value = null
  }
}

function formatBreakdownTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}
const narrationImageReady = computed(() => narrationImagesReady(sbs.value))
const shotVidCount = computed(() => sbs.value.filter(s => s.video_url || s.videoUrl).length)
const visualCharTotal = computed(() => visualChars.value.length)

const prodTabDefs = computed(() => {
  if (isNarrationMode.value) {
    return [
      { id: 'voice', label: '旁白音色', icon: Mic2, badge: narratorReady.value ? '✓' : '' },
      { id: 'chars', label: '定妆参考', icon: Users, badge: visualCharTotal.value ? `${charImgCount.value}/${visualCharTotal.value}` : '' },
      { id: 'dubbing', label: '生成配音', icon: Mic2, badge: ttsEligibleCount.value ? `${ttsGeneratedCount.value}/${ttsEligibleCount.value}` : '' },
      { id: 'bgm', label: 'BGM 配乐', icon: Music, badge: sbs.value.length ? `${bgmAppliedCount.value}/${sbs.value.length}` : '' },
      { id: 'shots', label: '生成配图', icon: ImageIcon, badge: narrationNeedImageCount.value ? `${shotImgCount.value}/${narrationNeedImageCount.value}` : '' },
      { id: 'compose', label: '镜头合成', icon: Layers, badge: sbs.value.length ? `${composedCount.value}/${sbs.value.length}` : '' },
    ]
  }
  return [
    { id: 'chars', label: '角色形象', icon: Users, badge: visualCharTotal.value ? `${charImgCount.value}/${visualCharTotal.value}` : '' },
    { id: 'scenes', label: '场景图片', icon: MapPin, badge: sceneImgCount.value ? `${sceneImgCount.value}/${scenes.value.length}` : '' },
    { id: 'dubbing', label: '配音生成', icon: Mic2, badge: '' },
    { id: 'bgm', label: 'BGM 配乐', icon: Music, badge: sbs.value.length ? `${bgmAppliedCount.value}/${sbs.value.length}` : '' },
    { id: 'shots', label: '镜头图片', icon: ImageIcon, badge: shotImgCount.value ? `${shotImgCount.value}/${sbs.value.length}` : '' },
    { id: 'videos', label: '视频生成（可选）', icon: Video, badge: shotVidCount.value ? `${shotVidCount.value}/${sbs.value.length}` : '' },
    { id: 'compose', label: '视频合成', icon: Layers, badge: composedCount.value ? `${composedCount.value}/${sbs.value.length}` : '' },
  ]
})

const mainStageDefs = [
  { id: 'script', label: '剧本', desc: '内容改写与整理', icon: FileText },
  { id: 'assets', label: '资产', desc: '角色、场景与音色', icon: FolderKanban },
  { id: 'storyboard', label: '分镜', desc: '镜头制作与合成', icon: Clapperboard },
  { id: 'export', label: '导出', desc: '拼接与成片输出', icon: Download },
]

const workflowState = computed(() => ({
  rawContent: !!rawContent.value,
  scriptContent: !!scriptContent.value,
  charsCount: visualChars.value.length,
  charsVoiced: charsVoiced.value,
  sbsCount: sbs.value.length,
  narratorReady: narratorReady.value,
  ttsEligibleCount: ttsEligibleCount.value,
  ttsGeneratedCount: ttsGeneratedCount.value,
  shotImgCount: shotImgCount.value,
  shotImgNeededCount: narrationNeedImageCount.value,
  narrationImagesReady: narrationImageReady.value,
  narrationTtsReady: narrationTtsReady.value,
  shotVidCount: shotVidCount.value,
  composedCount: composedCount.value,
  mergeUrl: !!mergeUrl.value,
  openingVideoUrl: !!openingVideoUrl.value,
  titleVideoUrl: !!titleVideoUrl.value,
  bgmAppliedCount: bgmAppliedCount.value,
}))

const narrationIconMap = {
  'script:raw': FileText,
  'script:storyboard': Clapperboard,
  'prod:voice': Mic2,
  'prod:chars': Users,
  'prod:dubbing': Mic2,
  'prod:bgm': Music,
  'prod:shots': ImageIcon,
  'prod:compose': Layers,
  'export:opening': Film,
  'export:title': Clapperboard,
  'export:merge': Download,
}

const sidebarSections = computed(() => {
  if (isNarrationMode.value) {
    const sections = buildSidebarSections('narration', workflowState.value) || []
    return sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        icon: narrationIconMap[item.key] || FileText,
      })),
    }))
  }
  return [
    {
      id: 'script',
      label: '剧本',
      items: [
        { key: 'script:raw', label: '原始内容', desc: '', icon: FileText, done: !!rawContent.value },
        { key: 'script:rewrite', label: 'AI 改写', desc: '', icon: FileText, done: !!scriptContent.value },
        { key: 'script:extract', label: '提取', desc: '', icon: Users, done: !!chars.value.length },
        { key: 'script:voice', label: '音色', desc: '', icon: Mic2, done: !!chars.value.length && charsVoiced.value === chars.value.length },
        { key: 'script:storyboard', label: '分镜', desc: '', icon: Clapperboard, done: !!sbs.value.length },
      ],
    },
    {
      id: 'production',
      label: '制作',
      items: [
        { key: 'prod:chars', label: '角色形象', desc: '', icon: Users, done: prodStepDone('chars') },
        { key: 'prod:scenes', label: '场景图片', desc: '', icon: MapPin, done: prodStepDone('scenes') },
        { key: 'prod:dubbing', label: '配音生成', desc: '', icon: Mic2, done: prodStepDone('dubbing') },
        { key: 'prod:bgm', label: 'BGM 配乐', desc: '', icon: Music, done: prodStepDone('bgm') },
        { key: 'prod:shots', label: '镜头图片', desc: '', icon: ImageIcon, done: prodStepDone('shots') },
        { key: 'prod:videos', label: '视频生成', desc: '', icon: Video, done: prodStepDone('videos') },
        { key: 'prod:compose', label: '视频合成', desc: '', icon: Layers, done: prodStepDone('compose') },
      ],
    },
    {
      id: 'export',
      label: '导出',
      items: [
        { key: 'export:opening', label: '开幕视频', desc: '', icon: Film, done: !!openingVideoUrl.value },
        { key: 'export:title', label: '片头视频', desc: '', icon: Clapperboard, done: !!titleVideoUrl.value },
        { key: 'export:merge', label: '拼接导出', desc: '', icon: Download, done: !!mergeUrl.value },
      ],
    },
  ]
})

const activeMainStage = computed(() => {
  if (panel.value === 'export') return 'export'
  if (isNarrationMode.value) {
    if (panel.value === 'production') return 'production'
    return 'script'
  }
  if (panel.value === 'production') {
    return ['chars', 'scenes'].includes(prodTab.value) ? 'assets' : 'storyboard'
  }
  if (scriptStep.value <= 1) return 'script'
  if (scriptStep.value <= 3) return 'assets'
  return 'storyboard'
})

function mainStageDone(stageId) {
  if (stageId === 'script') return !!scriptContent.value
  if (stageId === 'assets') {
    const charsReady = !!chars.value.length && charsVoiced.value === chars.value.length
    const charImagesReady = !visualCharTotal.value || charImgCount.value === visualCharTotal.value
    const sceneImagesReady = !scenes.value.length || sceneImgCount.value === scenes.value.length
    return charsReady && charImagesReady && sceneImagesReady
  }
  if (stageId === 'storyboard') {
    if (!sbs.value.length) return false
    const ttsReady = isNarrationMode.value
      ? narrationTtsReady.value
      : (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value)
    return ttsReady
      && (isNarrationMode.value ? narrationImageReady.value : shotImgCount.value === sbs.value.length)
      && (isNarrationMode.value || shotVidCount.value === sbs.value.length)
      && composedCount.value === sbs.value.length
  }
  if (stageId === 'export') return !!mergeUrl.value
  return false
}

function goMainStage(stageId) {
  if (stageId === 'script') {
    panel.value = 'script'
    scriptStep.value = Math.min(scriptStep.value, isNarrationMode.value ? 1 : 1)
    return
  }
  if (stageId === 'assets') {
    const hasAssetWorkspace = !!visualCharTotal.value || !!scenes.value.length
    const hasPendingAssetGeneration = (visualCharTotal.value && charImgCount.value < visualCharTotal.value)
      || (scenes.value.length && sceneImgCount.value < scenes.value.length)
    if (panel.value === 'production' || hasPendingAssetGeneration || hasAssetWorkspace) {
      panel.value = 'production'
      prodTab.value = ['chars', 'scenes'].includes(prodTab.value) ? prodTab.value : 'chars'
      return
    }
    panel.value = 'script'
    scriptStep.value = chars.value.length ? 3 : 2
    return
  }
  if (stageId === 'storyboard') {
    if (panel.value === 'production') {
      prodTab.value = ['dubbing', 'bgm', 'shots', 'videos', 'compose'].includes(prodTab.value) ? prodTab.value : 'dubbing'
      return
    }
    panel.value = 'script'
    scriptStep.value = 4
    return
  }
  panel.value = 'export'
}

const activeSubSteps = computed(() => {
  if (isNarrationMode.value) {
    if (panel.value === 'script') {
      return [
        { key: 'script:raw', label: '文案输入', done: !!rawContent.value },
        { key: 'script:storyboard', label: '旁白分镜', done: !!sbs.value.length },
      ]
    }
    if (panel.value === 'production') {
      return [
        { key: 'prod:voice', label: '旁白音色', done: narratorReady.value },
        { key: 'prod:chars', label: '定妆参考', done: !visualCharTotal.value || charImgCount.value === visualCharTotal.value },
        { key: 'prod:dubbing', label: '生成配音', done: isNarrationMode.value ? narrationTtsReady.value : (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value) },
        { key: 'prod:bgm', label: 'BGM 配乐', done: bgmAppliedCount.value > 0 },
        { key: 'prod:shots', label: '生成配图', done: !!sbs.value.length && narrationImageReady.value },
        { key: 'prod:compose', label: '镜头合成', done: !!sbs.value.length && composedCount.value === sbs.value.length },
      ]
    }
    return [
      { key: 'export:opening', label: '开幕视频', done: !!openingVideoUrl.value },
      { key: 'export:title', label: '片头视频', done: !!titleVideoUrl.value },
      { key: 'export:merge', label: '拼接导出', done: !!mergeUrl.value },
    ]
  }
  if (activeMainStage.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!scriptContent.value },
    ]
  }
  if (activeMainStage.value === 'assets') {
    return [
      { key: 'script:extract', label: '提取角色场景', done: !!chars.value.length },
      { key: 'script:voice', label: '分配音色', done: !!chars.value.length && charsVoiced.value === chars.value.length },
      { key: 'prod:chars', label: '角色形象', done: !visualCharTotal.value || charImgCount.value === visualCharTotal.value },
      { key: 'prod:scenes', label: '场景图片', done: !scenes.value.length || sceneImgCount.value === scenes.value.length },
    ]
  }
  if (activeMainStage.value === 'storyboard') {
    return [
      { key: 'script:storyboard', label: '分镜拆解', done: !!sbs.value.length },
      { key: 'prod:dubbing', label: '配音生成', done: !ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value },
      { key: 'prod:bgm', label: 'BGM 配乐', done: bgmAppliedCount.value > 0 },
      { key: 'prod:shots', label: '镜头图片', done: !!sbs.value.length && shotImgCount.value === sbs.value.length },
      { key: 'prod:videos', label: '视频生成', done: !!sbs.value.length && shotVidCount.value === sbs.value.length },
      { key: 'prod:compose', label: '视频合成', done: !!sbs.value.length && composedCount.value === sbs.value.length },
    ]
  }
  return [
    { key: 'export:opening', label: '开幕视频', done: !!openingVideoUrl.value },
    { key: 'export:title', label: '片头视频', done: !!titleVideoUrl.value },
    { key: 'export:merge', label: '拼接导出', done: !!mergeUrl.value },
  ]
})

const activeSubStepKey = computed(() => resolveActiveSubStepKey(productionMode.value, panel.value, scriptStep.value, prodTab.value, exportTab.value))

const sidebarJumpSteps = computed(() => {
  const section = sidebarSections.value.find((item) => item.items.some(step => step.key === activeSubStepKey.value))
  return section?.items || []
})

const bubbleSteps = computed(() => {
  if (panel.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!scriptContent.value },
      { key: 'script:extract', label: '提取', done: !!chars.value.length },
      { key: 'script:voice', label: '音色', done: !!chars.value.length && charsVoiced.value === chars.value.length },
      { key: 'script:storyboard', label: '分镜', done: !!sbs.value.length },
    ]
  }
  if (panel.value === 'production') {
    return prodTabDefs.value.map(step => ({
      key: `prod:${step.id}`,
      label: step.label,
      done: prodStepDone(step.id),
    }))
  }
  return []
})

const activeBubbleKey = computed(() => {
  if (panel.value === 'script') return activeSubStepKey.value
  if (panel.value === 'production') return `prod:${prodTab.value}`
  return ''
})

const showBottomBubble = computed(() => panel.value === 'script' || panel.value === 'production')

function goSubStep(key) {
  if (key.startsWith('script:')) {
    panel.value = 'script'
    scriptStep.value = resolveScriptStep(productionMode.value, key)
    return
  }
  if (key.startsWith('prod:')) {
    panel.value = 'production'
    prodTab.value = key.replace('prod:', '')
    return
  }
  if (key.startsWith('export:')) {
    panel.value = 'export'
    exportTab.value = key.replace('export:', '')
    return
  }
  panel.value = 'export'
  exportTab.value = 'merge'
}

const pipelineProgress = computed(() => workflowProgress(productionMode.value, workflowState.value))

const currentStageLabel = computed(() => {
  if (panel.value === 'script') return `${isNarrationMode.value ? '解说' : '剧本'}阶段 · ${stepLabels.value[scriptStep.value] || ''}`
  if (panel.value === 'production') return `制作阶段 · ${prodTabDefs.value[prodTabIdx.value]?.label || '制作'}`
  if (exportTab.value === 'opening') {
    return openingVideoUrl.value ? '导出阶段 · 开幕视频已生成' : '导出阶段 · 开幕视频'
  }
  if (exportTab.value === 'title') {
    return titleVideoUrl.value ? '导出阶段 · 片头视频已生成' : '导出阶段 · 片头视频'
  }
  return mergeUrl.value ? '导出阶段 · 成片已生成' : '导出阶段 · 等待拼接'
})

const currentMainStageLabel = computed(() => {
  const current = mainStageDefs.find(stage => stage.id === activeMainStage.value)
  return current?.label || '工作台'
})

const currentSubStageLabel = computed(() => {
  const current = activeSubSteps.value.find(step => step.key === activeSubStepKey.value)
  return current?.label || currentStageLabel.value
})

function updateCharVoice(charId, voiceId) {
  characterAPI.update(charId, { voice_style: voiceId, voice_provider: lockedAudioProvider.value || undefined })
  const c = chars.value.find(ch => ch.id === charId)
  if (c) {
    c.voice_style = voiceId
    c.voiceStyle = voiceId
    c.voice_provider = lockedAudioProvider.value || ''
    c.voiceProvider = lockedAudioProvider.value || ''
    c.voice_sample_url = ''
    c.voiceSampleUrl = ''
  }
}
function getVoiceProfile(voiceId) {
  return voiceProfiles.value.find(v => v.id === voiceId) || null
}
const totalDuration = computed(() => sbs.value.reduce((s, sb) => s + (sb.duration || 10), 0))

const selectedSb = ref(null)
watch(selectedSb, sb => syncNarrationEditFromShot(sb), { immediate: true })

const shotTypes = [
  '大远景', '远景', '全景', '中景', '中近景', '近景', '特写', '大特写',
  '双人镜头', '三人镜头', '群像', '背影', '侧面', '正面', '俯视', '仰视',
  '过肩', '主观视角', '航拍', '运动镜头',
]
const shotAngles = ['平视', '仰视', '俯视', '侧拍', '背拍', '斜侧', '主观视角', '过肩']
const shotMovements = ['固定', '推镜', '拉镜', '摇镜', '移镜', '跟拍', '升降', '手持', '环绕']

function updateField(sb, field, value) {
  const current = sb[field] ?? sb[toCamel(field)]
  if (current === value) return
  sb[field] = value
  const camelField = toCamel(field)
  if (camelField !== field) sb[camelField] = value
  storyboardAPI.update(sb.id, { [field]: value })
}

function toCamel(field) {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function getStoryboardCharacterIds(sb) {
  return sb?.character_ids || sb?.characterIds || []
}

function getStoryboardCharacterNames(sb) {
  const ids = getStoryboardCharacterIds(sb)
  return chars.value.filter(char => ids.includes(char.id)).map(char => formatCharacterDisplayName(char))
}

async function resolveShotCharacterIds(sb) {
  try {
    const resolved = await storyboardAPI.resolveCharacters(sb.id)
    const ids = resolved?.character_ids || []
    if (ids.length) {
      sb.character_ids = ids
      sb.characterIds = ids
    }
    return ids.length ? ids : getStoryboardCharacterIds(sb)
  } catch {
    return getStoryboardCharacterIds(sb)
  }
}

function isStoryboardCharacterSelected(sb, charId) {
  return getStoryboardCharacterIds(sb).includes(charId)
}

function toggleStoryboardCharacter(sb, charId) {
  const currentIds = getStoryboardCharacterIds(sb)
  const nextIds = currentIds.includes(charId)
    ? currentIds.filter(id => id !== charId)
    : [...currentIds, charId]
  updateField(sb, 'character_ids', nextIds)
}

function getSceneName(sb) {
  const sceneId = sb?.scene_id || sb?.sceneId
  if (!sceneId) return '未绑定场景'
  const scene = scenes.value.find(s => s.id === sceneId)
  return scene ? `${scene.location} · ${scene.time || '未设时间'}` : `场景 #${sceneId}`
}

async function deleteShot(sb) {
  if (!confirm('确定删除此镜头？')) return
  const idx = sbs.value.indexOf(sb)
  await storyboardAPI.del(sb.id)
  await refresh()
  if (sbs.value.length) selectedSb.value = sbs.value[Math.min(idx, sbs.value.length - 1)]
  else selectedSb.value = null
}

const scriptSteps = computed(() => {
  const hasScript = !!scriptContent.value
  const hasChars = chars.value.length > 0 && hasScript
  const hasVoice = charsVoiced.value > 0 && hasChars
  const hasSbs = sbs.value.length > 0
  return [
    { label: '原始内容', state: rawContent.value ? 'done' : 'active', spinning: false },
    { label: 'AI 改写', state: hasScript ? 'done' : (rawContent.value ? 'active' : ''), spinning: rt.value === 'script_rewriter' },
    { label: '提取', state: hasChars ? 'done' : (hasScript ? 'active' : ''), spinning: rt.value === 'extractor' },
    { label: '音色', state: hasVoice ? 'done' : (hasChars ? 'active' : ''), spinning: rt.value === 'voice_assigner' },
    { label: '分镜', state: hasSbs ? 'done' : (hasVoice ? 'active' : ''), spinning: rt.value === 'storyboard_breaker' },
  ]
})

watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

async function refreshStoryboardsOnly() {
  if (!epId.value) return
  sbs.value = sortStoryboards(await episodeAPI.storyboards(epId.value))
}

function normalizeBgmLibraryRows(rows) {
  if (Array.isArray(rows)) return rows
  if (Array.isArray(rows?.items)) return rows.items
  return []
}

function mergeBgmLibraryRows(existing, incoming) {
  const map = new Map()
  for (const item of existing || []) map.set(item.id, item)
  for (const item of incoming || []) map.set(item.id, { ...map.get(item.id), ...item })
  return Array.from(map.values()).sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
}

function stopBgmPoll() {
  if (bgmPollTimer) {
    clearInterval(bgmPollTimer)
    bgmPollTimer = null
  }
}

async function tickBgmPoll(options = { resume: false }) {
  if (!dramaId) return
  try {
    const prevCompleted = bgmCompletedCount.value
    if (options.resume) {
      try { await musicAPI.resumePending({ drama_id: dramaId }) } catch {}
    }
    await loadBgmLibrary({ resumePoll: false })
    const pending = bgmPendingCount.value
    const nowCompleted = bgmCompletedCount.value
    if (nowCompleted > prevCompleted) {
      toast.success(`BGM 生成完成，新增 ${nowCompleted - prevCompleted} 首，共 ${nowCompleted} 首可用`)
      await refreshStoryboardsOnly()
    }
    if (!pending) stopBgmPoll()
  } catch (e) {
    console.warn('[BGM poll]', e?.message || e)
  }
}

function startBgmPoll() {
  stopBgmPoll()
  bgmPollTick = 0
  void tickBgmPoll({ resume: true })
  bgmPollTimer = setInterval(() => {
    bgmPollTick += 1
    void tickBgmPoll({ resume: bgmPollTick % 6 === 0 })
  }, 5000)
}

async function loadBgmLibrary(options = { resumePoll: true }) {
  if (!dramaId) return
  const rows = await musicAPI.list({ drama_id: dramaId })
  bgmLibrary.value = normalizeBgmLibraryRows(rows)
  if (options.resumePoll) {
    const pending = bgmLibrary.value.some(m => ['pending', 'processing'].includes(m.status))
    if (pending && !bgmPollTimer) startBgmPoll()
  }
}

async function refreshBgmLibrary() {
  if (!dramaId) return
  const pendingLead = bgmLibrary.value
    .filter(m => m.status === 'processing')
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))[0]
  if (pendingLead?.id) {
    try {
      await musicAPI.sync(pendingLead.id)
      toast.success('BGM 已同步完成')
      await loadBgmLibrary()
      return
    } catch (e) {
      console.warn('[BGM sync]', e?.message || e)
    }
  }
  try { await musicAPI.resumePending({ drama_id: dramaId }) } catch {}
  await loadBgmLibrary()
}

async function generateBgmDescription() {
  bgmDescGenerating.value = true
  try {
    const sb = bgmTargetSbId.value ? sbs.value.find(s => s.id === bgmTargetSbId.value) : null
    const result = await musicAPI.suggestDescription({
      episode_id: epId.value,
      storyboard_id: sb?.id,
      model: bgmModel.value,
      description: bgmDesc.value.trim() || undefined,
      content: sb ? getDialogueText(sb) : (localScript.value || scriptContent.value || localRaw.value || ''),
    })
    if (result?.description) {
      bgmDesc.value = result.description
      toast.success('BGM 描述已生成')
    } else {
      toast.error('AI 未返回描述')
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    bgmDescGenerating.value = false
  }
}

async function generateEpisodeBgm() {
  if (!bgmDesc.value.trim()) {
    toast.error('请填写 BGM 描述')
    return
  }
  if (bgmModel.value === 'pixverse-sound-effect' && !bgmTargetSbId.value) {
    toast.error('PixVerse 需关联已有合成/视频的镜头')
    return
  }
  if (bgmModel.value === 'pixverse-sound-effect' && bgmTargetSbId.value) {
    const sb = sbs.value.find(s => s.id === bgmTargetSbId.value)
    const hasVideo = sb && (sb.composed_video_url || sb.composedVideoUrl || sb.video_url || sb.videoUrl)
    if (!hasVideo) {
      toast.error('所选镜头尚无合成/视频，请先在「合成」步骤生成，或改用 Suno')
      return
    }
  }
  bgmGenerating.value = true
  try {
    const sb = bgmTargetSbId.value ? sbs.value.find(s => s.id === bgmTargetSbId.value) : null
    const result = await musicAPI.generate({
      drama_id: dramaId,
      episode_id: epId.value,
      storyboard_id: sb?.id,
      description: bgmDesc.value.trim(),
      content: sb ? getDialogueText(sb) : (localScript.value || scriptContent.value || ''),
      model: bgmModel.value,
      auto_apply: !!sb,
    })
    const createdItems = normalizeBgmLibraryRows(result?.items)
    await loadBgmLibrary({ resumePoll: false })
    if (createdItems.length) {
      bgmLibrary.value = mergeBgmLibraryRows(bgmLibrary.value, createdItems)
    }
    toast.success(createdItems.length ? 'BGM 已提交，正在生成…' : 'BGM 生成已提交，请稍候')
    startBgmPoll()
  } catch (e) {
    toast.error(e.message)
  } finally {
    bgmGenerating.value = false
  }
}

async function applyBgmToShot(musicId, storyboardId) {
  try {
    await musicAPI.apply(musicId, storyboardId)
    toast.success('已应用到镜头')
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message)
  }
}

async function refresh() {
  try {
    drama.value = await dramaAPI.get(dramaId)
    const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber)
    if (ep) {
      episode.value = ep
      syncExportWatermarkFromEpisode(ep)
      openingSubtitleText.value = resolveOpeningSubtitleText(ep.opening_subtitle_text || ep.openingSubtitleText)
      syncEpisodeImageModel(ep)
      syncEpisodeTextModel(ep)
      syncEpisodeTextThinking(ep)
      syncReferPreviousEpisode(ep)
      try { chars.value = await episodeAPI.characters(ep.id) } catch { chars.value = [] }
      try { scenes.value = await episodeAPI.scenes(ep.id) } catch { scenes.value = [] }
      sbs.value = sortStoryboards(await episodeAPI.storyboards(ep.id))
      if (hasDuplicateStoryboardNumbers(sbs.value)) {
        await fixDuplicateStoryboardNumbers()
      }
      if (sbs.value.length) {
        const prevId = selectedSb.value?.id
        const stillExists = prevId && sbs.value.some(sb => sb.id === prevId)
        if (!stillExists) selectedSb.value = sbs.value[0]
      } else {
        selectedSb.value = null
      }

      const epHasContent = !!(episode.value?.content)
      const epHasScript = !!(episode.value?.script_content || episode.value?.scriptContent)
      const epHasSbs = sbs.value.length > 0

      if (isNarrationMode.value) {
        scriptStep.value = inferNarrationScriptStep(episode.value, sbs.value.length, visualChars.value.length)
        try { await ensureNarratorCharacter() } catch {}
      } else if (epHasSbs) scriptStep.value = 4
      else if (epHasScript && chars.value.some(c => c.voice_style || c.voiceStyle)) scriptStep.value = 3
      else if (epHasScript && chars.value.length) scriptStep.value = 2
      else if (epHasScript || epHasContent) scriptStep.value = 1
      else scriptStep.value = 0
      await loadLatestGridImage()
      syncNarrationBreakdownImageCount()
      if (isNarrationMode.value && panel.value === 'production' && !['voice', 'chars', 'dubbing', 'bgm', 'shots', 'compose'].includes(prodTab.value)) {
        prodTab.value = 'voice'
      }
      try { await loadBgmLibrary() } catch {}
    }
  } catch (e) {
    toast.error(e.message)
  }
  try {
    mergeData.value = await mergeAPI.status(epId.value)
    if (['processing', 'pending'].includes(mergeData.value?.status) || ['processing', 'pending'].includes(mergeData.value?.test?.status)) {
      startMergePoll()
    }
  } catch {}
  try {
    await resumeNarrationImageBreakdownPollIfNeeded()
  } catch {}
}

function saveRaw() { episodeAPI.update(epId.value, { content: localRaw.value }); episode.value.content = localRaw.value }
function saveScr() { episodeAPI.update(epId.value, { script_content: localScript.value }); episode.value.script_content = localScript.value }
async function saveNarrationScript() {
  const script = (localRaw.value || localScript.value || '').trim()
  if (!script) throw new Error('请先填写解说文案')
  localScript.value = script
  localRaw.value = script
  await Promise.all([
    episodeAPI.update(epId.value, { content: script, script_content: script }),
  ])
  episode.value.content = script
  episode.value.script_content = script
  return script
}
function doRewrite() { saveRaw(); runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', dramaId, epId.value, refresh) }
function skipRewrite() {
  const raw = (localRaw.value || rawContent.value || '').trim()
  if (!raw) {
    toast.warning('请先填写原始内容')
    return
  }
  localScript.value = raw
  saveScr()
  toast.success('已跳过 AI 改写，当前将直接使用原始内容')
  scriptStep.value = 2
}
function doExtract() { saveScr(); runAgent('extractor', '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并', dramaId, epId.value, refresh) }
function doVoice() { runAgent('voice_assigner', '请为所有角色分配合适的音色', dramaId, epId.value, refresh) }
async function batchGenSamples() {
  const pending = chars.value.filter(c => (c.voice_style || c.voiceStyle) && !(c.voice_sample_url || c.voiceSampleUrl))
  if (!pending.length) {
    toast.info(charsVoiced.value ? '所有角色的试听文件已生成' : '请先分配音色')
    return
  }
  if (!tryBeginBatch('voiceSamples', '正在批量生成试听文件…')) return
  try {
    const results = await Promise.allSettled(pending.map(c => characterAPI.voiceSample(c.id, epId.value)))
    const okCount = results.filter(r => r.status === 'fulfilled').length
    const failCount = results.length - okCount
    if (okCount) toast.success(`已生成 ${okCount} 份试听文件`)
    if (failCount) toast.error(`${failCount} 份试听文件生成失败`)
    await refresh()
  } finally {
    endBatch('voiceSamples')
  }
}
function doBreakdown() {
  const cfg = videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)
  const label = cfg ? `${cfg.name} (${cfg.provider})` : '默认'
  runAgent('storyboard_breaker', `请拆解分镜并生成视频提示词。视频模型：${label}，请根据该模型的特性和时长限制生成合适的视频提示词。`, dramaId, epId.value, refresh)
}
function restoreImageDetectModePrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const mode = window.localStorage.getItem(`episode-${epId.value}-image-detect-mode`)
  if (mode === 'paragraph' || mode === 'balanced' || mode === 'conservative') imageDetectMode.value = 'paragraph'
}

function doNarrationBreakdown() {
  narrationBreaking.value = true
  void (async () => {
    try {
      const script = await saveNarrationScript()
      const res = await episodeAPI.narrationStoryboardBreakdown(epId.value, { script })
      const titleCount = res?.title_count ?? res?.titleCount ?? 0
      const titleHook = res?.title_hook ?? res?.titleHook
      const sentenceCount = res?.sentence_count ?? res?.sentenceCount ?? 0
      const titleHint = titleCount
        ? `，片头 ${titleCount} 镜${titleHook ? `（${titleHook}）` : ''}`
        : '，未识别片头标题（首行请写「标题：」或「今天体验的人生剧本是…」）'
      toast.success(`旁白分镜：${sentenceCount} 句 → ${res?.count || 0} 镜${titleHint}`)
      persistNarrationBreakdownSummary({
        ...res,
        storyboard_breakdown_at: Date.now(),
      })
      await refresh()
      await ensureNarratorCharacter()
    } catch (e) {
      toast.error(e.message)
    } finally {
      narrationBreaking.value = false
    }
  })()
}

function stopNarrationImageBreakdownPoll() {
  if (narrationImageBreakdownPollTimer) {
    clearInterval(narrationImageBreakdownPollTimer)
    narrationImageBreakdownPollTimer = null
  }
}

async function pollNarrationImageBreakdownProgress() {
  if (!epId.value) return
  try {
    const progress = await episodeAPI.narrationImageBreakdownStatus(epId.value)
    narrationImageBreakdownProgress.value = progress
    if (progress?.status === 'completed' || progress?.status === 'failed' || progress?.status === 'idle') {
      stopNarrationImageBreakdownPoll()
      narrationImageBreaking.value = false
    }
  } catch {}
}

function startNarrationImageBreakdownPoll() {
  stopNarrationImageBreakdownPoll()
  void pollNarrationImageBreakdownProgress()
  narrationImageBreakdownPollTimer = setInterval(() => {
    void pollNarrationImageBreakdownProgress()
  }, 1500)
}

async function resumeNarrationImageBreakdownPollIfNeeded() {
  if (!epId.value) return
  const progress = await episodeAPI.narrationImageBreakdownStatus(epId.value)
  narrationImageBreakdownProgress.value = progress
  if (progress?.status === 'processing') {
    narrationImageBreaking.value = true
    startNarrationImageBreakdownPoll()
  }
}

function doNarrationImageBreakdown() {
  runNarrationImageBreakdown({ retry_missing_prompts: false })
}

function doRetryMissingNarrationImagePrompts() {
  runNarrationImageBreakdown({ retry_missing_prompts: true })
}

function runNarrationImageBreakdown(options = {}) {
  const retryMissing = options.retry_missing_prompts === true
  narrationImageBreaking.value = true
  narrationImageBreakdownProgress.value = {
    status: 'processing',
    phase: retryMissing ? 'prompts' : 'detecting',
    message: retryMissing ? '正在补全缺失配图文案…' : '正在启动配图分镜…',
    percent: 1,
  }
  startNarrationImageBreakdownPoll()
  const style = drama.value?.style || 'comic'
  void (async () => {
    try {
      const res = await episodeAPI.narrationImageBreakdown(epId.value, {
        style,
        image_detect_mode: imageDetectMode.value,
        retry_missing_prompts: retryMissing,
      })
      if (res?.retry_missing_prompts ?? res?.retryMissingPrompts) {
        const updated = res?.prompts_updated ?? res?.promptsUpdated ?? 0
        toast.success(`已补全 ${updated} 条缺失配图文案`)
      } else {
        const paragraphCount = res?.paragraph_count ?? res?.paragraphCount ?? 0
        const diptychCount = res?.diptych_count ?? res?.diptychCount ?? 0
        const imageCount = res?.image_needed_count ?? res?.imageNeededCount ?? 0
        const diptychHint = diptychCount ? `（含 ${diptychCount} 张两宫格）` : ''
        const promptSource = res?.image_prompt_source ?? res?.imagePromptSource
        const promptHint = promptSource === 'llm' ? ' · AI配图文案' : ' · 规则配图文案'
        toast.success(`配图分镜：${paragraphCount} 段 · ${imageCount} 张配图${diptychHint}${promptHint}`)
      }
      persistNarrationBreakdownSummary({
        ...res,
        image_breakdown_at: Date.now(),
      })
      await refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      stopNarrationImageBreakdownPoll()
      narrationImageBreaking.value = false
      try {
        narrationImageBreakdownProgress.value = await episodeAPI.narrationImageBreakdownStatus(epId.value)
      } catch {
        narrationImageBreakdownProgress.value = null
      }
    }
  })()
}
function triggerNarrationStoryboardDescUpload() {
  storyboardDescUploadTarget.value = 'storyboard'
  storyboardDescUploadInputRef.value?.click()
}

function triggerNarrationImageDescUpload() {
  storyboardDescUploadTarget.value = 'image'
  storyboardDescUploadInputRef.value?.click()
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file, 'UTF-8')
  })
}

async function onStoryboardDescUploadSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  const target = storyboardDescUploadTarget.value
  storyboardDescUploadTarget.value = null
  if (!file || !target) return

  try {
    const text = String(await readTextFile(file)).trim()
    if (!text) throw new Error('文件内容为空')

    if (target === 'storyboard') {
      narrationStoryboardDescUploading.value = true
      const res = await episodeAPI.importNarrationStoryboardDesc(epId.value, text)
      const mode = res?.mode
      if (mode === 'script') {
        localRaw.value = text
        localScript.value = text
        if (episode.value) {
          episode.value.content = text
          episode.value.script_content = text
        }
        const titleCount = res?.title_count ?? res?.titleCount ?? 0
        const sentenceCount = res?.sentence_count ?? res?.sentenceCount ?? 0
        toast.success(`已导入文案并分镜：${sentenceCount} 句 → ${res?.count || 0} 镜`)
        persistNarrationBreakdownSummary({
          ...res,
          storyboard_breakdown_at: Date.now(),
        })
        await refresh()
        await ensureNarratorCharacter()
      } else if (mode === 'create') {
        toast.success(`已创建 ${res?.count || 0} 个旁白分镜`)
        persistNarrationBreakdownSummary({
          count: res?.count,
          total_duration: res?.total_duration ?? res?.totalDuration,
          storyboard_breakdown_at: Date.now(),
        })
        await refresh()
        await ensureNarratorCharacter()
      } else {
        const updated = res?.updated ?? 0
        const skipped = res?.skipped ?? 0
        toast.success(`已更新 ${updated} 镜旁白描述${skipped ? `，${skipped} 条未匹配` : ''}`)
        await refresh()
      }
    } else if (target === 'image') {
      narrationImageDescUploading.value = true
      const res = await episodeAPI.importNarrationImageDesc(epId.value, text)
      const updated = res?.updated ?? 0
      const skipped = res?.skipped ?? 0
      const mode = res?.mode === 'lines' ? '逐行' : '【#序号】'
      toast.success(`已导入 ${updated} 条配图描述（${mode}）${skipped ? `，${skipped} 条未匹配` : ''}`)
      if (updated > 0) {
        persistNarrationBreakdownSummary({
          image_breakdown_at: Date.now(),
          image_prompt_source: 'upload',
        })
      }
      await refresh()
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationStoryboardDescUploading.value = false
    narrationImageDescUploading.value = false
  }
}

async function doExtractNarrationCharacters() {
  narrationExtracting.value = true
  try {
    const script = await saveNarrationScript()
    const style = drama.value?.style || 'comic'
    const res = await episodeAPI.extractNarrationCharacters(epId.value, {
      script,
      style,
      text_model: episodeTextModel.value,
      text_thinking: episodeTextThinking.value,
    })
    const created = res?.created ?? 0
    const updated = res?.updated ?? 0
    const archived = res?.archived ?? 0
    if (created || updated) {
      const total = (res?.characters || []).length
      const archiveHint = archived ? `，已移除 ${archived} 个配角定妆` : ''
      toast.success(`已提取主角 ${total} 条定妆：新增 ${created}，更新 ${updated}${archiveHint}`)
    } else if (archived) {
      toast.success(`已移除 ${archived} 个配角定妆，保留主角 ${(res?.characters || []).length} 条`)
    } else if ((res?.characters || []).length) {
      toast.info('角色列表已是最新')
    } else {
      toast.warning('未从文案中识别到画面角色，可手动添加或跳过后续分镜')
    }
    await refresh()
    if (sbs.value.length) {
      await episodeAPI.linkNarrationCharacters(epId.value)
      await refresh()
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationExtracting.value = false
  }
}

async function addNarrationCharacter() {
  const name = window.prompt('角色姓名')
  if (!name?.trim()) return
  try {
    await characterAPI.create({
      drama_id: dramaId,
      episode_id: epId.value,
      name: name.trim(),
      role: '角色',
    })
    await refresh()
    toast.success('角色已添加')
  } catch (e) {
    toast.error(e.message)
  }
}

function updateCharacterAppearance(charId, value) {
  const trimmed = String(value || '').trim()
  characterAPI.update(charId, { appearance: trimmed })
  const c = chars.value.find(ch => ch.id === charId)
  if (c) c.appearance = trimmed
}

function onNarratorVoiceChange(voiceId) {
  narratorVoiceId.value = voiceId
  narratorVoiceDirty.value = true
}

function syncNarratorVoiceFromChar(narrator) {
  if (narratorVoiceDirty.value) return
  const voice = narrator?.voice_style || narrator?.voiceStyle
  if (voice) narratorVoiceId.value = voice
}

async function ensureNarratorCharacter() {
  if (!epId.value) {
    throw new Error('集信息加载中，请稍后重试')
  }
  let narrator = findNarratorChar(chars.value)
  if (narrator) {
    syncNarratorVoiceFromChar(narrator)
    return narrator
  }

  const dramaNarrator = findNarratorChar(drama.value?.characters || [])
  await characterAPI.create({
    drama_id: dramaId,
    episode_id: epId.value,
    name: '旁白',
    role: '旁白',
    voice_style: narratorVoiceId.value || dramaNarrator?.voice_style || dramaNarrator?.voiceStyle || undefined,
    voice_provider: lockedAudioProvider.value || undefined,
  })
  await refresh()
  narrator = findNarratorChar(chars.value)
  if (narrator) syncNarratorVoiceFromChar(narrator)
  return narrator || null
}
async function saveNarratorVoice() {
  if (!narratorVoiceId.value) {
    toast.warning('请先选择旁白音色')
    return
  }
  const selectedVoice = narratorVoiceId.value
  try {
    const narrator = await ensureNarratorCharacter()
    if (!narrator?.id) {
      toast.error('旁白角色创建失败，请刷新页面后重试')
      return
    }
    narratorVoiceId.value = selectedVoice
    const updated = await characterAPI.update(narrator.id, {
      voice_style: selectedVoice,
      voice_provider: lockedAudioProvider.value || undefined,
    })
    const patch = {
      voice_style: selectedVoice,
      voiceStyle: selectedVoice,
      voice_provider: lockedAudioProvider.value || undefined,
      voiceProvider: lockedAudioProvider.value || undefined,
    }
    const local = chars.value.find(c => c.id === narrator.id)
    if (local) Object.assign(local, patch)
    const dramaChar = drama.value?.characters?.find(c => c.id === narrator.id)
    if (dramaChar) Object.assign(dramaChar, patch)
    narratorVoiceId.value = updated?.voice_style || updated?.voiceStyle || selectedVoice
    narratorVoiceDirty.value = false
    toast.success('旁白音色已保存')
  } catch (e) {
    toast.error(e.message || '旁白音色保存失败')
  }
}
async function genSample(id) { try { await characterAPI.voiceSample(id, epId.value); toast.success('试听已生成'); refresh() } catch (e) { toast.error(e.message) } }
async function addShot() { await storyboardAPI.create({ episode_id: epId.value, storyboard_number: sbs.value.length + 1, title: `镜头${sbs.value.length + 1}`, duration: 10 }); refresh() }

function isBatchRunning(key) {
  return batchRunning.value.has(key)
}

function tryBeginBatch(key, message) {
  if (batchRunning.value.has(key)) {
    toast.warning('批量任务进行中，请稍候')
    return false
  }
  batchRunning.value = new Set([...batchRunning.value, key])
  toast.info(message)
  return true
}

function endBatch(key) {
  const next = new Set(batchRunning.value)
  next.delete(key)
  batchRunning.value = next
}

async function mapWithConcurrency(items, limit, worker) {
  if (!items.length) return []
  const results = new Array(items.length)
  let cursor = 0
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, () => runWorker()))
  return results
}

function resolveTtsBatchConcurrency() {
  if (isNarrationMode.value && localTtsEnabled.value !== false) {
    return localTtsEngine.value === 'voicebox' ? 8 : 6
  }
  return 2
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function watchAsyncResult(check, attempts = 24, delay = 2500) {
  return (async () => {
    for (let i = 0; i < attempts; i++) {
      await sleep(delay)
      await refresh()
      if (check()) return true
    }
    return false
  })()
}

async function watchCharImageResult(charId, generationId, attempts = 36, delay = 2500, baseline = null) {
  const startChar = chars.value.find(c => c.id === charId)
  const startUrl = baseline?.startUrl ?? (startChar?.image_url || startChar?.imageUrl || '')
  const startUpdatedAt = baseline?.startUpdatedAt ?? (startChar?.updated_at || startChar?.updatedAt || '')

  for (let i = 0; i < attempts; i++) {
    await sleep(i === 0 ? 1500 : delay)

    if (generationId) {
      try {
        const gen = await imageAPI.get(generationId)
        if (gen?.status === 'failed') {
          pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
          toast.error(gen?.error_msg || gen?.errorMsg || '定妆生成失败')
          return false
        }
        if (gen?.status === 'completed') {
          await refresh()
          pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
          return true
        }
      } catch {}
    }

    await refresh()
    const char = chars.value.find(c => c.id === charId)
    const url = char?.image_url || char?.imageUrl || ''
    const updatedAt = char?.updated_at || char?.updatedAt || ''
    if (url && (url !== startUrl || updatedAt !== startUpdatedAt)) {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
      return true
    }
  }
  pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
  toast.warning('定妆生成超时或失败，请重试')
  return false
}

async function copyTextToClipboard(text) {
  const value = String(text || '').trim()
  if (!value) {
    toast.warning('暂无描述词')
    return false
  }
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (!ok) toast.error('复制失败，请手动复制')
    return ok
  }
}

const imageUploadInputRef = ref(null)
const shotFolderUploadInputRef = ref(null)
const imageUploadTarget = ref(null)
const audioUploadInputRef = ref(null)
const audioUploadTarget = ref(null)
const narrationAudioSplitting = ref(false)
const narrationAudioUploading = ref(false)
const narrationSrtPreviewing = ref(false)
const uploadedEpisodeAudio = ref([])
const narrationSrtFiles = ref([])
const narrationSrtPanelOpen = ref(false)
const expandedSrtIndex = ref(-1)
const srtViewMode = ref('table')

const narrationSrtCueCount = computed(() =>
  narrationSrtFiles.value.reduce((sum, file) => sum + (file.cues?.length || file.subtitle_count || file.subtitleCount || 0), 0),
)

function pendingAudioStorageKey() {
  return `episode-${epId.value}-pending-audio`
}

function loadUploadedEpisodeAudio() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(pendingAudioStorageKey())
    uploadedEpisodeAudio.value = raw ? JSON.parse(raw) : []
  } catch {
    uploadedEpisodeAudio.value = []
  }
}

function saveUploadedEpisodeAudio() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(pendingAudioStorageKey(), JSON.stringify(uploadedEpisodeAudio.value))
}

function clearUploadedEpisodeAudio() {
  uploadedEpisodeAudio.value = []
  saveUploadedEpisodeAudio()
  clearNarrationSrtFiles()
}

function removeUploadedEpisodeAudio(index) {
  uploadedEpisodeAudio.value = uploadedEpisodeAudio.value.filter((_, i) => i !== index)
  saveUploadedEpisodeAudio()
}

function getUploadedAudioUrl(path) {
  const normalized = String(path || '').replace(/^\/+/, '')
  return normalized ? `/${normalized}` : ''
}

function narrationSrtStorageKey() {
  return `episode-${epId.value}-narration-srt`
}

function loadNarrationSrtFiles() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(narrationSrtStorageKey())
    narrationSrtFiles.value = raw ? JSON.parse(raw) : []
    expandedSrtIndex.value = -1
  } catch {
    narrationSrtFiles.value = []
    expandedSrtIndex.value = -1
  }
}

function saveNarrationSrtFiles() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(narrationSrtStorageKey(), JSON.stringify(narrationSrtFiles.value))
}

function applyNarrationSrtFiles(files) {
  narrationSrtFiles.value = Array.isArray(files) ? files : []
  saveNarrationSrtFiles()
}

function clearNarrationSrtFiles() {
  narrationSrtFiles.value = []
  expandedSrtIndex.value = -1
  saveNarrationSrtFiles()
}

function getSrtAudioName(file) {
  const path = file.audio_path || file.audioPath || ''
  const matched = uploadedEpisodeAudio.value.find(item => item.path === path)
  if (matched?.name) return matched.name
  return path.split('/').pop() || '音频'
}

function getSrtDownloadUrl(path) {
  return getUploadedAudioUrl(path)
}

function formatSrtRaw(file) {
  const cues = file.cues || []
  return cues.map(cue => {
    const idx = cue.index
    const start = cue.start_label || cue.startLabel || ''
    const end = cue.end_label || cue.endLabel || ''
    const script = cue.script_text || cue.scriptText || ''
    const scriptLine = script ? `\n; 分镜: ${script}` : ''
    return `${idx}\n${start} --> ${end}\n${cue.text}${scriptLine}\n`
  }).join('\n')
}

function hasSrtScriptColumn(file) {
  return (file.cues || []).some(cue => cue.script_text || cue.scriptText)
}

function toggleSrtExpand(index) {
  expandedSrtIndex.value = expandedSrtIndex.value === index ? -1 : index
}

async function previewNarrationSrt() {
  if (!uploadedEpisodeAudio.value.length) {
    toast.warning('请先上传 MP3')
    return
  }
  narrationSrtPreviewing.value = true
  try {
    toast.info('正在 Whisper 转写字幕…')
    const paths = uploadedEpisodeAudio.value.map(item => item.path)
    const res = await episodeAPI.transcribeNarrationAudio(epId.value, paths)
    const files = res?.srt_files ?? res?.srtFiles ?? []
    applyNarrationSrtFiles(files)
    const cached = files.filter(f => f.cached).length
    const cacheHint = cached > 0 ? `，其中 ${cached} 份来自缓存` : ''
    toast.success(`已生成 ${files.length} 份字幕${cacheHint}`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationSrtPreviewing.value = false
  }
}

watch(epId, () => {
  loadUploadedEpisodeAudio()
  loadNarrationSrtFiles()
}, { immediate: true })

function triggerEpisodeNarrationAudioUpload(replace = false) {
  if (!ttsEligibleCount.value) {
    toast.warning('请先完成分镜并填写旁白文案')
    return
  }
  audioUploadTarget.value = { kind: 'episode-upload', replace: !!replace }
  if (audioUploadInputRef.value) {
    audioUploadInputRef.value.multiple = true
  }
  audioUploadInputRef.value?.click()
}

async function splitEpisodeNarrationAudio() {
  if (!uploadedEpisodeAudio.value.length) {
    toast.warning('请先上传 MP3')
    return
  }
  narrationAudioSplitting.value = true
  try {
    toast.info('正在按文案对齐裁剪…')
    const paths = uploadedEpisodeAudio.value.map(item => item.path)
    const res = await episodeAPI.splitNarrationAudio(epId.value, paths)
    const srtFiles = res?.srt_files ?? res?.srtFiles
    if (srtFiles?.length) applyNarrationSrtFiles(srtFiles)
    await refresh()
    const count = res?.assigned_count ?? res?.assignedCount ?? 0
    const alignMode = res?.align_mode ?? res?.alignMode
    const merged = res?.merged
    const alignScore = res?.align_score ?? res?.alignScore
    const srtCachedCount = res?.srt_cached_count ?? res?.srtCachedCount ?? 0
    const alignHintMap = {
      srt: '（SRT 字幕对齐）',
      speech: '（句间静音对齐）',
      boundary: '（上传段边界对齐）',
      weighted: '（按字数比例切分）',
      content_match: '（按字数比例切分）',
    }
    const scoreHint = typeof alignScore === 'number' ? `，匹配度 ${Math.round(alignScore * 100)}%` : ''
    const cacheHint = srtCachedCount > 0 ? `，复用 ${srtCachedCount} 份已生成字幕` : ''
    const alignHint = alignHintMap[alignMode] || ''
    const mergeHint = merged ? '（多段已先合成）' : ''
    toast.success(`已裁剪分配 ${count} 条配音${mergeHint}${alignHint}${scoreHint}${cacheHint}`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationAudioSplitting.value = false
  }
}

function triggerShotTtsUpload(sbId) {
  audioUploadTarget.value = { kind: 'shot', id: sbId }
  if (audioUploadInputRef.value) {
    audioUploadInputRef.value.multiple = false
  }
  audioUploadInputRef.value?.click()
}

function triggerOpeningAudioUpload() {
  audioUploadTarget.value = { kind: 'opening' }
  if (audioUploadInputRef.value) {
    audioUploadInputRef.value.multiple = false
  }
  audioUploadInputRef.value?.click()
}

async function generateOpeningAudio() {
  const text = openingSubtitleText.value.trim()
  if (!text) {
    toast.warning('请先填写字幕文案')
    return
  }
  if (localTtsEngine.value === 'voicebox' && !voiceboxAvailable.value) {
    toast.error('Voicebox 未运行，请先启动 Voicebox（默认端口 17493）')
    return
  }
  if (!localEdgeVoiceId.value) {
    toast.warning(localTtsEngine.value === 'voicebox' ? '请选择 Voicebox 音色' : '请选择本地音色')
    return
  }
  try {
    openingAudioGenerating.value = true
    await episodeAPI.generateOpeningAudio(epId.value, {
      subtitle_text: text,
      local_tts_engine: localTtsEngine.value === 'voicebox' ? 'voicebox' : 'edge',
      local_voice: localEdgeVoiceId.value,
      tts_speed: localTtsSpeed.value,
      ...(localTtsEngine.value === 'voicebox' && resolveVoiceboxInstructText()
        ? { voicebox_instruct: resolveVoiceboxInstructText() }
        : {}),
      ...(localTtsEngine.value === 'voicebox'
        ? { voicebox_model_size: localVoiceboxModelSize.value }
        : {}),
    })
    await refresh()
    toast.success('开幕配音已生成，可点击生成开幕视频')
  } catch (e) {
    toast.error(e.message)
  } finally {
    openingAudioGenerating.value = false
  }
}

async function saveOpeningSubtitle() {
  if (!epId.value || !openingAudioUrl.value) return
  try {
    const path = openingAudioUrl.value.replace(/^\//, '')
    await episodeAPI.uploadOpeningAudio(epId.value, path, openingSubtitleText.value.trim())
    await refresh()
  } catch (e) {
    toast.error(e.message)
  }
}

async function onAudioUploadSelected(event) {
  const files = Array.from(event.target.files || [])
    .filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name))
  event.target.value = ''
  const target = audioUploadTarget.value
  audioUploadTarget.value = null
  if (!files.length || !target) return

  try {
    if (target.kind === 'episode-upload') {
      narrationAudioUploading.value = true
      toast.info(`正在上传 ${files.length} 段音频…`)
      const entries = []
      for (const file of files) {
        const uploaded = await uploadAPI.audio(file)
        const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
        if (!path) throw new Error('上传失败')
        entries.push({ path, name: file.name })
      }
      uploadedEpisodeAudio.value = target.replace
        ? entries
        : [...uploadedEpisodeAudio.value, ...entries]
      saveUploadedEpisodeAudio()
      toast.success(`已添加 ${entries.length} 段，当前共 ${uploadedEpisodeAudio.value.length} 段，可先试听后裁剪`)
    } else if (target.kind === 'shot') {
      const file = files[0]
      const uploaded = await uploadAPI.audio(file)
      const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
      if (!path) throw new Error('上传失败')
      await storyboardAPI.uploadTTS(target.id, path)
      await refresh()
      toast.success('本镜配音已上传')
    } else if (target.kind === 'opening') {
      openingAudioUploading.value = true
      const file = files[0]
      const uploaded = await uploadAPI.audio(file)
      const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
      if (!path) throw new Error('上传失败')
      await episodeAPI.uploadOpeningAudio(epId.value, path, openingSubtitleText.value.trim())
      await refresh()
      toast.success('开幕配音已上传，可点击生成开幕视频')
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationAudioUploading.value = false
    openingAudioUploading.value = false
  }
}

function triggerAllCharImageUpload() {
  const ids = sortCharactersForPortraitGeneration(visualChars.value).map(c => c.id)
  if (!ids.length) {
    toast.warning('暂无角色')
    return
  }
  imageUploadTarget.value = { kind: 'character-batch', ids }
  imageUploadInputRef.value?.click()
}

function triggerAllShotImageUpload() {
  const list = narrationShotsNeedingImage(sbs.value)
  const ids = list.map(sb => sb.id)
  if (!ids.length) {
    toast.warning('暂无需配图镜头')
    return
  }
  imageUploadTarget.value = { kind: 'shot-batch', ids }
  imageUploadInputRef.value?.click()
}

function triggerShotImageUpload(sbId) {
  imageUploadTarget.value = { kind: 'shot-batch', ids: [sbId] }
  imageUploadInputRef.value?.click()
}

async function uploadImageFile(file) {
  const uploaded = await uploadAPI.image(file)
  const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
  if (!path) throw new Error('上传失败')
  return path
}

async function applyCharacterUploadedImage(charId, path) {
  await characterAPI.update(charId, { image_url: path })
  const row = chars.value.find(ch => ch.id === charId)
  if (row) {
    row.image_url = path
    row.imageUrl = path
  }
}

async function applyShotUploadedImage(sbId, path) {
  const sb = sbs.value.find(item => item.id === sbId)
  const updates = { composed_image: path }
  if (sb) {
    const meta = parseNarrationImageMeta(sb)
    updates.reference_images = JSON.stringify({
      ...meta,
      narration_image_mode: 'new',
      narration_image_source: 'upload',
    })
  }
  await storyboardAPI.update(sbId, updates)
  const row = sbs.value.find(item => item.id === sbId)
  if (row) {
    row.composed_image = path
    row.composedImage = path
    if (updates.reference_images) row.reference_images = updates.reference_images
  }
}

function triggerNextShotImageUpload() {
  const next = nextPendingNarrationShot.value
  if (!next) {
    toast.warning('暂无待配图镜头')
    return
  }
  imageUploadTarget.value = { kind: 'shot-batch', ids: [next.id] }
  imageUploadInputRef.value?.click()
}

async function clearUploadedNarrationShotImages() {
  const targets = narrationShotsWithUploadedImage(sbs.value)
  if (!targets.length) {
    toast.info('暂无已上传配图')
    return
  }
  for (const sb of targets) {
    const meta = parseNarrationImageMeta(sb)
    const { narration_image_source: _source, ...rest } = meta
    await storyboardAPI.update(sb.id, {
      composed_image: null,
      reference_images: JSON.stringify({ ...rest, narration_image_mode: 'new' }),
    })
  }
  toast.success(`已清除 ${targets.length} 张上传配图`)
  await refresh()
}

async function cropNarrationImageWatermarks() {
  const count = narrationCropImageCount.value
  if (!count) {
    toast.warning('暂无配图文件')
    return
  }
  if (!confirm(`将处理 ${count} 张配图右下角水印区（宽 1/8 × 高 1/18，用相邻画面覆盖）；已合成的镜头视频会失效，需重新「镜头合成」。是否继续？`)) return
  narrationCropWatermarkProcessing.value = true
  try {
    const res = await episodeAPI.cropNarrationImages(epId.value)
    const cropped = res?.cropped ?? 0
    const skipped = res?.skipped ?? 0
    const failed = res?.failed ?? 0
    if (failed) {
      toast.warning(`新裁剪 ${cropped} 张，跳过 ${skipped} 张，失败 ${failed} 张`)
    } else if (skipped && !cropped) {
      toast.info(`配图已裁剪过（${skipped} 张），无需重复操作`)
    } else {
      toast.success(`已处理 ${cropped} 张右下角水印${skipped ? `，${skipped} 张此前已处理` : ''}`)
    }
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message || '裁剪失败')
  } finally {
    narrationCropWatermarkProcessing.value = false
  }
}

async function restoreNarrationImageWatermarks() {
  const count = narrationWmCroppedImageCount.value
  if (!count) {
    toast.warning('没有可恢复的水印裁剪配图')
    return
  }
  if (!confirm(`将 ${count} 张配图恢复为去水印前的原图（同名原图或生成记录）；已合成镜头需重新「镜头合成」。是否继续？`)) return
  narrationRestoreWatermarkProcessing.value = true
  try {
    const res = await episodeAPI.restoreNarrationImages(epId.value)
    const restored = res?.restored ?? 0
    const failed = res?.failed ?? 0
    const fromGen = res?.from_generation ?? 0
    if (failed) {
      toast.warning(`已恢复 ${restored} 张${fromGen ? `（${fromGen} 张来自生成记录）` : ''}，${failed} 张失败`)
    } else {
      toast.success(`已恢复 ${restored} 张原图${fromGen ? `（${fromGen} 张来自生成记录）` : ''}`)
    }
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message || '恢复失败')
  } finally {
    narrationRestoreWatermarkProcessing.value = false
  }
}

function triggerShotFolderUpload() {
  const list = narrationShotsNeedingImage(sbs.value)
  const ids = list.map(sb => sb.id)
  if (!ids.length) {
    toast.warning('暂无需配图镜头')
    return
  }
  imageUploadTarget.value = { kind: 'shot-batch', ids, matchByFilename: true }
  shotFolderUploadInputRef.value?.click()
}

function resolveImageUploadPairs(files, target) {
  const ids = target.ids || []
  const parsed = files.map(file => ({
    file,
    storyboardId: parseShotImageFilename(file.name)?.storyboardId ?? null,
  }))
  const allShotIds = parsed.length > 0 && parsed.every(item => item.storyboardId != null)
  const useShotId = allShotIds && (
    target.matchByFilename
    || target.kind === 'shot-batch'
  )

  if (useShotId) {
    const validSet = new Set(ids)
    const pairs = []
    const unmatched = []
    for (const item of parsed) {
      if (item.storyboardId && validSet.has(item.storyboardId)) {
        pairs.push({ file: item.file, id: item.storyboardId })
      } else {
        unmatched.push(item.file.name)
      }
    }
    if (!pairs.length) {
      throw new Error('没有可匹配的图片（文件名需为 #序号#镜头ID，如 #1#127.png）')
    }
    return { pairs, unmatched, matchMode: 'storyboard-id' }
  }

  if (target.matchByFilename) {
    const { slots, error } = buildFolderUploadSlots(files, ids.length)
    if (error) throw new Error(error)
    return {
      pairs: slots.map(({ file, slotIndex }) => ({ file, id: ids[slotIndex] })),
      unmatched: [],
      matchMode: 'order',
    }
  }

  if (files.length !== ids.length) {
    throw new Error(`请一次选择 ${ids.length} 张图片（当前选了 ${files.length} 张），按列表顺序对应`)
  }
  return {
    pairs: files.map((file, i) => ({ file, id: ids[i] })),
    unmatched: [],
    matchMode: 'picker-order',
  }
}

async function processImageUploadPairs(pairs, target) {
  let ok = 0
  const failed = []
  for (const { file, id } of pairs) {
    try {
      const path = await uploadImageFile(file)
      if (target.kind === 'character-batch') {
        await applyCharacterUploadedImage(id, path)
      } else {
        await applyShotUploadedImage(id, path)
      }
      ok++
    } catch (err) {
      console.error(err)
      const sb = sbs.value.find(item => item.id === id)
      failed.push({
        id,
        label: sb ? `#${getNarrationShotDisplayNo(sb)}` : `#${id}`,
        fileName: file.name,
        error: err?.message || String(err),
      })
    }
  }
  await refresh()
  return { ok, failed }
}

function formatUploadFailures(failed, limit = 5) {
  if (!failed.length) return ''
  const head = failed.slice(0, limit).map(f => `${f.label}（${f.fileName}）`).join('、')
  const tail = failed.length > limit ? ` 等 ${failed.length} 镜` : ''
  return `${head}${tail}`
}

async function onShotFolderUploadSelected(event) {
  const files = Array.from(event.target.files || []).filter(isImageUploadFile)
  event.target.value = ''
  const target = imageUploadTarget.value
  imageUploadTarget.value = null
  if (!files.length || !target) return

  try {
    const { pairs, unmatched, matchMode } = resolveImageUploadPairs(files, target)
    const { ok, failed } = await processImageUploadPairs(pairs, target)
    if (unmatched.length) {
      toast.warning(`已上传 ${ok} 张，${unmatched.length} 个文件无法匹配（需 #序号#镜头ID）`)
      return
    }
    if (failed.length) {
      toast.warning(`上传完成 ${ok}/${pairs.length}，失败：${formatUploadFailures(failed)}`)
      return
    }
    if (ok === pairs.length) {
      const firstSb = sbs.value.find(item => item.id === pairs[0]?.id)
      const lastSb = sbs.value.find(item => item.id === pairs[pairs.length - 1]?.id)
      const firstNo = firstSb ? getNarrationShotDisplayNo(firstSb) : '?'
      const lastNo = lastSb ? getNarrationShotDisplayNo(lastSb) : '?'
      toast.success(matchMode === 'order'
        ? `已上传 ${ok} 张：无后缀→#${firstNo}，(${pairs.length - 1})→#${lastNo}`
        : `已按文件名匹配上传 ${ok} 张配图`)
    } else {
      toast.warning(`上传完成 ${ok}/${pairs.length}，部分失败请重试`)
    }
  } catch (e) {
    toast.error(e.message)
  }
}

async function onImageUploadSelected(event) {
  const files = Array.from(event.target.files || []).filter(isImageUploadFile)
  event.target.value = ''
  const target = imageUploadTarget.value
  imageUploadTarget.value = null
  if (!files.length || !target) return

  const ids = target.ids || []
  if (!ids.length) return

  try {
    const { pairs, unmatched, matchMode } = resolveImageUploadPairs(files, target)
    const { ok, failed } = await processImageUploadPairs(pairs, target)
    if (unmatched.length) {
      toast.warning(`已上传 ${ok} 张，${unmatched.length} 个文件无法匹配`)
      return
    }
    if (failed.length) {
      toast.warning(`上传完成 ${ok}/${pairs.length}，失败：${formatUploadFailures(failed)}`)
      return
    }
    if (ok === pairs.length) {
      const shotMsg = target.kind === 'shot-batch' && pairs.length === 1
        ? `镜头 #${getNarrationShotDisplayNo(sbs.value.find(item => item.id === pairs[0].id) || { storyboard_number: pairs[0].id })}`
        : ''
      toast.success(target.kind === 'character-batch'
        ? `已全部上传 ${ok} 张定妆图`
        : matchMode === 'order'
          ? `已按文件名序号上传 ${ok} 张配图`
          : target.matchByFilename || pairs.some(p => parseShotImageFilename(p.file.name))
            ? `已按文件名匹配上传 ${ok} 张配图`
            : shotMsg
              ? `已上传配图到 ${shotMsg}（同段镜头自动沿用至下一需配图位置）`
              : `已全部上传 ${ok} 张配图`)
    } else {
      toast.warning(`上传完成 ${ok}/${pairs.length}，部分失败请重试`)
    }
  } catch (e) {
    toast.error(e.message)
  }
}

async function copyAllCharPortraitPrompts() {
  const list = sortCharactersForPortraitGeneration(visualChars.value)
  if (!list.length) {
    toast.warning('暂无角色')
    return
  }
  const blocks = []
  for (const charRow of list) {
    try {
      const useReference = isCharPortraitUseReference(charRow.id)
      const res = await characterAPI.getPortraitPrompt(charRow.id, epId.value, { useReference })
      if (res?.prompt) blocks.push(`【${formatCharacterDisplayName(charRow)}】\n${res.prompt}`)
    } catch {
      const fallback = String(charRow?.appearance || charRow?.description || '').trim()
      if (fallback) blocks.push(`【${formatCharacterDisplayName(charRow)}】\n${fallback}`)
    }
  }
  if (!blocks.length) {
    toast.warning('暂无描述词')
    return
  }
  const copied = await copyTextToClipboard(blocks.join('\n\n'))
  if (copied) toast.success(`已复制全部 ${blocks.length} 条定妆描述词`)
}

async function copyNarrationShotPromptsBatch() {
  const list = narrationShotsNeedingImage(sbs.value)
  if (!list.length) {
    toast.warning('暂无需配图镜头')
    return
  }
  const batchIdx = Math.max(1, Number(narrationCopyBatchIndex.value) || 1)
  const start = (batchIdx - 1) * NARRATION_PROMPT_COPY_BATCH_SIZE
  const batch = list.slice(start, start + NARRATION_PROMPT_COPY_BATCH_SIZE)
  if (!batch.length) {
    toast.warning('当前批次无镜头')
    return
  }
  const firstNo = getNarrationShotDisplayNo(batch[0])
  const lastNo = getNarrationShotDisplayNo(batch[batch.length - 1])
  const blocks = batch.map((sb) => {
    const prompt = getNarrationImagePromptForCopy(sb)
    const label = `#${getNarrationShotDisplayNo(sb)} ${extractNarrationSentence(sb) || '镜头'}`
    return prompt ? `【${label}】\n${prompt}` : ''
  }).filter(Boolean)
  if (!blocks.length) {
    toast.warning(`镜头 #${firstNo}-#${lastNo} 暂无描述词`)
    return
  }
  const copied = await copyTextToClipboard(blocks.join('\n\n'))
  if (!copied) return
  if (blocks.length < batch.length) {
    toast.success(`已复制 ${blocks.length}/${batch.length} 条（镜头 #${firstNo}-#${lastNo}，${batch.length - blocks.length} 条暂无文案）`)
    return
  }
  toast.success(`已复制 ${blocks.length} 条描述词（镜头 #${firstNo}-#${lastNo}）`)
}

async function copyNarrationShotPrompt(sb) {
  const prompt = getNarrationImagePromptForCopy(sb)
  if (!prompt) {
    toast.warning('暂无配图文案')
    return
  }
  const label = `#${getNarrationShotDisplayNo(sb)}`
  const copied = await copyTextToClipboard(prompt)
  if (copied) toast.success(`已复制镜头 ${label} 配图文案`)
}

async function genCharImg(id) {
  const useReference = isCharPortraitUseReference(id)
  const beforeChar = chars.value.find(c => c.id === id)
  const baseline = {
    startUrl: beforeChar?.image_url || beforeChar?.imageUrl || '',
    startUpdatedAt: beforeChar?.updated_at || beforeChar?.updatedAt || '',
  }
  try {
    if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
    const result = await characterAPI.generateImage(id, epId.value, { useReference })
    if (result?.appearance_auto_enriched && result?.appearance) {
      const c = chars.value.find(ch => ch.id === id)
      if (c) c.appearance = result.appearance
      toast.info('已自动补全 English tags 外貌描述')
    }
    const refHint = !useReference
      ? '（纯文生图）'
      : result?.used_portrait_reference
      ? `（参考：${result?.reference_character_variant || '同角色定妆'}）`
      : result?.used_style_anchor
      ? '（画风锚定：项目已有定妆）'
      : '（无可用参考，纯文生图）'
    toast.success(`定妆生成中 · ${result?.model || episodeImageModel.value}${refHint}`)
    await refresh()
    const genId = result?.image_generation_id
    const done = await watchCharImageResult(id, genId, 36, 2500, baseline)
    if (done) toast.success('定妆图已更新')
    else if (genId) {
      try {
        const gen = await imageAPI.get(genId)
        const err = gen?.error_msg || gen?.errorMsg
        if (err) toast.error(err)
      } catch {}
    }
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}

async function recognizeCharPortrait(id) {
  try {
    if (!isPendingCharRecognize(id)) pendingCharRecognizeIds.value.push(id)
    const result = await characterAPI.recognizePortrait(id, epId.value)
    toast.success('外貌描述已更新')
    if (result?.character) {
      const idx = chars.value.findIndex(c => c.id === id)
      if (idx >= 0) chars.value[idx] = result.character
    }
    await refresh()
  } catch (e) {
    toast.error(e.message)
  } finally {
    pendingCharRecognizeIds.value = pendingCharRecognizeIds.value.filter(item => item !== id)
  }
}

async function generateCharAppearance(id) {
  try {
    if (!isPendingCharAppearance(id)) pendingCharAppearanceIds.value.push(id)
    const script = localRaw.value || rawContent.value || scriptContent.value || ''
    const result = await characterAPI.generateAppearance(id, {
      episode_id: epId.value,
      script,
      text_model: episodeTextModel.value,
      text_thinking: episodeTextThinking.value,
    })
    const appearance = result?.appearance || ''
    if (appearance) {
      const c = chars.value.find(ch => ch.id === id)
      if (c) c.appearance = appearance
      if (result?.character) {
        const idx = chars.value.findIndex(ch => ch.id === id)
        if (idx >= 0) chars.value[idx] = result.character
      }
    }
    toast.success('AI 外貌描述已生成（含 English tags）')
  } catch (e) {
    toast.error(e.message)
  } finally {
    pendingCharAppearanceIds.value = pendingCharAppearanceIds.value.filter(item => item !== id)
  }
}

async function batchCharImages() {
  const pending = sortCharactersForPortraitGeneration(
    visualChars.value.filter(c => !(c.image_url || c.imageUrl)),
  )
  const ids = pending.map(c => c.id)
  if (!ids.length) {
    toast.info('所有角色图片已生成')
    return
  }
  if (!tryBeginBatch('charImages', '角色图片批量生成中…')) return
  pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
  try {
    for (const char of pending) {
      const useReference = isCharPortraitUseReference(char.id)
      if (useReference) {
        const ref = findPortraitReferenceCharacter(chars.value, char)
        if (ref && pending.some(c => c.id === ref.id && !(c.image_url || c.imageUrl))) {
          await watchAsyncResult(() => {
            const row = chars.value.find(c => c.id === ref.id)
            return !!(row?.image_url || row?.imageUrl)
          }, 36)
          await refresh()
        } else if (!ref) {
          const anchor = findDramaStyleAnchorCharacter(chars.value, char)
          if (anchor && pending.some(c => c.id === anchor.id && !(c.image_url || c.imageUrl))) {
            await watchAsyncResult(() => {
              const row = chars.value.find(c => c.id === anchor.id)
              return !!(row?.image_url || row?.imageUrl)
            }, 36)
            await refresh()
          }
        }
      }
      await characterAPI.generateImage(char.id, epId.value, { useReference })
    }
    await refresh()
    await watchAsyncResult(() => ids.every(id => {
      const char = chars.value.find(c => c.id === id)
      const done = !!(char?.image_url || char?.imageUrl)
      if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
      return done
    }), 36)
    toast.success('角色图片批量生成完成')
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item))
    toast.error(e.message)
  } finally {
    endBatch('charImages')
  }
}
async function genSceneImg(id) {
  try {
    if (!isPendingSceneImage(id)) pendingSceneImageIds.value.push(id)
    await sceneAPI.generateImage(id, epId.value)
    toast.success('场景图片生成中')
    await refresh()
    watchAsyncResult(() => {
      const scene = scenes.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      return done
    })
  } catch (e) {
    pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}
async function batchSceneImages() {
  const ids = scenes.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
  if (!ids.length) {
    toast.info('所有场景图片已生成')
    return
  }
  if (!tryBeginBatch('sceneImages', '场景图片批量生成中…')) return
  pendingSceneImageIds.value = [...new Set([...pendingSceneImageIds.value, ...ids])]
  try {
    const results = await Promise.allSettled(ids.map(id => sceneAPI.generateImage(id, epId.value)))
    const failCount = results.filter(r => r.status === 'rejected').length
    if (failCount) toast.error(`${failCount} 个场景图片提交失败`)
    await refresh()
    await watchAsyncResult(() => ids.every(id => {
      const scene = scenes.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      return done
    }), 36)
    if (!failCount) toast.success('场景图片批量生成完成')
  } catch (e) {
    pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => !ids.includes(item))
    toast.error(e.message)
  } finally {
    endBatch('sceneImages')
  }
}

const IGNORE_TTS_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const IGNORE_TTS_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

function getDialogueSpeakerRaw(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  const match = dialogue.match(/^(.+?)[:：]/)
  return match ? match[1].replace(/[（(].+?[)）]/g, '').trim() : ''
}

function getDialogueText(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  return dialogue ? dialogue.replace(/^.+?[:：]\s*/, '').trim() : ''
}

function isTTSIgnorable(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  const text = getDialogueText(sb)
  if (!sb?.dialogue?.trim()) return true
  if (speaker && IGNORE_TTS_SPEAKERS.test(speaker)) return true
  if (!text) return true
  if (IGNORE_TTS_TEXT.test(text)) return true
  return false
}

function hasDialogue(sb) { return !isTTSIgnorable(sb) }
function hasTTS(sb) { return !!(sb?.tts_audio_url || sb?.ttsAudioUrl) }
function hasComposeTts(sb) {
  if (isNarrationMode.value) return hasEffectiveNarrationTts(sbs.value, sb)
  return hasTTS(sb)
}
function getTTSUrl(sb) { return sb?.tts_audio_url || sb?.ttsAudioUrl || '' }
function applyTtsResultToStoryboard(storyboardId, result) {
  const path = result?.tts_audio_url || result?.ttsAudioUrl
  if (!path) return
  const sb = sbs.value.find(item => item.id === storyboardId)
  if (!sb) return
  sb.tts_audio_url = path
  sb.ttsAudioUrl = path
}
function hasNarrationShotOwnTts(sb) { return !!getNarrationShotOwnTts(sb) }
function hasEffectiveTTS(sb) {
  if (!isNarrationMode.value) return hasTTS(sb)
  return !!resolveNarrationEffectiveTts(sbs.value, sb).path
}
function getEffectiveTTSUrl(sb) {
  if (!isNarrationMode.value) return getTTSUrl(sb)
  return resolveNarrationEffectiveTts(sbs.value, sb).path || ''
}
function narrationTtsStatusLabel(sb) {
  if (!isNarrationMode.value) return hasTTS(sb) ? '已生成' : '待生成'
  const resolved = resolveNarrationEffectiveTts(sbs.value, sb)
  if (resolved.path && resolved.inherited) return '沿用前镜'
  return resolved.path ? '已生成' : '待生成'
}
function getDialogueSpeaker(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  if (!speaker) return '旁白'
  return speaker
}
async function genShotTTS(sb, force = false) {
  try {
    const res = await storyboardAPI.generateTTS(sb.id, ttsGenerateOptions(force))
    applyTtsResultToStoryboard(sb.id, res)
    const provider = res?.provider || (localTtsEnabled.value ? localTtsEngine.value : 'api')
    const mode = provider === 'edge' ? '（本地 Edge）' : provider === 'voicebox' ? '（Voicebox）' : '（付费 API）'
    toast.success(`镜头 #${sb.storyboard_number || sb.storyboardNumber || sb.id} 配音已生成${mode}`)
    await refreshStoryboardsOnly()
  } catch (e) { toast.error(e.message) }
}
async function batchShotTTS() {
  const pending = (isNarrationMode.value
    ? sbs.value.filter(sb => hasDialogue(sb) && !hasNarrationShotOwnTts(sb))
    : sbs.value.filter(sb => hasDialogue(sb) && !hasTTS(sb)))
    .sort((a, b) => (a.storyboard_number || a.storyboardNumber || 0) - (b.storyboard_number || b.storyboardNumber || 0))
  if (!pending.length) {
    toast.info(ttsEligibleCount.value ? '所有镜头配音已就绪' : '当前没有可生成的对白或旁白')
    return
  }
  await runBatchShotTTS(pending, `配音生成中（剩余 ${pending.length} 条${localTtsEnabled.value ? ' · 并发' : ''}）…`, false)
}

async function batchShotTTSAll() {
  const targets = sbs.value
    .filter(sb => hasDialogue(sb))
    .sort((a, b) => (a.storyboard_number || a.storyboardNumber || 0) - (b.storyboard_number || b.storyboardNumber || 0))
  if (!targets.length) {
    toast.info('当前没有可生成的对白或旁白')
    return
  }
  await runBatchShotTTS(
    targets,
    `正在重新生成全部 ${targets.length} 条配音${localTtsEnabled.value ? ' · 并发' : ''}…`,
    true,
  )
}

async function runBatchShotTTS(targets, batchMessage, force) {
  if (!tryBeginBatch('tts', batchMessage)) return
  try {
    const concurrency = resolveTtsBatchConcurrency()
    const results = await mapWithConcurrency(
      targets,
      concurrency,
      sb => storyboardAPI.generateTTS(sb.id, ttsGenerateOptions(force)),
    )
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        applyTtsResultToStoryboard(targets[index].id, result.value)
      }
    })
    const apiCount = results.filter(r => r.status === 'fulfilled').length
    const failCount = results.length - apiCount
    if (apiCount) {
      const label = force ? '已重新生成' : '已生成'
      const engineLabel = localTtsEngine.value === 'voicebox' ? 'Voicebox' : 'Edge'
      toast.success(`${label} ${apiCount} 条配音${localTtsEnabled.value ? `（本地 ${engineLabel} · ${concurrency} 并发）` : ''}`)
    }
    if (failCount) toast.error(`${failCount} 条镜头配音生成失败`)
    await refreshStoryboardsOnly()
  } finally {
    endBatch('tts')
  }
}

function getFirstFrame(s) { return s?.first_frame_image || s?.firstFrameImage || null }
function getLastFrame(s) { return s?.last_frame_image || s?.lastFrameImage || null }
function getNarrationShotImage(s) { return getNarrationShotOwnImage(s) }
function hasNarrationShotImage(s) { return !!getNarrationShotImage(s) }
function getNarrationDisplayImage(s) { return resolveNarrationEffectiveImage(sbs.value, s).path }
function narrationShotImageSrc(sb) {
  const path = getNarrationDisplayImage(sb)
  if (!path) return ''
  const v = sb?.updated_at || sb?.updatedAt || episode.value?.updated_at || episode.value?.updatedAt || ''
  const q = v ? `?v=${encodeURIComponent(String(v))}` : ''
  return `/${path.replace(/^\//, '')}${q}`
}
function narrationShotInherited(s) {
  return hasNarrationShotImage(s) && parseNarrationImageMeta(s).narration_image_mode === 'copy'
    || (!hasNarrationShotImage(s) && !!resolveNarrationEffectiveImage(sbs.value, s).inherited)
}
function narrationShotImageLabel(s) {
  const meta = parseNarrationImageMeta(s)
  if (meta.narration_shot_type === 'title') {
    const segment = extractNarrationSentence(s)
    if (meta.narration_image_mode === 'new') {
      return hasNarrationShotImage(s)
        ? `片头 · 已生成背景图（剧中红字：${segment}）`
        : `片头 · 待生成背景图（剧中红字：${segment}）`
    }
    const inherited = resolveNarrationEffectiveImage(sbs.value, s)
    return inherited.path
      ? `片头 · 沿用背景图（剧中红字：${segment}）`
      : '片头 · 待首镜生成背景图'
  }
  if (meta.narration_image_mode === 'new') {
    const paraHint = meta.paragraph_index != null ? `段 ${meta.paragraph_index + 1}` : '段落'
    const layoutHint = meta.paragraph_layout === 'diptych' ? ' · 两宫格' : ''
    const sceneHint = meta.scene_content ? ` · ${meta.scene_content.slice(0, 20)}${meta.scene_content.length > 20 ? '…' : ''}` : ''
    return hasNarrationShotImage(s)
      ? `${paraHint}${layoutHint} · 已生成配图${sceneHint}`
      : `${paraHint}${layoutHint} · 待生成配图${sceneHint}`
  }
  if (hasNarrationShotImage(s) && meta.narration_image_mode === 'copy') return '已复用上一镜配图'
  if (!narrationShotNeedsOwnImage(s)) return '沿用上一张'
  if (resolveNarrationEffectiveImage(sbs.value, s).inherited) return '同段 · 合成沿用前图'
  return '同段 · 沿用上一张'
}
function findPrevNarrationShotWithImage(sb) {
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  if (idx <= 0) return null
  for (let i = idx - 1; i >= 0; i--) {
    if (hasNarrationShotImage(sbs.value[i])) return sbs.value[i]
  }
  return null
}
function narrationImageMetaJson(mode) {
  return JSON.stringify({ narration_image_mode: mode })
}
async function reuseNarrationShotImage(sb) {
  const prev = findPrevNarrationShotWithImage(sb)
  if (!prev) {
    toast.warning('前面没有可复用的配图')
    return
  }
  await storyboardAPI.update(sb.id, {
    composed_image: getNarrationShotImage(prev),
    reference_images: narrationImageMetaJson('copy'),
  })
  toast.success('已复用上一镜配图')
  await refresh()
}
async function clearNarrationShotImage(sb) {
  await storyboardAPI.update(sb.id, {
    composed_image: null,
    reference_images: narrationImageMetaJson('inherit'),
  })
  toast.success('已取消复用，合成时将自动沿用前图')
  await refresh()
}
async function markNarrationShotNeedImage(sb) {
  const sceneContent = resolveSceneContentForShot(sbs.value, sb)
  const style = drama.value?.style || 'comic'
  const meta = {
    narration_image_mode: 'new',
    scene_content: sceneContent,
    paragraph_layout: 'single',
  }
  const draft = {
    ...sb,
    reference_images: JSON.stringify(meta),
    image_prompt: null,
    imagePrompt: null,
  }
  await storyboardAPI.update(sb.id, {
    reference_images: JSON.stringify(meta),
    image_prompt: buildNarrationImagePrompt(draft, style, sbs.value),
  })
  toast.success('已标记为需配图')
  await refresh()
}

async function setNarrationShotLayout(sb, layout) {
  if (resolveNarrationParagraphLayout(sb) === layout) return
  const meta = parseNarrationImageMeta(sb)
  let parsed = {}
  const raw = sb?.reference_images || sb?.referenceImages
  if (raw) {
    try {
      parsed = typeof raw === 'object' ? { ...raw } : JSON.parse(raw)
    } catch {
      parsed = {}
    }
  }
  parsed.narration_image_mode = meta.narration_image_mode || 'new'
  parsed.paragraph_layout = layout
  if (meta.scene_content) parsed.scene_content = meta.scene_content
  if (meta.paragraph_index != null) parsed.paragraph_index = meta.paragraph_index
  if (meta.narration_shot_type) parsed.narration_shot_type = meta.narration_shot_type
  if (meta.narration_tts_mode) parsed.narration_tts_mode = meta.narration_tts_mode

  const style = drama.value?.style || 'comic'
  const existingPrompt = String(sb?.image_prompt || sb?.imagePrompt || '').trim()
  const draft = {
    ...sb,
    reference_images: JSON.stringify(parsed),
    image_prompt: existingPrompt ? existingPrompt : null,
    imagePrompt: existingPrompt ? existingPrompt : null,
  }
  const newPrompt = existingPrompt || buildNarrationImagePrompt(draft, style, sbs.value)
  await storyboardAPI.update(sb.id, {
    reference_images: JSON.stringify(parsed),
    image_prompt: newPrompt || null,
  })
  sb.reference_images = JSON.stringify(parsed)
  sb.image_prompt = newPrompt
  sb.imagePrompt = newPrompt
  toast.success(
    existingPrompt
      ? (layout === 'diptych' ? '已切换为两宫格，AI 配图文案已保留' : '已切换为完整单图，AI 配图文案已保留')
      : (layout === 'diptych' ? '已切换为两宫格' : '已切换为完整单图'),
  )
}
function isPendingNarrationShot(id) { return pendingNarrationShotIds.value.includes(id) }

async function genNarrationShotImage(sb) {
  const style = drama.value?.style || 'comic'
  const basePrompt = getNarrationImagePromptText(sb, style)
  if (!basePrompt) {
    toast.warning('该镜头没有旁白文案，无法生成配图')
    return
  }
  const otherPending = narrationShotsPendingImage(sbs.value).filter(item => item.id !== sb.id)
  if (otherPending.length) {
    toast.info(`另有未生成：${formatNarrationShotDisplayList(otherPending)}`)
  } else if (narrationShotNeedsOwnImage(sb) && !hasNarrationShotImage(sb)) {
    toast.info(`正在生成最后一镜 #${getNarrationShotDisplayNo(sb)}`)
  }
  if (!String(sb?.image_prompt || sb?.imagePrompt || '').trim()) {
    updateField(sb, 'image_prompt', basePrompt)
  }
  try {
    if (!isPendingNarrationShot(sb.id)) pendingNarrationShotIds.value.push(sb.id)
    const characterIds = await resolveShotCharacterIds(sb)
    const payload = buildNarrationImageGeneratePayload(sb, visualChars.value, style, {
      storyboard_id: sb.id,
      drama_id: dramaId,
      frame_type: 'illustration',
    }, episodeImageModel.value, characterIds, sbs.value)
    await imageAPI.generate(buildImagePayload(payload))
    toast.success('配图生成中')
    await refresh()
    await watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === sb.id)
      const done = hasNarrationShotImage(target)
      if (done) pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(item => item !== sb.id)
      return done
    })
  } catch (e) {
    pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(item => item !== sb.id)
    toast.error(e.message)
  }
}

async function batchNarrationShotImages() {
  const pending = narrationShotsPendingImage(sbs.value)
  if (!pending.length) {
    toast.info('所有需配图镜头已生成')
    return
  }
  const pendingLabel = formatNarrationShotDisplayList(pending)
  const pendingHint = formatNarrationPendingImageHint(sbs.value)
  if (!tryBeginBatch('narrationImages', `配图生成中：${pendingHint}…`)) return
  try {
    const style = drama.value?.style || 'comic'
    pendingNarrationShotIds.value = [...new Set([...pendingNarrationShotIds.value, ...pending.map(sb => sb.id)])]
    const results = await Promise.allSettled(pending.map(async sb => {
      const characterIds = await resolveShotCharacterIds(sb)
      const payload = buildNarrationImageGeneratePayload(sb, visualChars.value, style, {
        storyboard_id: sb.id,
        drama_id: dramaId,
        frame_type: 'illustration',
      }, episodeImageModel.value, characterIds, sbs.value)
      return imageAPI.generate(buildImagePayload(payload))
    }))
    const failCount = results.filter(r => r.status === 'rejected').length
    if (failCount) toast.error(`${failCount} 个镜头配图提交失败（${pendingLabel}）`)
    else toast.success(`已提交配图生成：${pendingHint}`)
    await refresh()
    await watchAsyncResult(() => pending.every(sb => {
      const target = sbs.value.find(s => s.id === sb.id)
      const done = hasNarrationShotImage(target)
      if (done) pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(item => item !== sb.id)
      return done
    }), 60, 4000)
  } finally {
    endBatch('narrationImages')
  }
}

function getStoryboardCover(s) {
  if (isNarrationMode.value) return getNarrationDisplayImage(s) || getNarrationShotImage(s)
  return s?.composed_image || s?.composedImage || getFirstFrame(s) || getLastFrame(s) || null
}
function getVideoUrl(s) { return s?.video_url || s?.videoUrl || null }
function getComposedVideoUrl(s) { return s?.composed_video_url || s?.composedVideoUrl || null }
function hasImg(s) { return !!getStoryboardCover(s) }
function hasVid(s) { return !!getVideoUrl(s) }
function hasDialogueForCompose(s) { return hasDialogue(s) }
function canCompose(s) {
  if (hasVid(s)) return true
  if (isNarrationMode.value) return hasDialogueForCompose(s)
  return hasImg(s)
}
function hasComposed(s) { return !!getComposedVideoUrl(s) }

function getShotReferenceImages(sb) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= 6) return
    refs.push(value)
  }
  const sceneId = sb?.scene_id || sb?.sceneId
  const scene = scenes.value.find(item => item.id === sceneId)
  pushRef(scene?.image_url || scene?.imageUrl)
  for (const charId of getStoryboardCharacterIds(sb)) {
    const char = chars.value.find(item => item.id === charId)
    pushRef(char?.image_url || char?.imageUrl)
  }
  for (const ref of getRefs(sb)) {
    pushRef(ref)
  }
  const first = getFirstFrame(sb)
  const last = getLastFrame(sb)
  pushRef(first)
  pushRef(last)
  return refs.filter(Boolean).slice(0, 6)
}

function buildShotImagePrompt(sb, frameType) {
  const title = sb.title || ''
  const description = sb.image_prompt || sb.imagePrompt || sb.description || ''
  const shotType = sb.shot_type || sb.shotType || ''
  const angle = sb.angle || ''
  const movement = sb.movement || ''
  const location = sb.location || getSceneName(sb)
  const time = sb.time || ''
  const charactersText = getStoryboardCharacterNames(sb).join('、')
  const action = sb.action || ''
  const atmosphere = sb.atmosphere || ''
  const frameHint = frameType === 'first_frame'
    ? '生成这个镜头的起始关键帧，突出建立关系和动作开始瞬间'
    : '生成这个镜头的结束关键帧，突出动作结束、情绪落点或结果状态'

  return [
    title ? `镜头标题：${title}` : '',
    description ? `画面描述：${description}` : '',
    shotType ? `景别：${shotType}` : '',
    angle ? `机位：${angle}` : '',
    movement ? `运镜：${movement}` : '',
    charactersText ? `角色：${charactersText}` : '',
    location ? `地点：${location}` : '',
    time ? `时间：${time}` : '',
    action ? `动作：${action}` : '',
    atmosphere ? `氛围：${atmosphere}` : '',
    frameHint,
  ].filter(Boolean).join('；')
}

async function genShotFrame(sb, frameType) {
  const prompt = buildShotImagePrompt(sb, frameType)
  const referenceImages = getShotReferenceImages(sb)
  const key = framePendingKey(sb.id, frameType)
  try {
    if (!pendingShotFrameKeys.value.includes(key)) pendingShotFrameKeys.value.push(key)
    const body = buildImagePayload({
      storyboard_id: sb.id,
      drama_id: dramaId,
      prompt,
      frame_type: frameType,
      reference_images: referenceImages.length ? referenceImages : undefined,
    })
    await imageAPI.generate(body)
    toast.success(frameType === 'first_frame' ? '首帧生成中' : '尾帧生成中')
    await refresh()
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === sb.id)
      const done = frameType === 'first_frame' ? !!getFirstFrame(target) : !!getLastFrame(target)
      if (done) pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
      return done
    })
  } catch (e) {
    pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
    toast.error(e.message)
  }
}

async function genVid(sb) {
  const params = {
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt: sb.video_prompt || sb.videoPrompt || '',
    duration: Number(sb.duration || 5),
  }
  const first = getFirstFrame(sb)
  const last = getLastFrame(sb)
  const refs = getRefs(sb)
  if (first && last) { Object.assign(params, { reference_mode: 'first_last', first_frame_url: first, last_frame_url: last }) }
  else if (refs.length) { Object.assign(params, { reference_mode: 'multiple', reference_image_urls: [first, ...refs].filter(Boolean) }) }
  else if (first) { Object.assign(params, { reference_mode: 'single', image_url: first }) }
  try {
    delete failedVideoMessages.value[sb.id]
    if (!isPendingVideo(sb.id)) pendingVideoIds.value.push(sb.id)
    const generation = await videoAPI.generate(params)
    toast.success('视频生成中')
    await refresh()
    pollVideoGeneration(generation?.id, sb.id)
  } catch (e) {
    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
    toast.error(e.message)
  }
}
async function pollVideoGeneration(generationId, storyboardId) {
  if (!generationId) {
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === storyboardId)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
      return done
    }, 60, 4000)
    return
  }
  for (let i = 0; i < 120; i++) {
    await sleep(4000)
    try {
      const res = await videoAPI.get(generationId)
      await refresh()
      if (res?.status === 'completed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        delete failedVideoMessages.value[storyboardId]
        toast.success('视频生成完成')
        return
      }
      if (res?.status === 'failed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        failedVideoMessages.value = {
          ...failedVideoMessages.value,
          [storyboardId]: res?.error_msg || res?.errorMsg || '视频生成失败',
        }
        toast.error(failedVideoMessages.value[storyboardId])
        return
      }
    } catch {}
  }
  pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
  failedVideoMessages.value = {
    ...failedVideoMessages.value,
    [storyboardId]: '视频生成超时',
  }
  toast.error('视频生成超时')
}
async function doCompose(sb) {
  try {
    delete failedComposeMessages.value[sb.id]
    if (!isPendingCompose(sb.id)) pendingComposeIds.value.push(sb.id)
    await composeAPI.shot(sb.id)
    toast.success('合成完成')
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    refresh()
  } catch (e) {
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    failedComposeMessages.value = {
      ...failedComposeMessages.value,
      [sb.id]: e.message,
    }
    toast.error(e.message)
  }
}
async function batchVideos() {
  const pendingIds = sbs.value.filter(s => !hasVid(s)).map(s => s.id)
  if (!pendingIds.length) return
  if (!tryBeginBatch('videos', '批量视频生成中…')) return
  try {
    pendingIds.forEach(id => {
      const sb = sbs.value.find(item => item.id === id)
      if (sb) genVid(sb)
    })
    pendingVideoIds.value = [...new Set([...pendingVideoIds.value, ...pendingIds])]
    await watchAsyncResult(() => pendingIds.every(id => {
      const target = sbs.value.find(s => s.id === id)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== id)
      return done
    }), 80, 4000)
  } finally {
    endBatch('videos')
  }
}
async function batchCompose() {
  const pending = sbs.value.filter(sb => canCompose(sb) && !hasComposed(sb))
  if (!pending.length) {
    toast.info('所有可合成镜头已完成')
    return
  }
  if (!tryBeginBatch('compose', `镜头合成中（剩余 ${pending.length} 个 · 并发）…`)) return
  try {
    const res = await composeAPI.all(epId.value, { only_remaining: true })
    const concurrency = res?.concurrency || 3
    pendingComposeIds.value = [...new Set([...pendingComposeIds.value, ...pending.map(sb => sb.id)])]
    toast.info(`已开始合成剩余 ${pending.length} 个镜头（${concurrency} 路并发）`)
    await pollComposeStatus()
  } catch (e) {
    toast.error(e.message)
  } finally {
    endBatch('compose')
  }
}

async function regenerateAllComposeAndMerge() {
  const targets = sbs.value.filter(sb => canCompose(sb))
  if (!targets.length) {
    toast.info('没有可合成的镜头')
    return
  }
  if (!tryBeginBatch('compose', `正在重新合成全部 ${targets.length} 个镜头…`)) return
  try {
    const res = await composeAPI.all(epId.value, { only_remaining: false })
    const concurrency = res?.concurrency || 3
    pendingComposeIds.value = [...new Set([...pendingComposeIds.value, ...targets.map(sb => sb.id)])]
    toast.info(`已开始重新合成全部 ${targets.length} 个镜头（${concurrency} 路并发）`)
    const ok = await pollComposeStatus({
      successMessage: '全部镜头合成完成，正在拼接导出…',
      maxAttempts: Math.max(600, targets.length * 4),
      expectTotal: targets.length,
    })
    await refresh()
    if (!ok) return
    panel.value = 'export'
    exportTab.value = 'merge'
    await doMerge({ wait: true })
  } catch (e) {
    toast.error(e.message)
  } finally {
    endBatch('compose')
  }
}
function stopMergePoll() {
  if (mergePollTimer) {
    clearInterval(mergePollTimer)
    mergePollTimer = null
  }
}

function startMergePoll(onDone) {
  stopMergePoll()
  mergePollTimer = setInterval(async () => {
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    const mainStatus = mergeData.value?.status
    const testStatus = mergeData.value?.test?.status
    const mainActive = ['processing', 'pending'].includes(mainStatus)
    const testActive = ['processing', 'pending'].includes(testStatus)
    if (mainActive || testActive) return

    stopMergePoll()
    if (pendingMergeKind.value === 'test') {
      if (testStatus === 'completed') {
        toast.success(`测试导出完成（前 ${testMergeClipCount.value} 镜）`)
        await refresh()
      } else if (testStatus === 'failed') {
        toast.error(testMergeFailedMessage.value)
      }
      pendingMergeKind.value = null
      return
    }

    if (mainStatus === 'completed') {
      toast.success('视频生成完成')
      await refresh()
      onDone?.(true)
    } else if (mainStatus === 'failed') {
      toast.error(mergeFailedMessage.value)
      onDone?.(false)
    } else {
      onDone?.(false)
    }
    pendingMergeKind.value = null
  }, 1500)
}

function waitForMergeComplete() {
  return new Promise((resolve) => {
    startMergePoll(resolve)
  })
}

async function cancelMerge() {
  try {
    await mergeAPI.cancel(epId.value)
    stopMergePoll()
    pendingMergeKind.value = null
    mergeData.value = {
      ...(mergeData.value || {}),
      status: mergeData.value?.status === 'processing' || mergeData.value?.status === 'pending' ? 'cancelled' : mergeData.value?.status,
      test: mergeData.value?.test && ['processing', 'pending'].includes(mergeData.value.test.status)
        ? { ...mergeData.value.test, status: 'cancelled' }
        : mergeData.value?.test,
    }
    toast.info('已取消生成')
  } catch (e) {
    toast.error(e.message)
  }
}

function stopOpeningPoll() {
  if (openingPollTimer) {
    clearInterval(openingPollTimer)
    openingPollTimer = null
  }
}

function startOpeningPoll() {
  stopOpeningPoll()
  openingPollTimer = setInterval(async () => {
    try {
      const status = await episodeAPI.openingVideoStatus(epId.value)
      if (status?.status === 'processing') return
      stopOpeningPoll()
      openingVideoProcessing.value = false
      await refresh()
      if (status?.status === 'completed') toast.success('开幕视频已生成')
      else if (status?.status === 'failed') toast.error(status?.opening_video_error || '开幕视频生成失败')
    } catch {
      stopOpeningPoll()
      openingVideoProcessing.value = false
    }
  }, 2500)
}

async function generateOpeningVideo() {
  if (!illustrationImageCount.value) {
    toast.warning('暂无可用配图，请先生成或上传镜头配图')
    return
  }
  try {
    openingVideoProcessing.value = true
    await episodeAPI.generateOpeningVideo(epId.value)
    toast.success('开幕视频生成中…')
    startOpeningPoll()
  } catch (e) {
    openingVideoProcessing.value = false
    toast.error(e.message)
  }
}

let titlePollTimer = null

function stopTitlePoll() {
  if (titlePollTimer) {
    clearInterval(titlePollTimer)
    titlePollTimer = null
  }
}

function startTitlePoll() {
  stopTitlePoll()
  titlePollTimer = setInterval(async () => {
    try {
      const status = await episodeAPI.titleVideoStatus(epId.value)
      if (status?.status === 'processing') return
      stopTitlePoll()
      titleVideoProcessing.value = false
      await refresh()
      if (status?.status === 'completed') toast.success('片头视频已生成')
      else if (status?.status === 'failed') toast.error(status?.title_video_error || '片头视频生成失败')
    } catch {
      stopTitlePoll()
      titleVideoProcessing.value = false
    }
  }, 2500)
}

async function generateTitleVideo() {
  if (!titleShots.value.length) {
    toast.warning('本集没有片头镜')
    return
  }
  if (!titleShotsReady.value) {
    toast.warning('请为全部片头镜完成配图与配音')
    return
  }
  try {
    titleVideoProcessing.value = true
    await episodeAPI.generateTitleVideo(epId.value)
    toast.success('片头视频生成中…')
    startTitlePoll()
  } catch (e) {
    titleVideoProcessing.value = false
    toast.error(e.message)
  }
}

async function mergeOpeningIntoMain() {
  if (!mergeUrl.value) {
    toast.error('请先完成全集拼接')
    return
  }
  if (!openingVideoUrl.value) {
    toast.error('请先生成开幕视频')
    return
  }
  if (mergeHasOpening.value) {
    toast.info('当前成片已包含开幕视频')
    return
  }
  try {
    await mergeAPI.mergeOpening(epId.value)
    mergeData.value = {
      status: 'processing',
      merged_url: null,
      mergedUrl: null,
      progress_percent: 0,
      progress_message: '正在合并开幕视频…',
    }
    toast.success('正在合并开幕视频…')
    startMergePoll()
  } catch (e) {
    toast.error(e.message)
  }
}

async function regenerateMerge() {
  stopMergePoll()
  await doMerge()
}

async function doTestMerge() {
  const limit = normalizedMergeTestClipLimit()
  mergeTestClipLimit.value = limit
  const targets = getTestMergeTargets(limit)
  if (!targets.length) {
    toast.error('暂无分镜')
    return false
  }
  const notReady = targets.filter(sb => !canCompose(sb))
  if (notReady.length) {
    toast.error(`前 ${limit} 镜中有 ${notReady.length} 镜尚未就绪（需配图+配音）`)
    return false
  }
  if (!tryBeginBatch('compose', `测试导出：重新合成前 ${targets.length} 镜…`)) return false

  pendingMergeKind.value = 'test'
  panel.value = 'export'
  exportTab.value = 'merge'

  try {
    await composeAPI.all(epId.value, {
      only_remaining: false,
      storyboard_ids: targets.map(sb => sb.id),
    })
    pendingComposeIds.value = [...new Set([...pendingComposeIds.value, ...targets.map(sb => sb.id)])]
    toast.info(`正在重新合成前 ${targets.length} 镜…`)

    const ok = await pollComposeStatus({
      expectStoryboardIds: targets.map(sb => sb.id),
      successMessage: `前 ${targets.length} 镜合成完成，正在测试拼接…`,
      maxAttempts: Math.max(120, targets.length * 4),
    })
    await refresh()
    if (!ok) {
      pendingMergeKind.value = null
      return false
    }

    await mergeAPI.merge(epId.value, { ...buildMergePayload(), clip_limit: limit })
    mergeData.value = {
      ...(mergeData.value || {}),
      test: {
        status: 'processing',
        merged_url: null,
        mergedUrl: null,
        progress_percent: 0,
        progress_message: `正在拼接前 ${targets.length} 镜…`,
      },
    }
    startMergePoll()
  } catch (e) {
    pendingMergeKind.value = null
    toast.error(e.message)
    return false
  } finally {
    endBatch('compose')
  }
}

async function doMerge(options = {}) {
  if (composedCount.value < sbs.value.length) {
    toast.error(`尚有 ${sbs.value.length - composedCount.value} 个镜头未合成（${composedCount.value}/${sbs.value.length}），请先在「镜头合成」完成后再导出`)
    return false
  }
  if (exportMixBgm.value && !exportBgmMusicId.value && exportBgmOptions.value.length) {
    exportBgmMusicId.value = exportBgmOptions.value[0].value
  }
  if (exportMixBgm.value && !exportBgmMusicId.value) {
    toast.warning('未选择 BGM，将仅拼接旁白；可在右侧选择曲目或前往「BGM 配乐」生成')
  }
  try {
    pendingMergeKind.value = 'full'
    await mergeAPI.merge(epId.value, buildMergePayload())
    mergeData.value = {
      status: 'processing',
      merged_url: null,
      mergedUrl: null,
      progress_percent: 0,
      progress_message: '正在启动拼接…',
    }
    toast.success('生成中…')
    if (options.wait) return waitForMergeComplete()
    startMergePoll()
  } catch (e) {
    pendingMergeKind.value = null
    toast.error(e.message)
    return false
  }
}

async function pollComposeStatus(options = {}) {
  const maxAttempts = options.maxAttempts ?? 120
  const expectTotal = options.expectTotal ?? 0
  const expectStoryboardIds = options.expectStoryboardIds ?? null
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000)
    try {
      const res = await composeAPI.status(epId.value)
      await refresh()
      const items = Array.isArray(res?.items) ? res.items : []
      const scopedItems = expectStoryboardIds?.length
        ? items.filter(item => expectStoryboardIds.includes(item.id))
        : items
      const processingCount = expectStoryboardIds?.length
        ? scopedItems.filter(item => item.status === 'compose_processing').length
        : (res?.processing ?? items.filter(item => item.status === 'compose_processing').length)
      const completedCount = expectStoryboardIds?.length
        ? scopedItems.filter(item => item.status === 'compose_completed' && (item.composed_video_url || item.composedVideoUrl)).length
        : (res?.completed ?? items.filter(item => item.status === 'compose_completed').length)
      const totalCount = expectStoryboardIds?.length || res?.total || items.length
      const processingIds = scopedItems.filter(item => item.status === 'compose_processing').map(item => item.id)
      pendingComposeIds.value = processingIds

      const failedItems = scopedItems.filter(item => item.status === 'compose_failed')
      if (failedItems.length) {
        const next = { ...failedComposeMessages.value }
        failedItems.forEach((item) => {
          next[item.id] = item.error_msg || item.errorMsg || '视频合成失败'
        })
        failedComposeMessages.value = next
      }

      if (processingCount > 0) continue

      const doneTotal = expectStoryboardIds?.length || (expectTotal > 0 ? expectTotal : totalCount)
      if (completedCount < doneTotal) continue

      if (failedItems.length) toast.error(`有 ${failedItems.length} 个镜头合成失败`)
      else toast.success(options.successMessage || '剩余镜头合成完成')
      return failedItems.length === 0
    } catch {}
  }
  toast.error('合成等待超时，请稍后在导出页手动拼接')
  return false
}
function getRefs(sb) {
  const raw = sb.reference_images || sb.referenceImages
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function loadConfigs() {
  try {
    const [imgCfgs, vidCfgs, audCfgs, musCfgs] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('audio'),
      aiConfigAPI.list('music'),
    ])
    imageConfigs.value = imgCfgs || []
    videoConfigs.value = vidCfgs || []
    audioConfigs.value = audCfgs || []
    musicConfigs.value = musCfgs || []
    const activeMusic = (musCfgs || []).find(c => c.is_active)
    if (activeMusic?.model) {
      bgmModel.value = Array.isArray(activeMusic.model) ? activeMusic.model[0] : activeMusic.model
    } else {
      bgmModel.value = DEFAULT_BGM_MODEL
    }
  } catch (e) { console.error('Failed to load AI configs', e) }
}

function inferVoiceGender(name, desc = []) {
  const text = `${name} ${Array.isArray(desc) ? desc.join(' ') : ''}`
  if (/[男|青年|大爷|学长|boy|man|male]/i.test(text)) return '男声'
  if (/[女|少女|御姐|奶奶|girl|woman|female]/i.test(text)) return '女声'
  return '中性'
}

function mapVoiceProfile(v) {
  const desc = Array.isArray(v.description) ? v.description : []
  return {
    id: v.voice_id,
    label: v.voice_name || v.voice_id,
    gender: inferVoiceGender(v.voice_name || v.voice_id, desc),
    traits: desc.length ? desc.slice(0, 2).join('、') : `${v.language || '多语言'}音色`,
    suitable: desc.length > 2 ? desc.slice(2).join('、') : `${v.language || '通用'}角色`,
  }
}

async function loadEdgeVoices() {
  try {
    const rows = await voicesAPI.list('edge')
    return rows?.length
      ? rows.map(mapVoiceProfile)
      : [{ id: DEFAULT_LOCAL_EDGE_VOICE, label: '云希（男·解说）', gender: '男声', traits: '本地 Edge', suitable: '解说旁白' }]
  } catch (e) {
    console.error('Failed to load edge voices', e)
    return [{ id: DEFAULT_LOCAL_EDGE_VOICE, label: '云希（男·解说）', gender: '男声', traits: '本地 Edge', suitable: '解说旁白' }]
  }
}

async function loadVoiceboxVoices() {
  try {
    const health = await voicesAPI.voiceboxHealth()
    voiceboxAvailable.value = !!health?.ok
    if (!health?.ok) return []
    const rows = await voicesAPI.list('voicebox', { model_size: localVoiceboxModelSize.value })
    if (!rows?.length) return []
    const presetEngineLabel = (engine) => {
      if (engine === 'qwen_custom_voice') return 'CustomVoice'
      if (engine === 'kokoro') return 'Kokoro'
      return engine || '预设'
    }
    return rows.map(v => {
      const isCloned = v.voice_type === 'cloned'
      const isPreset = v.voice_type === 'preset'
      const engineLabel = presetEngineLabel(v.preset_engine)
      const desc = Array.isArray(v.description) ? v.description[0] : ''
      const notReady = v.model_ready === false
      return {
        id: v.voice_id,
        label: isCloned
          ? `${v.voice_name}（克隆）`
          : isPreset
            ? `${v.voice_name}（预设·${engineLabel}${notReady ? '·模型未就绪' : ''}）`
            : v.voice_name,
        gender: '本地',
        traits: v.supports_instruct
          ? '支持感情 instruct'
          : isCloned
            ? 'Voicebox 克隆'
            : 'Voicebox 预设',
        suitable: notReady
          ? (v.model_hint || '模型未下载')
          : (desc || `${v.language || '中文'}${isCloned ? ` · 样本 ${v.sample_count ?? 0}` : ''}`),
        modelReady: v.model_ready !== false,
        modelHint: v.model_hint || '',
      }
    })
  } catch (e) {
    console.error('Failed to load voicebox voices', e)
    voiceboxAvailable.value = false
    return []
  }
}

async function refreshLocalVoices() {
  if (localTtsEngine.value === 'voicebox') {
    const profiles = await loadVoiceboxVoices()
    edgeVoiceProfiles.value = profiles
    if (profiles.length && !profiles.some(p => p.id === localEdgeVoiceId.value)) {
      localEdgeVoiceId.value = profiles[0].id
    }
    return
  }
  edgeVoiceProfiles.value = await loadEdgeVoices()
  if (!edgeVoiceProfiles.value.some(p => p.id === localEdgeVoiceId.value)) {
    localEdgeVoiceId.value = edgeVoiceProfiles.value[0]?.id || DEFAULT_LOCAL_EDGE_VOICE
  }
}

async function loadVoices() {
  try {
    const provider = lockedAudioProvider.value || 'minimax'
    const rows = await voicesAPI.list(provider)
    voiceProfiles.value = rows?.length ? rows.map(mapVoiceProfile) : fallbackVoiceProfiles
  } catch (e) {
    console.error('Failed to load voices', e)
    voiceProfiles.value = fallbackVoiceProfiles
  }
}

watch([lockedAudioConfigId, audioConfigs], () => { loadVoices() }, { deep: true })
watch([localTtsEnabled, localTtsEngine, localEdgeVoiceId, localTtsSpeed, localVoiceboxInstructPreset, localVoiceboxInstructCustom, localVoiceboxModelSize], persistLocalTtsPrefs)
watch(localVoiceboxModelSize, () => {
  if (localTtsEngine.value === 'voicebox') refreshLocalVoices()
})
watch(localTtsEngine, () => { refreshLocalVoices() })
watch([exportMixBgm, exportBgmMusicId, exportBgmVolume], persistExportBgmPrefs)
watch(exportWatermarkText, () => {
  persistExportBgmPrefs()
  scheduleWatermarkSave()
})
watch(exportWatermarkAnimated, () => {
  persistExportBgmPrefs()
  scheduleWatermarkSave()
})
watch(exportBgmOptions, (opts) => {
  if (!exportBgmMusicId.value && opts.length) exportBgmMusicId.value = opts[0].value
})
watch(epId, () => { restoreLocalTtsPrefs(); restoreExportBgmPrefs(); restoreNarrationBreakdownSummary(); restoreImageDetectModePrefs() }, { immediate: true })
watch([prodTab, epId], ([tab, id]) => {
  if (tab === 'bgm' && id) loadBgmLibrary()
})
watch([panel, epId], ([p, id]) => {
  if (p === 'export' && id) loadBgmLibrary({ resumePoll: false })
})
onMounted(async () => {
  await refreshLocalVoices()
  if (!voiceboxAvailable.value && localTtsEngine.value === 'voicebox' && !edgeVoiceProfiles.value.length) {
    localTtsEngine.value = 'edge'
    await refreshLocalVoices()
  }
  refresh()
  loadConfigs()
  loadVoices()
})
</script>

<style scoped>
/* ===== Studio Layout ===== */
.studio {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 14px;
  gap: 12px;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,0.7), transparent 28%),
    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0)),
    var(--bg-base);
}

.studio-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 18px;
  background: rgba(252, 253, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 14px 36px rgba(20, 32, 54, 0.07), 0 3px 10px rgba(20, 32, 54, 0.04);
  backdrop-filter: blur(16px);
}

.studio-topbar-main,
.sidebar,
.main {
  background: rgba(252, 253, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 18px 48px rgba(20, 32, 54, 0.08), 0 4px 14px rgba(20, 32, 54, 0.05);
  backdrop-filter: blur(16px);
}

.studio-topbar-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
  background: transparent;
  min-width: 0;
}

.topbar-back {
  width: auto;
  min-width: 76px;
  padding: 0 8px;
  height: 28px;
  border-radius: 999px;
  white-space: nowrap;
  font-size: 11px;
}

.studio-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.studio-overline {
  display: none;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.studio-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.studio-title {
  font-size: 14px;
  line-height: 1;
  letter-spacing: -0.04em;
  white-space: nowrap;
}

.studio-episode-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  color: var(--accent-text);
  font-size: 9px;
  font-weight: 700;
}
.studio-episode-chip.is-mode {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.studio-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  min-width: 0;
}

.studio-meta-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(18, 25, 42, 0.05);
  color: var(--text-2);
  font-size: 8px;
  font-weight: 600;
  white-space: nowrap;
}

.studio-meta-pill.is-stage {
  background: rgba(19, 51, 121, 0.08);
  color: var(--accent-text);
}
.studio-meta-pill.is-progress {
  background: rgba(45, 122, 69, 0.08);
  color: var(--success);
}
.studio-meta-inline {
  font-size: 9px;
  color: var(--text-3);
  font-weight: 600;
  white-space: nowrap;
}

.studio-topbar-side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.studio-actions {
  display: flex;
  gap: 6px;
}
.studio-topbar .btn {
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
  white-space: nowrap;
}

.studio-body {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
  flex: 1;
}

/* ===== Sidebar ===== */
.sidebar {
  width: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  border-radius: 28px;
}
.back-btn {
  width: 40px; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(27, 41, 64, 0.1); border-radius: 14px;
  background: rgba(255,255,255,0.8); color: var(--text-2);
  cursor: pointer; transition: all 0.15s;
  box-shadow: var(--shadow-xs);
}
.back-btn:hover { background: #fff; color: var(--text-0); }

/* Pipeline Nav */
.pipeline { flex: 1; overflow-y: auto; padding: 16px 14px 12px; display: flex; flex-direction: column; gap: 12px; }
.pipe-section { display: flex; flex-direction: column; gap: 4px; }
.pipe-section-label {
  font-size: 10px; font-weight: 700; color: #95a1b6;
  text-transform: uppercase; letter-spacing: 0.1em;
  padding: 2px 8px 3px;
}
.pipe-item {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 7px 10px;
  border-radius: 17px;
  font-size: 12px; font-weight: 600;
  background: none; border: 1px solid transparent; color: var(--text-2); cursor: pointer;
  transition: all 0.14s; width: 100%; text-align: left;
}
.pipe-item:hover { background: rgba(255,255,255,0.3); color: var(--text-0); }
.pipe-item.active {
  background: rgba(255,255,255,0.94);
  color: var(--text-0);
  border-color: rgba(27, 41, 64, 0.05);
  box-shadow: 0 8px 18px rgba(19, 33, 56, 0.045);
}
.pipe-item.done { color: var(--success); }
.pipe-item-sub {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  padding: 7px 10px;
  position: relative;
  min-height: 42px;
}

.pipe-item-sub:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 18px;
  top: 25px;
  bottom: -7px;
  width: 1px;
  background: rgba(27, 41, 64, 0.07);
}

.pipe-icon {
  width: 17px; height: 17px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(246,248,252,0.98); border: 1px solid rgba(18,25,42,0.08);
  color: #aab4c6; flex-shrink: 0; transition: all 0.15s;
  position: relative;
  z-index: 1;
}
.pipe-item.active .pipe-icon { background: rgba(19, 51, 121, 0.07); border-color: rgba(19, 51, 121, 0.1); color: var(--accent-text); }
.pipe-item.done .pipe-icon { background: rgba(45, 122, 69, 0.96); border-color: rgba(45,122,69,0.18); color: #fff; }
.icon-active { background: var(--accent-dark) !important; border-color: var(--accent-dark) !important; color: #fff !important; }
.icon-done { background: var(--success) !important; border-color: var(--success) !important; color: #fff !important; }

.pipe-label { flex: 1; font-size: 11.5px; }
.pipe-copy { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pipe-sub {
  font-size: 8.5px;
  line-height: 1.35;
  color: var(--text-3);
  font-weight: 500;
}
.pipe-badge {
  font-size: 9px; font-weight: 700; padding: 1px 5px;
  border-radius: 99px; background: var(--bg-3); color: var(--text-3);
  font-family: var(--font-mono);
}
.pipe-badge.badge-done { background: var(--success-bg); color: var(--success); }
.pipe-spinner { width: 10px; height: 10px; border: 1.5px solid var(--accent-bg); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }

/* Sidebar Bottom */
.sidebar-bottom {
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  display: flex; flex-direction: column; gap: 8px;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.72));
}
.sidebar-jumper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 3px 0 2px;
}
.sidebar-jump-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: none;
  background: rgba(45, 122, 69, 0.22);
  cursor: pointer;
  transition: transform 0.14s, background 0.14s, box-shadow 0.14s;
}
.sidebar-jump-dot:hover {
  transform: scale(1.08);
}
.sidebar-jump-dot.active {
  background: var(--accent-dark);
  box-shadow: 0 0 0 2px rgba(76, 125, 255, 0.14);
}
.sidebar-jump-dot.done {
  background: var(--success);
}
.sidebar-jump-dot.active.done {
  background: #1e3f8a;
}
.progress-wrap { display: flex; flex-direction: column; gap: 5px; }
.progress-head { display: flex; justify-content: space-between; }
.progress-label { font-size: 10.5px; color: var(--text-3); font-weight: 500; }
.progress-val { font-size: 10.5px; color: var(--text-2); font-family: var(--font-mono); font-weight: 600; }
.progress-track { height: 6px; background: rgba(194, 207, 227, 0.92); border-radius: 99px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent-gradient); border-radius: 99px; transition: width 0.5s var(--ease-out); }
.refresh-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px; font-size: 11.5px; color: var(--text-2);
  background: rgba(255,255,255,0.86); border: 1px solid rgba(27, 41, 64, 0.08); border-radius: 999px;
  cursor: pointer; transition: all 0.15s;
}
.refresh-btn:hover { background: #fff; color: var(--text-0); }

/* ===== Main Content ===== */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; border-radius: 30px; }
.content-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; min-height: 0; }
.stage-subnav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.52));
  overflow-x: auto;
  flex-shrink: 0;
}
.stage-subnav-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.7);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}
.stage-subnav-item:hover {
  background: #fff;
  color: var(--text-0);
}
.stage-subnav-item.active {
  background: rgba(19, 51, 121, 0.08);
  border-color: rgba(19, 51, 121, 0.12);
  color: #1e3f8a;
}
.stage-subnav-item.done {
  color: var(--text-1);
}
.stage-subnav-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--success);
  box-shadow: 0 0 0 4px rgba(45, 122, 69, 0.1);
}

/* Toolbar */
.step-toolbar {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); flex-shrink: 0;
}
.prod-toolbar { background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); }
.toolbar-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.step-indicator { display: flex; align-items: center; gap: 8px; }
.step-num {
  width: 26px; height: 26px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(19, 51, 121, 0.08);
  font-family: var(--font-mono); font-size: 10px; font-weight: 800; color: var(--accent-text); letter-spacing: 0.05em;
}
.step-name { font-size: 13px; font-weight: 700; color: var(--text-1); font-family: var(--font-display); }
.char-count { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }

/* Editor Area */
.step-editor { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.fill-textarea {
  flex: 1; border: none; border-radius: 0; padding: 26px 28px;
  font-size: 13.5px; line-height: 1.9; resize: none; outline: none;
  font-family: var(--font-body); background: linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12)); color: var(--text-0);
}
.fill-textarea:focus { box-shadow: none; }

/* Step Empty State */
.step-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; min-height: 300px; gap: 10px; padding: 46px;
  animation: fadeIn 0.3s var(--ease-out);
}
.empty-visual {
  width: 72px; height: 72px; border-radius: 22px;
  background: rgba(255,255,255,0.8); color: var(--accent);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: var(--shadow-sm);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.empty-title { font-size: 22px; font-weight: 700; font-family: var(--font-display); color: var(--text-0); }
.empty-desc { font-size: 13px; color: var(--text-2); max-width: 420px; text-align: center; line-height: 1.8; }
.step-empty-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* Step Loading */
.step-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; gap: 12px;
}
.loading-text { font-size: 13px; color: var(--text-2); }

/* Step Navigator Bubble */
.step-bubble {
  position: static;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.58));
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  margin-top: auto;
}
.bubble-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 500;
  border: 1px solid rgba(27, 41, 64, 0.08); background: rgba(255,255,255,0.84); color: var(--text-2); cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.bubble-btn:hover:not(:disabled) { background: #fff; color: var(--text-0); }
.bubble-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.bubble-btn.primary { margin-left: auto; background: linear-gradient(135deg, #557ff4, #345fcc); color: #fff; box-shadow: 0 6px 16px rgba(53, 95, 206, 0.2); border-color: transparent; }
.bubble-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
.bubble-btn.primary:disabled { filter: none; box-shadow: none; opacity: 0.5; }
.bubble-dots { display: flex; gap: 7px; padding: 0 4px; }
.bubble-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(143, 160, 184, 0.4); cursor: pointer; transition: all 0.15s;
  border: none;
}
.bubble-dot.done { background: var(--success); }
.bubble-dot.current { background: var(--accent-dark); transform: scale(1.2); box-shadow: 0 0 0 2px rgba(76, 125, 255, 0.14); }

/* Extract grid */
.extract-stage { flex: 1; min-height: 0; overflow: hidden; padding: 12px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
.extract-summary { padding: 16px; display: flex; flex-direction: column; gap: 14px; align-self: stretch; position: sticky; top: 0; max-height: 100%; }
.extract-summary-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.extract-summary-title { font-size: 20px; line-height: 1.05; font-family: var(--font-display); color: var(--text-0); }
.extract-summary-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.extract-summary-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.extract-summary-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); display: flex; flex-direction: column; gap: 4px; }
.extract-summary-stat span { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.extract-summary-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.extract-summary-note { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); font-size: 11px; line-height: 1.7; color: var(--text-2); }
.extract-card { overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
.extract-card-head {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 14px; font-size: 12px; font-weight: 600;
  border-bottom: 1px solid var(--border); background: var(--bg-1);
  color: var(--text-1);
}
.extract-list { padding: 8px 14px; flex: 1; min-height: 0; overflow-y: auto; }
.extract-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
.extract-row + .extract-row { border-top: 1px solid var(--border); }
.char-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.scene-icon {
  width: 30px; height: 30px; border-radius: 6px;
  background: var(--bg-2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3); flex-shrink: 0;
}
.extract-info { min-width: 0; }
.extract-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.extract-name { font-size: 13px; font-weight: 600; }
.extract-meta { font-size: 11px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.extract-meta.wrap { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* Voice grid */
.voice-stage { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; }
.voice-stage-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: start;
  position: sticky;
  top: 0;
  min-height: 0;
  max-height: calc(100vh - 210px);
  overflow: hidden;
}
.voice-stage-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.voice-stage-title { font-size: 20px; line-height: 1.05; font-family: var(--font-display); color: var(--text-0); }
.voice-stage-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.voice-stage-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.voice-stage-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); display: flex; flex-direction: column; gap: 3px; }
.voice-stage-stat-label { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.voice-stage-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.voice-library-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}
.voice-library {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.voice-library-item { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); display: flex; flex-direction: column; gap: 4px; }
.voice-library-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.voice-library-name { font-size: 13px; font-weight: 700; color: var(--text-0); }
.voice-library-traits { font-size: 11px; color: var(--text-1); }
.voice-library-fit { font-size: 10px; color: var(--text-3); line-height: 1.5; }

.voice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; align-content: start; }
.voice-card { padding: 16px; display: flex; flex-direction: column; gap: 12px; border-radius: 22px; min-height: 0; }
.voice-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.voice-char { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.voice-name { min-width: 0; flex: 1; }
.voice-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.voice-card-copy { min-height: 58px; }
.voice-card-text { font-size: 12px; line-height: 1.7; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.voice-select-block { display: flex; flex-direction: column; gap: 6px; }
.voice-block-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.voice-profile-card { padding: 12px; border-radius: 16px; background: linear-gradient(135deg, rgba(19, 51, 121, 0.08), rgba(255,255,255,0.78)); border: 1px solid rgba(19, 51, 121, 0.1); display: flex; flex-direction: column; gap: 4px; }
.voice-profile-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.voice-profile-name { font-size: 13px; font-weight: 700; color: var(--accent-text); }
.voice-profile-traits { font-size: 11px; color: var(--text-1); }
.voice-profile-fit { font-size: 10px; color: var(--text-2); line-height: 1.5; }
.voice-actions-row { display: flex; align-items: center; gap: 8px; }
.voice-player audio { width: 100%; height: 30px; border-radius: var(--radius); }
.char-avatar.lg { width: 38px; height: 38px; font-size: 16px; }

/* Split layout (storyboard) */
.split-layout { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.shot-list { width: 296px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border); background: var(--bg-0); }
.shot-list-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 12px 10px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.06);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(10px);
}
.shot-list-title { font-size: 13px; font-weight: 700; color: var(--text-0); }
.shot-list-sub { margin-top: 3px; font-size: 11px; color: var(--text-3); line-height: 1.45; }
.shot-list-body { padding: 6px; }
.shot-item {
  position: relative; padding: 10px 11px; cursor: pointer;
  border: 1px solid transparent; border-left: 3px solid transparent;
  transition: all 0.15s;
  display: flex; flex-direction: column; gap: 5px;
  border-radius: 14px;
}
.shot-item + .shot-item { margin-top: 6px; }
.shot-item:hover { background: var(--bg-hover); border-color: rgba(27, 41, 64, 0.06); }
.shot-item.active {
  background: var(--bg-0);
  border-left-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent-glow);
  z-index: 1;
}
.shot-item-header { display: flex; align-items: center; gap: 8px; }
.shot-num {
  font-size: 11px; font-family: var(--font-mono); font-weight: 700;
  color: var(--accent); background: var(--accent-bg);
  padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
  letter-spacing: 0.03em;
}
.shot-item.active .shot-num { background: var(--accent); color: #fff; }
.shot-status { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.shot-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.shot-dot.has-img { background: var(--success); }
.shot-dot.has-video { background: var(--info); }
.shot-dot.has-dialogue { background: var(--warning); }
.shot-body { }
.shot-desc { font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--text-1); }
.shot-item.active .shot-desc { color: var(--text-0); }
.shot-meta { display: flex; align-items: center; gap: 6px; }
.shot-location {
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.shot-dialogue {
  font-size: 10px; color: var(--text-3); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding-left: 2px; border-left: 2px solid var(--border);
  padding-left: 6px;
}

.detail-panel { flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-width: 0; }
.detail-head { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.detail-head-copy { display: flex; flex-direction: column; gap: 2px; }
.detail-head-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.detail-head-sub { font-size: 11px; color: var(--text-3); }
.detail-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.9fr);
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(20,39,82,0.08), rgba(255,255,255,0.68));
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-hero-copy { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.detail-hero-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--text-3);
}
.detail-hero-text { font-size: 13px; color: var(--text-1); line-height: 1.7; }
.detail-status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.detail-preview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.detail-preview-card { display: flex; flex-direction: column; gap: 6px; }
.detail-preview-title { font-size: 11px; font-weight: 700; color: var(--text-2); }
.detail-preview-media {
  position: relative; aspect-ratio: 16/9; overflow: hidden;
  border-radius: 14px; background: rgba(18,25,42,0.08);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-preview-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.detail-preview-empty {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: var(--text-3); font-size: 12px;
}
.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.detail-section-title { font-size: 12px; font-weight: 700; color: var(--text-0); }
.detail-section-copy { font-size: 11px; color: var(--text-3); }

/* Field */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.field-row { display: flex; gap: 12px; }
.field-grid { display: grid; gap: 12px; }
.field-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.locked-config {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  border: 1px solid rgba(19, 51, 121, 0.12);
  color: var(--text-1);
  font-size: 11px;
  font-weight: 600;
}
.locked-config-banner {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.role-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.role-pill {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(27, 41, 64, 0.12);
  background: rgba(255,255,255,0.86);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.role-pill:hover { border-color: var(--accent); color: var(--text-0); }
.role-pill.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  box-shadow: 0 8px 18px rgba(29, 77, 176, 0.18);
}

/* Production tabs */
.prod-tabs { display: flex; gap: 0; background: var(--bg-2); border-radius: var(--radius); padding: 2px; }
.prod-tab {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px; font-size: 12px;
  border: none; background: transparent; color: var(--text-2); cursor: pointer;
  border-radius: calc(var(--radius) - 2px); transition: all 0.15s; font-weight: 500;
}
.prod-tab:hover { color: var(--text-0); }
.prod-tab.active { background: var(--bg-0); color: var(--text-0); font-weight: 600; box-shadow: var(--shadow-xs); }
.prod-tab-badge { font-size: 10px; font-family: var(--font-mono); padding: 0 4px; background: var(--bg-3); border-radius: 99px; }
.prod-tab.active .prod-tab-badge { background: var(--accent-bg); color: var(--accent-text); }

/* Production content */
.prod-content { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.prod-section-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.prod-image-model-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.03);
}
.narration-breakdown-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}
.btn-retry-missing-prompts {
  background: linear-gradient(135deg, #2548a6 0%, #1e3a8a 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);
}
.btn-retry-missing-prompts:hover {
  background: linear-gradient(135deg, #2d56b8 0%, #2548a6 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 6px 18px rgba(30, 58, 138, 0.48);
  transform: translateY(-1px);
}
.btn-retry-missing-prompts:active {
  filter: brightness(0.96);
  transform: translateY(0);
}
.text-thinking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}
.text-thinking-tabs {
  padding: 2px;
  min-width: 72px;
}
.text-thinking-tabs .prod-tab {
  min-width: 32px;
  justify-content: center;
  padding: 4px 10px;
}
.narration-hint {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.18);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
}
.narration-hint strong { color: var(--accent); font-weight: 600; }

.local-tts-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(34, 197, 94, 0.06);
  border: 1px solid rgba(34, 197, 94, 0.16);
}
.local-tts-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-1);
  cursor: pointer;
  user-select: none;
}
.local-tts-toggle input { accent-color: var(--accent); }
.local-tts-preview-player {
  height: 32px;
  max-width: 280px;
  min-width: 180px;
}

.uploaded-audio-panel {
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px dashed rgba(27, 41, 64, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}
.uploaded-audio-panel.is-empty {
  border-style: dashed;
  opacity: 0.95;
}
.uploaded-audio-empty {
  font-size: 12px;
  line-height: 1.6;
  padding: 4px 2px 2px;
}
.uploaded-audio-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.uploaded-audio-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.uploaded-audio-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.uploaded-audio-idx {
  flex-shrink: 0;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-3);
  padding-top: 2px;
}
.uploaded-audio-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.uploaded-audio-name {
  font-size: 12px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.uploaded-audio-player {
  width: 100%;
  height: 32px;
}

.narration-srt-panel {
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.04);
}
.narration-srt-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.narration-srt-panel-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(27, 41, 64, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  flex-shrink: 0;
}
.narration-srt-panel-toggle:hover {
  border-color: rgba(59, 130, 246, 0.35);
  color: var(--text-primary, #1e293b);
}
.narration-srt-panel-toggle svg {
  transition: transform 0.15s ease;
}
.narration-srt-head:has(+ div) {
  margin-bottom: 10px;
}
.narration-srt-head:not(:has(+ div)) {
  margin-bottom: 0;
}
.narration-srt-empty {
  font-size: 12px;
  line-height: 1.6;
  padding: 2px;
}
.narration-srt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.narration-srt-file {
  border-radius: 10px;
  border: 1px solid rgba(27, 41, 64, 0.1);
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
}
.narration-srt-file.is-expanded {
  border-color: rgba(59, 130, 246, 0.28);
}
.narration-srt-file-head {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--text-1);
  text-align: left;
  cursor: pointer;
}
.narration-srt-file-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.narration-srt-body {
  padding: 0 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.narration-srt-view-tabs {
  display: flex;
  gap: 6px;
}
.narration-srt-spoken {
  font-size: 11px;
  line-height: 1.5;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}
.narration-srt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.narration-srt-table th,
.narration-srt-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  vertical-align: top;
  text-align: left;
}
.narration-srt-table th {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 500;
}
.narration-srt-table td.mono {
  color: var(--text-3);
  white-space: nowrap;
}
.narration-srt-time {
  font-size: 11px;
}
.narration-srt-whisper {
  color: var(--text-3);
}
.narration-srt-script {
  color: var(--text-1);
}
.narration-srt-raw {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
  font-family: var(--font-mono, monospace);
}

.tag.warn { color: #b45309; border-color: rgba(180, 83, 9, 0.25); background: rgba(251, 191, 36, 0.12); }
.tag.ok { color: #047857; border-color: rgba(4, 120, 87, 0.25); background: rgba(16, 185, 129, 0.12); }

.narration-breakdown-panel {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.16);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.narration-breakdown-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
}
.narration-breakdown-head strong { color: var(--accent); }
.narration-breakdown-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.narration-breakdown-steps {
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-2);
}
.narration-breakdown-steps strong { color: var(--text-1); font-weight: 600; }
.narration-shot-edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.shot-edit-btn {
  margin-left: auto;
  flex-shrink: 0;
}
.narration-breakdown-prompts {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-2);
}
.narration-breakdown-prompts-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.narration-breakdown-prompts-head strong {
  color: var(--text-1);
  font-weight: 600;
}
.narration-prompt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
}
.narration-prompt-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.narration-prompt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.narration-prompt-content {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-1);
  word-break: break-word;
}
.narration-prompt-content + .narration-prompt-content { margin-top: 4px; }
.narration-prompt-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.narration-prompt-textarea {
  font-size: 11px;
  line-height: 1.55;
  min-height: 72px;
  resize: vertical;
}
.narration-shot-prompt-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 10px;
}
.narration-shot-prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.narration-shot-prompt-copy {
  padding: 2px 8px;
  font-size: 10px;
  min-height: 0;
  flex-shrink: 0;
}
.narration-shot-layout-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 10px;
}
.narration-shot-layout-row .btn {
  flex: 1 1 72px;
  justify-content: center;
}
.narration-shot-prompt-textarea {
  font-size: 11px;
  line-height: 1.5;
  min-height: 60px;
  resize: vertical;
}
.prod-card .prod-info { align-items: stretch; }

.dub-grid { display: flex; flex-direction: column; gap: 10px; }
.dub-card { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; border-radius: 20px; background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58)); }
.dub-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.dub-copy { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.dub-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dub-desc { font-size: 13px; line-height: 1.6; color: var(--text-1); }
.dub-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 11px; }
.dub-foot { display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid rgba(27, 41, 64, 0.08); }
.dub-audio { flex: 1; min-width: 0; height: 30px; }

/* Asset grid */
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.asset-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
}
.asset-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(20, 32, 54, 0.08); }
.asset-cover { position: relative; aspect-ratio: 1; background: var(--bg-2); overflow: hidden; }
.asset-cover.wide { aspect-ratio: 16/9; }
.asset-cover img { width: 100%; height: 100%; object-fit: cover; }
.previewable-image { cursor: zoom-in; transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out); }
.previewable-image:hover { transform: scale(1.015); filter: saturate(1.04); }
.asset-cover-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(7,11,21,0.58);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.asset-cover-badge.is-ready {
  background: rgba(36, 125, 72, 0.92);
}
.asset-cover-badge.is-pending {
  background: rgba(19, 51, 121, 0.92);
}
.asset-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.asset-body { padding: 8px 10px; }
.asset-name { font-size: 13px; font-weight: 600; }
.asset-meta { font-size: 11px; }
.asset-foot { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-top: 1px solid var(--border); }
.sr-only-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Frame grid */
.frame-grid { display: flex; flex-direction: column; gap: 8px; }
.frame-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; cursor: pointer;
  border-radius: var(--radius-lg);
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.frame-row:hover { background: var(--bg-0); border-color: var(--border); }
.frame-row.active {
  background: var(--bg-0);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.frame-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.frame-top { display: flex; align-items: center; gap: 8px; }
.frame-num {
  font-size: 13px; font-family: var(--font-mono); font-weight: 800;
  color: var(--accent);
}
.frame-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px;
  background: var(--accent-bg); color: var(--accent);
  border: 1px solid var(--accent-glow);
  white-space: nowrap;
}
.frame-desc {
  font-size: 12px; line-height: 1.5; color: var(--text-1);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.frame-meta { display: flex; align-items: center; gap: 6px; }
.frame-thumbs { display: flex; gap: 8px; flex-shrink: 0; }
.frame-thumb-wrap { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.frame-thumb-label { font-size: 10px; font-weight: 600; color: var(--text-3); }
.frame-thumb {
  position: relative; width: 130px; aspect-ratio: 16/9;
  border-radius: 6px; overflow: hidden;
  background: var(--bg-2); cursor: pointer;
  transition: all 0.15s; border: 1.5px solid var(--border);
}
.frame-thumb:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.frame-thumb img { width: 100%; height: 100%; object-fit: cover; }
.frame-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.frame-re {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff;
  display: none; align-items: center; justify-content: center;
}
.frame-thumb:hover .frame-re { display: flex; }
.frame-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }
.dot.pending {
  background: var(--accent-dark);
  box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.14);
}

/* Prod grid */
.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.prod-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58));
}
.prod-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(20, 32, 54, 0.08); }
.prod-cover { position: relative; aspect-ratio: 16/9; background: var(--bg-2); overflow: hidden; }
.prod-cover img { width: 100%; height: 100%; object-fit: cover; }
.prod-video { width: 100%; height: 100%; object-fit: cover; background: #000; display: block; }
.prod-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.prod-idx {
  position: absolute; top: 5px; left: 5px; font-size: 10px; font-weight: 700;
  font-family: var(--font-mono); background: rgba(0,0,0,0.5); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.prod-overlay-badge {
  position: absolute; bottom: 5px; right: 5px; font-size: 10px; font-weight: 600;
  background: var(--success); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.prod-overlay-badge.is-title {
  background: #e53935;
  left: 5px;
  right: auto;
}
.prod-overlay-badge.is-pending {
  background: #f59e0b;
}
.tag-title {
  background: rgba(229, 57, 53, 0.15);
  color: #e53935;
  border: 1px solid rgba(229, 57, 53, 0.35);
}
.prod-info { padding: 10px 12px 8px; }
.prod-desc { font-size: 12px; line-height: 1.4; }
.prod-meta-line { margin-top: 5px; font-size: 10px; color: var(--text-3); }
.prod-dots { display: flex; align-items: center; gap: 4px; margin-top: 5px; color: var(--text-3); }
.prod-error {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.prod-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid rgba(27, 41, 64, 0.08); }
.prod-actions .btn { flex: 1 1 120px; justify-content: center; }

/* Image viewer */
.image-viewer-overlay {
  z-index: 120;
  padding: 28px;
  background: rgba(18, 24, 34, 0.68);
  backdrop-filter: blur(10px);
}
.image-viewer-dialog {
  width: min(1100px, calc(100vw - 56px));
  max-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,251,255,0.92));
}
.image-viewer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
}
.image-viewer-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--font-display);
}
.image-viewer-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: auto;
  min-height: 0;
}
.image-viewer-img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 140px);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(8, 14, 24, 0.22);
  background: rgba(255,255,255,0.9);
}

.shot-editor-overlay { z-index: 120; }
.shot-editor-dialog {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
}
.shot-editor-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
}
.shot-editor-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--font-display);
}
.shot-editor-sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.shot-editor-body {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.shot-editor-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
}

/* Grid tool dialog */
.grid-tool { width: min(1320px, calc(100vw - 40px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; animation: scaleIn 0.2s var(--ease-out); }
.grid-tool-head { display: flex; align-items: center; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.grid-tool-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.grid-tool-body-preview { overflow: hidden; min-height: 0; padding-bottom: 10px; }
.grid-tool-foot { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); margin-top: 4px; }
.grid-preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(340px, 400px);
  gap: 14px;
  min-height: 0;
  flex: 1;
  align-items: start;
}
.grid-preview-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grid-assignment-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 18px;
  background: rgba(255,255,255,0.66);
  overflow: hidden;
  max-height: min(70vh, 840px);
}
.grid-assign-head {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72));
}
.grid-assign-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.grid-assign-subtitle {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.grid-assign-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.86);
}
.grid-assign-columns {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(246, 248, 252, 0.92);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Prompt preview */
.grid-prompt-summary { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
.grid-prompt-label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; }
.grid-prompt-text { font-size: 12px; color: var(--text-1); line-height: 1.7; }

.grid-blank-preview {
  display: grid;
  gap: 4px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  padding: 8px;
  min-height: 200px;
}
.grid-blank-cell {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 70px;
}
.grid-blank-cell.empty { opacity: 0.4; }
.grid-blank-cell-index { font-size: 10px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); }
.grid-blank-cell-desc { font-size: 11px; color: var(--text-2); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.grid-mode-tabs { display: flex; gap: 6px; }
.grid-mode-tab { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--bg-0); cursor: pointer; transition: all 0.15s; text-align: left; }
.grid-mode-tab:hover { border-color: var(--border-strong); }
.grid-mode-tab.active { border-color: var(--accent); background: var(--accent-bg); }
.grid-config { display: flex; gap: 12px; align-items: flex-end; }
.grid-pick-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; }
.grid-pick-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; transition: background 0.1s; }
.grid-pick-item:hover { background: var(--bg-hover); }
.grid-pick-item.selected { background: var(--accent-bg); }
.grid-pick-item input { accent-color: var(--accent); }
.grid-preview-wrap {
  border-radius: var(--radius);
  overflow: auto;
  border: 1px solid var(--border);
  background: rgba(14, 19, 28, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  max-height: min(70vh, 860px);
  padding: 10px;
}
.grid-preview-stage {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: auto;
  line-height: 0;
}
.grid-preview-img {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: min(66vh, 820px);
  object-fit: contain;
}
.grid-overlay { position: absolute; inset: 0; display: grid; }
.grid-overlay-cell {
  border: 1px dashed rgba(255,255,255,0.42);
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 4px 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.grid-overlay-cell.active {
  background: rgba(255,255,255,0.08);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.28);
}
.grid-cell-label { font-size: 10px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.5); padding: 1px 5px; border-radius: 3px; }
.grid-adjust-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 0 2px; }
.grid-assign-info {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 4px 12px 10px;
}
.grid-assign-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 112px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(27, 41, 64, 0.08);
}
.grid-assign-row.active {
  background: rgba(32, 86, 190, 0.05);
  border-radius: 12px;
  padding-left: 6px;
  padding-right: 6px;
}
.grid-assign-row:last-child { border-bottom: 0; }
.grid-assign-index {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
  font-family: var(--font-mono);
}
.grid-assign-bind {
  font-size: 11px;
  color: var(--text-2);
  line-height: 1.45;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grid-history-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px 12px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.64));
}
.grid-history-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.grid-history-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.grid-history-subtitle {
  font-size: 11px;
  color: var(--text-3);
}
.grid-history-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(160px, 182px);
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.grid-history-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: rgba(255,255,255,0.78);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.grid-history-item:hover {
  border-color: rgba(33, 88, 255, 0.18);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.grid-history-item.active {
  border-color: rgba(33, 88, 255, 0.26);
  background: linear-gradient(180deg, rgba(244,248,255,0.96), rgba(255,255,255,0.86));
  box-shadow: 0 14px 28px rgba(33, 88, 255, 0.12);
}
.grid-history-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(14, 19, 28, 0.05);
}
.grid-history-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.grid-history-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grid-history-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.grid-history-meta {
  font-size: 10.5px;
  color: var(--text-3);
  line-height: 1.45;
  word-break: break-word;
}

.latest-grid-strip {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.62));
}
.latest-grid-strip-thumb {
  width: 72px;
  height: 48px;
  padding: 0;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(14, 19, 28, 0.06);
  cursor: zoom-in;
  box-shadow: none;
}
.latest-grid-strip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.latest-grid-strip-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.latest-grid-strip-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.latest-grid-strip-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.latest-grid-strip-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-3);
}
.latest-grid-strip-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Export */
.export-split { flex: 1; display: flex; min-height: 0; }
.export-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; }
.export-video { max-width: 720px; width: 100%; border-radius: var(--radius-lg); background: #000; }
.export-bar { display: flex; align-items: center; gap: 12px; margin-top: 16px; width: 100%; max-width: 720px; }
.export-list { width: 280px; flex-shrink: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.export-list-options { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.export-bgm-panel { padding: 10px 12px 12px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
.export-bgm-panel-primary { background: var(--bg-elevated, rgba(255,255,255,0.03)); }
.export-opening-page { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.export-opening-body { flex: 1; overflow: auto; padding: 16px 20px; max-width: 960px; }
.export-opening-panel { padding: 10px 12px 12px; border-bottom: 1px solid var(--border); }
.export-opening-video { width: 100%; border-radius: 8px; background: #000; margin-bottom: 8px; }
.export-opening-actions { display: flex; gap: 8px; }
.export-opening-status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-2); }
.export-bgm-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-2); cursor: pointer; }
.export-bgm-toggle input { accent-color: var(--accent); }
.export-bgm-fields { display: flex; flex-direction: column; gap: 8px; }
.export-bgm-volume { display: flex; flex-direction: column; gap: 4px; }
.export-bgm-slider { width: 100%; accent-color: var(--accent); }
.export-list-head { padding: 11px 14px; font-size: 11px; font-weight: 700; color: var(--text-3); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.06em; }
.export-list-body { flex: 1 1 auto; min-height: 100px; max-height: 38vh; overflow-y: auto; padding: 6px; }
.exp-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius); }
.exp-row:hover { background: var(--bg-hover); }

/* Shared */
.dim { color: var(--text-3); }

@media (max-width: 1240px) {
  .studio-body {
    grid-template-columns: 1fr;
  }

  .studio-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .studio-topbar-side {
    justify-content: space-between;
  }

  .split-layout,
  .export-split {
    flex-direction: column;
  }

  .sidebar {
    max-height: 340px;
  }

  .shot-list,
  .export-list {
    width: 100%;
  }

  .detail-panel {
    min-height: 420px;
  }

  .field-grid-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .image-viewer-overlay {
    padding: 16px;
  }

  .image-viewer-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .grid-tool {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .grid-preview-layout {
    grid-template-columns: 1fr;
  }

  .grid-preview-wrap,
  .grid-preview-img {
    max-height: 42vh;
  }

  .grid-assignment-pane {
    max-height: 42vh;
  }

  .grid-assign-columns {
    display: none;
  }

  .grid-assign-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}

@media (max-width: 860px) {
  .studio {
    padding: 12px;
    gap: 12px;
  }

  .studio-topbar-main {
    align-items: flex-start;
  }

  .studio-topbar-side,
  .studio-actions {
    flex-wrap: wrap;
  }

  .toolbar-right,
  .step-bubble,
  .export-bar {
    flex-wrap: wrap;
  }

  .extract-grid,
  .voice-grid,
  .asset-grid,
  .prod-grid {
    grid-template-columns: 1fr;
  }

  .voice-stage {
    grid-template-columns: 1fr;
  }

  .extract-stage {
    grid-template-columns: 1fr;
  }

  .extract-summary {
    position: static;
  }

  .voice-stage-panel {
    position: static;
    max-height: none;
    overflow: visible;
  }

  .frame-row {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-hero {
    grid-template-columns: 1fr;
  }

  .field-grid-2,
  .field-grid-4 {
    grid-template-columns: 1fr;
  }

  .frame-thumbs {
    width: 100%;
  }

  .frame-thumb {
    width: 100%;
  }

  .latest-grid-strip {
    grid-template-columns: 1fr;
  }

  .grid-history-list {
    grid-auto-columns: minmax(148px, 168px);
  }

  .latest-grid-strip-thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .latest-grid-strip-actions {
    justify-content: flex-start;
  }
}
</style>
