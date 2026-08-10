<template>
  <div
    v-if="visible"
    class="novel-bible-panel"
    :class="{ collapsed: !expanded }"
  >
    <button type="button" class="novel-bible-head" @click="expanded = !expanded">
      <div class="novel-bible-head-main">
        <span class="novel-bible-title">小说设定</span>
        <span class="dim novel-bible-hint">整本大纲与主要角色，各集原文 / 定妆共用</span>
        <span v-if="summary" class="novel-bible-summary">{{ summary }}</span>
      </div>
      <span class="novel-bible-chevron" :class="{ collapsed: !expanded }">▾</span>
    </button>

    <div v-if="expanded" class="novel-bible-body">
      <div class="novel-bible-field">
        <label class="novel-bible-label">作品大纲</label>
        <textarea
          v-model="bible.outline"
          class="novel-bible-textarea"
          rows="4"
          placeholder="整本故事大纲、主线冲突、结局走向……各集拆镜与定妆会参考此处"
        />
      </div>
      <div class="novel-bible-field">
        <label class="novel-bible-label">世界观 / 时代 / 基调</label>
        <textarea
          v-model="bible.setting"
          class="novel-bible-textarea"
          rows="2"
          placeholder="时代背景、世界观、整体气质（可选）"
        />
      </div>

      <div class="novel-bible-cast">
        <div class="novel-bible-cast-head">
          <label class="novel-bible-label">主要角色</label>
          <button type="button" class="btn btn-sm" :disabled="saving" @click="addCharacter">
            添加角色
          </button>
        </div>
        <div v-if="!bible.main_characters.length" class="dim novel-bible-empty">
          暂无角色。填写后可同步到定妆角色表。
        </div>
        <div
          v-for="(ch, idx) in bible.main_characters"
          :key="idx"
          class="novel-bible-cast-row"
        >
          <input v-model="ch.name" class="novel-bible-input" placeholder="姓名">
          <input v-model="ch.role" class="novel-bible-input" placeholder="定位（男主/女主/妻子…）">
          <input
            v-model="ch.brief"
            class="novel-bible-input novel-bible-input-brief"
            placeholder="简介（性格、身份、外貌要点）"
          >
          <button
            type="button"
            class="btn btn-sm novel-bible-remove"
            :disabled="saving"
            @click="removeCharacter(idx)"
          >
            删
          </button>
        </div>
      </div>

      <div class="novel-bible-actions">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? '保存中…' : '保存设定' }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :disabled="saving || !bible.main_characters.some(c => c.name.trim())"
          @click="syncCharacters"
        >
          同步到角色表
        </button>
        <span v-if="bible.updated_at" class="dim" style="font-size:11px">
          已保存 {{ formatUpdatedAt(bible.updated_at) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { dramaAPI } from '~/composables/useApi'
import { parseProductionMode } from '~/composables/useEpisodeWorkflow'

const props = defineProps<{
  dramaId: number
  /** 传入 drama 对象时可按制作模式显示；也可强制 visible */
  drama?: Record<string, unknown> | null
  forceVisible?: boolean
}>()

const emit = defineEmits<{
  synced: []
}>()

type CastRow = { name: string; role: string; brief: string }

const bible = reactive({
  outline: '',
  setting: '',
  main_characters: [] as CastRow[],
  updated_at: null as string | null,
})
const expanded = ref(true)
const saving = ref(false)
const loaded = ref(false)

const productionMode = computed(() => parseProductionMode(props.drama))
const visible = computed(() => {
  if (props.forceVisible) return true
  const mode = productionMode.value
  return mode === 'narration' || mode === 'motion_comic' || mode === 'novel_comic'
})

const summary = computed(() => {
  const parts: string[] = []
  if (String(bible.outline || '').trim()) parts.push('有大纲')
  const n = bible.main_characters.filter(c => String(c.name || '').trim()).length
  if (n) parts.push(`${n} 名角色`)
  return parts.join(' · ')
})

function applyPayload(raw: any) {
  const chars = Array.isArray(raw?.main_characters)
    ? raw.main_characters
    : (Array.isArray(raw?.mainCharacters) ? raw.mainCharacters : [])
  bible.outline = String(raw?.outline || '')
  bible.setting = String(raw?.setting || '')
  bible.main_characters = chars.map((c: any) => ({
    name: String(c?.name || ''),
    role: String(c?.role || ''),
    brief: String(c?.brief || c?.description || ''),
  }))
  bible.updated_at = raw?.updated_at ?? raw?.updatedAt ?? null
  loaded.value = true
}

async function load() {
  if (!props.dramaId) return
  try {
    const data = await dramaAPI.novelBible.get(props.dramaId)
    applyPayload(data)
  } catch (e: any) {
    if (!loaded.value) applyPayload({})
    console.warn('[novel-bible] load failed', e?.message || e)
  }
}

function addCharacter() {
  bible.main_characters.push({ name: '', role: '', brief: '' })
  expanded.value = true
}

function removeCharacter(index: number) {
  bible.main_characters.splice(index, 1)
}

function buildPayload() {
  return {
    outline: bible.outline,
    setting: bible.setting,
    main_characters: bible.main_characters
      .map(c => ({
        name: String(c.name || '').trim(),
        role: String(c.role || '').trim() || undefined,
        brief: String(c.brief || '').trim() || undefined,
      }))
      .filter(c => c.name),
  }
}

async function save() {
  if (!props.dramaId || saving.value) return
  saving.value = true
  try {
    const data = await dramaAPI.novelBible.update(props.dramaId, buildPayload())
    applyPayload(data)
    toast.success('小说设定已保存')
  } catch (e: any) {
    toast.error(e?.message || '保存小说设定失败')
  } finally {
    saving.value = false
  }
}

async function syncCharacters() {
  if (!props.dramaId || saving.value) return
  const named = bible.main_characters.filter(c => String(c.name || '').trim())
  if (!named.length) {
    toast.error('请先填写主要角色')
    return
  }
  saving.value = true
  try {
    const saved = await dramaAPI.novelBible.update(props.dramaId, buildPayload())
    applyPayload(saved)
    const result = await dramaAPI.novelBible.syncCharacters(props.dramaId)
    toast.success(`已同步角色：新建 ${result.created || 0}，更新 ${result.updated || 0}`)
    emit('synced')
  } catch (e: any) {
    toast.error(e?.message || '同步角色失败')
  } finally {
    saving.value = false
  }
}

function formatUpdatedAt(raw: string) {
  try {
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return raw
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return raw
  }
}

onMounted(() => { void load() })
watch(() => props.dramaId, () => { void load() })
</script>

<style scoped>
.novel-bible-panel {
  max-width: 760px;
  margin-bottom: 28px;
  border-radius: 14px;
  border: 1px solid rgba(27, 41, 64, 0.1);
  background: rgba(252, 253, 255, 0.92);
  box-shadow: 0 6px 18px rgba(20, 32, 54, 0.05);
  overflow: hidden;
}
.novel-bible-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.novel-bible-head-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.novel-bible-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-0);
}
.novel-bible-hint { font-size: 12px; color: var(--text-2); }
.novel-bible-summary {
  font-size: 11px;
  color: var(--accent, #3b6fd9);
  background: rgba(59, 111, 217, 0.08);
  padding: 2px 8px;
  border-radius: 999px;
}
.novel-bible-chevron {
  color: var(--text-3);
  transition: transform 0.15s;
  font-size: 12px;
  flex-shrink: 0;
}
.novel-bible-chevron.collapsed { transform: rotate(-90deg); }
.novel-bible-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 14px;
  border-top: 1px solid rgba(27, 41, 64, 0.06);
  padding-top: 12px;
}
.novel-bible-field { display: flex; flex-direction: column; gap: 4px; }
.novel-bible-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}
.novel-bible-textarea,
.novel-bible-input {
  width: 100%;
  border: 1px solid rgba(27, 41, 64, 0.12);
  border-radius: 10px;
  background: #fff;
  color: var(--text-0);
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
  resize: vertical;
  font-family: inherit;
}
.novel-bible-input { resize: none; }
.novel-bible-cast { display: flex; flex-direction: column; gap: 8px; }
.novel-bible-cast-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.novel-bible-empty { font-size: 12px; }
.novel-bible-cast-row {
  display: grid;
  grid-template-columns: minmax(72px, 0.9fr) minmax(90px, 1fr) minmax(140px, 2fr) auto;
  gap: 6px;
  align-items: center;
}
.novel-bible-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 2px;
}
@media (max-width: 900px) {
  .novel-bible-cast-row {
    grid-template-columns: 1fr 1fr auto;
  }
  .novel-bible-input-brief { grid-column: 1 / -1; }
}
</style>
