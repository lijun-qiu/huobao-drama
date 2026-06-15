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

        <!-- Narration Step 1: Character Reference -->
        <div v-else-if="isNarrationMode && scriptStep === 1" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">02</span>
                <span class="step-name">角色定妆</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="visualChars.length" class="char-count">{{ visualCharNameCount }} 人物 · {{ charImgCount }}/{{ visualChars.length }} 定妆</span>
              <button v-if="visualChars.length" class="btn btn-sm" :disabled="narrationExtracting" @click="doExtractNarrationCharacters">
                <Loader2 v-if="narrationExtracting" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                重新提取
              </button>
            </div>
          </div>

          <div class="narration-hint" style="margin-bottom:12px">
            <strong>角色定妆参考：</strong>从解说文案提取会在画面出现的角色；若文案含不同年龄/时期（回忆、多年后等），会<strong>自动拆成多条定妆</strong>（如 张三·青年、张三·老年）。<strong>中年/老年形态会以青年定妆图为参考</strong>生成，请先完成青年定妆；后续配图按镜头关联对应形态参考图。
          </div>

          <div class="prod-image-model-bar" style="margin-bottom:12px">
            <span class="dim" style="font-size:12px">项目画风</span>
            <span class="tag tag-success">{{ artStyleLabel(drama?.style) }}</span>
            <span class="dim" style="font-size:11px">项目页可切换 · 改画风后需重生成定妆</span>
          </div>

          <div class="prod-image-model-bar" style="margin-bottom:12px">
            <span class="dim" style="font-size:12px">定妆生图模型</span>
            <BaseSelect
              :model-value="episodeImageModel"
              :options="imageModelOptions"
              placeholder="选择定妆模型"
              searchable
              style="width:300px"
              @update:model-value="onEpisodeImageModelChange"
            />
            <span class="tag">{{ lockedImageConfigLabel }}</span>
            <span v-if="imageModelSupportsReferenceImages(episodeImageModel)" class="tag tag-success">支持参考图</span>
          </div>

          <div v-if="!visualChars.length && !narrationExtracting" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div class="empty-title">从解说文案提取角色</div>
            <div class="empty-desc">AI 分析文案中会出现的人物，生成外貌设定，供后续配图保持一致</div>
            <div class="step-empty-actions">
              <button class="btn btn-primary" :disabled="!localRaw.trim()" @click="doExtractNarrationCharacters">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                提取角色
              </button>
              <button class="btn" @click="addNarrationCharacter">手动添加</button>
            </div>
          </div>
          <div v-else-if="narrationExtracting" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">正在从文案提取角色设定...</div>
          </div>
          <div v-else class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ visualChars.length }} 个画面角色</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="addNarrationCharacter">添加角色</button>
                <button class="btn btn-sm" :disabled="isBatchRunning('charImages') || !charImagesPendingCount" @click="batchCharImages">
                  生成定妆图{{ charImagesPendingCount ? ` (${charImagesPendingCount})` : '' }}
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
                    @click.stop="openImageViewer('/' + (c.image_url || c.imageUrl), `${c.name} 定妆参考`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (isPendingCharImage(c.id) ? 'is-pending' : '')">{{ (c.image_url || c.imageUrl) ? '定妆完成' : (isPendingCharImage(c.id) ? '生成中' : '待生成') }}</span>
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
                  <button class="btn btn-sm ml-auto" :disabled="isPendingCharImage(c.id)" @click="genCharImg(c.id)">{{ isPendingCharImage(c.id) ? '生成中' : '生成定妆' }}</button>
                  <button
                    v-if="c.image_url || c.imageUrl"
                    class="btn btn-sm"
                    :disabled="isPendingCharRecognize(c.id)"
                    @click="recognizeCharPortrait(c.id)"
                  >{{ isPendingCharRecognize(c.id) ? '识图中' : '识图补全外貌' }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 1: Rewrite -->
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
                <span class="step-num">{{ isNarrationMode ? '03' : '05' }}</span>
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
                <span class="tag dim" style="font-size:11px">按段落配图 · AI文案</span>
              </template>
              <button class="btn btn-sm" :disabled="rn || narrationBreaking" @click="isNarrationMode ? doNarrationBreakdown() : doBreakdown()">
                <Loader2 v-if="(rn && rt === 'storyboard_breaker') || narrationBreaking" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ sbs.length ? '重新分镜' : (isNarrationMode ? '旁白分镜' : 'AI 拆解分镜') }}
              </button>
            </div>
          </div>

          <div v-if="isNarrationMode && sbs.length && narrationBreakdownPanel" class="narration-breakdown-panel">
            <div class="narration-breakdown-head">
              <div>
                <strong>旁白分镜结果</strong>
                <span v-if="narrationBreakdownPanel.generatedAt" class="dim" style="font-size:11px;margin-left:8px">{{ formatBreakdownTime(narrationBreakdownPanel.generatedAt) }}</span>
              </div>
              <span v-if="narrationBreakdownPanel.detectLabel" class="tag">{{ narrationBreakdownPanel.detectLabel }}</span>
            </div>
            <div class="narration-breakdown-stats">
              <span class="tag mono">{{ narrationBreakdownPanel.sentenceCount }} 句旁白</span>
              <span class="tag mono">{{ narrationBreakdownPanel.count }} 镜</span>
              <span class="tag mono">约 {{ narrationBreakdownPanel.totalDur }}s</span>
              <span class="tag">{{ narrationBreakdownPanel.imageNeeded }} 张配图</span>
              <span v-if="narrationBreakdownPanel.paragraphCount != null" class="tag mono">{{ narrationBreakdownPanel.paragraphCount }} 段</span>
              <span v-if="narrationBreakdownPanel.diptychCount" class="tag">含 {{ narrationBreakdownPanel.diptychCount }} 张两宫格</span>
              <span v-if="narrationBreakdownPanel.imageNeeded" class="tag dim">约 ¥{{ narrationBreakdownPanel.estImageCost }}（{{ narrationBreakdownPanel.priceLabel }}）</span>
              <span v-if="narrationBreakdownPanel.titleCount" class="tag">
                片头 {{ narrationBreakdownPanel.titleCount }} 镜 · {{ narrationBreakdownPanel.titleImageCount }} 张标题图
                <template v-if="narrationBreakdownPanel.titleHook">（{{ narrationBreakdownPanel.titleHook }}）</template>
              </span>
            </div>
            <div class="narration-breakdown-steps">
              <strong>下一步：</strong>
              ① 确认角色定妆图已生成
              → ② 生成配音 → ③ 生成配图（自动带角色参考） → ④ 镜头合成 → ⑤ 导出
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
                      <div v-if="sb.imageUrl || sb.composedImage || sb.firstFrameImage" class="shot-dot has-img" title="已生成图片"></div>
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
            <div class="loading-text">{{ isNarrationMode ? '正在按规则拆镜，并由 AI 生成配图文案...' : '正在拆解分镜并生成提示词...' }}</div>
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
              <strong>配图规则：</strong>拆镜按规则（一句一镜、按段落配图）；配图文案由<strong>文本 AI</strong>生成，失败时自动退回规则模板。内容多时用两宫格。
            </div>
            <div v-if="isNarrationMode" style="margin-bottom:10px">
              <span class="tag">按段落配图 · AI文案</span>
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
              <strong>定妆参考图：</strong>每个角色可单独开关；开启后会自动选用同角色<strong>已有定妆</strong>作参考（不限青年，无可用参考则纯文生图）。
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ visualChars.length }} 个需生成形象角色</span>
              <span v-if="chars.length > visualChars.length" class="tag">旁白仅保留声音</span>
              <div class="ml-auto flex gap-1">
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
              <strong>配音策略：</strong>解说模式<strong>默认本地 Edge TTS</strong>（免 MiniMax 计费）。批量生成时本地模式<strong>最多 6 路并发</strong>，比逐条快很多。
            </div>
            <div v-if="isNarrationMode" class="local-tts-bar">
              <label class="local-tts-toggle">
                <input v-model="localTtsEnabled" type="checkbox" />
                <span>本地配音（Edge TTS · 免 API）</span>
              </label>
              <BaseSelect
                v-if="localTtsEnabled"
                :model-value="localEdgeVoiceId"
                :options="edgeVoiceSelectOptions"
                placeholder="选择本地音色"
                searchable
                style="min-width:220px"
                @update:model-value="localEdgeVoiceId = $event"
              />
              <span v-else class="tag warn">将使用付费 API：{{ lockedAudioConfigLabel }}</span>
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ ttsEligibleCount }} 条旁白</span>
              <span class="tag mono">{{ ttsGeneratedCount }}/{{ ttsEligibleCount }} 已就绪</span>
              <span class="tag">{{ localTtsEnabled ? '本地 Edge TTS' : lockedAudioConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
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
              <strong>BGM 策略：</strong>默认 <code>suno_music_open</code>（纯器乐）；可选 <code>pixverse-sound-effect</code>（按画面生成环境音，需关联已合成镜头）。上方工具栏可切换模型；合成时自动与旁白混音（BGM 音量约 22%）。
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 镜头 · {{ bgmAppliedCount }} 已配 BGM</span>
              <span class="tag mono">{{ bgmCompletedCount }} 首可用</span>
              <span v-if="bgmPendingCount" class="tag">{{ bgmPendingCount }} 生成中</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="bgmGenerating" @click="refreshBgmLibrary">刷新库</button>
              </div>
            </div>

            <div class="card" style="padding:14px;margin-bottom:14px">
              <div class="field-label" style="margin-bottom:8px">生成新 BGM</div>
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
              <div class="empty-desc">填写描述并点击「生成 BGM」，通常需 1–3 分钟。也可在分镜详情里填写 BGM 描述后在此生成。</div>
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
                    <div v-if="item.model" class="dim" style="font-size:11px;margin-top:4px">{{ item.model }}</div>
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
              <strong>配图策略：</strong>每段 1 张图（内容多时为两宫格）；下方可编辑<strong>配图文案</strong>，修改后点生成即按新提示词出图。
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ shotImgCount }}/{{ narrationNeedImageCount }} 需配图</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-primary btn-sm" :disabled="isBatchRunning('narrationImages') || !narrationImagesPendingCount" @click="batchNarrationShotImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  生成剩余{{ narrationImagesPendingCount ? ` (${narrationImagesPendingCount})` : '' }}
                </button>
              </div>
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <img
                    v-if="getNarrationDisplayImage(sb)"
                    :src="'/' + getNarrationDisplayImage(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getNarrationDisplayImage(sb), `镜头 #${String(i + 1).padStart(2, '0')} 配图`)"
                  />
                  <div v-else-if="isPendingNarrationShot(sb.id)" class="prod-cover-empty">
                    <Loader2 :size="20" class="animate-spin" style="color:var(--accent)" />
                  </div>
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                  <span class="prod-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="isNarrationTitleShot(sb)" class="prod-overlay-badge is-title">片头</span>
                  <span v-else-if="narrationShotNeedsOwnImage(sb) && parseNarrationImageMeta(sb).paragraph_layout === 'diptych'" class="prod-overlay-badge">两宫格</span>
                  <span v-else-if="narrationShotInherited(sb)" class="prod-overlay-badge">复用</span>
                  <span v-else-if="!narrationShotNeedsOwnImage(sb)" class="prod-overlay-badge">沿用</span>
                </div>
                <div class="prod-info">
                  <div class="prod-desc truncate">{{ extractNarrationSentence(sb) || '—' }}</div>
                  <div class="prod-meta-line dim" style="font-size:11px">{{ narrationShotImageLabel(sb) }}</div>
                  <label v-if="narrationShotNeedsOwnImage(sb)" class="narration-shot-prompt-field" @click.stop>
                    <span class="dim">配图文案</span>
                    <textarea
                      class="textarea narration-shot-prompt-textarea"
                      rows="3"
                      :value="getNarrationImagePromptText(sb)"
                      placeholder="配图提示词…"
                      @blur="updateNarrationImagePrompt(sb, $event.target.value)"
                    />
                  </label>
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
                <button class="btn btn-sm btn-primary" :disabled="isBatchRunning('compose') || mergeProcessing || !composePendingCount" @click="batchCompose">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  生成剩余{{ composePendingCount ? ` (${composePendingCount})` : '' }}
                </button>
                <button class="btn btn-sm" :disabled="isBatchRunning('compose') || mergeProcessing || !composableCount" @click="regenerateAllComposeAndMerge">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  重新生成全部并导出
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
            <template v-else-if="mergeUrl">
              <video :key="mergeVideoSrc" :src="mergeVideoSrc" controls class="export-video" />
              <div class="export-bar">
                <span class="tag tag-success">拼接完成</span>
                <span class="dim" style="font-size:12px">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
                <button class="btn" :disabled="composedCount === 0 || isBatchRunning('compose') || mergeProcessing" @click="regenerateAllComposeAndMerge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  全部重合成并导出
                </button>
                <button class="btn" :disabled="composedCount === 0 || mergeProcessing" @click="regenerateMerge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  重新拼接
                </button>
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
                  <button class="btn btn-primary" :disabled="composedCount === 0 || isBatchRunning('compose') || mergeProcessing" @click="regenerateAllComposeAndMerge">全部重合成并导出</button>
                  <button class="btn" :disabled="composedCount === 0 || mergeProcessing" @click="regenerateMerge">仅重新拼接</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="step-empty">
                <div class="empty-visual">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div class="empty-title">生成全集视频</div>
                <div class="empty-desc">将 {{ composedCount }}/{{ sbs.length }} 个已合成镜头拼接为完整视频{{ composedCount < sbs.length ? '（需全部镜头合成完成）' : '' }}{{ exportMixBgm && exportBgmMusicId ? '，并混入所选 BGM' : '' }}</div>
                <button class="btn btn-primary" :disabled="composedCount === 0 || composedCount < sbs.length || mergeProcessing" @click="doMerge" style="margin-top:12px">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  开始生成
                </button>
              </div>
            </template>
          </div>
          <div class="export-list">
            <div class="export-list-head">成片 BGM</div>
            <div class="export-bgm-panel">
              <label class="export-bgm-toggle">
                <input v-model="exportMixBgm" type="checkbox" />
                <span>拼接时混入 BGM</span>
              </label>
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
                  暂无可用 BGM，请先在「BGM 配乐」步骤生成，或
                  <button class="btn btn-ghost btn-sm" style="padding:0 4px;font-size:11px" @click="panel = 'production'; prodTab = 'bgm'">前往生成</button>
                </div>
                <div v-else class="export-bgm-volume">
                  <span class="dim" style="font-size:11px">BGM 音量 {{ exportBgmVolume }}%</span>
                  <input v-model.number="exportBgmVolume" type="range" min="5" max="50" step="1" class="export-bgm-slider" />
                </div>
                <audio
                  v-if="exportBgmPreviewUrl"
                  :src="exportBgmPreviewUrl"
                  controls
                  preload="none"
                  class="dub-audio"
                  style="width:100%;margin-top:4px"
                />
                <div v-if="bgmAppliedCount > 0" class="dim" style="font-size:11px;line-height:1.5">
                  已有 {{ bgmAppliedCount }} 镜在「镜头合成」时混入了 BGM；此处为<strong>整集成片</strong>再铺一层配乐，二者可叠加。
                </div>
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
                {{ shotEditor.isTitle ? '片头改字后请点「保存并重新制作」：自动重新配音 + 重新合成该镜。' : '改台词后需重新配音并重新合成该镜。' }}
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
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { toast } from 'vue-sonner'
import {
  Users, MapPin, Video, ImageIcon, Layers, Mic2, Music, FileText, FolderKanban, Clapperboard, Download,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, imageAPI, videoAPI, composeAPI, mergeAPI, gridAPI, aiConfigAPI, voicesAPI, musicAPI } from '~/composables/useApi'
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
  IMAGE_MODEL_OPTIONS,
  BGM_MODEL_OPTIONS,
  DEFAULT_BGM_MODEL,
  bgmModelLabel,
  imageModelUnitPrice,
  imageModelPriceLabel,
  resolveEpisodeImageModel,
  narrationShotNeedsOwnImage,
  isNarrationTitleShot,
  getNarrationShotOwnImage,
  resolveNarrationEffectiveImage,
  narrationShotsNeedingImage,
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
  sortCharactersForPortraitGeneration,
  dramaStoryboardStep,
  narrationStoryboardStep,
} from '~/composables/useEpisodeWorkflow'
import { artStyleLabel } from '~/composables/useArtStyles'
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
const localEdgeVoiceId = ref(DEFAULT_LOCAL_EDGE_VOICE)
const edgeVoiceProfiles = ref([])
const pipelineStepTotal = computed(() => workflowStepTotal(productionMode.value))
const panel = ref('script')
const { running: rn, runningType: rt, run: runAgent } = useAgent()
const narrationBreaking = ref(false)
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
const mergeProgressPercent = computed(() => {
  const p = mergeData.value?.progress_percent ?? mergeData.value?.progressPercent
  return typeof p === 'number' ? Math.min(100, Math.max(0, Math.round(p))) : 0
})
const mergeProgressMessage = computed(() =>
  mergeData.value?.progress_message || mergeData.value?.progressMessage || '正在拼接镜头…',
)
let mergePollTimer = null
const mergeVideoSrc = computed(() => {
  if (!mergeUrl.value) return ''
  const v = mergeData.value?.id || mergeData.value?.completed_at || mergeData.value?.completedAt || Date.now()
  return `/${mergeUrl.value}?v=${encodeURIComponent(String(v))}`
})

const scriptStep = ref(0)
const prodTab = ref('chars')
const bgmLibrary = ref([])
const bgmGenerating = ref(false)
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
const exportMixBgm = ref(true)
const exportBgmMusicId = ref(null)
const exportBgmVolume = ref(22)
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
    .map(m => ({
      value: m.id,
      label: `${m.title || 'BGM'} #${m.id}`,
    })),
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

function ttsGenerateOptions(force = false) {
  const opts = {}
  if (force) opts.force = true
  if (isNarrationMode.value && localTtsEnabled.value !== false) {
    opts.local_tts = true
    opts.local_voice = localEdgeVoiceId.value
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
  window.localStorage.setItem(`episode-${epId.value}-local-voice`, localEdgeVoiceId.value)
}

function restoreLocalTtsPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const stored = window.localStorage.getItem(`episode-${epId.value}-local-tts`)
  localTtsEnabled.value = stored === null ? true : stored === '1'
  const voice = window.localStorage.getItem(`episode-${epId.value}-local-voice`)
  if (voice) localEdgeVoiceId.value = voice
}

function persistExportBgmPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  window.localStorage.setItem(`episode-${epId.value}-export-mix-bgm`, exportMixBgm.value ? '1' : '0')
  window.localStorage.setItem(`episode-${epId.value}-export-bgm-id`, exportBgmMusicId.value ? String(exportBgmMusicId.value) : '')
  window.localStorage.setItem(`episode-${epId.value}-export-bgm-vol`, String(exportBgmVolume.value))
}

function restoreExportBgmPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const mix = window.localStorage.getItem(`episode-${epId.value}-export-mix-bgm`)
  exportMixBgm.value = mix === null ? true : mix === '1'
  const id = window.localStorage.getItem(`episode-${epId.value}-export-bgm-id`)
  exportBgmMusicId.value = id ? Number(id) : null
  const vol = window.localStorage.getItem(`episode-${epId.value}-export-bgm-vol`)
  if (vol) exportBgmVolume.value = Number(vol) || 22
}

function buildMergePayload() {
  const payload = { cancel_running: true }
  if (exportMixBgm.value && exportBgmMusicId.value) {
    payload.bgm_music_id = exportBgmMusicId.value
    payload.bgm_volume = Math.max(0.05, Math.min(0.5, exportBgmVolume.value / 100))
  }
  return payload
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

const PUNCT_BOUNDARY_RE = /(?<=[。！？；，、,.!?;])\s*/

function splitNarrationLines(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const lines = []
  for (const block of normalized.split(/\n+/)) {
    const flat = block.replace(/\s+/g, ' ').trim()
    if (!flat) continue
    const parts = flat.split(PUNCT_BOUNDARY_RE).map(s => s.trim()).filter(Boolean)
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
  if (baseMeta.paragraph_layout) meta.paragraph_layout = baseMeta.paragraph_layout
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

  const dialogue = normalizeNarrationDialogue(sb, editor.dialogue)
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
    await storyboardAPI.update(sb.id, {
      dialogue,
      description,
      title,
      duration,
    })
    sb.dialogue = dialogue
    sb.description = description
    sb.title = title
    sb.duration = duration
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

    toast.info('正在重新配音…')
    await storyboardAPI.generateTTS(sb.id, { force: true, local_tts: localTtsEnabled.value })
    toast.info('正在重新合成该镜…')
    delete failedComposeMessages.value[sb.id]
    if (!isPendingCompose(sb.id)) pendingComposeIds.value.push(sb.id)
    await composeAPI.shot(sb.id)
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    toast.success(`镜头 #${editor.number} 已重新制作`)
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
const imageModelOptions = computed(() => IMAGE_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value })))
const showImageModelPicker = computed(() => ['chars', 'scenes', 'shots'].includes(prodTab.value))
const showBgmModelPicker = computed(() => prodTab.value === 'bgm')

function syncEpisodeImageModel(ep) {
  episodeImageModel.value = resolveEpisodeImageModel(ep)
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
  }
}

// Script step navigation
const stepLabels = computed(() => isNarrationMode.value
  ? ['解说文案', '角色定妆', '旁白分镜']
  : ['原始内容', 'AI 改写', '提取', '音色', '分镜'])
const prevStepLabel = computed(() => scriptStep.value > 0 ? stepLabels.value[scriptStep.value - 1] : '')
const nextStepLabel = computed(() => {
  if (scriptStep.value === storyboardStep.value) return '进入制作'
  return stepLabels.value[scriptStep.value + 1] || ''
})
const canGoNext = computed(() => {
  if (scriptStep.value === 0) return !!localRaw.value.trim()
  if (isNarrationMode.value && scriptStep.value === 1) return true
  if (isNarrationMode.value && scriptStep.value === 2) return sbs.value.length > 0
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

const ttsPendingCount = computed(() => {
  if (isNarrationMode.value) {
    return sbs.value.filter(sb => hasDialogue(sb) && !hasNarrationShotOwnTts(sb)).length
  }
  return sbs.value.filter(sb => hasDialogue(sb) && !hasTTS(sb)).length
})
const narrationImagesPendingCount = computed(() =>
  sbs.value.filter(sb => narrationShotNeedsOwnImage(sb) && !hasNarrationShotImage(sb)).length,
)
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
  return buildNarrationImagePrompt(sb, style)
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

const narrationBreakdownPanel = computed(() => {
  if (!isNarrationMode.value || !sbs.value.length) return null
  const s = narrationBreakdownSummary.value
  const count = s?.count ?? sbs.value.length
  const sentenceCount = s?.sentence_count ?? s?.sentenceCount ?? sbs.value.filter(sb => !isNarrationTitleShot(sb)).length
  const titleCount = s?.title_count ?? s?.titleCount ?? sbs.value.filter(sb => isNarrationTitleShot(sb)).length
  const titleImageCount = s?.title_image_count ?? s?.titleImageCount ?? (titleCount ? 1 : 0)
  const titleHook = s?.title_hook ?? s?.titleHook ?? null
  const paragraphCount = s?.paragraph_count ?? s?.paragraphCount ?? null
  const diptychCount = s?.diptych_count ?? s?.diptychCount ?? 0
  const imageNeeded = s?.image_needed_count ?? s?.imageNeededCount ?? narrationNeedImageCount.value
  const unitPrice = imageModelUnitPrice(episodeImageModel.value)
  const estImageCost = Math.round(imageNeeded * unitPrice * 100) / 100
  const priceLabel = imageModelPriceLabel(episodeImageModel.value)
  const totalDur = s?.total_duration ?? s?.totalDuration ?? totalDuration.value
  const detectSource = s?.image_detect_source ?? s?.imageDetectSource
  const detectMode = s?.image_detect_mode ?? s?.imageDetectMode ?? imageDetectMode.value
  const detectLabel = detectSource === 'paragraph+llm'
    ? '按段落配图 · AI文案'
    : (detectMode === 'paragraph' || detectSource === 'paragraph'
      ? '按段落配图 · 规则文案'
      : (detectMode === 'conservative'
        ? (detectSource === 'llm' ? '省钱 · AI识别' : '省钱 · 规则识别')
        : (detectSource === 'llm' ? '标准 · AI识别' : detectSource === 'heuristic' ? '标准 · 规则识别' : '标准')))
  return {
    count,
    sentenceCount,
    titleCount,
    titleImageCount,
    titleHook,
    paragraphCount,
    diptychCount,
    imageNeeded,
    estImageCost,
    priceLabel,
    totalDur,
    detectLabel,
    generatedAt: s?.generated_at ?? s?.generatedAt ?? null,
  }
})

function persistNarrationBreakdownSummary(res) {
  if (!epId.value) return
  const payload = {
    count: res?.count ?? 0,
    sentence_count: res?.sentence_count ?? res?.sentenceCount ?? 0,
    title_count: res?.title_count ?? res?.titleCount ?? 0,
    title_image_count: res?.title_image_count ?? res?.titleImageCount ?? 0,
    title_hook: res?.title_hook ?? res?.titleHook ?? null,
    image_needed_count: res?.image_needed_count ?? res?.imageNeededCount ?? 0,
    paragraph_count: res?.paragraph_count ?? res?.paragraphCount ?? 0,
    diptych_count: res?.diptych_count ?? res?.diptychCount ?? 0,
    image_detect_source: res?.image_detect_source ?? res?.imageDetectSource ?? null,
    image_prompt_source: res?.image_prompt_source ?? res?.imagePromptSource ?? null,
    image_detect_mode: res?.image_detect_mode ?? res?.imageDetectMode ?? imageDetectMode.value,
    total_duration: res?.total_duration ?? res?.totalDuration ?? 0,
    generated_at: Date.now(),
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
  bgmAppliedCount: bgmAppliedCount.value,
}))

const narrationIconMap = {
  'script:raw': FileText,
  'script:characters': Users,
  'script:storyboard': Clapperboard,
  'prod:voice': Mic2,
  'prod:chars': Users,
  'prod:dubbing': Mic2,
  'prod:bgm': Music,
  'prod:shots': ImageIcon,
  'prod:compose': Layers,
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
    scriptStep.value = Math.min(scriptStep.value, isNarrationMode.value ? 2 : 1)
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
        { key: 'script:characters', label: '角色定妆', done: visualCharTotal.value > 0 },
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
    return [{ key: 'export:merge', label: '拼接导出', done: !!mergeUrl.value }]
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
    { key: 'export:merge', label: '拼接导出', done: !!mergeUrl.value },
  ]
})

const activeSubStepKey = computed(() => resolveActiveSubStepKey(productionMode.value, panel.value, scriptStep.value, prodTab.value))

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
  panel.value = 'export'
}

const pipelineProgress = computed(() => workflowProgress(productionMode.value, workflowState.value))

const currentStageLabel = computed(() => {
  if (panel.value === 'script') return `${isNarrationMode.value ? '解说' : '剧本'}阶段 · ${stepLabels.value[scriptStep.value] || ''}`
  if (panel.value === 'production') return `制作阶段 · ${prodTabDefs.value[prodTabIdx.value]?.label || '制作'}`
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
  if (!epId.value) return
  try {
    const prevCompleted = bgmCompletedCount.value
    if (options.resume) {
      try { await musicAPI.resumePending({ episode_id: epId.value }) } catch {}
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
  if (!epId.value) return
  const rows = await musicAPI.list({ episode_id: epId.value })
  bgmLibrary.value = normalizeBgmLibraryRows(rows)
  if (options.resumePoll) {
    const pending = bgmLibrary.value.some(m => ['pending', 'processing'].includes(m.status))
    if (pending && !bgmPollTimer) startBgmPoll()
  }
}

async function refreshBgmLibrary() {
  if (!epId.value) return
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
  try { await musicAPI.resumePending({ episode_id: epId.value }) } catch {}
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
      syncEpisodeImageModel(ep)
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
    if (['processing', 'pending'].includes(mergeData.value?.status)) startMergePoll()
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
  const style = drama.value?.style || 'comic'
  void (async () => {
    try {
      const script = await saveNarrationScript()
      const res = await episodeAPI.narrationBreakdown(epId.value, {
        style,
        script,
        image_detect_mode: imageDetectMode.value,
      })
      const titleCount = res?.title_count ?? res?.titleCount ?? 0
      const titleImageCount = res?.title_image_count ?? res?.titleImageCount ?? (titleCount ? 1 : 0)
      const titleHook = res?.title_hook ?? res?.titleHook
      const sentenceCount = res?.sentence_count ?? res?.sentenceCount ?? 0
      const titleHint = titleCount
        ? `，片头 ${titleCount} 镜共用 ${titleImageCount} 张标题图${titleHook ? `（${titleHook}）` : ''}`
        : '，未识别片头标题（首行请写「标题：」或「今天体验的人生剧本是…」）'
      const paragraphCount = res?.paragraph_count ?? res?.paragraphCount ?? 0
      const diptychCount = res?.diptych_count ?? res?.diptychCount ?? 0
      const imageCount = res?.image_needed_count ?? res?.imageNeededCount ?? 0
      const diptychHint = diptychCount ? `（含 ${diptychCount} 张两宫格）` : ''
      const promptSource = res?.image_prompt_source ?? res?.imagePromptSource
      const promptHint = promptSource === 'llm' ? ' · AI配图文案' : ' · 规则配图文案'
      toast.success(`已拆分 ${sentenceCount} 句 → ${res?.count || 0} 镜${titleHint}，${paragraphCount} 段 · ${imageCount} 张配图${diptychHint}${promptHint}`)
      persistNarrationBreakdownSummary(res)
      await refresh()
      await ensureNarratorCharacter()
    } catch (e) {
      toast.error(e.message)
    } finally {
      narrationBreaking.value = false
    }
  })()
}

async function doExtractNarrationCharacters() {
  narrationExtracting.value = true
  try {
    const script = await saveNarrationScript()
    const style = drama.value?.style || 'comic'
    const res = await episodeAPI.extractNarrationCharacters(epId.value, { script, style })
    const created = res?.created ?? 0
    const updated = res?.updated ?? 0
    if (created || updated) {
      const total = (res?.characters || []).length
      toast.success(`已提取 ${total} 条定妆：新增 ${created}，更新 ${updated}`)
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
  if (isNarrationMode.value && localTtsEnabled.value !== false) return 6
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
    const provider = res?.provider || (localTtsEnabled.value ? 'edge' : 'api')
    const mode = provider === 'edge' ? '（本地 Edge）' : '（付费 API）'
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
      toast.success(`${label} ${apiCount} 条配音${localTtsEnabled.value ? `（本地 Edge · ${concurrency} 并发）` : ''}`)
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
  if (!narrationShotNeedsOwnImage(s)) return '同段 · 沿用上一张'
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
  const draft = {
    ...sb,
    reference_images: JSON.stringify({ narration_image_mode: 'new', scene_content: sceneContent }),
    image_prompt: null,
    imagePrompt: null,
  }
  await storyboardAPI.update(sb.id, {
    reference_images: JSON.stringify({ narration_image_mode: 'new', scene_content: sceneContent }),
    image_prompt: buildNarrationImagePrompt(draft, style),
  })
  toast.success('已标记为需配图')
  await refresh()
}
function isPendingNarrationShot(id) { return pendingNarrationShotIds.value.includes(id) }

async function genNarrationShotImage(sb) {
  const style = drama.value?.style || 'comic'
  const basePrompt = getNarrationImagePromptText(sb, style)
  if (!basePrompt) {
    toast.warning('该镜头没有旁白文案，无法生成配图')
    return
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
    }, episodeImageModel.value, characterIds)
    await imageAPI.generate(buildImagePayload(payload))
    toast.success('配图生成中')
    await refresh()
    watchAsyncResult(() => {
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
  const pending = sbs.value.filter(sb => narrationShotNeedsOwnImage(sb) && !hasNarrationShotImage(sb))
  if (!pending.length) {
    toast.info('所有需配图镜头已生成')
    return
  }
  if (!tryBeginBatch('narrationImages', `配图生成中（剩余 ${pending.length} 张）…`)) return
  try {
    const style = drama.value?.style || 'comic'
    pendingNarrationShotIds.value = [...new Set([...pendingNarrationShotIds.value, ...pending.map(sb => sb.id)])]
    const results = await Promise.allSettled(pending.map(async sb => {
      const characterIds = await resolveShotCharacterIds(sb)
      const payload = buildNarrationImageGeneratePayload(sb, visualChars.value, style, {
        storyboard_id: sb.id,
        drama_id: dramaId,
        frame_type: 'illustration',
      }, episodeImageModel.value, characterIds)
      return imageAPI.generate(buildImagePayload(payload))
    }))
    const failCount = results.filter(r => r.status === 'rejected').length
    if (failCount) toast.error(`${failCount} 个镜头配图提交失败`)
    else toast.success(`已提交剩余 ${pending.length} 张配图生成`)
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
    const status = mergeData.value?.status
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      stopMergePoll()
      if (status === 'completed') {
        toast.success('视频生成完成')
        await refresh()
        onDone?.(true)
      } else if (status === 'failed') {
        toast.error(mergeFailedMessage.value)
        onDone?.(false)
      } else {
        onDone?.(false)
      }
    }
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
    mergeData.value = { ...(mergeData.value || {}), status: 'cancelled' }
    toast.info('已取消生成')
  } catch (e) {
    toast.error(e.message)
  }
}

async function regenerateMerge() {
  stopMergePoll()
  await doMerge()
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
    toast.error(e.message)
    return false
  }
}

async function pollComposeStatus(options = {}) {
  const maxAttempts = options.maxAttempts ?? 120
  const expectTotal = options.expectTotal ?? 0
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000)
    try {
      const res = await composeAPI.status(epId.value)
      await refresh()
      const items = Array.isArray(res?.items) ? res.items : []
      const processingCount = res?.processing ?? items.filter(item => item.status === 'compose_processing').length
      const completedCount = res?.completed ?? items.filter(item => item.status === 'compose_completed').length
      const totalCount = res?.total ?? items.length
      const processingIds = items.filter(item => item.status === 'compose_processing').map(item => item.id)
      pendingComposeIds.value = processingIds

      const failedItems = items.filter(item => item.status === 'compose_failed')
      if (failedItems.length) {
        const next = { ...failedComposeMessages.value }
        failedItems.forEach((item) => {
          next[item.id] = item.error_msg || item.errorMsg || '视频合成失败'
        })
        failedComposeMessages.value = next
      }

      if (processingCount > 0) continue

      const doneTotal = expectTotal > 0 ? expectTotal : totalCount
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
    edgeVoiceProfiles.value = rows?.length
      ? rows.map(mapVoiceProfile)
      : [{ id: DEFAULT_LOCAL_EDGE_VOICE, label: '云希（男·解说）', gender: '男声', traits: '本地 Edge', suitable: '解说旁白' }]
  } catch (e) {
    console.error('Failed to load edge voices', e)
    edgeVoiceProfiles.value = [{ id: DEFAULT_LOCAL_EDGE_VOICE, label: '云希（男·解说）', gender: '男声', traits: '本地 Edge', suitable: '解说旁白' }]
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
watch([localTtsEnabled, localEdgeVoiceId], persistLocalTtsPrefs)
watch([exportMixBgm, exportBgmMusicId, exportBgmVolume], persistExportBgmPrefs)
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
onMounted(() => { refresh(); loadConfigs(); loadVoices(); loadEdgeVoices() })
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
.tag.warn { color: #b45309; border-color: rgba(180, 83, 9, 0.25); background: rgba(251, 191, 36, 0.12); }

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
.prod-actions { display: flex; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid rgba(27, 41, 64, 0.08); }
.prod-actions .btn { flex: 1; justify-content: center; }

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
.export-list { width: 280px; flex-shrink: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.export-bgm-panel { padding: 10px 12px 12px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
.export-bgm-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-2); cursor: pointer; }
.export-bgm-toggle input { accent-color: var(--accent); }
.export-bgm-fields { display: flex; flex-direction: column; gap: 8px; }
.export-bgm-volume { display: flex; flex-direction: column; gap: 4px; }
.export-bgm-slider { width: 100%; accent-color: var(--accent); }
.export-list-head { padding: 11px 14px; font-size: 11px; font-weight: 700; color: var(--text-3); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.06em; }
.export-list-body { flex: 1; overflow-y: auto; padding: 6px; }
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
