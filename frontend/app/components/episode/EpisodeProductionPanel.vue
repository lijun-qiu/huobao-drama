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
              <strong>配音策略：</strong>与镜头合成一致，<strong>同配图段合并为一段配音</strong>（多句旁白一次 TTS）；片头镜仍逐镜生成。可先上传 MP3 再「按文案裁剪」；裁剪按<strong>分镜旁白字数比例</strong>切分时长。
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
              <span
                v-if="localTtsEnabled && localTtsEngine === 'voicebox' && !selectedVoiceSupportsInstruct"
                class="tag warn"
                title="感情风格仅对 CustomVoice 预设音色生效（如 Eric、Serena）；克隆音色请改用预设或选「默认（自然）」"
              >当前音色不支持感情</span>
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
                placeholder="输入要合成的旁白或台词，例如：体验365个人生副本"
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
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ ttsEligibleCount }} 个配音段</span>
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
                  {{ isBatchRunning('tts') ? '生成中…' : '生成剩余' }}{{ ttsPendingCount ? ` (${ttsPendingCount})` : '' }}
                </button>
                <button class="btn btn-sm" :disabled="isBatchRunning('tts') || !ttsEligibleCount" @click="batchShotTTSAll">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  全部生成
                </button>
                <button
                  v-if="ttsAssignedCount"
                  class="btn btn-sm"
                  title="清除本集全部镜头配音，删除文件并重置数据库"
                  :disabled="narrationAssetClearing || isBatchRunning('tts')"
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
                      <span class="frame-badge">{{ isNarrationTitleShot(item.sb) ? '片头' : `配音段 ${(dubbingListPage - 1) * DUBBING_LIST_PAGE_SIZE + i + 1}` }}</span>
                    </div>
                    <ul v-if="!isNarrationTitleShot(item.sb) && item.subtitleLines.length > 1" class="compose-subtitle-lines dub-unit-lines">
                      <li v-for="line in item.subtitleLines" :key="line.index">
                        <span class="compose-subtitle-time">#{{ line.shotNo }}</span>
                        <span class="compose-subtitle-text">{{ line.displayText }}</span>
                      </li>
                    </ul>
                    <div v-else class="dub-desc">{{ item.mergedText || '未填写文本' }}</div>
                    </div>
                    <span class="tag" :class="item.ready ? 'tag-success' : ''">{{ item.statusLabel }}</span>
                  </div>
                <div class="dub-meta">
                  <span class="dim">{{ item.lineCount }} 句</span>
                  <span class="dim">约 {{ item.durationLabel }}</span>
                </div>
                <div class="dub-foot">
                  <audio v-if="getEffectiveTTSUrl(item.sb)" :src="'/' + getEffectiveTTSUrl(item.sb)" controls preload="none" class="dub-audio" />
                  <div v-else class="dim" style="font-size:12px">尚未生成语音文件</div>
                  <div class="ml-auto flex gap-1">
                    <button class="btn btn-sm" @click="triggerShotTtsUpload(item.sb.id)">上传 MP3</button>
                    <button class="btn btn-sm" @click="genShotTTS(item.sb, hasNarrationShotOwnTts(item.sb))">
                      {{ hasNarrationShotOwnTts(item.sb) ? '重新生成' : '生成配音' }}
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
              <strong>BGM 策略：</strong>默认 <code>suno_music_open</code>（纯器乐）；可选 <code>pixverse-sound-effect</code>（按画面生成环境音，需关联已合成镜头）；也可<strong>上传本地音频</strong>直接使用。BGM 库按<strong>项目</strong>共享。合成时自动与旁白混音（BGM 音量约 8%）。
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
              <strong>配图策略：</strong>① 检测配图 → ② 生成纯 LLM 六维文案 → ③ 检查/优化配图文案 → 批量生成配图。卡片可「复用上一镜 / 下一镜」；同段 inherit 镜头合成时自动沿用。
            </div>
            <div class="prod-image-model-bar detect-batch-config" style="margin-bottom:12px">
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
                :disabled="narrationImageBreaking || narrationAssetClearing || !narrationPromptLiveCount"
                title="清除本集全部配图锚点的配图文案（保留检测分段与 scene_content，不删配图文件）"
                @click="clearAllNarrationImagePrompts"
              >
                {{ narrationAssetClearing ? '清除中…' : `清除文案 (${narrationPromptLiveCount})` }}
              </button>
            </div>
            <div class="prod-image-model-bar" style="margin-bottom:12px">
              <span class="dim" style="font-size:12px">画风风格</span>
              <BaseSelect
                :model-value="narrationImageStyle"
                :options="narrationImageStyleOptions"
                placeholder="选择配图画风"
                style="min-width:120px"
                title="配图生成专用画风，默认简体素人；与项目级画风独立"
                @update:model-value="onNarrationImageStyleChange"
              />
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
              <span class="tag">配图分镜（三步）</span>
              <button
                class="btn btn-sm"
                :disabled="narrationImageBreaking || !sbs.length"
                title="LLM 判定哪些镜头需要配图及张数"
                @click="doNarrationImageDetect"
              >
                <Loader2 v-if="narrationImageBreaking && narrationImageStep === 'detect'" :size="11" class="animate-spin" />
                ① 检测配图
                <span v-if="narrationDetectDisplayCount" class="btn-step-count">{{ narrationDetectDisplayCount }}</span>
              </button>
              <button
                class="btn btn-sm"
                :disabled="narrationImageBreaking || !sbs.length || !narrationDetectDisplayCount"
                title="根据检测结果生成纯 LLM 六维配图文案（无清洗）"
                @click="doNarrationImagePrompts"
              >
                <Loader2 v-if="narrationImageBreaking && narrationImageStep === 'prompts' && !narrationImagePromptTestActive" :size="11" class="animate-spin" />
                ② 生成配图文案
                <span v-if="narrationDetectDisplayCount" class="btn-step-count">{{ narrationPromptDisplayCount }}/{{ narrationDetectDisplayCount }}</span>
              </button>
              <button
                class="btn btn-sm"
                :disabled="narrationImageAuditing || !narrationNeedImageCount"
                title="本地规则扫描血腥/服装/格式等问题，不修改"
                @click="doNarrationImageAudit"
              >
                <Loader2 v-if="narrationImageAuditing" :size="11" class="animate-spin" />
                ③ 检查文案
              </button>
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
                  title="仅对缺配图文案的锚点镜头重新调用 LLM（不重新检测）"
                  @click="doRetryMissingNarrationImagePrompts"
                >
                  <Loader2 v-if="narrationImageBreaking" :size="11" class="animate-spin" />
                  补全缺失文案 ({{ narrationMissingPromptCount }})
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
            <div v-if="narrationImageAuditPanel" class="narration-breakdown-panel" style="margin-bottom:12px">
              <div class="narration-breakdown-head">
                <div>
                  <strong>配图文案检查</strong>
                  <span class="dim" style="font-size:11px;margin-left:8px">
                    {{ narrationImageAuditPanel.shotsWithIssues }}/{{ narrationImageAuditPanel.total }} 镜有问题 · 共 {{ narrationImageAuditPanel.issueCount }} 项
                  </span>
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
            <div v-if="narrationImageBreakdownPanel" class="narration-breakdown-panel" style="margin-bottom:12px">
              <div class="narration-breakdown-head">
                <div>
                  <strong>配图分镜进度</strong>
                </div>
                <span v-if="narrationImageBreakdownPanel.detectLabel" class="tag">{{ narrationImageBreakdownPanel.detectLabel }}</span>
              </div>
              <div class="narration-breakdown-stats">
                <span class="tag mono">
                  ① 检测分镜
                  <strong>{{ narrationImageBreakdownPanel.detectCount }}</strong> 张
                  <span v-if="narrationImageBreakdownPanel.detectAt" class="dim">· {{ formatBreakdownTime(narrationImageBreakdownPanel.detectAt) }}</span>
                </span>
                <span class="tag mono">
                  ② 六维文案
                  <strong>{{ narrationImageBreakdownPanel.promptCount }}</strong><template v-if="narrationImageBreakdownPanel.detectCount">/{{ narrationImageBreakdownPanel.detectCount }}</template> 条
                  <span v-if="narrationImageBreakdownPanel.promptAt" class="dim">· {{ formatBreakdownTime(narrationImageBreakdownPanel.promptAt) }}</span>
                </span>
                <span v-if="narrationImageBreakdownPanel.diptychCount" class="tag">含 {{ narrationImageBreakdownPanel.diptychCount }} 张两宫格</span>
                <span v-if="narrationImageBreakdownPanel.promptLabel" class="tag">{{ narrationImageBreakdownPanel.promptLabel }}</span>
                <span v-if="narrationImageBreakdownPanel.detectCount" class="tag dim">约 ¥{{ narrationImageBreakdownPanel.estImageCost }}（{{ narrationImageBreakdownPanel.priceLabel }}）</span>
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
              <div class="ml-auto flex gap-1 items-center flex-wrap">
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
                  title="清除本集全部配图（含 AI 生成与上传），删除文件并重置数据库"
                  :disabled="narrationAssetClearing"
                  @click="clearAllNarrationImages"
                >
                  {{ narrationAssetClearing ? '清除中…' : `清除已有配图 (${narrationOwnImageCount})` }}
                </button>
                <button class="btn btn-sm" :disabled="!narrationNeedImageCount" @click="copyNarrationShotPromptsBatch">
                  {{ narrationCopyBatchOptions.length > 1 ? `复制描述词 (${narrationCopyBatchOptions.find(o => o.value === narrationCopyBatchIndex)?.label || '#01-#10'})` : `一键复制描述词（${narrationNeedImageCount}）` }}
                </button>
                <button class="btn btn-sm" :disabled="!narrationNeedImageCount" @click="triggerAllShotImageUpload">一键上传全部（{{ narrationNeedImageCount }}）</button>
                <button class="btn btn-sm" :disabled="!narrationNeedImageCount" @click="triggerShotFolderUpload" title="文件夹上传：1.png→第1镜、2.png→第2镜…（可用 backend/scripts/准备配图文件夹.bat 按修改时间重命名）">文件夹上传</button>
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
                  :title="narrationImagesPendingTitle"
                  @click="batchNarrationShotImages"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  生成剩余
                </button>
              </div>
            </div>
            <div v-if="sbs.length > PROD_SHOT_PAGE_SIZE" class="prod-pagination">
              <select v-model="shotsListFilter" class="input input-sm prod-page-filter">
                <option value="all">全部 {{ sbs.length }}</option>
                <option value="pending">待生成 {{ narrationImagesPendingCount }}</option>
                <option value="processing">生成中 {{ pendingNarrationShotIds.length }}</option>
                <option value="need_own">需配图 {{ narrationNeedImageCount }}</option>
                <option value="done">已有图 {{ shotsDoneCount }}</option>
                <option value="inherit">沿用 {{ sbs.length - narrationNeedImageCount }}</option>
              </select>
              <button class="btn btn-sm" :disabled="shotsListPage <= 1" @click="shotsListPage -= 1">上一页</button>
              <span class="dim prod-page-indicator">{{ shotsListPage }} / {{ shotsPageCount }} · 每页 {{ PROD_SHOT_PAGE_SIZE }}</span>
              <button class="btn btn-sm" :disabled="shotsListPage >= shotsPageCount" @click="shotsListPage += 1">下一页</button>
            </div>
            <div class="prod-grid">
              <div v-for="sb in shotsPageItems" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <img
                    v-if="getNarrationDisplayImage(sb)"
                    :src="narrationShotImageSrc(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer(narrationShotImageSrc(sb), `镜头 #${getNarrationShotDisplayNo(sb)} 配图`)"
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
                    v-if="textModelSupportsVision(episodeTextModel) && hasNarrationShotImage(sb)"
                    class="btn btn-sm"
                    :disabled="pendingShotScanIds.includes(sb.id)"
                    title="用 VLM 检查配图是否与旁白、配图文案一致"
                    @click="scanNarrationShotImage(sb)"
                  >
                    {{ pendingShotScanIds.includes(sb.id) ? '扫描中' : '扫描配图' }}
                  </button>
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
              <strong>与分镜配图一致：</strong>沿用「同图继承」分组合成（多句共用一张图 → 一条成片）；若已做「检测配图」，则优先按配图段划分。列表每行一个合成单元，<strong>不含片头</strong>（配图 {{ narrationNeedImageCount }} 含片头 1 镜 → 合成 {{ composableCount || '—' }} 单元）。
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
                    <span :class="['dot', hasImg(sb) && 'ok']" /><span style="font-size:10px">配图</span>
                    <span :class="['dot', hasComposeTts(sb) && 'ok']" /><span style="font-size:10px">配音</span>
                    <span :class="['dot', hasVid(sb) && 'ok']" /><span style="font-size:10px">AI视频</span>
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
