<template>
<div class="content-panel">
<div v-if="!scriptContent || !sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <div class="empty-title">尚未准备就绪</div>
          <div class="empty-desc">{{ !scriptContent ? '请先完成剧本编写' : '请先完成分镜拆解' }}</div>
          <button class="btn btn-primary" @click="panel = 'script'">前往剧本</button>
        </div>

        <template v-else>
          <div class="prod-shell">
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

          <div v-if="showImageStylePicker" class="prod-image-model-bar">
            <span class="dim" style="font-size:12px">画风风格</span>
            <BaseSelect
              :model-value="narrationImageStyle"
              :options="narrationImageStyleOptions"
              placeholder="选择画风风格"
              searchable
              style="min-width:220px"
              :title="isDramaLikeMode ? '与项目画风联动，定妆/场景/分镜配图共用；切换后请重新生成' : '定妆参考与配图共用；切换后请重新生成定妆/配图'"
              @update:model-value="onNarrationImageStyleChange"
            />
            <span v-if="isDramaLikeMode" class="tag">{{ artStyleLabel(narrationImageStyle) }}</span>
            <span class="dim" style="font-size:11px">含电影质感、写实摄影等；与上方「配图模型」不同</span>
          </div>

          <div v-if="showBgmModelPicker" class="prod-image-model-bar">
            <span class="dim" style="font-size:12px">BGM 模型</span>
            <BaseSelect
              :model-value="bgmModel"
              :options="bgmModelOptions"
              placeholder="选择 BGM 模型"
              searchable
              style="width:320px"
              @update:model-value="bgmModel = $event"
            />
            <span class="tag">{{ bgmModelLabel(bgmModel) }}</span>
            <span v-if="isLocalComicMode" class="dim" style="font-size:11px">Suno 为云端 API；也可下方直接上传本地音频</span>
            <span v-if="bgmModel === 'pixverse-sound-effect'" class="tag tag-accent">需关联已合成镜头</span>
          </div>

          <!-- Sub: Narrator Voice (narration mode) -->
          <div v-if="prodTab === 'voice'" class="prod-content">
            <div v-if="isMotionComicMode || isDialoguePortraitMode" class="narration-hint">
              <strong>多角色本地配音：</strong>优先使用 Voicebox 的 <strong>Kokoro</strong> 中文音色，不够时自动补 <strong>Edge TTS</strong>；也可手动选用 <strong>Voicebox 克隆</strong> 音色。完成「{{ isDialoguePortraitMode ? '对话分镜' : '旁白分镜' }}」后会<strong>按当前分镜说话人同步角色并重新分配音色</strong>；也可手动点「重新分配」。
            </div>
            <div v-else class="narration-hint">
              <strong>旁白音色：</strong>可选择 MiniMax 等 API 音色，或 Voicebox 已克隆的中文音色（需 Voicebox 运行）。若已在「生成配音」勾选<strong>本地配音</strong>，也可直接使用生成配音区的 Voicebox / Edge 设置。
            </div>

            <template v-if="isMotionComicMode || isDialoguePortraitMode">
              <div class="prod-section-bar" style="margin-bottom:12px">
                <span class="dim" style="font-size:12px">{{ motionComicCharsVoiced }}/{{ motionComicVoiceChars.length }} 已分配</span>
                <span class="tag">Kokoro · 克隆 · Edge</span>
                <div class="ml-auto flex gap-1">
                  <button class="btn btn-sm btn-primary" :disabled="localVoiceAssigning || !motionComicVoiceChars.length" @click="assignLocalCharacterVoices(false)">
                    {{ localVoiceAssigning ? '分配中…' : '自动分配音色' }}
                  </button>
                  <button class="btn btn-sm" :disabled="localVoiceAssigning || !motionComicCharsVoiced" @click="assignLocalCharacterVoices(true)">
                    重新分配
                  </button>
                </div>
              </div>
              <div v-if="!motionComicVoiceChars.length" class="step-empty" style="min-height:220px">
                <div class="empty-title">暂无当前分镜角色</div>
                <div class="empty-desc">请先完成「{{ isDialoguePortraitMode ? '对话分镜' : '旁白分镜' }}」（台本每行需带说话人），系统会按分镜说话人同步角色后再分配音色。</div>
              </div>
              <div v-else class="voice-grid">
                <div v-for="c in motionComicVoiceChars" :key="c.id" class="card voice-card">
                  <div class="voice-card-head">
                    <div class="voice-char">
                      <div class="char-avatar lg">{{ c.name?.[0] || '?' }}</div>
                      <div class="voice-name">
                        <div class="voice-name-row">
                          <div class="extract-name">{{ c.name }}</div>
                          <span v-if="getCharacterGenderLabel(c)" class="tag">{{ getCharacterGenderLabel(c) }}</span>
                          <span class="tag" :class="(c.voice_style || c.voiceStyle) ? 'tag-success' : ''">{{ (c.voice_style || c.voiceStyle) ? '已分配' : '待分配' }}</span>
                        </div>
                        <div class="extract-meta">{{ c.role || '角色' }}</div>
                      </div>
                    </div>
                  </div>
                  <label class="field" style="margin-top:10px">
                    <span class="field-label">本地音色</span>
                    <BaseSelect
                      :model-value="c.voice_style || c.voiceStyle || ''"
                      :options="localCastVoiceSelectOptions"
                      placeholder="选择 Kokoro / 克隆 / Edge 音色"
                      searchable
                      style="width:100%"
                      @update:model-value="updateCharVoice(c.id, $event)"
                    />
                  </label>
                  <div v-if="getLocalVoiceProfile(c.voice_style || c.voiceStyle)" class="voice-profile-card" style="margin-top:10px">
                    <div class="voice-profile-head">
                      <span class="voice-profile-name">{{ getLocalVoiceProfile(c.voice_style || c.voiceStyle)?.label }}</span>
                      <span class="tag">{{ getLocalVoiceProfile(c.voice_style || c.voiceStyle)?.gender }}</span>
                    </div>
                    <div class="voice-profile-traits">{{ getLocalVoiceProfile(c.voice_style || c.voiceStyle)?.traits }}</div>
                  </div>
                  <div v-else-if="c.voice_style || c.voiceStyle" class="dim" style="font-size:11px;margin-top:8px">
                    当前：{{ formatLocalVoiceLabel(c) }}
                  </div>
                  <div class="voice-actions-row" style="margin-top:10px">
                    <button
                      class="btn btn-sm"
                      :disabled="!(c.voice_style || c.voiceStyle) || charVoicePreviewingId === c.id"
                      @click="previewCharacterLocalVoice(c)"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                      {{ charVoicePreviewingId === c.id ? '生成试听…' : (charVoicePreviewSrc(c.id) ? '重新试听' : '试听') }}
                    </button>
                    <span class="dim" style="font-size:11px">确认音色后再批量生成配音</span>
                  </div>
                  <div v-if="charVoicePreviewSrc(c.id) || c.voice_sample_url || c.voiceSampleUrl" class="voice-player">
                    <audio
                      :key="charVoicePreviewSrc(c.id) || ('/' + (c.voice_sample_url || c.voiceSampleUrl))"
                      :src="charVoicePreviewSrc(c.id) || ('/' + String(c.voice_sample_url || c.voiceSampleUrl).replace(/^\//, ''))"
                      controls
                      preload="metadata"
                    />
                  </div>
                </div>
              </div>
            </template>

            <div v-else class="card" style="padding:16px;max-width:520px">
              <label class="field">
                <span class="field-label">旁白音色</span>
                <BaseSelect :model-value="narratorVoiceId" :options="narratorVoiceSelectOptions" placeholder="选择 API / 克隆旁白音色" searchable style="width:100%" @update:model-value="onNarratorVoiceChange" />
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
          <div v-else-if="prodTab === 'chars'" class="prod-content">
            <div v-if="isLocalComicMode" class="narration-hint">
              <strong>角色形象：</strong>先「一键生成 AI 配图描述」，再「一键生成配图」；剧本阶段已提取的角色会出现在下方，可逐条修改外貌描述后重新生成。
            </div>
            <div v-if="isDialoguePortraitMode" class="narration-hint">
              <strong>定妆 + 表情包：</strong>本集绑定 <strong>1～2 个角色</strong>（1 人居中 / 2 人左右）；先生成白底定妆基图，再生成 <strong>idle / talk / react</strong> 三态表情。合成时说话人用 talk，听者 idle，反应词用 react。
              <span v-if="dialoguePortraitCharOverLimit" class="tag" style="margin-left:6px;color:var(--danger,#ef4444)">已超过 2 人上限，请删减</span>
            </div>
            <div v-else-if="isNarrationMode" class="narration-hint">
              <template v-if="isMotionComicMode">
                <strong>定妆参考：</strong>先「提取角色」只建名单；再「一键生成 AI 配图描述」写定妆文案；最后生成定妆图。每个角色可单独上传/清除。
              </template>
              <template v-else>
                <strong>定妆参考：</strong>从解说文案提取主角；<strong>白底正面全身</strong>定妆；每个角色可单独<strong>上传/清除</strong>定妆图，或顶部一键复制/上传/清除。
              </template>
            </div>
            <div v-if="isNarrationMode && !visualChars.length && !narrationExtracting" class="step-empty">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div class="empty-title">{{ isDialoguePortraitMode ? '提取对话角色定妆' : (isMotionComicMode ? '从旁白稿提取角色' : '从解说文案提取主角定妆') }}</div>
              <div class="empty-desc">{{ isDialoguePortraitMode ? '本集仅 1～2 个角色；16:9 白底正面全身定妆后生成 idle/talk/react 表情包' : (isMotionComicMode ? '只提取主人公 + 主要配角名单（不写定妆文案）；提取后再点「一键生成 AI 配图描述」；一次性路人不提取' : '16:9 白底正面全身定妆；动漫风格清晰脸型，素体风格清晰卡通脸与体型；切换画风后请重新生成') }}</div>
              <div class="step-empty-actions">
                <button class="btn btn-primary" :disabled="!localRaw.trim() && !rawContent" @click="doExtractNarrationCharacters">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {{ isDialoguePortraitMode ? '提取对话角色' : (isMotionComicMode ? '提取角色' : '提取主角定妆') }}
                </button>
                <button class="btn" @click="addNarrationCharacter">手动添加</button>
              </div>
              <p v-if="narrationExtractFailedAt" class="llm-failed-at" style="margin-top:12px;text-align:center">失败于 {{ formatBreakdownTime(narrationExtractFailedAt) }}<template v-if="narrationExtractError">：{{ narrationExtractError }}</template></p>
            </div>
            <div v-else-if="isNarrationMode && narrationExtracting" class="step-loading">
              <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
              <div class="loading-text">{{ isMotionComicMode ? '正在提取角色名单…' : '正在从文案提取角色设定...' }}</div>
            </div>
            <template v-else>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ visualChars.length }} 个需生成形象角色</span>
              <span v-if="chars.length > visualChars.length" class="tag">旁白仅保留声音</span>
              <div class="ml-auto flex gap-1">
                <button v-if="isNarrationMode && visualChars.length" class="btn btn-sm" :disabled="narrationExtracting" @click="doExtractNarrationCharacters">重新提取</button>
                <span v-if="narrationExtractFailedAt" class="llm-failed-at" style="font-size:11px;align-self:center">失败于 {{ formatBreakdownTime(narrationExtractFailedAt) }}<template v-if="narrationExtractError">：{{ narrationExtractError }}</template></span>
                <span v-else-if="narrationExtractGeneratedAt" class="dim" style="font-size:11px;align-self:center">提取于 {{ formatBreakdownTime(narrationExtractGeneratedAt) }}</span>
                <button v-if="isNarrationMode" class="btn btn-sm" @click="addNarrationCharacter">添加角色</button>
                <button
                  v-if="isDialoguePortraitMode"
                  class="btn btn-sm"
                  :disabled="isBatchRunning('dialogueExpressions') || !charImgCount"
                  title="基于定妆基图生成 idle/talk/react"
                  @click="batchDialogueExpressions({ force: true })"
                >
                  一键生成表情包{{ charImgCount ? ` (${charImgCount})` : '' }}
                </button>
                <button v-if="isComicCharPortraitMode" class="btn btn-sm" :disabled="!visualChars.length" @click="copyAllCharPortraitPrompts">一键复制全部描述词</button>
                <button v-if="isComicCharPortraitMode" class="btn btn-sm" :disabled="!visualChars.length" @click="triggerAllCharImageUpload">一键上传全部（{{ visualChars.length }}）</button>
                <button v-if="isComicCharPortraitMode" class="btn btn-sm" :disabled="!charImgCount" @click="clearAllCharPortraitImages">一键清除全部</button>
                <button
                  v-if="charImgCount"
                  class="btn btn-sm"
                  :disabled="isBatchRunning('charStyleValidate')"
                  title="用本地看图模型校验定妆是否 Q版/比例等不标准"
                  @click="batchValidateCharPortraitStyles"
                >
                  {{ isBatchRunning('charStyleValidate') ? '校验中…' : `一键校验画风${charImgCount ? ` (${charImgCount})` : ''}` }}
                </button>
                <button
                  v-if="charImgCount"
                  class="btn btn-sm"
                  :disabled="isBatchRunning('charImages')"
                  title="覆盖已有定妆图重新生成"
                  @click="regenerateAllCharPortraitImages"
                >
                  重新生成全部{{ charImgCount ? ` (${charImgCount})` : '' }}
                </button>
                <button
                  v-if="isComicCharPortraitMode"
                  class="btn btn-sm"
                  :disabled="isBatchRunning('charAppearances') || !visualChars.length"
                  :title="charAppearancesPendingCount
                    ? `为 ${charAppearancesPendingCount} 个尚无描述的角色生成`
                    : '全部已有描述，点击将覆盖重写'"
                  @click="batchCharAppearances"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  {{ charAppearancesPendingCount ? `一键生成 AI 配图描述 (${charAppearancesPendingCount})` : '一键生成 AI 配图描述' }}
                </button>
                <button class="btn btn-sm" :disabled="isBatchRunning('charImages') || !charImagesPendingCount" @click="batchCharImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {{ isComicCharPortraitMode ? '一键生成配图' : '生成剩余' }}{{ charImagesPendingCount ? ` (${charImagesPendingCount})` : '' }}
                </button>
              </div>
            </div>
            <div class="asset-grid">
              <div v-for="c in visualChars" :key="c.id" class="card asset-card">
                <div class="asset-cover" :class="{ wide: usesComicStoryboardRules || isMotionComicMode }">
                  <img
                    v-if="c.image_url || c.imageUrl"
                    :key="charPortraitImageSrc(c)"
                    :src="charPortraitImageSrc(c)"
                    class="previewable-image"
                    @click.stop="openImageViewer(charPortraitImageSrc(c), `${c.name} 角色形象`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (isPendingCharImage(c.id) ? 'is-pending' : '')">{{ (c.image_url || c.imageUrl) ? '已生成' : (isPendingCharImage(c.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div v-if="isDialoguePortraitMode" class="dialogue-expr-row">
                  <div
                    v-for="key in DIALOGUE_PORTRAIT_EXPRESSIONS"
                    :key="key"
                    class="dialogue-expr-thumb"
                    :class="{ ready: !!getDialoguePortraitExpressions(c)[key] }"
                    :title="DIALOGUE_PORTRAIT_EXPRESSION_LABELS[key]"
                  >
                    <img
                      v-if="getDialoguePortraitExpressions(c)[key]"
                      :src="dialoguePortraitExpressionSrc(getDialoguePortraitExpressions(c)[key])"
                      class="previewable-image"
                      @click.stop="openImageViewer(dialoguePortraitExpressionSrc(getDialoguePortraitExpressions(c)[key]), `${c.name} · ${DIALOGUE_PORTRAIT_EXPRESSION_LABELS[key]}`)"
                    />
                    <span v-else class="dialogue-expr-empty">{{ DIALOGUE_PORTRAIT_EXPRESSION_LABELS[key] }}</span>
                    <span class="dialogue-expr-label">{{ key }}</span>
                  </div>
                </div>
                <div class="asset-body">
                  <div class="asset-name">{{ formatCharacterDisplayName(c) }}</div>
                  <div v-if="formatCharacterRoleSubtitle(c)" class="asset-meta dim">{{ formatCharacterRoleSubtitle(c) }}</div>
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
                  <span v-if="charAppearanceFailedAt[c.id]" class="llm-failed-at" style="font-size:10px;display:block;margin-top:4px">失败于 {{ formatBreakdownTime(charAppearanceFailedAt[c.id]) }}<template v-if="charAppearanceError[c.id]">：{{ charAppearanceError[c.id] }}</template></span>
                  <span v-else-if="charAppearanceGeneratedAt[c.id]" class="dim" style="font-size:10px;display:block;margin-top:4px">生成于 {{ formatBreakdownTime(charAppearanceGeneratedAt[c.id]) }}</span>
                  <button
                    v-if="imageModelSupportsReferenceImages(episodeImageModel)"
                    class="btn btn-sm"
                    style="margin-top:6px"
                    :class="{ 'btn-primary': isCharPortraitUseReference(c.id) }"
                    :title="isCharPortraitUseReference(c.id) ? (isMotionComicMode ? '使用同角色已有定妆作参考' : '使用同角色已有定妆作参考（自动选最合适形态）') : '纯文生图，不使用参考图'"
                    @click="toggleCharPortraitUseReference(c.id)"
                  >{{ isCharPortraitUseReference(c.id) ? '✓ 参考图' : '参考图' }}</button>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (c.image_url || c.imageUrl) && 'ok', isPendingCharImage(c.id) && 'pending']" />
                  <span class="dim" style="font-size:10px">{{ (c.image_url || c.imageUrl) ? '已生成' : (isPendingCharImage(c.id) ? '生成中' : '待生成') }}</span>
                  <span v-if="charImageFailedAt[c.id]" class="llm-failed-at" style="font-size:10px;margin-left:4px">失败于 {{ formatBreakdownTime(charImageFailedAt[c.id]) }}<template v-if="charImageError[c.id]">：{{ charImageError[c.id] }}</template></span>
                  <span v-else-if="resolveCharImageDisplayTime(c)" class="dim" style="font-size:10px;margin-left:4px">定妆于 {{ formatBreakdownTime(resolveCharImageDisplayTime(c)) }}</span>
                  <button class="btn btn-sm ml-auto" :disabled="isPendingCharImage(c.id)" @click="genCharImg(c.id)">{{ isPendingCharImage(c.id) ? '生成中' : ((c.image_url || c.imageUrl) ? '重新生成' : '生成') }}</button>
                  <button
                    v-if="isDialoguePortraitMode && (c.image_url || c.imageUrl)"
                    class="btn btn-sm"
                    :disabled="isPendingDialogueExpression(c.id)"
                    @click="genDialogueExpressions(c.id, { force: true })"
                  >{{ isPendingDialogueExpression(c.id) ? '表情生成中' : (dialoguePortraitExpressionsReady(c) ? '重做表情包' : '生成表情包') }}</button>
                  <button
                    class="btn btn-sm"
                    :disabled="isPendingCharImage(c.id)"
                    @click="triggerCharImageUpload(c.id)"
                  >
                    上传
                  </button>
                  <button
                    v-if="c.image_url || c.imageUrl"
                    class="btn btn-sm"
                    @click="clearCharPortraitImage(c.id)"
                  >
                    清除
                  </button>
                  <button
                    v-if="c.image_url || c.imageUrl"
                    class="btn btn-sm"
                    :disabled="isPendingCharRecognize(c.id)"
                    @click="recognizeCharPortrait(c.id)"
                  >{{ isPendingCharRecognize(c.id) ? '识图中' : '识图' }}</button>
                  <button
                    v-if="c.image_url || c.imageUrl"
                    class="btn btn-sm"
                    :disabled="isPendingCharStyleValidate(c.id) || isBatchRunning('charStyleValidate')"
                    title="本地看图模型校验画风是否不标准"
                    @click="validateCharPortraitStyle(c.id)"
                  >{{ isPendingCharStyleValidate(c.id) ? '校验中' : '校验画风' }}</button>
                </div>
                <div
                  v-if="charStyleValidateResult[c.id]"
                  class="dim"
                  style="font-size:10px;padding:0 10px 8px;line-height:1.4"
                  :style="{ color: charStyleValidateResult[c.id].is_standard ? undefined : 'var(--danger, #ef4444)' }"
                >
                  {{ charStyleValidateResult[c.id].is_standard ? '✓' : '✗' }}
                  {{ charStyleValidateResult[c.id].summary }}
                  <template v-if="charStyleValidateResult[c.id].score != null">（{{ charStyleValidateResult[c.id].score }}分）</template>
                  <template v-if="!charStyleValidateResult[c.id].is_standard && charStyleValidateResult[c.id].issues?.length">
                    · {{ charStyleValidateResult[c.id].issues.join('；') }}
                  </template>
                </div>
              </div>
            </div>
            </template>
          </div>

          <!-- Sub: Scenes -->
          <div v-else-if="prodTab === 'scenes'" class="prod-content">
            <div v-if="isDialoguePortraitMode" class="narration-hint">
              <strong>固定场景背景：</strong>生成<strong>无人</strong>场景图（empty of people）；同 scene 镜头复用。合成时背景锁定，不做 zoompan / 运镜。
            </div>
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
            <div v-if="isMotionComicMode || isDialoguePortraitMode" class="narration-hint">
              <strong>多角色配音：</strong>请先在「角色音色」自动分配 Kokoro / Edge 音色；勾选<strong>本地配音</strong>后批量生成，系统按分镜「角色名：台词」自动选用对应音色。
            </div>
            <div v-else-if="isNarrationMode" class="narration-hint">
              <strong>配音策略：</strong>与镜头合成一致，<strong>同配图段合并为一段配音</strong>（多句旁白一次 TTS）；片头镜仍逐镜生成。可先上传 MP3 再「按文案裁剪」；裁剪按<strong>分镜旁白字数比例</strong>切分时长。
            </div>
            <div v-else-if="isLocalComicMode" class="narration-hint">
              <strong>本地配音：</strong>在上方选择 <strong>GPT-SoVITS / Voicebox / Edge TTS</strong> 引擎并点「运行模型」；按角色已分配音色生成台词。GPT-SoVITS 未安装时可改用 Voicebox 或 Edge。
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
            <div v-if="isNarrationMode || isLocalComicMode" class="local-tts-bar">
              <label v-if="isNarrationMode" class="local-tts-toggle">
                <input v-model="localTtsEnabled" type="checkbox" />
                <span>本地配音（免 API）</span>
              </label>
              <span v-else class="tag">本地配音</span>
              <BaseSelect
                v-if="isLocalComicMode || localTtsEnabled"
                :model-value="localTtsEngine"
                :options="localTtsEngineOptions"
                placeholder="选择引擎"
                style="min-width:160px"
                @update:model-value="onLocalTtsEngineChange"
              />
              <BaseSelect
                v-if="isLocalComicMode || localTtsEnabled"
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
                :placeholder="localTtsVoicePlaceholder()"
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
                v-if="localTtsEnabled && localTtsSupportsEmotionInstruct"
                :model-value="localVoiceboxInstructPreset"
                :options="voiceboxInstructOptions"
                :placeholder="localTtsEngine === 'indextts' ? '情感指令' : '风格/感情'"
                style="min-width:140px"
                @update:model-value="localVoiceboxInstructPreset = $event"
              />
              <span
                v-if="localTtsEnabled && localTtsEngine === 'voicebox' && !selectedVoiceSupportsInstruct"
                class="tag warn"
                title="感情风格仅对 CustomVoice 预设音色生效（如 Eric、Serena）；克隆音色请改用预设或选「默认（自然）」"
              >当前音色不支持感情</span>
              <input
                v-if="localTtsEnabled && localTtsSupportsEmotionInstruct && localVoiceboxInstructPreset === VOICEBOX_INSTRUCT_CUSTOM"
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
                :disabled="localTtsPreviewing || !localEdgeVoiceId || !localTtsEngineReady() || (localTtsEngine === 'voicebox' && !selectedVoiceboxVoiceReady())"
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
              <span v-if="localTtsEnabled && localTtsEngine === 'indextts' && indexttsAvailable" class="tag ok">IndexTTS2 已就绪</span>
              <span v-else-if="localTtsEnabled && localTtsEngine === 'indextts' && !indexttsAvailable" class="tag warn">IndexTTS2 未就绪</span>
              <span v-if="localTtsEnabled && localTtsEngine === 'gptsovits' && gptsovitsAvailable" class="tag ok">GPT-SoVITS 已连接</span>
              <span v-else-if="localTtsEnabled && localTtsEngine === 'gptsovits' && !gptsovitsAvailable" class="tag warn">GPT-SoVITS 未运行</span>
              <span v-if="localTtsEnabled && localTtsEngine === 'voicebox' && voiceboxAvailable" class="tag ok">Voicebox 已连接</span>
              <span v-else-if="localTtsEnabled && localTtsEngine === 'voicebox' && !voiceboxAvailable" class="tag warn">Voicebox 未运行</span>
              <span v-if="localTtsEnabled && localTtsEngine === 'edge' && localModelOnline.edgeTts" class="tag ok">Edge TTS 可用</span>
              <span v-else-if="localTtsEnabled && localTtsEngine === 'edge' && !localModelOnline.edgeTts" class="tag warn">Edge TTS 不可用</span>
              <span
                v-if="localTtsEnabled && localTtsEngine === 'voicebox' && voiceboxAvailable && !voiceboxModelLoaded"
                class="tag warn"
                title="预设 CustomVoice 首次合成需加载大模型，请单条生成并等待数分钟"
              >模型未加载·首次较慢</span>
              <span v-else-if="!localTtsEnabled" class="tag warn">将使用付费 API：{{ lockedAudioConfigLabel }}</span>
            </div>
            <div class="custom-tts-panel">
              <div class="custom-tts-head">
                <span style="font-size:13px;font-weight:600">文案试配</span>
                <span class="dim" style="font-size:11px">
                  {{ customTtsUsesLocal ? '使用上方本地音色与语速' : '使用付费 API，可选音色' }}
                </span>
              </div>
              <textarea
                v-model="customTtsText"
                class="textarea"
                rows="3"
                :placeholder="isMotionComicMode ? '输入要合成的配音台词，例如：标题：废柴少年逆袭' : '输入要合成的旁白或台词，例如：体验365个人生副本'"
              />
              <div v-if="!customTtsUsesLocal" class="custom-tts-actions">
                <BaseSelect
                  :model-value="customTtsVoiceId"
                  :options="voiceSelectOptions"
                  placeholder="选择音色"
                  searchable
                  style="min-width:220px"
                  @update:model-value="customTtsVoiceId = $event"
                />
              </div>
              <div class="custom-tts-actions">
                <button
                  class="btn btn-sm btn-primary"
                  type="button"
                  :disabled="customTtsGenerating || !customTtsText.trim()"
                  @click="generateCustomTts"
                >
                  {{ customTtsGenerating ? '生成中…' : '生成配音' }}
                </button>
                <span v-if="customTtsUsesLocal" class="tag">{{ localTtsEngineLabel }} · {{ localTtsSpeedLabel }}</span>
                <span v-else class="tag">{{ lockedAudioConfigLabel }}</span>
              </div>
              <div v-if="customTtsAudioUrl" class="custom-tts-result">
                <audio :key="customTtsPreviewSrc" :src="customTtsPreviewSrc" controls preload="metadata" class="dub-audio" />
                <a :href="customTtsDownloadSrc" :download="customTtsDownloadName" class="btn btn-sm">下载音频</a>
              </div>
            </div>
            <div class="narration-hint" style="margin-bottom:10px">
              <strong>按句配音：</strong>每句分镜单独生成配音；合成视频时同一段配图内的多句会自动拼接，字幕按各句真实时长对齐。批量生成默认 <strong>{{ ttsBatchConcurrencyLabel }}</strong>。
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ ttsEligibleCount }} 句待配音</span>
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
                <button class="btn btn-sm btn-primary" :disabled="ttsBatchActive || !ttsPendingCount" @click="batchShotTTS">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                  {{ ttsBatchActive ? '提交中…' : (pendingTtsShotIds.length ? `生成中 (${pendingTtsShotIds.length})` : '生成剩余') }}{{ !ttsBatchActive && !pendingTtsShotIds.length && ttsPendingCount ? ` (${ttsPendingCount})` : '' }}
                </button>
                <button class="btn btn-sm" :disabled="ttsBatchActive || !ttsEligibleCount" @click="batchShotTTSAll">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  全部生成
                </button>
                <button
                  v-if="ttsAssignedCount"
                  class="btn btn-sm"
                  title="清除本集全部镜头配音，删除文件并重置数据库"
                  :disabled="narrationAssetClearing || ttsBatchActive || pendingTtsShotIds.length"
                  @click="clearAllNarrationTts"
                >
                  {{ narrationAssetClearing ? '清除中…' : `清除已有配音 (${ttsAssignedCount})` }}
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

            <template v-else>
              <div v-if="dubbingUnitViews.length > DUBBING_LIST_PAGE_SIZE" class="prod-pagination">
                <button class="btn btn-sm" :disabled="dubbingListPage <= 1" @click="dubbingListPage -= 1">上一页</button>
                <span class="dim prod-page-indicator">{{ dubbingListPage }} / {{ dubbingPageCount }} · 每页 {{ DUBBING_LIST_PAGE_SIZE }}</span>
                <button class="btn btn-sm" :disabled="dubbingListPage >= dubbingPageCount" @click="dubbingListPage += 1">下一页</button>
              </div>

              <div class="dub-grid">
                <div v-for="(item, i) in dubbingPageItems" :key="item.sb.id" class="card dub-card">
                  <div class="dub-head">
                    <div class="dub-copy">
                    <div class="dub-title">
                      <span class="frame-num">{{ item.shotRangeLabel }}</span>
                      <span class="frame-badge">{{ isNarrationTitleShot(item.sb) ? '片头' : (isMotionComicMode ? '台词' : '旁白句') }}</span>
                    </div>
                    <div v-if="item.voiceHint || item.speakerLabel || item.voiceGenderLabel" class="dub-voice-row">
                      <span v-if="item.voiceGenderLabel" class="tag">{{ item.voiceGenderLabel }}</span>
                      <span v-if="item.voiceHint || item.speakerLabel" class="dim" style="font-size:11px">{{ item.voiceHint || item.speakerLabel }}</span>
                    </div>
                    <ul v-if="!isNarrationTitleShot(item.sb) && item.subtitleLines.length > 1" class="compose-subtitle-lines dub-unit-lines">
                      <li v-for="line in item.subtitleLines" :key="line.index">
                        <span class="compose-subtitle-time">#{{ line.shotNo }}</span>
                        <span class="compose-subtitle-text">{{ line.displayText }}</span>
                      </li>
                    </ul>
                    <div v-else class="dub-desc">{{ item.mergedText || '未填写文本' }}</div>
                    </div>
                    <span class="tag" :class="item.ready ? 'tag-success' : ''">{{ isPendingTtsShot(item.sb.id) ? '生成中' : item.statusLabel }}</span>
                  </div>
                <div class="dub-meta">
                  <span class="dim">{{ item.lineCount }} 句</span>
                  <span class="dim">约 {{ item.durationLabel }}</span>
                </div>
                <div class="dub-foot">
                  <audio v-if="getEffectiveTTSUrl(item.sb)" :src="'/' + getEffectiveTTSUrl(item.sb)" controls preload="none" class="dub-audio" />
                  <div v-else class="dim" style="font-size:12px">尚未生成语音文件</div>
                  <div class="ml-auto flex gap-1">
                    <button class="btn btn-sm" :disabled="isPendingTtsShot(item.sb.id)" @click="triggerShotTtsUpload(item.sb.id)">上传 MP3</button>
                    <button class="btn btn-sm" :disabled="isPendingTtsShot(item.sb.id)" @click="genShotTTS(item.sb, hasNarrationShotOwnTts(item.sb))">
                      {{ isPendingTtsShot(item.sb.id) ? '生成中' : (hasNarrationShotOwnTts(item.sb) ? '重新生成' : '生成配音') }}
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </template>
          </div>

          <!-- Sub: BGM -->
          <div v-else-if="prodTab === 'bgm'" class="prod-content">
            <div class="narration-hint">
              <strong>BGM 策略：</strong>顶部可选 <strong>BGM 模型</strong>（默认 Suno 纯器乐，需设置页配置音乐 API Key）；也可<strong>上传本地音频</strong>直接使用。BGM 库按<strong>项目</strong>共享。合成时自动与旁白混音（BGM 音量约 6%）。
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
              <div class="flex gap-2" style="flex-wrap:wrap;margin-bottom:10px;align-items:center">
                <span class="dim" style="font-size:12px">BGM 模型</span>
                <BaseSelect
                  :model-value="bgmModel"
                  :options="bgmModelOptions"
                  placeholder="选择 BGM 模型"
                  searchable
                  style="min-width:280px"
                  @update:model-value="bgmModel = $event"
                />
                <span class="tag">{{ bgmModelLabel(bgmModel) }}</span>
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
                <span v-if="bgmDescFailedAt" class="llm-failed-at" style="font-size:11px;align-self:center">失败于 {{ formatBreakdownTime(bgmDescFailedAt) }}<template v-if="bgmDescError">：{{ bgmDescError }}</template></span>
                <span v-else-if="bgmDescGeneratedAt" class="dim" style="font-size:11px;align-self:center">生成于 {{ formatBreakdownTime(bgmDescGeneratedAt) }}</span>
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
          <div v-else-if="prodTab === 'shots' && isDialoguePortraitMode" class="prod-content">
            <div class="step-empty" style="flex:1;min-height:220px">
              <div class="empty-title">整帧配图不适用</div>
              <div class="empty-desc">对话立绘不生成整帧分镜配图；请完成「定妆/表情包」与「场景背景」后，直接「镜头合成」（固定背景 + 立绘叠层）。</div>
              <div class="step-empty-actions">
                <button class="btn" @click="prodTab = 'chars'">去定妆/表情包</button>
                <button class="btn btn-primary" @click="prodTab = 'scenes'">去场景背景</button>
              </div>
            </div>
          </div>
          <div v-else-if="prodTab === 'shots' && isNarrationMode" class="prod-content">
            <div class="narration-hint narration-hint-with-actions">
              <span><strong>配图策略：</strong>① AI 对话检测配图 → ② AI 对话生成配图文案 → ③ 检查/优化 → 批量生成配图。</span>
              <button
                type="button"
                class="btn btn-sm"
                :disabled="imageDetectChatGenerating || imagePromptChatGenerating || narrationAssetClearing || !canClearNarrationImageDetect"
                title="清除检测配图结果（不保留检测分段与配图文案；旁白镜头与已有配图文件不动）"
                @click="clearAllNarrationImageDetect"
              >
                {{ narrationAssetClearing ? '清除中…' : `清除检测配图${narrationDetectClearCount ? ` (${narrationDetectClearCount})` : ''}` }}
              </button>
            </div>

            <div v-if="narrationImageBreakdownPanel" class="narration-breakdown-panel image-workflow-status" style="margin-bottom:12px">
              <div class="narration-breakdown-stats" style="margin:0">
                <span class="tag mono">
                  ① 检测配图
                  <strong>{{ narrationImageBreakdownPanel.detectCount }}</strong> 张
                  <span v-if="narrationImageBreakdownPanel.detectFailedAt" class="llm-failed-at">· 失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.detectFailedAt) }}<template v-if="narrationImageBreakdownPanel.detectError">：{{ narrationImageBreakdownPanel.detectError }}</template></span>
                  <span v-else-if="narrationImageBreakdownPanel.detectAt" class="dim">· 检测于 {{ formatBreakdownTime(narrationImageBreakdownPanel.detectAt) }}</span>
                </span>
                <span class="tag mono">
                  ② 配图文案
                  <strong>{{ narrationImageBreakdownPanel.promptCount }}</strong><template v-if="narrationImageBreakdownPanel.detectCount">/{{ narrationImageBreakdownPanel.detectCount }}</template> 条
                  <span v-if="narrationImageBreakdownPanel.promptFailedAt" class="llm-failed-at">· 失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.promptFailedAt) }}<template v-if="narrationImageBreakdownPanel.promptError">：{{ narrationImageBreakdownPanel.promptError }}</template></span>
                  <span v-else-if="narrationImageBreakdownPanel.promptAt" class="dim">· 文案于 {{ formatBreakdownTime(narrationImageBreakdownPanel.promptAt) }}</span>
                </span>
                <span v-if="narrationImageBreakdownPanel.auditFailedAt || narrationImageBreakdownPanel.auditAt" class="tag mono">
                  ③ 文案检查
                  <span v-if="narrationImageBreakdownPanel.auditFailedAt" class="llm-failed-at">· 失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.auditFailedAt) }}<template v-if="narrationImageBreakdownPanel.auditError">：{{ narrationImageBreakdownPanel.auditError }}</template></span>
                  <span v-else class="dim">· 检查于 {{ formatBreakdownTime(narrationImageBreakdownPanel.auditAt) }}</span>
                  <template v-if="narrationImageBreakdownPanel.auditShotsWithIssues != null"> · {{ narrationImageBreakdownPanel.auditShotsWithIssues }} 镜有问题</template>
                </span>
                <span v-if="narrationImageBreakdownPanel.optimizeAt" class="tag dim">优化于 {{ formatBreakdownTime(narrationImageBreakdownPanel.optimizeAt) }}</span>
                <span v-if="narrationImageBreakdownPanel.detectLabel" class="tag">{{ narrationImageBreakdownPanel.detectLabel }}</span>
                <span v-if="narrationImageBreakdownPanel.promptLabel" class="tag">{{ narrationImageBreakdownPanel.promptLabel }}</span>
                <span v-if="narrationImageBreakdownPanel.diptychCount" class="tag">含 {{ narrationImageBreakdownPanel.diptychCount }} 张两宫格</span>
                <span v-if="narrationImageBreakdownPanel.detectCount" class="tag dim">约 ¥{{ narrationImageBreakdownPanel.estImageCost }}（{{ narrationImageBreakdownPanel.priceLabel }}）</span>
              </div>
              <div v-if="narrationImageBreakdownPanel.detectCount" class="narration-breakdown-steps" style="margin-top:8px">
                <strong>下一步：</strong>
                批量生成或上传配图 → 镜头合成 → 导出
              </div>
            </div>

            <div class="image-workflow-chat-wrap">
              <div class="prod-tabs image-workflow-chat-tabs">
                <button
                  type="button"
                  class="prod-tab"
                  :class="{ active: imageWorkflowChatTab === 'detect' }"
                  :disabled="imageDetectChatGenerating || imagePromptChatGenerating"
                  @click="imageWorkflowChatTab = 'detect'"
                >
                  ① 检测配图
                  <span v-if="narrationDetectDisplayCount" class="btn-step-count">{{ narrationDetectDisplayCount }}</span>
                  <span v-if="narrationImageBreakdownPanel?.detectFailedAt" class="llm-failed-at tab-step-time">失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.detectFailedAt) }}</span>
                  <span v-else-if="narrationImageBreakdownPanel?.detectAt" class="dim tab-step-time">检测于 {{ formatBreakdownTime(narrationImageBreakdownPanel.detectAt) }}</span>
                </button>
                <button
                  type="button"
                  class="prod-tab"
                  :class="{ active: imageWorkflowChatTab === 'prompts' }"
                  :disabled="imageDetectChatGenerating || imagePromptChatGenerating"
                  @click="imageWorkflowChatTab = 'prompts'"
                >
                  ② 生成文案
                  <span v-if="narrationDetectDisplayCount" class="btn-step-count">{{ narrationPromptDisplayCount }}/{{ narrationDetectDisplayCount }}</span>
                  <span v-if="narrationImageBreakdownPanel?.promptFailedAt" class="llm-failed-at tab-step-time">失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.promptFailedAt) }}</span>
                  <span v-else-if="narrationImageBreakdownPanel?.promptAt" class="dim tab-step-time">文案于 {{ formatBreakdownTime(narrationImageBreakdownPanel.promptAt) }}</span>
                </button>
              </div>

              <!-- Detect chat -->
              <div v-if="imageWorkflowChatTab === 'detect'" class="script-chat-panel script-chat-panel-full image-workflow-chat-panel">
                <div class="script-chat-body">
                  <div class="script-chat-toolbar">
                    <span class="dim" style="font-size:12px">换镜检测 · AI 对话</span>
                    <span v-if="narrationImageBreakdownPanel?.detectFailedAt" class="llm-failed-at" style="font-size:11px">失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.detectFailedAt) }}<template v-if="narrationImageBreakdownPanel.detectError">：{{ narrationImageBreakdownPanel.detectError }}</template></span>
                    <span v-else-if="narrationImageBreakdownPanel?.detectAt" class="dim" style="font-size:11px">检测于 {{ formatBreakdownTime(narrationImageBreakdownPanel.detectAt) }}</span>
                    <button type="button" class="btn btn-sm" :disabled="imageDetectChatGenerating" @click="clearImageDetectChat">清空对话</button>
                    <button
                      type="button"
                      class="btn btn-sm"
                      :disabled="imageDetectChatGenerating || narrationAssetClearing || !canClearNarrationImageDetect"
                      title="清除检测配图结果（不保留检测分段与配图文案；旁白镜头与已有配图文件不动）"
                      @click="clearAllNarrationImageDetect"
                    >
                      {{ narrationAssetClearing ? '清除中…' : `清除检测配图${narrationDetectClearCount ? ` (${narrationDetectClearCount})` : ''}` }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-primary"
                      :disabled="imageDetectChatGenerating || !sbs.length"
                      @click="sendImageDetectChat('run')"
                    >
                      <Loader2 v-if="imageDetectChatGenerating" :size="11" class="animate-spin" />
                      执行检测
                    </button>
                  </div>
                  <div ref="imageDetectChatScrollRef" class="script-chat-messages">
                    <div
                      v-for="(msg, idx) in imageDetectChatMessages"
                      :key="'detect-' + idx"
                      :class="['script-chat-msg', msg.role === 'user' ? 'is-user' : 'is-assistant']"
                    >
                      <span class="script-chat-msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</span>
                      <div class="script-chat-msg-text">
                        <template v-if="msg.role === 'assistant' && imageDetectChatGenerating && idx === imageDetectChatMessages.length - 1 && !msg.content && !msg.thinking && !msg.statusText">
                          <Loader2 :size="14" class="animate-spin" style="vertical-align:-2px;margin-right:6px" />
                          <span class="dim">正在生成…</span>
                        </template>
                        <template v-else>
                          <div v-if="msg.statusText" class="script-chat-status">{{ msg.statusText }}</div>
                          <div v-if="msg.thinking" class="script-chat-thinking">
                            <div class="script-chat-thinking-label">思考过程</div>
                            <div class="script-chat-thinking-body">{{ msg.thinking }}</div>
                          </div>
                          <div v-if="msg.content" class="script-chat-reply">{{ msg.content }}</div>
                          <div v-if="msg.role === 'assistant' && msg.failedAt" class="llm-failed-at" style="font-size:11px;margin-top:4px">失败于 {{ formatBreakdownTime(msg.failedAt) }}<template v-if="msg.errorMessage">：{{ msg.errorMessage }}</template></div>
                          <div v-else-if="msg.role === 'assistant' && msg.generatedAt" class="dim llm-generated-at" style="font-size:11px;margin-top:4px">生成于 {{ formatBreakdownTime(msg.generatedAt) }}</div>
                        </template>
                      </div>
                    </div>
                  </div>
                  <div class="script-chat-hints">
                    <button
                      v-for="hint in imageDetectChatQuickHints"
                      :key="hint"
                      type="button"
                      class="btn btn-sm"
                      :disabled="imageDetectChatGenerating"
                      @click="imageDetectChatInput = hint"
                    >
                      {{ hint }}
                    </button>
                  </div>
                  <div class="script-chat-compose">
                    <textarea
                      v-model="imageDetectChatInput"
                      class="script-chat-input"
                      rows="2"
                      placeholder="讨论配图策略，或输入「开始检测」…"
                      :disabled="imageDetectChatGenerating"
                      @keydown.enter.exact.prevent="sendImageDetectChat()"
                    />
                    <button
                      type="button"
                      class="btn btn-primary script-chat-send"
                      :disabled="imageDetectChatGenerating || !imageDetectChatInput.trim()"
                      @click="sendImageDetectChat()"
                    >
                      发送
                    </button>
                  </div>
                </div>
              </div>

              <!-- Prompt chat -->
              <div v-else class="script-chat-panel script-chat-panel-full image-workflow-chat-panel">
                <div class="script-chat-body">
                  <div class="script-chat-toolbar">
                    <span class="dim" style="font-size:12px">配图文案 · AI 对话</span>
                    <span v-if="narrationImageBreakdownPanel?.promptFailedAt" class="llm-failed-at" style="font-size:11px">失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.promptFailedAt) }}<template v-if="narrationImageBreakdownPanel.promptError">：{{ narrationImageBreakdownPanel.promptError }}</template></span>
                    <span v-else-if="narrationImageBreakdownPanel?.promptAt" class="dim" style="font-size:11px">文案于 {{ formatBreakdownTime(narrationImageBreakdownPanel.promptAt) }}</span>
                    <button type="button" class="btn btn-sm" :disabled="imagePromptChatGenerating" @click="clearImagePromptChat">清空对话</button>
                    <button
                      type="button"
                      class="btn btn-sm"
                      :disabled="imagePromptChatGenerating || !narrationDetectDisplayCount"
                      @click="sendImagePromptChat('retry_missing')"
                    >
                      补全缺失 ({{ narrationMissingPromptCount }})
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-primary"
                      :disabled="imagePromptChatGenerating || !narrationDetectDisplayCount"
                      @click="sendImagePromptChat('run')"
                    >
                      <Loader2 v-if="imagePromptChatGenerating" :size="11" class="animate-spin" />
                      执行生成
                    </button>
                  </div>
                  <div ref="imagePromptChatScrollRef" class="script-chat-messages">
                    <div
                      v-for="(msg, idx) in imagePromptChatMessages"
                      :key="'prompt-' + idx"
                      :class="['script-chat-msg', msg.role === 'user' ? 'is-user' : 'is-assistant']"
                    >
                      <span class="script-chat-msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</span>
                      <div class="script-chat-msg-text">
                        <template v-if="msg.role === 'assistant' && imagePromptChatGenerating && idx === imagePromptChatMessages.length - 1 && !msg.content && !msg.thinking && !msg.statusText">
                          <Loader2 :size="14" class="animate-spin" style="vertical-align:-2px;margin-right:6px" />
                          <span class="dim">{{ narrationImageBreakdownProgressMessage || '正在生成…' }}</span>
                        </template>
                        <template v-else>
                          <div v-if="msg.statusText" class="script-chat-status">{{ msg.statusText }}</div>
                          <div v-if="msg.thinking" class="script-chat-thinking">
                            <div class="script-chat-thinking-label">思考过程</div>
                            <div class="script-chat-thinking-body">{{ msg.thinking }}</div>
                          </div>
                          <div v-if="msg.content" class="script-chat-reply">{{ msg.content }}</div>
                          <div v-if="msg.role === 'assistant' && msg.failedAt" class="llm-failed-at" style="font-size:11px;margin-top:4px">失败于 {{ formatBreakdownTime(msg.failedAt) }}<template v-if="msg.errorMessage">：{{ msg.errorMessage }}</template></div>
                          <div v-else-if="msg.role === 'assistant' && msg.generatedAt" class="dim llm-generated-at" style="font-size:11px;margin-top:4px">生成于 {{ formatBreakdownTime(msg.generatedAt) }}</div>
                        </template>
                      </div>
                    </div>
                  </div>
                  <div class="script-chat-hints">
                    <button
                      v-for="hint in imagePromptChatQuickHints"
                      :key="hint"
                      type="button"
                      class="btn btn-sm"
                      :disabled="imagePromptChatGenerating"
                      @click="imagePromptChatInput = hint"
                    >
                      {{ hint }}
                    </button>
                  </div>
                  <div class="script-chat-compose">
                    <textarea
                      v-model="imagePromptChatInput"
                      class="script-chat-input"
                      rows="2"
                      placeholder="讨论或调整配图文案，或输入「开始生成文案」…"
                      :disabled="imagePromptChatGenerating"
                      @keydown.enter.exact.prevent="sendImagePromptChat()"
                    />
                    <button
                      type="button"
                      class="btn btn-primary script-chat-send"
                      :disabled="imagePromptChatGenerating || !imagePromptChatInput.trim()"
                      @click="sendImagePromptChat()"
                    >
                      发送
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="image-workflow-config">
              <div class="prod-image-model-bar detect-batch-config">
                <span class="dim" style="font-size:12px">检测分批</span>
                <label class="detect-batch-field">
                  超过
                  <input
                    v-model.number="imageDetectBatchThreshold"
                    type="number"
                    min="0"
                    max="500"
                    step="1"
                    class="detect-batch-input"
                    title="镜头数超过该值时分批检测；0 表示始终单次调用"
                  />
                  镜
                </label>
                <label class="detect-batch-field">
                  每批
                  <input
                    v-model.number="imageDetectBatchSize"
                    type="number"
                    min="10"
                    max="200"
                    step="1"
                    class="detect-batch-input"
                    title="分批时每批最多覆盖的镜头数"
                  />
                  镜
                </label>
                <span class="dim" style="font-size:11px">0=不分批</span>
                <span class="dim" style="font-size:12px;margin-left:12px">配图文案</span>
                <label class="detect-batch-field">
                  每批
                  <input
                    v-model.number="imagePromptBatchSize"
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    class="detect-batch-input"
                    title="生成配图文案时每批最多段落数"
                  />
                  段
                </label>
                <BaseSelect
                  v-if="narrationPromptTestBatchOptions.length > 1"
                  :options="narrationPromptTestBatchOptions"
                  :model-value="narrationPromptTestBatchIndex"
                  placeholder="测试段批"
                  style="min-width:88px"
                  :title="`按每批 ${normalizedImagePromptBatchSize()} 段划分；测试仅生成所选段批`"
                  @update:model-value="narrationPromptTestBatchIndex = Number($event) || 1"
                />
                <button
                  class="btn btn-sm"
                  :disabled="narrationImageBreaking || !narrationPromptTestCanRun"
                  :title="narrationPromptTestPendingTitle"
                  @click="doNarrationImagePromptsTest"
                >
                  <Loader2 v-if="narrationImageBreaking && narrationImagePromptTestActive" :size="11" class="animate-spin" />
                  测试生成
                </button>
                <button
                  class="btn btn-sm"
                  :disabled="narrationImageBreaking || narrationAssetClearing || !canClearNarrationImageDetect"
                  title="清除检测配图结果（不保留检测分段与配图文案；旁白镜头与已有配图文件不动）"
                  @click="clearAllNarrationImageDetect"
                >
                  {{ narrationAssetClearing ? '清除中…' : `清除检测配图${narrationDetectClearCount ? ` (${narrationDetectClearCount})` : ''}` }}
                </button>
                <button
                  class="btn btn-sm"
                  :disabled="narrationImageBreaking || narrationAssetClearing || !narrationPromptLiveCount"
                  title="清除本集全部配图锚点的配图文案（保留检测分段与 scene_content，不删配图文件）"
                  @click="clearAllNarrationImagePrompts"
                >
                  {{ narrationAssetClearing ? '清除中…' : `清除文案 (${narrationPromptLiveCount})` }}
                </button>
              </div>
              <div v-if="!showImageStylePicker" class="prod-image-model-bar">
                <span class="dim" style="font-size:12px">画风风格</span>
                <BaseSelect
                  :model-value="narrationImageStyle"
                  :options="narrationImageStyleOptions"
                  placeholder="选择配图画风"
                  searchable
                  style="min-width:120px"
                  title="与定妆参考联动；切换后请重新生成定妆/配图"
                  @update:model-value="onNarrationImageStyleChange"
                />
                <button
                  class="btn btn-sm"
                  :disabled="narrationImageAuditing || !narrationNeedImageCount"
                  title="本地规则扫描血腥/服装/格式等问题，不修改"
                  @click="doNarrationImageAudit"
                >
                  <Loader2 v-if="narrationImageAuditing" :size="11" class="animate-spin" />
                  ③ 检查文案
                </button>
                <span v-if="narrationImageBreakdownPanel?.auditFailedAt" class="llm-failed-at" style="font-size:11px">失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.auditFailedAt) }}<template v-if="narrationImageBreakdownPanel.auditError">：{{ narrationImageBreakdownPanel.auditError }}</template></span>
                <span v-else-if="narrationImageBreakdownPanel?.auditAt" class="dim" style="font-size:11px">检查于 {{ formatBreakdownTime(narrationImageBreakdownPanel.auditAt) }}</span>
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
              </div>
            </div>

            <div v-if="narrationImageAuditPanel" class="narration-breakdown-panel" style="margin-bottom:12px">
              <div class="narration-breakdown-head">
                <div>
                  <strong>配图文案检查</strong>
                  <span class="dim" style="font-size:11px;margin-left:8px">
                    {{ narrationImageAuditPanel.shotsWithIssues }}/{{ narrationImageAuditPanel.total }} 镜有问题 · 共 {{ narrationImageAuditPanel.issueCount }} 项
                  </span>
                  <span v-if="narrationImageBreakdownPanel?.auditFailedAt" class="llm-failed-at" style="font-size:11px;margin-left:8px">失败于 {{ formatBreakdownTime(narrationImageBreakdownPanel.auditFailedAt) }}</span>
                  <span v-else-if="narrationImageBreakdownPanel?.auditAt" class="dim" style="font-size:11px;margin-left:8px">检查于 {{ formatBreakdownTime(narrationImageBreakdownPanel.auditAt) }}</span>
                  <span v-if="narrationImageBreakdownPanel?.optimizeAt" class="dim" style="font-size:11px;margin-left:8px">优化于 {{ formatBreakdownTime(narrationImageBreakdownPanel.optimizeAt) }}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <button
                    class="btn btn-sm"
                    :disabled="narrationImageOptimizing || !narrationImageAuditPanel.shotsWithIssues"
                    @click="doNarrationImageOptimizeAll"
                  >
                    {{ narrationImageOptimizing ? '优化中…' : '全部应用优化' }}
                  </button>
                  <button
                    class="btn btn-sm"
                    :disabled="narrationImageRestoring || !narrationImageAuditRestorableCount"
                    @click="doNarrationImageRestoreAll"
                    title="还原为第二步 LLM 原文"
                  >
                    {{ narrationImageRestoring ? '还原中…' : '全部还原 LLM 原文' }}
                  </button>
                </div>
              </div>
              <div class="narration-audit-list" style="max-height:240px;overflow:auto;margin-top:8px">
                <div
                  v-for="item in narrationImageAuditPanel.items.filter(i => i.issues?.length)"
                  :key="item.storyboard_id"
                  class="narration-audit-item"
                  style="padding:8px 0;border-bottom:1px solid var(--border-subtle, #333)"
                >
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <strong class="mono">#{{ String(item.storyboard_number).padStart(2, '0') }}</strong>
                    <span v-for="issue in item.issues" :key="issue.code" class="tag" :class="issue.severity === 'error' ? 'tag-danger' : ''">{{ issue.label }}</span>
                    <button
                      v-if="item.can_restore"
                      class="btn btn-sm"
                      :disabled="narrationImageRestoring"
                      @click="doNarrationImageRestoreOne(item.storyboard_id)"
                    >
                      还原 LLM 原文
                    </button>
                    <button
                      class="btn btn-sm ml-auto"
                      :disabled="narrationImageOptimizing"
                      @click="doNarrationImageOptimizeOne(item.storyboard_id)"
                    >
                      应用优化
                    </button>
                  </div>
                </div>
                <p v-if="!narrationImageAuditPanel.shotsWithIssues" class="dim" style="font-size:12px;margin:8px 0">未发现明显问题</p>
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
              <span
                v-if="showNarrationImageCharFilter && narrationImageCharFilterActive"
                class="tag tag-accent"
                :title="`当前按角色筛选：${narrationImageCharFilterLabel}`"
              >
                角色筛选 · {{ narrationImageCharFilterLabel }}
              </span>
              <div class="ml-auto flex gap-1 items-center flex-wrap">
                <button
                  v-if="canClearNarrationImageDetect"
                  class="btn btn-sm"
                  :disabled="narrationAssetClearing || pendingNarrationShotIds.length"
                  title="清除检测配图结果，便于重新检测"
                  @click="clearAllNarrationImageDetect"
                >
                  {{ narrationAssetClearing ? '清除中…' : `清除检测配图${narrationDetectClearCount ? ` (${narrationDetectClearCount})` : ''}` }}
                </button>
                <span class="dim shot-folder-tool-hint" title="按修改时间重命名为 1.png、2.png… 后可直接文件夹上传">本地重命名：backend/scripts/准备配图文件夹.bat</span>
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
                  v-if="narrationOwnImageCount"
                  class="btn btn-sm"
                  :title="narrationImageCharFilterActive
                    ? `清除「${narrationImageCharFilterLabel}」相关配图（含 AI 生成与上传）`
                    : '清除本集全部配图（含 AI 生成与上传），删除文件并重置数据库'"
                  :disabled="narrationAssetClearing || pendingNarrationShotIds.length"
                  @click="clearAllNarrationImages"
                >
                  {{ narrationAssetClearing
                    ? '清除中…'
                    : (narrationImageCharFilterActive
                      ? `清除配图·${narrationImageCharFilterLabel} (${narrationOwnImageCount})`
                      : `清除已有配图 (${narrationOwnImageCount})`) }}
                </button>
                <button
                  v-if="narrationImagesRegenCount"
                  class="btn btn-sm"
                  :title="narrationImageCharFilterActive
                    ? `重新生成「${narrationImageCharFilterLabel}」相关已有配图`
                    : '重新生成本集已有配图（覆盖原图）'"
                  :disabled="isBatchRunning('narrationImages') || narrationAssetClearing || pendingNarrationShotIds.length"
                  @click="regenerateNarrationShotImagesForFilter"
                >
                  {{ isBatchRunning('narrationImages')
                    ? '生成中…'
                    : (narrationImageCharFilterActive
                      ? `重新生成·${narrationImageCharFilterLabel} (${narrationImagesRegenCount})`
                      : `重新生成 (${narrationImagesRegenCount})`) }}
                </button>
                <button class="btn btn-sm" :disabled="!narrationNeedImageCount" @click="copyNarrationShotPromptsBatch">
                  {{ narrationCopyBatchOptions.length > 1 ? `复制描述词 (${narrationCopyBatchOptions.find(o => o.value === narrationCopyBatchIndex)?.label || '#01-#10'})` : `一键复制描述词（${narrationNeedImageCount}）` }}
                </button>
                <button
                  v-if="showFluxEnglishPrompt && !showFluxTranslateRemaining"
                  class="btn btn-sm"
                  :disabled="!canUseFluxEnglishPrompt || !narrationFluxTranslatePendingCount || fluxPromptTranslating || fluxPromptClearing"
                  :title="fluxEnglishPromptHint || '配图文案只出中文；需要 Flux/InstantID 英文时再点此按钮翻译（Kolors 中文直出无需此步）'"
                  @click="translateAllNarrationFluxPrompts"
                >
                  {{ fluxPromptTranslating ? '翻译中…' : `翻译英文 (${narrationFluxTranslatePendingCount})` }}
                </button>
                <button
                  v-if="showFluxTranslateRemaining"
                  class="btn btn-sm"
                  :disabled="!canUseFluxEnglishPrompt || !narrationFluxTranslatePendingCount || fluxPromptTranslating || fluxPromptClearing"
                  :title="fluxEnglishPromptHint || '补译尚未完成或需重译的镜头'"
                  @click="translateRemainingNarrationFluxPrompts"
                >
                  {{ fluxPromptTranslating ? '翻译中…' : `补译剩余 (${narrationFluxTranslatePendingCount})` }}
                </button>
                <button
                  v-if="showFluxEnglishPrompt && narrationFluxEnglishCount"
                  class="btn btn-sm"
                  :disabled="!canUseFluxEnglishPrompt || fluxPromptTranslating || fluxPromptClearing"
                  :title="fluxEnglishPromptHint || '清除本集全部 Flux 英文（保留中文），便于重新翻译'"
                  @click="clearAllNarrationFluxPrompts"
                >
                  {{ fluxPromptClearing ? '清除中…' : `清除英文 (${narrationFluxEnglishCount})` }}
                </button>
                <div
                  v-if="fluxPromptTranslating && fluxPromptTranslateProgress.total"
                  class="progress-wrap flux-translate-progress"
                  style="width:min(280px,100%);margin-top:4px"
                >
                  <div class="progress-head">
                    <span class="progress-label">
                      Flux 英文翻译 {{ fluxPromptTranslateProgress.done }}/{{ fluxPromptTranslateProgress.total }}
                      <template v-if="fluxPromptTranslateProgress.currentNo">
                        · 正在译 #{{ fluxPromptTranslateProgress.currentNo }}
                      </template>
                    </span>
                    <span class="progress-val">{{ fluxPromptTranslateProgressPercent }}%</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" :style="{ width: fluxPromptTranslateProgressPercent + '%' }"></div>
                  </div>
                </div>
                <button class="btn btn-sm" :disabled="!narrationNeedImageCount || shotImageUploadProcessing" @click="triggerAllShotImageUpload">
                  {{ shotImageUploadProcessing ? `上传中 ${shotImageUploadProgress.done}/${shotImageUploadProgress.total}` : `一键上传全部（${narrationNeedImageCount}）` }}
                </button>
                <button
                  class="btn btn-sm"
                  :disabled="!narrationNeedImageCount || shotImageUploadProcessing"
                  title="文件夹上传：1.png→第1镜、2.png→第2镜…（可用 backend/scripts/准备配图文件夹.bat 按修改时间重命名）"
                  @click="triggerShotFolderUpload"
                >
                  {{ shotImageUploadProcessing ? `上传中 ${shotImageUploadProgress.done}/${shotImageUploadProgress.total}` : '文件夹上传' }}
                </button>
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
                  class="btn btn-sm"
                  :disabled="isBatchRunning('shotImageValidate') || !shotImgCount"
                  title="用本地看图模型校验已有配图是否合适（旁白匹配+画风）"
                  @click="batchScanNarrationShotImages"
                >
                  {{ isBatchRunning('shotImageValidate') ? '校验中…' : `一键校验配图${shotImgCount ? ` (${shotImgCount})` : ''}` }}
                </button>
                <button
                  v-if="Object.keys(shotScanResult || {}).length"
                  class="btn btn-sm"
                  title="打开已保存的配图校验结果面板"
                  @click="rebuildShotImageValidatePanel"
                >
                  查看校验记录 ({{ Object.keys(shotScanResult || {}).length }})
                </button>
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="isBatchRunning('narrationImages') || !narrationImagesPendingCount"
                  :title="narrationImagesPendingTitle"
                  @click="batchNarrationShotImages"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {{ narrationImageCharFilterActive
                    ? `生成剩余·${narrationImageCharFilterLabel}${narrationImagesPendingCount ? ` (${narrationImagesPendingCount})` : ''}`
                    : `生成剩余${narrationImagesPendingCount ? ` (${narrationImagesPendingCount})` : ''}` }}
                </button>
              </div>
            </div>

            <div
              v-if="shotImageValidatePanel"
              id="shot-image-validate-panel"
              class="narration-breakdown-panel"
              style="margin-bottom:12px"
            >
              <div class="narration-breakdown-head">
                <div>
                  <strong>配图校验结果</strong>
                  <span class="dim" style="font-size:11px;margin-left:8px">
                    合适 {{ shotImageValidatePanel.suitable }} / 不合适 {{ shotImageValidatePanel.unsuitable }} · 共 {{ shotImageValidatePanel.total }} 镜
                  </span>
                  <span v-if="shotImageValidatePanel.at" class="dim" style="font-size:11px;margin-left:8px">
                    校验于 {{ formatBreakdownTime(shotImageValidatePanel.at) }}
                  </span>
                </div>
                <button class="btn btn-sm" @click="clearShotImageValidatePanel">关闭</button>
              </div>
              <div class="narration-audit-list" style="max-height:280px;overflow:auto;margin-top:8px">
                <div
                  v-for="item in shotImageValidatePanel.items"
                  :key="item.storyboard_id"
                  class="narration-audit-item"
                  style="padding:8px 0;border-bottom:1px solid var(--border-subtle, #333)"
                >
                  <div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between">
                    <div style="min-width:0;flex:1">
                      <strong :style="{ color: item.is_suitable ? undefined : 'var(--danger, #ef4444)' }">
                        #{{ item.shot_no }} {{ item.is_suitable ? '合适' : '不合适' }}
                      </strong>
                      <span class="dim" style="font-size:11px;margin-left:6px">{{ item.match_score ?? '—' }}分</span>
                      <div style="font-size:12px;margin-top:4px">{{ item.summary }}</div>
                      <div v-if="item.issues?.length" style="font-size:11px;color:var(--danger, #ef4444);margin-top:4px">
                        问题：{{ item.issues.join('；') }}
                      </div>
                      <div v-if="item.suggestions?.length" class="dim" style="font-size:11px;margin-top:2px">
                        建议：{{ item.suggestions.join('；') }}
                      </div>
                    </div>
                    <button class="btn btn-sm" @click="jumpToShotFromValidate(item.storyboard_id)">查看</button>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="showNarrationImageCharFilter"
              class="prod-section-bar"
              style="margin-top:-4px;margin-bottom:8px"
            >
              <span class="dim" style="font-size:12px">按角色筛选</span>
              <div class="role-pills" style="flex:1;min-width:0">
                <button
                  type="button"
                  class="role-pill role-pill--plain"
                  :class="{ active: !narrationImageCharFilterActive }"
                  title="对全部角色生效（清除/生成剩余/重新生成）"
                  @click="clearNarrationImageCharFilter"
                >
                  全部
                </button>
                <button
                  v-for="c in visualChars"
                  :key="c.id"
                  type="button"
                  class="role-pill"
                  :class="{ active: narrationImageCharFilterIds.includes(c.id) }"
                  :title="`筛选含「${formatCharacterDisplayName(c)}」的分镜；可多选`"
                  @click="toggleNarrationImageCharFilter(c.id)"
                >
                  <img
                    v-if="charPortraitImageSrc(c)"
                    :src="charPortraitImageSrc(c)"
                    class="role-pill-avatar"
                    alt=""
                  />
                  <span v-else class="role-pill-avatar is-fallback">{{ c.name?.[0] || '?' }}</span>
                  <span class="role-pill-label">{{ formatCharacterDisplayName(c) }}</span>
                </button>
              </div>
            </div>

            <div v-if="sbs.length > NARRATION_SHOT_PAGE_SIZE" class="prod-pagination">
              <select v-model="shotsListFilter" class="input input-sm prod-page-filter">
                <option value="all">全部 {{ sbs.length }}</option>
                <option value="pending">待生成 {{ narrationImagesPendingCount }}</option>
                <option value="processing">生成中 {{ pendingNarrationShotIds.length }}</option>
                <option value="need_own">需配图 {{ narrationNeedImageCount }}</option>
                <option value="done">已有图 {{ shotsDoneCount }}</option>
                <option value="inherit">沿用 {{ sbs.length - narrationNeedImageCount }}</option>
              </select>
              <button class="btn btn-sm" :disabled="shotsListPage <= 1" @click="shotsListPage -= 1">上一页</button>
              <span class="dim prod-page-indicator">{{ shotsListPage }} / {{ shotsPageCount }} · 每页 {{ NARRATION_SHOT_PAGE_SIZE }}</span>
              <button class="btn btn-sm" :disabled="shotsListPage >= shotsPageCount" @click="shotsListPage += 1">下一页</button>
            </div>
            <div class="prod-grid">
              <div
                v-for="sb in shotsPageItems"
                :id="`shot-card-${sb.id}`"
                :key="sb.id"
                class="card prod-card"
                :class="{ 'is-selected-shot': selectedSb?.id === sb.id }"
              >
                <div class="prod-cover">
                  <img
                    v-if="getNarrationDisplayImage(sb)"
                    :key="narrationShotImageSrc(sb)"
                    :src="narrationShotImageSrc(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer(narrationShotImageSrc(sb), `镜头 #${getNarrationShotDisplayNo(sb)} 配图`)"
                  />
                  <div
                    v-if="isPendingNarrationShot(sb.id) || getNarrationShotImageJob(sb.id)"
                    class="prod-cover-empty prod-cover-generating"
                    :class="{ 'is-overlay': !!getNarrationDisplayImage(sb) }"
                  >
                    <Loader2 :size="20" class="animate-spin" style="color:var(--accent)" />
                    <template v-if="getNarrationShotImageJob(sb.id)">
                      <div class="prod-cover-progress-track">
                        <div
                          class="prod-cover-progress-fill"
                          :style="{ width: (getNarrationShotImageJob(sb.id).percent || 8) + '%' }"
                        />
                      </div>
                      <span class="prod-cover-progress-label">
                        {{ getNarrationShotImageJob(sb.id).percent || 0 }}% · {{ getNarrationShotImageJob(sb.id).message || '生图中' }}
                      </span>
                    </template>
                    <span v-else class="dim" style="font-size:11px">生图中…</span>
                  </div>
                  <div v-else-if="!getNarrationDisplayImage(sb)" class="prod-cover-empty">
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
                  <div class="prod-narration-label dim">旁白</div>
                  <div class="prod-desc prod-narration-text">{{ getNarrationShotDisplayText(sb, sbs) || '—' }}</div>
                  <div class="prod-meta-line dim" style="font-size:11px">{{ narrationShotImageLabel(sb) }}</div>
                  <div
                    v-if="getNarrationShotImageJob(sb.id)?.status === 'failed'"
                    class="prod-shot-image-error llm-failed-at"
                    style="font-size:11px"
                  >
                    {{ getNarrationShotImageJob(sb.id).message }}<template v-if="getNarrationShotImageJob(sb.id).error">：{{ getNarrationShotImageJob(sb.id).error }}</template>
                  </div>
                  <label v-if="narrationShotNeedsOwnImage(sb)" class="narration-shot-prompt-field" @click.stop>
                    <div class="narration-shot-prompt-duo">
                      <div class="narration-shot-prompt-col">
                        <div class="narration-shot-prompt-head">
                          <span class="dim">中文配图文案</span>
                          <button
                            type="button"
                            class="btn btn-sm narration-shot-prompt-copy"
                            :disabled="!getNarrationImagePromptText(sb)"
                            @click="copyNarrationShotPrompt(sb)"
                          >
                            复制中文
                          </button>
                        </div>
                        <textarea
                          class="textarea narration-shot-prompt-textarea"
                          rows="4"
                          :value="getNarrationImagePromptText(sb)"
                          placeholder="中文配图文案…"
                          @blur="updateNarrationImagePrompt(sb, $event.target.value)"
                        />
                      </div>
                      <div v-if="showFluxEnglishPrompt" class="narration-shot-prompt-col narration-shot-prompt-col--en">
                        <div class="narration-shot-prompt-head">
                          <span class="dim">Flux 英文（生图用）</span>
                          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
                            <button
                              type="button"
                              class="btn btn-sm narration-shot-prompt-copy"
                              :disabled="!canUseFluxEnglishPrompt || !getNarrationImagePromptText(sb) || fluxPromptTranslatingShotIds.includes(sb.id)"
                              :title="fluxEnglishPromptHint || '翻译为 Flux 英文'"
                              @click="translateNarrationShotFluxPrompt(sb)"
                            >
                              {{ fluxPromptTranslatingShotIds.includes(sb.id) ? '翻译中' : (getNarrationFluxPromptEn(sb) ? '重译' : '翻译') }}
                            </button>
                            <button
                              type="button"
                              class="btn btn-sm narration-shot-prompt-copy"
                              :disabled="!getNarrationFluxPromptEn(sb)"
                              @click="copyNarrationFluxPromptEn(sb)"
                            >
                              复制英文
                            </button>
                          </div>
                        </div>
                        <textarea
                          class="textarea narration-shot-prompt-textarea"
                          rows="4"
                          :value="getNarrationFluxPromptEn(sb)"
                          placeholder="点击「翻译」生成英文；ComfyUI 生图使用此文本，不会覆盖左侧中文"
                          @blur="updateNarrationFluxPromptEn(sb, $event.target.value)"
                        />
                      </div>
                    </div>
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
                    v-if="hasNarrationShotImage(sb)"
                    class="btn btn-sm"
                    :disabled="pendingShotScanIds.includes(sb.id) || isBatchRunning('shotImageValidate')"
                    title="用本地看图模型校验配图是否合适（旁白/文案匹配 + 画风）"
                    @click="scanNarrationShotImage(sb)"
                  >
                    {{ pendingShotScanIds.includes(sb.id) ? '校验中' : '校验配图' }}
                  </button>
                  <span v-if="shotScanFailedAt[sb.id]" class="llm-failed-at" style="font-size:10px">失败于 {{ formatBreakdownTime(shotScanFailedAt[sb.id]) }}<template v-if="shotScanError[sb.id]">：{{ shotScanError[sb.id] }}</template></span>
                  <span v-else-if="shotScanGeneratedAt[sb.id]" class="dim" style="font-size:10px">校验于 {{ formatBreakdownTime(shotScanGeneratedAt[sb.id]) }}</span>
                  <button
                    class="btn btn-sm"
                    :disabled="!findPrevNarrationShotWithImage(sb)"
                    title="复制上一镜的配图到本镜"
                    @click="reuseNarrationShotImage(sb)"
                  >
                    复用上一镜
                  </button>
                  <button
                    class="btn btn-sm"
                    :disabled="!findNextNarrationShotWithImage(sb)"
                    title="复制下一镜的配图到本镜"
                    @click="reuseNextNarrationShotImage(sb)"
                  >
                    复用下一镜
                  </button>
                  <button
                    v-if="narrationShotExplicitCopy(sb)"
                    class="btn btn-sm"
                    @click="clearNarrationShotImage(sb)"
                  >
                    取消复用
                  </button>
                </div>
                <div
                  v-if="shotScanResult[sb.id]"
                  class="shot-scan-result"
                  :class="{ bad: !shotScanResult[sb.id].is_suitable }"
                >
                  <strong>{{ shotScanResult[sb.id].is_suitable ? '✓ 配图合适' : '✗ 配图不合适' }}</strong>
                  <span class="dim">（{{ shotScanResult[sb.id].match_score ?? '—' }}分）</span>
                  <div>{{ shotScanResult[sb.id].summary }}</div>
                  <div v-if="shotScanResult[sb.id].issues?.length" class="shot-scan-issues">
                    问题：{{ shotScanResult[sb.id].issues.join('；') }}
                  </div>
                  <div v-if="shotScanResult[sb.id].suggestions?.length" class="dim">
                    建议：{{ shotScanResult[sb.id].suggestions.join('；') }}
                  </div>
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

            <div v-if="sbs.length > PROD_SHOT_PAGE_SIZE" class="prod-pagination">
              <select v-model="shotsListFilter" class="input input-sm prod-page-filter">
                <option value="all">全部 {{ sbs.length }}</option>
                <option value="pending">待生成 {{ shotsPendingCount }}</option>
                <option value="processing">生成中 {{ pendingShotFrameKeys.length }}</option>
                <option value="done">已有帧 {{ shotsDoneCount }}</option>
              </select>
              <button class="btn btn-sm" :disabled="shotsListPage <= 1" @click="shotsListPage -= 1">上一页</button>
              <span class="dim prod-page-indicator">{{ shotsListPage }} / {{ shotsPageCount }} · 每页 {{ PROD_SHOT_PAGE_SIZE }}</span>
              <button class="btn btn-sm" :disabled="shotsListPage >= shotsPageCount" @click="shotsListPage += 1">下一页</button>
            </div>

            <div class="frame-scroll">
              <div class="frame-grid">
                <div v-for="sb in shotsPageItems" :key="sb.id"
                  :class="['frame-row', 'card', { active: selectedSb?.id === sb.id }]"
                  @click="selectedSb = sb">
                  <!-- Info: number + type + desc -->
                  <div class="frame-info">
                    <div class="frame-top">
                      <span class="frame-num">#{{ String(storyboardDisplayIndex(sb)).padStart(2,'0') }}</span>
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
                          @click.stop="openImageViewer('/' + getFirstFrame(sb), `镜头 #${String(storyboardDisplayIndex(sb)).padStart(2, '0')} 首帧`)"
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
                          @click.stop="openImageViewer('/' + getLastFrame(sb), `镜头 #${String(storyboardDisplayIndex(sb)).padStart(2, '0')} 尾帧`)"
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
          <div v-else-if="prodTab === 'videos'" class="prod-content">
            <div v-if="isDialoguePortraitMode" class="step-empty" style="flex:1;min-height:220px">
              <div class="empty-title">本地视频 / 运镜不适用</div>
              <div class="empty-desc">对话立绘不做 Wan I2V、Glide 与 Ken Burns；合成时背景像素锁定，仅切换立绘表情与左右/居中布局。</div>
              <div class="step-empty-actions">
                <button class="btn btn-primary" @click="prodTab = 'compose'">去镜头合成</button>
              </div>
            </div>
            <template v-else>
            <div class="narration-hint">
              <template v-if="isNarrationMode || isLocalComicMode">
                <strong>默认 Wan I2V</strong>：人物可动（较慢）。也可选「动图风」做轻微推镜（秒级）。
                <strong>有声音需先「生成配音」</strong>。不生成也可直接「镜头合成」。
              </template>
              <template v-else>
                <strong>{{ isMotionComicMode ? '漫画解说可跳过本步：' : '可跳过本步：' }}</strong>若每镜已有「配图 + 配音」，无需 AI 视频，直接去「镜头合成」即可。
              </template>
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">
                {{ isNarrationMode ? `${videoGenTargets.length} 个合成单元` : `${sbs.length} 个镜头` }}
              </span>
              <span class="tag mono">{{ videosDoneCount }}/{{ videoGenTargets.length || 0 }} 已生成</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="isBatchRunning('videos') || !videosPendingCount" @click="batchVideos">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  生成剩余{{ videosPendingCount ? ` (${videosPendingCount})` : '' }}
                </button>
              </div>
            </div>
            <div v-if="videoGenTargets.length > VIDEO_LIST_PAGE_SIZE" class="prod-pagination">
              <select v-model="videosListFilter" class="input input-sm prod-page-filter">
                <option value="all">全部 {{ videoGenTargets.length }}</option>
                <option value="pending">待生成 {{ videosPendingCount }}</option>
                <option value="processing">生成中 {{ videosProcessingCount }}</option>
                <option value="failed">失败 {{ Object.keys(failedVideoMessages).length }}</option>
                <option value="done">已完成 {{ videosDoneCount }}</option>
              </select>
              <button class="btn btn-sm" :disabled="videosListPage <= 1" @click="videosListPage -= 1">上一页</button>
              <span class="dim prod-page-indicator">{{ videosListPage }} / {{ videosPageCount }} · 每页 {{ VIDEO_LIST_PAGE_SIZE }}</span>
              <button class="btn btn-sm" :disabled="videosListPage >= videosPageCount" @click="videosListPage += 1">下一页</button>
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in videosPageShots" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <video
                    v-if="hasVid(sb)"
                    :src="'/' + getVideoUrl(sb)"
                    class="prod-video"
                    controls
                    preload="none"
                    playsinline
                  />
                  <img
                    v-else-if="hasImg(sb)"
                    :src="'/' + getStoryboardCover(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getStoryboardCover(sb), `单元 ${getComposeUnitShotRangeLabel(sb, sbs)} 参考图`)"
                  />
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </div>
                  <span class="prod-idx">{{ getComposeUnitShotRangeLabel(sb, sbs) }}</span>
                  <span v-if="hasComposed(sb)" class="prod-overlay-badge">已合成</span>
                </div>
                <div class="prod-info">
                  <div class="prod-desc" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;line-height:1.4">
                    {{ getVideoUnitMergedText(sb) || sb.description || sb.title || '—' }}
                  </div>
                  <div class="prod-meta-line">
                    {{ sb.shot_type || sb.shotType || '未设景别' }}
                    · {{ estimateVideoDurationSec(sb) }}s
                  </div>
                  <div class="prod-dots">
                    <span :class="['dot', hasImg(sb) && 'ok']" /><span style="font-size:10px">图</span>
                    <span :class="['dot', hasVid(sb) && 'ok', isPendingVideo(sb.id) && 'pending']" /><span style="font-size:10px">{{ isPendingVideo(sb.id) ? '视频生成中' : '视频' }}</span>
                  </div>
                  <div v-if="!hasVid(sb) && !isPendingVideo(sb.id)" class="dim" style="font-size:10px;margin-top:4px;line-height:1.35">
                    时长按旁白推测；需先「生成配音」才有声音。
                  </div>
                  <div v-if="videoProgressMessage(sb.id)" class="prod-progress dim" style="font-size:11px;margin-top:4px;line-height:1.35">{{ videoProgressMessage(sb.id) }}</div>
                  <div v-if="videoFailMessage(sb.id)" class="prod-error">{{ videoFailMessage(sb.id) }}</div>
                </div>
                <div class="prod-actions">
                  <button class="btn btn-sm" :disabled="isPendingVideo(sb.id) || !hasImg(sb)" @click="genVid(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    {{ isPendingVideo(sb.id) ? '生成中' : (hasVid(sb) ? '重新生成' : '生成视频') }}
                  </button>
                  <button
                    v-if="hasVid(sb)"
                    class="btn btn-sm"
                    title="删除本单元本地视频"
                    :disabled="isPendingVideo(sb.id)"
                    @click="deleteShotVideo(sb)"
                  >
                    删除视频
                  </button>
                </div>
              </div>
            </div>
            </template>
          </div>

          <!-- Sub: Compose -->
          <div v-else-if="prodTab === 'compose'" class="prod-content">
            <div v-if="isDialoguePortraitMode" class="narration-hint">
              <strong>固定背景 + 立绘叠层：</strong>场景图锁定不动，按说话人切 idle/talk/react，说话立绘有轻微呼吸/弹动；1 人居中 / 2 人左右。不做整帧配图、不做运镜与 Ken Burns。需先完成场景背景、定妆表情包与配音。
            </div>
            <div v-else class="narration-hint">
              <strong>与分镜配图一致：</strong>沿用「同图继承」分组合成（多句共用一张图 → 一条成片）；若已做「检测配图」，则优先按配图段划分。列表每行一个合成单元，<strong>不含片头</strong>（配图 {{ narrationNeedImageCount }} 含片头 1 镜 → 合成 {{ composableCount || '—' }} 单元）。
              有本地视频的单元优先用 <code>videoUrl</code>；没有则静图 Ken Burns。若刚生成了视频，请对本单元重新合成。
            </div>
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ composedCount }}/{{ composableCount }} 单元已合成</span>
              <span v-if="composableShots.length !== composableCount" class="tag mono dim" style="font-size:11px">{{ composableShots.length }} 句旁白</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm btn-primary" :disabled="composeProcessing || anyMergeProcessing || !composePendingCount" @click="batchCompose">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  生成剩余{{ composePendingCount ? ` (${composePendingCount})` : '' }}
                </button>
                <button v-if="composeProcessing" class="btn btn-sm btn-ghost" @click="cancelCompose">取消合成</button>
                <button class="btn btn-sm" :disabled="composeProcessing || anyMergeProcessing || !composableCount" @click="regenerateAllComposeAndMerge">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  重新生成全部并导出
                </button>
                <button
                  v-if="composedCount || mergeUrl"
                  class="btn btn-sm"
                  title="清除本集全部镜头合成视频与导出成片，删除文件并重置数据库"
                  :disabled="narrationAssetClearing || isBatchRunning('compose') || anyMergeProcessing"
                  @click="clearAllComposedVideos"
                >
                  {{ narrationAssetClearing ? '清除中…' : `清除已有合成 (${composedCount})` }}
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
            <div v-if="composeFilteredShots.length > COMPOSE_LIST_PAGE_SIZE" class="prod-pagination">
              <select v-model="composeListFilter" class="input input-sm prod-page-filter">
                <option value="all">全部 {{ composableCount }}</option>
                <option value="pending">待合成 {{ composePendingCount }}</option>
                <option value="processing">合成中 {{ composeProcessingCount }}</option>
                <option value="failed">失败 {{ Object.keys(failedComposeMessages).length }}</option>
                <option value="done">已完成 {{ composedCount }}</option>
              </select>
              <button class="btn btn-sm" :disabled="composeListPage <= 1" @click="composeListPage -= 1">上一页</button>
              <span class="dim prod-page-indicator">{{ composeListPage }} / {{ composePageCount }} · 每页 {{ COMPOSE_LIST_PAGE_SIZE }}</span>
              <button class="btn btn-sm" :disabled="composeListPage >= composePageCount" @click="composeListPage += 1">下一页</button>
            </div>
            <div class="prod-grid">
              <div v-for="sb in composePageShots" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <video
                    v-if="hasComposed(sb)"
                    :key="composeVideoSrc(sb)"
                    :src="composeVideoSrc(sb)"
                    :poster="hasImg(sb) ? '/' + getStoryboardCover(sb) : undefined"
                    class="prod-video"
                    controls
                    preload="none"
                    playsinline
                  />
                  <img
                    v-else-if="hasImg(sb)"
                    :src="'/' + getStoryboardCover(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getStoryboardCover(sb), `镜头 #${String(storyboardDisplayIndex(sb)).padStart(2, '0')} 参考图`)"
                  />
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </div>
                  <span class="prod-idx">U{{ String(composeUnitIndex(sb)).padStart(2,'0') }}</span>
                  <span v-if="hasComposed(sb)" class="prod-overlay-badge">已合成</span>
                  <span v-else-if="isPendingCompose(sb.id)" class="prod-overlay-badge is-pending">合成中</span>
                </div>
                <div class="prod-info">
                  <div class="prod-meta-line">
                    {{ getComposeUnitShotRangeLabel(sb, sbs) }}
                    · {{ getComposeUnitSubtitleLines(sb, sbs).length }} 句
                    · 约 {{ formatComposeUnitDuration(sb, sbs) }}
                  </div>
                  <ul v-if="getComposeUnitSubtitleLines(sb, sbs).length" class="compose-subtitle-lines">
                    <li v-for="line in getComposeUnitSubtitleLines(sb, sbs)" :key="line.index">
                      <span class="compose-subtitle-time">#{{ line.shotNo }} {{ formatComposeTimecode(line.startSec) }}–{{ formatComposeTimecode(line.endSec) }}</span>
                      <span class="compose-subtitle-text">{{ line.displayText }}</span>
                    </li>
                  </ul>
                  <div v-else class="prod-desc truncate">—</div>
                  <div class="prod-dots">
                    <span v-if="isDialoguePortraitMode" :class="['dot', hasComposeTts(sb) && 'ok']" /><span v-if="isDialoguePortraitMode" style="font-size:10px">配音</span>
                    <span v-if="!isDialoguePortraitMode" :class="['dot', hasImg(sb) && 'ok']" /><span v-if="!isDialoguePortraitMode" style="font-size:10px">配图</span>
                    <span v-if="!isDialoguePortraitMode" :class="['dot', hasComposeTts(sb) && 'ok']" /><span v-if="!isDialoguePortraitMode" style="font-size:10px">配音</span>
                    <span v-if="!isDialoguePortraitMode" :class="['dot', hasVid(sb) && 'ok']" /><span v-if="!isDialoguePortraitMode" style="font-size:10px">AI视频</span>
                    <span :class="['dot', hasComposed(sb) && 'ok', isPendingCompose(sb.id) && 'pending']" /><span style="font-size:10px">{{ isPendingCompose(sb.id) ? '合成中' : '合成' }}</span>
                  </div>
                  <div v-if="composeFailMessage(sb.id)" class="prod-error">{{ composeFailMessage(sb.id) }}</div>
                </div>
                <div class="prod-actions">
                  <button v-if="isNarrationMode" class="btn btn-sm" @click="openShotEditor(sb)">编辑镜头</button>
                  <button v-if="hasComposed(sb)" class="btn btn-sm" title="全屏观看" @click="openComposeVideoPreview(sb)">全屏</button>
                  <button class="btn btn-sm" :disabled="!canCompose(sb) || isPendingCompose(sb.id)" @click="doCompose(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    {{ isPendingCompose(sb.id) ? '合成中' : (hasComposed(sb) ? '重新合成' : '开始合成') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Production Navigator -->
          </div>
        </template>
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

<style scoped>
.dialogue-expr-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 8px 10px 0;
}
.dialogue-expr-thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-2, #1a1f2e);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  display: flex;
  align-items: center;
  justify-content: center;
}
.dialogue-expr-thumb.ready {
  border-color: color-mix(in srgb, var(--accent, #5b8def) 45%, transparent);
}
.dialogue-expr-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.dialogue-expr-empty {
  font-size: 10px;
  color: var(--text-dim, #64748b);
}
.dialogue-expr-label {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 9px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  text-transform: lowercase;
}
.shot-scan-result {
  margin: 0 10px 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent, #5b8def) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent, #5b8def) 28%, transparent);
  font-size: 12px;
  line-height: 1.45;
}
.shot-scan-result.bad {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  border-color: color-mix(in srgb, #ef4444 35%, transparent);
}
.shot-scan-issues {
  margin-top: 4px;
  color: var(--danger, #ef4444);
}
.prod-card.is-selected-shot {
  outline: 2px solid var(--accent, #5b8def);
  outline-offset: 1px;
}
</style>
