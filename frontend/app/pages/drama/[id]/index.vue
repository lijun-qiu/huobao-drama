<template>
  <div class="page" v-if="drama">
    <!-- Header -->
    <div class="page-head">
      <div class="head-left">
        <button class="back-btn" @click="navigateTo('/')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          返回
        </button>
        <div class="head-info">
          <h1 class="page-title">{{ drama.title }}</h1>
          <div class="page-meta">
            <BaseSelect
              v-model="dramaStyle"
              :options="styleSelectOptions"
              placeholder="画风"
              searchable
              style="width:220px"
              @update:model-value="saveDramaStyle"
            />
            <span class="meta-divider"></span>
            <span class="meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {{ drama.characters?.length || 0 }} 角色
            </span>
            <span class="meta-divider"></span>
            <span class="meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
              {{ drama.scenes?.length || 0 }} 场景
            </span>
          </div>
        </div>
      </div>
      <button class="btn btn-primary" @click="openAddEpisode">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        添加集
      </button>
    </div>

    <!-- 小说漫画讲解：原文 + 章节大纲 -->
    <div v-if="isNovelComic" class="novel-comic-panel card">
      <div class="nc-head">
        <div>
          <div class="nc-kicker">小说漫画讲解</div>
          <h2 class="nc-title">粘贴小说 → 章节大纲 → 一章一集</h2>
          <p class="nc-sub">确认大纲后按章创建各集；每集旁白朗读该章、出漫画配图。</p>
        </div>
        <span v-if="outlineConfirmedAt" class="nc-badge">已确认 {{ outlineConfirmedAt.slice(0, 16).replace('T', ' ') }}</span>
      </div>

      <label class="field nc-field">
        <span class="field-label">小说原文</span>
        <textarea
          v-model="sourceNovel"
          class="input nc-textarea"
          rows="8"
          placeholder="粘贴完整小说原文…"
        />
        <span class="field-hint">约 {{ sourceNovel.length }} 字</span>
      </label>
      <div class="nc-actions">
        <button class="btn" :disabled="savingSource || !sourceNovel.trim()" @click="saveSourceNovel">
          {{ savingSource ? '保存中…' : '保存原文' }}
        </button>
        <label class="nc-chapters">
          目标章数
          <input v-model.number="targetChapters" class="input nc-num" type="number" min="2" max="12" />
        </label>
        <button class="btn btn-primary" :disabled="generatingOutline || !sourceNovel.trim()" @click="generateOutline">
          {{ generatingOutline ? '生成中…' : '生成章节大纲' }}
        </button>
      </div>

      <div v-if="chapterOutline.length" class="nc-outline">
        <div class="nc-outline-head">
          <span class="section-label-inline">章节大纲（可编辑）</span>
          <button class="btn" :disabled="savingOutline" @click="saveOutline">
            {{ savingOutline ? '保存中…' : '保存大纲' }}
          </button>
        </div>
        <div v-for="(ch, idx) in chapterOutline" :key="idx" class="nc-chapter card">
          <div class="nc-chapter-row">
            <span class="nc-ch-num">第 {{ idx + 1 }} 章</span>
            <input v-model="ch.title" class="input" placeholder="章标题" />
            <button class="btn btn-ghost" type="button" @click="removeChapter(idx)" :disabled="chapterOutline.length <= 2">删</button>
          </div>
          <textarea v-model="ch.summary" class="input nc-summary" rows="2" placeholder="本章摘要" />
          <input
            class="input"
            :value="(ch.key_beats || []).join('；')"
            placeholder="情节点（用；分隔）"
            @change="e => setChapterBeats(idx, e.target.value)"
          />
        </div>
        <button class="btn" type="button" @click="addChapter">+ 加一章</button>
        <div class="nc-apply">
          <button class="btn btn-primary" :disabled="applyingOutline || !chapterOutline.length" @click="applyOutline">
            {{ applyingOutline ? '建集中（按章写朗读稿）…' : '确认并创建各集' }}
          </button>
          <span class="field-hint">空集将按大纲重建；已有分镜的集不会被删除，仅追加缺失章。</span>
        </div>
      </div>
    </div>

    <!-- Episode List -->
    <div class="section-label">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="2" y="2" width="20" height="20" rx="2.5"/>
        <line x1="7" y1="8" x2="7" y2="16"/>
        <line x1="10" y1="8" x2="10" y2="16"/>
        <line x1="13" y1="8" x2="13" y2="16"/>
        <line x1="16" y1="8" x2="16" y2="16"/>
      </svg>
      剧集列表
    </div>

    <div class="ep-grid">
      <div
        v-for="(ep, i) in drama.episodes"
        :key="ep.id"
        class="card ep-card"
        :style="{ animationDelay: `${i * 0.05}s` }"
        @click="navigateTo(`/drama/${drama.id}/episode/${ep.episode_number || ep.episodeNumber}`)"
      >
        <div class="ep-number">E{{ String(ep.episode_number || ep.episodeNumber).padStart(2, '0') }}</div>
        <div class="ep-body">
          <span class="ep-title">{{ ep.title }}</span>
          <div class="ep-status">
            <span :class="['status-dot', hasScript(ep) ? 'dot-ready' : 'dot-pending']"></span>
            <span class="status-text">{{ hasScript(ep) ? '已完成剧本' : '待编写' }}</span>
            <span v-if="ep.duration" class="ep-duration">{{ ep.duration }}s</span>
          </div>
        </div>
        <div class="ep-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>

      <!-- Empty episode state -->
      <div v-if="!drama.episodes?.length" class="card ep-empty">
        <div class="ep-empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <p>点击上方「添加集」创建第一集</p>
      </div>
    </div>

    <div v-if="addDialog" class="dialog-mask" @click.self="addDialog = false">
      <div class="card dialog">
        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-kicker">Episode Setup</div>
            <div class="dialog-title-row">
              <div class="dialog-title">创建新集</div>
              <span class="dialog-badge">配置将锁定</span>
            </div>
            <div class="dialog-sub">为这一集预先锁定图片、视频和音频生成服务。创建后，这些生成链路将始终跟随当前集配置。</div>
          </div>
          <button class="back-btn" @click="addDialog = false">取消</button>
        </div>
        <div class="dialog-summary">
          <div class="summary-chip">图片 · {{ imageConfigs.length }} 可选</div>
          <div class="summary-chip">视频 · {{ videoConfigs.length }} 可选</div>
          <div class="summary-chip">音频 · {{ audioConfigs.length }} 可选</div>
        </div>
        <div class="dialog-body">
          <div class="dialog-section">
            <div class="dialog-section-head">
              <span class="dialog-section-title">基础信息</span>
              <span class="dialog-section-copy">这一项只影响显示名称，不影响生成配置</span>
            </div>
            <label class="field">
              <span class="field-label">标题</span>
              <input v-model="newEpisodeTitle" class="input" placeholder="默认按集数自动命名" />
              <span class="field-hint">留空时会自动按集数命名，例如“第 3 集”。</span>
            </label>
          </div>

          <div class="dialog-section">
            <div class="dialog-section-head">
              <span class="dialog-section-title">生成配置</span>
              <span class="dialog-section-copy">创建后不可更改，建议在这里一次性选对</span>
            </div>
            <div class="config-grid">
              <label class="config-card">
                <span class="config-card-kicker">IMAGE</span>
                <span class="field-label">图片配置</span>
                <BaseSelect v-model="newEpisodeImageConfigId" :options="imageConfigOptions" placeholder="选择图片服务" searchable />
              </label>
              <label class="config-card">
                <span class="config-card-kicker">MODEL</span>
                <span class="field-label">配图模型</span>
                <BaseSelect v-model="newEpisodeImageModel" :options="imageModelOptions" placeholder="选择配图模型" searchable />
              </label>
              <label class="config-card">
                <span class="config-card-kicker">VIDEO</span>
                <span class="field-label">视频配置</span>
                <BaseSelect v-model="newEpisodeVideoConfigId" :options="videoConfigOptions" placeholder="选择视频服务" searchable />
              </label>
              <label class="config-card">
                <span class="config-card-kicker">AUDIO</span>
                <span class="field-label">音频配置</span>
                <BaseSelect v-model="newEpisodeAudioConfigId" :options="audioConfigOptions" placeholder="选择音频服务" searchable />
              </label>
            </div>
          </div>
        </div>
        <div class="dialog-foot">
          <div class="dialog-foot-copy">创建后，API 服务锁定到当前集；配图模型可在工作台随时切换。</div>
          <button class="btn btn-primary" :disabled="creatingEpisode || !canCreateEpisode" @click="addEpisode">
            {{ creatingEpisode ? '创建中...' : '创建并锁定配置' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { aiConfigAPI, dramaAPI, episodeAPI } from '~/composables/useApi'
import { DEFAULT_IMAGE_MODEL, DEFAULT_LOCAL_IMAGE_MODEL, DEFAULT_LOCAL_TEXT_MODEL, imageModelOptionsForMode, parseProductionMode, usesLocalModelPipeline } from '~/composables/useEpisodeWorkflow'
import { artStyleLabel, artStyleSelectOptions, normalizeArtStyle } from '~/composables/useArtStyles'
import BaseSelect from '~/components/BaseSelect.vue'

const route = useRoute()
const drama = ref(null)
const dramaId = Number(route.params.id)
const addDialog = ref(false)
const creatingEpisode = ref(false)
const newEpisodeTitle = ref('')
const imageConfigs = ref([])
const videoConfigs = ref([])
const audioConfigs = ref([])
const newEpisodeImageConfigId = ref(null)
const newEpisodeImageModel = ref(DEFAULT_IMAGE_MODEL)
const newEpisodeTextModel = ref('')
const newEpisodeVideoConfigId = ref(null)
const newEpisodeAudioConfigId = ref(null)

const isNovelComic = computed(() => parseProductionMode(drama.value) === 'novel_comic')
const sourceNovel = ref('')
const chapterOutline = ref([])
const outlineConfirmedAt = ref(null)
const targetChapters = ref(4)
const savingSource = ref(false)
const generatingOutline = ref(false)
const savingOutline = ref(false)
const applyingOutline = ref(false)

function hasScript(ep) { return !!(ep.script_content || ep.scriptContent || ep.content) }

async function loadNovelComic() {
  if (!isNovelComic.value) return
  try {
    const state = await dramaAPI.novelComic.get(dramaId)
    sourceNovel.value = state.source_novel || ''
    chapterOutline.value = (state.chapter_outline || []).map((c, i) => ({
      number: c.number || i + 1,
      title: c.title || '',
      summary: c.summary || '',
      key_beats: Array.isArray(c.key_beats) ? [...c.key_beats] : [],
      approx_chars: c.approx_chars,
    }))
    outlineConfirmedAt.value = state.outline_confirmed_at || null
  } catch (e) {
    toast.error(e.message)
  }
}

async function saveSourceNovel() {
  savingSource.value = true
  try {
    await dramaAPI.novelComic.saveSource(dramaId, { source_novel: sourceNovel.value })
    outlineConfirmedAt.value = null
    toast.success('小说原文已保存')
  } catch (e) {
    toast.error(e.message)
  } finally {
    savingSource.value = false
  }
}

async function generateOutline() {
  generatingOutline.value = true
  try {
    if (sourceNovel.value.trim()) {
      await dramaAPI.novelComic.saveSource(dramaId, { source_novel: sourceNovel.value })
    }
    const res = await dramaAPI.novelComic.generateOutline(dramaId, {
      target_chapters: targetChapters.value,
    })
    chapterOutline.value = (res.chapter_outline || []).map((c, i) => ({
      number: c.number || i + 1,
      title: c.title || '',
      summary: c.summary || '',
      key_beats: Array.isArray(c.key_beats) ? [...c.key_beats] : [],
      approx_chars: c.approx_chars,
    }))
    outlineConfirmedAt.value = null
    toast.success(`已生成 ${chapterOutline.value.length} 章大纲`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    generatingOutline.value = false
  }
}

async function saveOutline() {
  savingOutline.value = true
  try {
    const payload = chapterOutline.value.map((c, i) => ({
      number: i + 1,
      title: c.title,
      summary: c.summary,
      key_beats: c.key_beats || [],
      approx_chars: c.approx_chars,
    }))
    await dramaAPI.novelComic.saveOutline(dramaId, { chapter_outline: payload })
    outlineConfirmedAt.value = null
    toast.success('大纲已保存')
  } catch (e) {
    toast.error(e.message)
  } finally {
    savingOutline.value = false
  }
}

async function applyOutline() {
  applyingOutline.value = true
  try {
    await saveOutline()
    const res = await dramaAPI.novelComic.applyOutline(dramaId)
    outlineConfirmedAt.value = res.outline_confirmed_at || new Date().toISOString()
    toast.success(`已落地 ${res.results?.length || 0} 章（一章一集）`)
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    applyingOutline.value = false
  }
}

function addChapter() {
  const n = chapterOutline.value.length + 1
  chapterOutline.value.push({ number: n, title: '', summary: '', key_beats: [] })
}

function removeChapter(idx) {
  chapterOutline.value.splice(idx, 1)
}

function setChapterBeats(idx, raw) {
  const beats = String(raw || '').split(/[；;]/).map(s => s.trim()).filter(Boolean)
  if (chapterOutline.value[idx]) chapterOutline.value[idx].key_beats = beats
}

function configLabel(config) {
  if (!config) return ''
  let modelName = ''
  try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

const imageConfigOptions = computed(() => imageConfigs.value.map(c => ({ label: configLabel(c), value: c.id })))
const imageModelOptions = computed(() => {
  const mode = parseProductionMode(drama.value)
  return imageModelOptionsForMode(mode).map(item => ({ label: item.label, value: item.value }))
})
const videoConfigOptions = computed(() => videoConfigs.value.map(c => ({ label: configLabel(c), value: c.id })))
const audioConfigOptions = computed(() => audioConfigs.value.map(c => ({ label: configLabel(c), value: c.id })))
const canCreateEpisode = computed(() => !!(newEpisodeImageConfigId.value && newEpisodeVideoConfigId.value && newEpisodeAudioConfigId.value))

const styleSelectOptions = artStyleSelectOptions
const dramaStyle = ref('')

async function load() {
  try {
    drama.value = await dramaAPI.get(dramaId)
    dramaStyle.value = normalizeArtStyle(drama.value?.style)
    await loadNovelComic()
  } catch (e) {
    toast.error(e.message)
  }
}

async function saveDramaStyle(style) {
  const next = normalizeArtStyle(style)
  if (!drama.value || next === normalizeArtStyle(drama.value.style)) return
  try {
    await dramaAPI.update(dramaId, { style: next })
    drama.value.style = next
    toast.success(`画风已切换为：${artStyleLabel(next)}，请重新生成定妆与配图`)
  } catch (e) {
    dramaStyle.value = normalizeArtStyle(drama.value?.style)
    toast.error(e.message)
  }
}

async function loadConfigs() {
  try {
    const [imgs, vids, auds] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('audio'),
    ])
    imageConfigs.value = imgs || []
    videoConfigs.value = vids || []
    audioConfigs.value = auds || []
    const mode = parseProductionMode(drama.value)
    const pick = (rows, provider) => rows.find(c => c.provider === provider)?.id || rows[0]?.id
    if (usesLocalModelPipeline(mode)) {
      newEpisodeImageConfigId.value = pick(imageConfigs.value, 'comfyui')
      newEpisodeVideoConfigId.value = pick(videoConfigs.value, 'comfyui')
      newEpisodeAudioConfigId.value = pick(audioConfigs.value, 'edge') || pick(audioConfigs.value, 'minimax')
    } else {
      if (!newEpisodeImageConfigId.value && imageConfigs.value.length) newEpisodeImageConfigId.value = imageConfigs.value[0].id
      if (!newEpisodeVideoConfigId.value && videoConfigs.value.length) newEpisodeVideoConfigId.value = videoConfigs.value[0].id
      if (!newEpisodeAudioConfigId.value && audioConfigs.value.length) newEpisodeAudioConfigId.value = audioConfigs.value[0].id
    }
  } catch (e) {
    toast.error(e.message)
  }
}

function openAddEpisode() {
  newEpisodeTitle.value = ''
  const mode = parseProductionMode(drama.value)
  newEpisodeImageModel.value = usesLocalModelPipeline(mode) ? DEFAULT_LOCAL_IMAGE_MODEL : DEFAULT_IMAGE_MODEL
  newEpisodeTextModel.value = usesLocalModelPipeline(mode) ? DEFAULT_LOCAL_TEXT_MODEL : ''
  addDialog.value = true
}

async function addEpisode() {
  try {
    creatingEpisode.value = true
    await episodeAPI.create({
      drama_id: dramaId,
      title: newEpisodeTitle.value || undefined,
      image_config_id: newEpisodeImageConfigId.value,
      image_model: newEpisodeImageModel.value,
      text_model: newEpisodeTextModel.value || undefined,
      video_config_id: newEpisodeVideoConfigId.value,
      audio_config_id: newEpisodeAudioConfigId.value,
    })
    toast.success('已添加新集')
    addDialog.value = false
    load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    creatingEpisode.value = false
  }
}

onMounted(() => { load(); loadConfigs() })
</script>

<style scoped>
.page {
  padding: 28px 48px 40px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  gap: 20px;
}
.head-left { display: flex; align-items: flex-start; gap: 12px; }
.head-info { display: flex; flex-direction: column; gap: 8px; }

.back-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 13px; font-weight: 500;
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-0); color: var(--text-2);
  cursor: pointer; transition: all 0.18s var(--ease-out);
  box-shadow: var(--shadow-xs);
}
.back-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); color: var(--text-0); }

.page-title {
  font-family: var(--font-display);
  font-size: 26px; font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.page-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.style-chip {
  font-size: 11px; font-weight: 500;
  padding: 2px 8px;
  background: var(--accent-bg); color: var(--accent-text);
  border-radius: 99px; border: 1px solid rgba(184,120,20,0.12);
}
.meta-divider { width: 3px; height: 3px; border-radius: 50%; background: var(--text-3); }
.meta-item {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: var(--text-2);
}

.novel-comic-panel {
  max-width: 760px;
  margin-bottom: 28px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.nc-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.nc-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--text-3); text-transform: uppercase; }
.nc-title { font-size: 18px; font-weight: 700; margin: 4px 0; }
.nc-sub { font-size: 13px; color: var(--text-2); margin: 0; }
.nc-badge {
  font-size: 11px; padding: 4px 10px; border-radius: 99px;
  background: var(--accent-bg); color: var(--accent-text); white-space: nowrap;
}
.nc-field { display: flex; flex-direction: column; gap: 6px; }
.nc-textarea { min-height: 160px; resize: vertical; font-family: inherit; line-height: 1.55; }
.nc-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.nc-chapters { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); }
.nc-num { width: 64px; }
.nc-outline { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
.nc-outline-head { display: flex; justify-content: space-between; align-items: center; }
.section-label-inline { font-size: 12px; font-weight: 600; color: var(--text-2); }
.nc-chapter { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.nc-chapter-row { display: flex; gap: 8px; align-items: center; }
.nc-ch-num { font-size: 12px; font-weight: 600; color: var(--text-3); white-space: nowrap; }
.nc-summary { resize: vertical; }
.nc-apply { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; margin-top: 4px; }
.btn-ghost {
  background: transparent; border: 1px solid var(--border); color: var(--text-2);
  padding: 6px 10px; border-radius: var(--radius); cursor: pointer;
}
.btn-ghost:hover { background: var(--bg-hover); }

/* Section label */
.section-label {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 700;
  color: var(--text-3); letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 12px;
}

/* Episode Grid */
.ep-grid { display: flex; flex-direction: column; gap: 10px; max-width: 760px; }

.ep-card {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 16px;
  cursor: pointer;
  animation: fadeUp 0.35s var(--ease-out) both;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s;
}
.ep-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow);
  transform: translateX(4px);
}

.ep-number {
  width: 44px; height: 44px; flex-shrink: 0;
  border-radius: var(--radius);
  background: var(--bg-2);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px; font-weight: 700;
  color: var(--text-2);
  transition: all 0.18s;
}
.ep-card:hover .ep-number {
  background: var(--accent-bg);
  border-color: rgba(184,120,20,0.2);
  color: var(--accent);
}

.ep-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ep-title { font-size: 14px; font-weight: 600; color: var(--text-0); }
.ep-status { display: flex; align-items: center; gap: 6px; }
.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
}
.dot-ready { background: var(--success); }
.dot-pending { background: var(--text-3); }
.status-text { font-size: 11px; color: var(--text-3); }
.ep-duration { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); margin-left: 4px; }

.ep-arrow { color: var(--text-3); flex-shrink: 0; transition: transform 0.18s; }
.ep-card:hover .ep-arrow { transform: translateX(3px); color: var(--accent); }

/* Empty */
.ep-empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 48px; text-align: center; color: var(--text-3); font-size: 13px;
  border-style: dashed;
}
.ep-empty-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--bg-2); display: flex; align-items: center; justify-content: center;
}

.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 38, 0.18);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.dialog {
  width: min(760px, 100%);
  max-height: min(860px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 26px 26px 22px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(122,167,255,0.14), transparent 34%),
    radial-gradient(circle at top right, rgba(76,125,255,0.08), transparent 26%),
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,255,0.92));
  overflow: hidden;
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 22px 52px rgba(32, 48, 77, 0.14), 0 8px 18px rgba(32, 48, 77, 0.08);
}
.dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dialog-head-copy { display: flex; flex-direction: column; gap: 8px; max-width: 520px; }
.dialog-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}
.dialog-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dialog-title { font-size: 28px; font-weight: 800; color: var(--text-0); letter-spacing: -0.03em; }
.dialog-badge {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(76,125,255,0.1);
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 700;
}
.dialog-sub { font-size: 14px; line-height: 1.7; color: var(--text-2); }
.dialog-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.summary-chip {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.78);
  border: 1px solid rgba(27, 41, 64, 0.08);
  font-size: 12px;
  color: var(--text-2);
}
.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 4px;
}
.dialog-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 22px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.dialog-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.dialog-section-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.dialog-section-copy { font-size: 12px; color: var(--text-3); }
.config-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.config-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(244,248,255,0.96), rgba(255,255,255,0.78));
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.config-card-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-3);
}
.dialog-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 2px;
}
.dialog-foot-copy {
  flex: 1;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.field-hint { font-size: 12px; color: var(--text-3); }

@media (max-width: 860px) {
  .dialog {
    width: 100%;
    max-height: calc(100vh - 24px);
    padding: 18px;
    border-radius: 22px;
  }

  .dialog-title {
    font-size: 24px;
  }

  .config-grid {
    grid-template-columns: 1fr;
  }

  .dialog-foot {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
