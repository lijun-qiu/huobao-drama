<template>
<div class="content-panel">
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
              从本集已生成/上传的配图中<strong>随机选 N 张</strong>合成云朵转场片头（<strong>第 1 张=集内首张、最后 1 张=集内末张</strong>，中间随机；可先导出 zip 再生成视频）。可用 <strong>Voicebox</strong> 生成或上传 MP3 配音，按配音时长生成并叠加<strong>屏幕正中红色字幕</strong>（字号 100）；未配音时为 3 秒无声片头。
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
                <span
                  v-if="localTtsEngine === 'voicebox' && !selectedVoiceSupportsInstruct"
                  class="tag warn"
                  title="感情风格仅对 CustomVoice 预设音色生效（如 Eric、Serena）；克隆音色请改用预设或选「默认（自然）」"
                >当前音色不支持感情</span>
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
                <span
                  v-if="localTtsEngine === 'voicebox' && voiceboxAvailable && !voiceboxModelLoaded"
                  class="tag warn"
                  title="预设 CustomVoice 首次合成需加载大模型，请单条生成并等待数分钟"
                >模型未加载·首次较慢</span>
              </div>
              <div class="export-bar" style="margin-bottom:0">
                <button class="btn" :disabled="openingAudioUploading" @click="triggerOpeningAudioUpload">
                  {{ openingAudioUploading ? '上传中…' : (openingAudioUrl ? '更换 MP3' : '或上传 MP3') }}
                </button>
                <audio v-if="openingAudioSrc" :src="openingAudioSrc" controls style="height:32px;max-width:280px" />
                <span v-if="openingAudioUrl" class="tag tag-success">配音已就绪</span>
              </div>
              <div class="export-bar" style="margin-top:12px;margin-bottom:0">
                <BaseSelect
                  :model-value="openingPickCount"
                  :options="openingPickCountOptions"
                  placeholder="配图张数"
                  style="min-width:130px"
                  @update:model-value="openingPickCount = Number($event) || DEFAULT_OPENING_IMAGE_COUNT"
                />
                <button
                  class="btn"
                  :disabled="!illustrationImageCount || openingPickedImagesExporting"
                  :title="`随机选 ${openingPickCount} 张（首尾镜固定）打包下载，无需先生成开幕视频`"
                  @click="exportOpeningPickedImages"
                >
                  {{ openingPickedImagesExporting ? '导出中…' : `导出 ${openingPickCount} 张配图` }}
                </button>
                <a
                  v-if="canDownloadOpeningImages"
                  :href="openingPickedImagesZipSrc"
                  download
                  class="btn"
                  :title="`下载已选 ${openingPickedImages.length} 张配图`"
                >
                  下载 {{ openingPickedImages.length }} 张
                </a>
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
                <BaseSelect
                  :model-value="openingPickCount"
                  :options="openingPickCountOptions"
                  placeholder="配图张数"
                  style="min-width:130px"
                  @update:model-value="openingPickCount = Number($event) || DEFAULT_OPENING_IMAGE_COUNT"
                />
                <button class="btn" :disabled="!illustrationImageCount" @click="generateOpeningVideo">重新生成</button>
                <button
                  class="btn"
                  :disabled="!illustrationImageCount || openingPickedImagesExporting"
                  :title="`重新随机选 ${openingPickCount} 张（首尾镜固定）`"
                  @click="exportOpeningPickedImages"
                >
                  {{ openingPickedImagesExporting ? '导出中…' : `重新导出 ${openingPickCount} 张` }}
                </button>
                <a
                  v-if="canDownloadOpeningImages"
                  :href="openingPickedImagesZipSrc"
                  download
                  class="btn"
                  :title="`下载已选 ${openingPickedImages.length} 张配图`"
                >
                  下载 {{ openingPickedImages.length }} 张
                </a>
                <button
                  v-else
                  class="btn"
                  :disabled="!illustrationImageCount || openingPickedImagesExporting"
                  :title="`随机选 ${openingPickCount} 张（首尾镜固定）打包下载`"
                  @click="exportOpeningPickedImages"
                >
                  导出 {{ openingPickCount }} 张
                </button>
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
                <div v-else class="empty-desc">需要至少 1 张镜头配图；可先导出配图 zip，再生成开幕视频</div>
                <div v-if="illustrationImageCount" class="export-bar" style="margin-top:12px;justify-content:center">
                  <BaseSelect
                    :model-value="openingPickCount"
                    :options="openingPickCountOptions"
                    placeholder="配图张数"
                    style="min-width:130px"
                    @update:model-value="openingPickCount = Number($event) || DEFAULT_OPENING_IMAGE_COUNT"
                  />
                </div>
                <button
                  v-if="illustrationImageCount"
                  class="btn"
                  style="margin-top:12px"
                  :disabled="openingPickedImagesExporting"
                  :title="`随机选 ${openingPickCount} 张（首尾镜固定）打包下载`"
                  @click="exportOpeningPickedImages"
                >
                  {{ openingPickedImagesExporting ? '导出中…' : `导出 ${openingPickCount} 张配图` }}
                </button>
                <a
                  v-if="canDownloadOpeningImages"
                  :href="openingPickedImagesZipSrc"
                  download
                  class="btn"
                  style="margin-top:12px;margin-left:8px"
                >
                  下载 {{ openingPickedImages.length }} 张
                </a>
                <button
                  class="btn btn-primary"
                  :style="{ marginTop: '12px', marginLeft: canDownloadOpeningImages ? '8px' : '0' }"
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
              将本集所有<strong>剧中红字片头镜</strong>按顺序合成并拼接为独立 MP4（含双层叠字字幕、自下而上滑入动画）。需各片头镜已具备<strong>配图 + 配音</strong>；生成后可预览下载，并单独「合并进主片」（默认全集拼接不含片头）。
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
                <button
                  v-if="mergeUrl && !mergeHasTitle"
                  class="btn btn-primary"
                  :disabled="mergeProcessing"
                  @click="mergeTitleIntoMain"
                >
                  合并进主片
                </button>
                <span v-else-if="mergeHasTitle" class="tag tag-success">主片已含片头</span>
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
                <div class="empty-desc" style="margin-top:8px">将 {{ bodyComposedCount }} 个合成单元拼接为完整视频（不含开幕/片头）</div>
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
                <button v-if="composeProcessing" class="btn btn-ghost" style="margin-top:16px" @click="cancelCompose">取消合成</button>
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
                  v-if="titleVideoUrl && !mergeHasTitle"
                  class="btn btn-primary"
                  :disabled="mergeProcessing"
                  @click="mergeTitleIntoMain"
                >
                  合并片头视频
                </button>
                <span v-else-if="mergeHasTitle" class="tag tag-success">已含片头</span>
                <button
                  v-if="openingVideoUrl && !mergeHasOpening"
                  class="btn btn-primary"
                  :disabled="mergeProcessing"
                  @click="mergeOpeningIntoMain"
                >
                  合并开幕视频
                </button>
                <span v-else-if="mergeHasOpening" class="tag tag-success">已含开幕</span>
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
                <div class="empty-desc">将 {{ bodyComposedCount }}/{{ bodyComposableCount }} 个合成单元拼接为主片（不含开幕/片头）{{ !canMergeBody ? '（需全部单元合成完成）' : '' }}{{ exportMixBgm && exportBgmMusicId && !bgmAppliedCount ? '，并混入所选 BGM' : '' }}；开幕与片头可在生成后单独合并。</div>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;justify-content:center;align-items:center">
                  <button class="btn btn-primary" :disabled="!canMergeBody || anyMergeProcessing" @click="doMerge">
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
                <input v-model="exportMixBgm" type="checkbox" :disabled="bgmAppliedCount > 0" />
                <span>拼接时混入 BGM</span>
              </label>
              <div v-if="bgmAppliedCount > 0" class="dim" style="font-size:11px;line-height:1.5;color:var(--warn, #b45309)">
                已有 {{ bgmAppliedCount }} 个镜头在「镜头合成」时混入了 BGM，成片将直接使用镜头内音乐，请勿再勾选（避免两轨叠加）。
              </div>
              <div v-else class="dim" style="font-size:11px;line-height:1.5">
                各镜头尚未混入 BGM 时可勾选，在整集成片上统一铺一层背景音乐。
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
              <div class="field-label" style="margin-bottom:4px">开幕与片头</div>
              <div class="dim" style="font-size:11px;line-height:1.5">
                默认拼接<strong>不含</strong>开幕视频与片头视频。主片生成后，在预览区或对应步骤页点击「合并进主片」；顺序为开幕 → 片头 → 正文。
              </div>
              <button
                v-if="mergeUrl && titleVideoUrl && !mergeHasTitle"
                class="btn btn-sm"
                style="margin-top:8px;margin-right:8px"
                :disabled="mergeProcessing"
                @click="mergeTitleIntoMain"
              >
                合并片头视频进主片
              </button>
              <div v-else-if="mergeHasTitle" class="tag tag-success" style="margin-top:8px;display:inline-block">当前成片已含片头</div>
              <div v-else-if="titleShots.length && !titleVideoUrl" class="dim" style="font-size:11px;margin-top:6px">
                尚未生成片头视频，请先在「片头视频」步骤生成。
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
              <div v-else-if="mergeHasOpening" class="tag tag-success" style="margin-top:8px">当前成片已含开幕</div>
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
