<template>
<div class="content-panel">
<!-- Step 0: AI Script Chat (narration) / Raw Content (drama) -->
        <div v-if="isNarrationMode && scriptStep === 0" class="step-editor script-chat-step">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">01</span>
                <span class="step-name">剧本生成</span>
              </div>
              <span class="dim" style="font-size:12px;margin-left:8px">{{ scriptGenMode === 'chat' ? 'AI 对话 · 体验人生解说稿' : '直接输入 · 粘贴或编写解说稿' }}</span>
            </div>
            <div class="toolbar-right">
              <div class="prod-tabs script-gen-tabs">
                <button
                  type="button"
                  class="prod-tab"
                  :class="{ active: scriptGenMode === 'chat' }"
                  :disabled="scriptChatGenerating"
                  @click="scriptGenMode = 'chat'"
                >
                  AI 对话
                </button>
                <button
                  type="button"
                  class="prod-tab"
                  :class="{ active: scriptGenMode === 'manual' }"
                  :disabled="scriptChatGenerating"
                  @click="scriptGenMode = 'manual'"
                >
                  直接输入
                </button>
              </div>
              <button
                v-if="scriptGenMode === 'chat'"
                type="button"
                class="btn btn-sm"
                :disabled="scriptChatGenerating"
                @click="clearScriptChat"
              >
                清空对话
              </button>
            </div>
          </div>

          <div v-if="scriptGenMode === 'manual'" class="script-manual-panel">
            <div class="script-manual-toolbar">
              <span v-if="rawLen" class="char-count">{{ rawLen }} 字</span>
              <button
                v-if="rawHasEmphasis"
                type="button"
                class="btn btn-sm"
                @click="stripRawEmphasis"
              >
                去掉 ** 标记
              </button>
              <button type="button" class="btn btn-sm btn-primary" @click="saveRaw(); toast.success('已保存')">
                保存
              </button>
            </div>
            <textarea
              v-model="localRaw"
              class="fill-textarea script-manual-textarea"
              placeholder="粘贴或编写完整解说稿…&#10;首行建议：今天体验的人生剧本是，…&#10;也可从 Word / 备忘录直接粘贴"
            />
            <div class="narration-hint" style="margin-top:10px">
              自备稿可直接在此编辑；保存后进入「文案输入」或「旁白分镜」继续。字幕 ** 强调在分镜时由 Qwen 自动标注。
            </div>
          </div>

          <div v-else class="script-chat-panel script-chat-panel-full">
            <div class="script-chat-body">
              <div class="script-chat-toolbar">
                <span class="dim" style="font-size:12px">模型</span>
                <BaseSelect
                  :model-value="scriptChatModel"
                  :options="textModelOptions"
                  placeholder="选择模型"
                  searchable
                  style="width:280px"
                  @update:model-value="v => scriptChatModel = v"
                />
                <div v-if="textModelSupportsThinking(scriptChatModel)" class="text-thinking-toggle">
                  <span class="dim" style="font-size:12px">思考</span>
                  <div class="prod-tabs text-thinking-tabs">
                    <button type="button" class="prod-tab" :class="{ active: scriptChatThinking }" @click="scriptChatThinking = true">开</button>
                    <button type="button" class="prod-tab" :class="{ active: !scriptChatThinking }" @click="scriptChatThinking = false">关</button>
                  </div>
                </div>
              </div>
              <div ref="scriptChatScrollRef" class="script-chat-messages">
                <div
                  v-for="(msg, idx) in scriptChatMessages"
                  :key="idx"
                  :class="['script-chat-msg', msg.role === 'user' ? 'is-user' : 'is-assistant']"
                >
                  <span class="script-chat-msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</span>
                  <div class="script-chat-msg-text">
                    <template v-if="msg.role === 'assistant' && scriptChatGenerating && idx === scriptChatMessages.length - 1 && !msg.content && !msg.thinking">
                      <Loader2 :size="14" class="animate-spin" style="vertical-align:-2px;margin-right:6px" />
                      <span class="dim">{{ scriptChatThinking ? '等待思考…' : '正在生成…' }}</span>
                    </template>
                    <template v-else>
                      <div v-if="msg.thinking" class="script-chat-thinking">
                        <div class="script-chat-thinking-label">思考过程</div>
                        <div class="script-chat-thinking-body">{{ msg.thinking }}</div>
                      </div>
                      <div v-if="msg.content" class="script-chat-reply">{{ msg.content }}</div>
                      <div
                        v-else-if="msg.role === 'assistant' && scriptChatGenerating && idx === scriptChatMessages.length - 1 && msg.thinking"
                        class="dim script-chat-writing-hint"
                      >
                        正在写稿…
                      </div>
                    </template>
                  </div>
                </div>
              </div>
              <div v-if="lastScriptChatDraft" class="script-chat-draft-actions">
                <button
                  type="button"
                  class="btn btn-sm"
                  :disabled="scriptChatGenerating || scriptChatDraftHasEmphasis"
                  @click="doScriptChatStripEmphasis"
                >
                  去掉 ** 标记
                </button>
                <button type="button" class="btn btn-sm btn-primary" :disabled="scriptChatGenerating" @click="applyScriptChatToEditor('replace', true)">填入文案并编辑</button>
                <button type="button" class="btn btn-sm" :disabled="scriptChatGenerating" @click="applyScriptChatToEditor('append', true)">追加到文案</button>
              </div>
              <div class="script-chat-hints">
                <button
                  v-for="hint in scriptChatQuickHints"
                  :key="hint"
                  type="button"
                  class="btn btn-sm"
                  :disabled="scriptChatGenerating"
                  @click="scriptChatInput = hint"
                >
                  {{ hint.slice(0, 18) }}{{ hint.length > 18 ? '…' : '' }}
                </button>
              </div>
              <div class="script-chat-compose">
                <textarea
                  v-model="scriptChatInput"
                  class="script-chat-input"
                  rows="3"
                  placeholder="描述本期人生，例如：十八岁职高辍学，八十年代进城摆夜市摊…"
                  :disabled="scriptChatGenerating"
                  @keydown.enter.exact.prevent="sendScriptChat"
                />
                <button
                  type="button"
                  class="btn btn-primary script-chat-send"
                  :disabled="scriptChatGenerating || !scriptChatInput.trim()"
                  @click="sendScriptChat"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!isNarrationMode && scriptStep === 0" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">01</span>
                <span class="step-name">原始内容</span>
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
        </div>

        <!-- Step 1: Raw Content (narration) -->
        <div v-else-if="isNarrationMode && scriptStep === 1" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">02</span>
                <span class="step-name">文案输入</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="rawLen" class="char-count">{{ rawLen }} 字</span>
              <button
                v-if="rawHasEmphasis"
                type="button"
                class="btn btn-sm"
                @click="stripRawEmphasis"
              >
                去掉 ** 标记
              </button>
              <button class="btn btn-sm" @click="saveRaw(); toast.success('已保存')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                保存
              </button>
            </div>
          </div>

          <textarea
            class="fill-textarea"
            v-model="localRaw"
            placeholder="粘贴解说文案，或在「剧本生成」写稿后点「填入文案并编辑」…"
          />
          <div class="narration-hint" style="margin-top:12px">
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
              → ② 检测配图 → 生成文案 → 优化文案 → ③ <strong>生成配图</strong> → ④ 生成配音 → ⑤ 镜头合成 → ⑥ 导出
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
              <div v-if="sbs.length > SCRIPT_STORYBOARD_PAGE_SIZE" class="prod-pagination shot-list-pagination">
                <button class="btn btn-sm" :disabled="scriptStoryboardPage <= 1" @click="scriptStoryboardPage -= 1">上一页</button>
                <span class="dim prod-page-indicator">{{ scriptStoryboardPage }} / {{ scriptStoryboardPageCount }} · 每页 {{ SCRIPT_STORYBOARD_PAGE_SIZE }}</span>
                <button class="btn btn-sm" :disabled="scriptStoryboardPage >= scriptStoryboardPageCount" @click="scriptStoryboardPage += 1">下一页</button>
              </div>
              <div class="shot-list-body">
                <div
                  v-for="sb in scriptStoryboardPageItems"
                  :key="sb.id"
                  :class="['shot-item', { active: selectedSb?.id === sb.id }]"
                  @click="selectedSb = sb"
                >
                  <div class="shot-item-header">
                    <div class="shot-num">#{{ String(scriptStoryboardListNo(sb)).padStart(2,'0') }}</div>
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
            <div class="loading-text">{{ isNarrationMode ? '正在整稿拆镜并标注字幕强调…' : '正在拆解分镜并生成提示词...' }}</div>
          </div>

          <div v-else class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/>
              </svg>
            </div>
            <div class="empty-title">{{ isNarrationMode ? '将解说文案拆解为旁白镜头' : '将剧本拆解为分镜序列' }}</div>
            <div class="empty-desc">{{ isNarrationMode ? '整稿一次交给 LLM 拆镜（句末标点断句、长句按逗号合并），并自动标注 ** 强调词；片头写「标题：」或「今天体验的人生剧本是…」' : 'AI 自动分析剧本，生成镜头列表和视频提示词' }}</div>
            <div v-if="!isNarrationMode" class="locked-config-banner">当前集视频模型：{{ lockedVideoConfigLabel }}</div>
            <div v-if="isNarrationMode" class="narration-hint" style="margin:10px 0">
              <strong>旁白分镜：</strong>按句拆分便于编辑；<strong>配音与镜头合成</strong>按场景段（同配图段合并为一段配音、一条成片）。<code>**强调词**</code> 在剧本生成时用 ** 包裹。
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
