import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest } from '../utils/response.js'
import { generateImage, reconcileStaleProcessingImageGenerations } from '../services/image-generation.js'
import {
  resolveEpisodeImageModel,
  resolveSceneImageModel,
  resolveStoryboardImageModel,
  imageModelMaxReferenceImages,
  imageModelSupportsReferenceImages,
} from '../constants/image-models.js'
import { resolveEpisodeProductionMode, usesLocalModelPipeline } from '../constants/production-mode.js'
import {
  normalizeArtStyle,
  resolveEpisodeVisualStyle,
} from '../constants/art-styles.js'
import { isFluxImageModel, isKolorsImageModel, isSdxlInstantIdImageModel } from '../services/comfyui-client.js'
import { collapseToSinglePortraitLabelInImagePromptCn } from '../constants/portrait-appearance-spec.js'
import { MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS } from '../constants/motion-comic.js'
import {
  collectCharacterReferenceImages,
  collectCharacterReferenceImagesByPortraitLabels,
  formatCharacterDisplayName,
  getEpisodeVisualCharacters,
  resolveStoryboardCharacterIdsForShot,
} from '../services/narration-characters.js'
import {
  collectPropReferenceImagesByLabels,
  collectSceneReferenceImagesByLabels,
  enrichImagePromptWithEnvAssets,
  listEpisodeNarrationProps,
  listEpisodeNarrationScenes,
  matchPropsForNarrationLines,
  prioritizeTypedImageRefs,
  sceneLabelOf,
  storyboardNarrationLinesForEnv,
  type TypedImageRef,
} from '../services/narration-scene-assets.js'
import {
  isToonflowStyleImagePrompt,
  parseToonflowAtImageSlots,
} from '../services/toonflow-storyboard-prompt.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'

const app = new Hono()

// POST /images — Generate image
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.prompt) return badRequest(c, 'prompt is required')

  try {
    let configId: number | undefined = body.config_id
    let episode: { id?: number; imageConfigId?: number | null; imageModel?: string | null; dramaId?: number } | null = null
    let prompt = String(body.prompt || '')
    let referenceImages: string[] | Array<{ url?: string }> | undefined = body.reference_images
    let dramaStyle: string | null = null
    let imageStyle: string | null = body.image_style ?? body.imageStyle ?? null
    // 默认开；显式 false 时不挂定妆参考（场面优先）
    const usePortraitReference = body.use_portrait_reference !== false && body.usePortraitReference !== false
    const useSceneReference = body.use_scene_reference !== false && body.useSceneReference !== false
    const usePropReference = body.use_prop_reference !== false && body.usePropReference !== false
    const panelTextModeRaw = body.panel_text_mode ?? body.panelTextMode
    const panelTextMode = panelTextModeRaw === 'full' || panelTextModeRaw === 'long'
      ? 'full' as const
      : panelTextModeRaw === 'short'
        ? 'short' as const
        : undefined

    if (body.storyboard_id) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb) {
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        episode = ep || null
        if (ep?.imageConfigId != null) configId = ep.imageConfigId

        const productionMode = resolveEpisodeProductionMode(ep.id)
        const useLocalPipeline = usesLocalModelPipeline(productionMode)
        const resolved = resolveStoryboardCharacterIdsForShot(sb.id, { sync: true })
        const model = resolveStoryboardImageModel(ep, body.model, productionMode)
        const allChars = getEpisodeVisualCharacters(sb.episodeId, ep!.dramaId)
        const [drama] = db.select({ style: schema.dramas.style }).from(schema.dramas).where(eq(schema.dramas.id, ep!.dramaId)).all()
        dramaStyle = drama?.style ?? null
        if (!imageStyle) imageStyle = resolveEpisodeVisualStyle(ep.id, { dramaStyle })
        let portraitLabelsForRefs: string[] = []
        let sceneLabelsForRefs: string[] = []
        let propLabelsForRefs: string[] = []
        const typedRefs: TypedImageRef[] = []
        // 按文案内容挂参考；仅用模型软上限兜底，不再额外卡死 4 张
        const maxTotal = Math.max(1, imageModelMaxReferenceImages(model))

        if (!usePortraitReference && !useSceneReference && !usePropReference) {
          referenceImages = []
          logTaskStart('ImageAPI', 'refs-disabled', { storyboardId: sb.id })
        } else if (imageModelSupportsReferenceImages(model)) {
          const epScenes = listEpisodeNarrationScenes(sb.episodeId)
          const epProps = listEpisodeNarrationProps(sb.episodeId)
          const toonflowPrompt = isToonflowStyleImagePrompt(prompt)
          // Toonflow 文案已含对照/@图N；勿再灌场景 bible。旧文案仍补标签。
          if (!toonflowPrompt) {
            prompt = enrichImagePromptWithEnvAssets(prompt, sb, { scenes: epScenes, props: epProps })
          }

          if (useSceneReference) {
            const byScene = collectSceneReferenceImagesByLabels(prompt, epScenes, 1)
            for (let i = 0; i < byScene.refs.length; i++) {
              typedRefs.push({ url: byScene.refs[i], kind: 'scene' })
            }
            sceneLabelsForRefs = byScene.labels
            // 无标签时回退 storyboard.scene_id
            if (!typedRefs.length && sb.sceneId) {
              const sc = epScenes.find(s => s.id === sb.sceneId)
              const url = String(sc?.imageUrl || '').trim()
              if (sc && url) {
                typedRefs.push({ url, kind: 'scene' })
                sceneLabelsForRefs = [sceneLabelOf(sc)]
              }
            }
          }

          if (usePortraitReference) {
            // 定妆张数按文案点名，不因「给道具留坑」而提前砍掉
            const maxPortrait = MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS
            const byLabels = collectCharacterReferenceImagesByPortraitLabels(prompt, allChars, maxPortrait)
            const charRefs = byLabels.refs.length
              ? byLabels.refs.slice(0, maxPortrait)
              : (resolved.characterIds.length
                ? collectCharacterReferenceImages(allChars, resolved.characterIds, maxPortrait)
                : [])
            for (const url of charRefs) typedRefs.push({ url, kind: 'portrait' })
            portraitLabelsForRefs = (byLabels.names.length
              ? byLabels.names
              : (byLabels.allLabels.length ? byLabels.allLabels.slice(0, charRefs.length) : [])
            ).slice(0, maxPortrait)

            // 仅裁剪超限定妆标签以对齐参考图槽位；不在生图时注入辨识差/动作壳
            if ([...prompt.matchAll(/对照定妆「/g)].length > maxPortrait) {
              const keepLabel = byLabels.names[0] || byLabels.allLabels[0] || ''
              if (keepLabel) {
                prompt = collapseToSinglePortraitLabelInImagePromptCn(prompt, keepLabel, allChars)
              }
            }
            if (byLabels.characterIds.length > resolved.characterIds.length) {
              logTaskStart('ImageAPI', 'portrait-label-refs', {
                storyboardId: sb.id,
                labels: byLabels.names,
                characterIds: byLabels.characterIds,
              })
            }
          }

          if (usePropReference) {
            // 本镜旁白/文案命中的道具全部挂上（再由 maxTotal 软截）
            const propCap = Math.max(epProps.length, 8)
            let byProp = collectPropReferenceImagesByLabels(prompt, epProps, propCap)
            if (!byProp.refs.length) {
              const hit = matchPropsForNarrationLines(
                storyboardNarrationLinesForEnv(sb),
                epProps.map(p => ({
                  id: p.id,
                  prop_label: p.name,
                  has_prop_ref: !!String(p.imageUrl || '').trim(),
                  description: String(p.description || p.prompt || ''),
                })),
              ).filter(p => p.has_prop_ref)
              const refs: string[] = []
              const labels: string[] = []
              for (const p of hit) {
                const row = epProps.find(x => x.id === p.id)
                const url = String(row?.imageUrl || '').trim()
                if (!url) continue
                refs.push(url)
                labels.push(p.prop_label)
              }
              byProp = { refs, labels, propIds: hit.map(p => p.id) }
            }
            for (let i = 0; i < byProp.refs.length; i++) {
              typedRefs.push({ url: byProp.refs[i], kind: 'prop' })
            }
            propLabelsForRefs = byProp.labels
          }

          const bodyRefs = Array.isArray(referenceImages)
            ? referenceImages.map(item => (typeof item === 'string' ? item : item?.url || '')).filter(Boolean)
            : []
          if (!typedRefs.length && bodyRefs.length) {
            for (const url of bodyRefs.slice(0, maxTotal)) typedRefs.push({ url, kind: 'portrait' })
          }

          // Toonflow：严格按 @图N 顺序挂参考；按 label 对齐，禁止同 kind 池序号错位
          const atSlots = parseToonflowAtImageSlots(prompt)
          if (atSlots.length) {
            const scenePool = typedRefs.filter(r => r.kind === 'scene')
            const portraitPool = typedRefs.filter(r => r.kind === 'portrait')
            const propPool = typedRefs.filter(r => r.kind === 'prop')
            const used = new Set<string>()
            const takeByLabel = (
              pool: TypedImageRef[],
              labels: string[],
              slotLabel: string,
            ): TypedImageRef | undefined => {
              const base = slotLabel.split(/[·•]/)[0]?.trim() || slotLabel
              const want = (lab: string) => {
                const lb = String(lab || '').trim()
                return lb === slotLabel || lb === base
                  || lb.startsWith(base) || slotLabel.startsWith(lb.split(/[·•]/)[0] || '')
              }
              // 优先：同序 labels 与 pool 对齐后的精确下标
              const li = labels.findIndex(want)
              if (li >= 0 && li < pool.length && !used.has(pool[li].url)) {
                used.add(pool[li].url)
                return pool[li]
              }
              // 回退：按 pool 顺序取第一个未用
              for (const r of pool) {
                if (used.has(r.url)) continue
                used.add(r.url)
                return r
              }
              return undefined
            }
            const ordered: TypedImageRef[] = []
            const nextPortraitLabels: string[] = []
            const nextSceneLabels: string[] = []
            const nextPropLabels: string[] = []
            for (const slot of atSlots) {
              if (ordered.length >= maxTotal) break
              let hit: TypedImageRef | undefined
              if (slot.kind === 'scene') {
                hit = takeByLabel(scenePool, sceneLabelsForRefs, slot.label)
                if (hit) nextSceneLabels.push(slot.label)
              } else if (slot.kind === 'portrait') {
                hit = takeByLabel(portraitPool, portraitLabelsForRefs, slot.label)
                if (hit) nextPortraitLabels.push(slot.label)
              } else if (slot.kind === 'prop') {
                hit = takeByLabel(propPool, propLabelsForRefs, slot.label)
                if (hit) nextPropLabels.push(slot.label)
              }
              if (hit) ordered.push(hit)
            }
            for (const pool of [scenePool, portraitPool, propPool]) {
              for (const r of pool) {
                if (ordered.length >= maxTotal) break
                if (used.has(r.url) || ordered.some(x => x.url === r.url)) continue
                used.add(r.url)
                ordered.push(r)
              }
            }
            referenceImages = ordered
            portraitLabelsForRefs = nextPortraitLabels
            sceneLabelsForRefs = nextSceneLabels
            propLabelsForRefs = nextPropLabels
            logTaskStart('ImageAPI', 'refs-toonflow-order', {
              storyboardId: sb.id,
              slots: atSlots.map(s => `@图${s.index}:${s.kind}:${s.label}`),
              kept: ordered.map(r => r.kind),
            })
          } else {
            // 软截断：1 场景 → 点名道具 → 肖像(≤2) → 其余
            const namedPropUrls = typedRefs.filter(r => r.kind === 'prop').map(r => r.url)
            referenceImages = prioritizeTypedImageRefs(typedRefs, {
              maxTotal,
              maxPortrait: MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS,
              namedPropUrls,
            })
            if (typedRefs.length > maxTotal || referenceImages.length < typedRefs.length) {
              const kept = referenceImages as TypedImageRef[]
              sceneLabelsForRefs = sceneLabelsForRefs.slice(0, kept.filter(r => r.kind === 'scene').length)
              portraitLabelsForRefs = portraitLabelsForRefs.slice(0, kept.filter(r => r.kind === 'portrait').length)
              propLabelsForRefs = propLabelsForRefs.slice(0, kept.filter(r => r.kind === 'prop').length)
              logTaskStart('ImageAPI', 'refs-soft-capped', {
                storyboardId: sb.id,
                wanted: typedRefs.length,
                kept: kept.length,
                kinds: kept.map(r => r.kind),
                priority: 'scene>namedProp>portrait>restProp',
              })
            }
          }
        }
        if (resolved.characterIds.length || portraitLabelsForRefs.length || sceneLabelsForRefs.length || propLabelsForRefs.length) {
          logTaskStart('ImageAPI', 'resolve-characters', {
            storyboardId: sb.id,
            characterIds: resolved.characterIds,
            portraitLabels: portraitLabelsForRefs,
            sceneLabels: sceneLabelsForRefs,
            propLabels: propLabelsForRefs,
            labels: resolved.characters.map(ch => formatCharacterDisplayName(ch)),
          })
        }
        // 与参考图顺序对齐的标签写入 prompt，供 Agnes 多图 identity map（避免缺图时索引错位）
        if (
          portraitLabelsForRefs.length
          && Array.isArray(referenceImages)
          && referenceImages.length
          && !/【定妆参考顺序：/.test(prompt)
        ) {
          prompt = `【定妆参考顺序：${portraitLabelsForRefs.join('、')}】${prompt}`
        }
        if (sceneLabelsForRefs.length && !/【场景参考：/.test(prompt)) {
          prompt = `【场景参考：${sceneLabelsForRefs.join('、')}】${prompt}`
        }
        if (propLabelsForRefs.length && !/【道具参考顺序：/.test(prompt)) {
          prompt = `【道具参考顺序：${propLabelsForRefs.join('、')}】${prompt}`
        }
      }
    } else if (body.drama_id) {
      const [drama] = db.select({ style: schema.dramas.style }).from(schema.dramas).where(eq(schema.dramas.id, Number(body.drama_id))).all()
      dramaStyle = drama?.style ?? null
      if (!imageStyle) imageStyle = normalizeArtStyle(dramaStyle)
    }

    // 所有生图：只按传入/落库文案，禁止六维/画风壳编译（画风等须在文案生成阶段写入）
    let negativePrompt: string | undefined
    const localPipeline = episode?.id ? usesLocalModelPipeline(resolveEpisodeProductionMode(episode.id)) : false
    const productionMode = episode?.id ? resolveEpisodeProductionMode(episode.id) : undefined
    const resolvedModel = body.character_id
      ? resolveEpisodeImageModel(episode, body.model, productionMode)
      : body.storyboard_id
        ? resolveStoryboardImageModel(episode, body.model, productionMode)
        : resolveSceneImageModel(episode, body.model, productionMode)

    // 本地 Flux/Kolors：以分镜落库文案为准；但保留上方刚挂的场景/道具参考标签前缀，并补齐对照标签
    if (body.storyboard_id && localPipeline && (isFluxImageModel(resolvedModel) || isKolorsImageModel(resolvedModel) || isSdxlInstantIdImageModel(resolvedModel))) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb?.imagePrompt?.trim()) {
        const prefixBits = [
          (prompt.match(/【定妆参考顺序：[^】]+】/) || [])[0],
          (prompt.match(/【场景参考：[^】]+】/) || [])[0],
          (prompt.match(/【道具参考顺序：[^】]+】/) || [])[0],
        ].filter(Boolean)
        let base = enrichImagePromptWithEnvAssets(String(sb.imagePrompt).trim(), sb)
        for (const bit of prefixBits) {
          if (bit && !base.includes(bit)) base = `${bit}${base}`
        }
        prompt = base
      }
    }

    const model = resolvedModel

    logTaskStart('ImageAPI', 'generate', {
      storyboardId: body.storyboard_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      dramaId: body.drama_id,
      frameType: body.frame_type,
    })
    logTaskPayload('ImageAPI', 'request body', body)
    const id = await generateImage({
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      prompt,
      negativePrompt,
      model,
      style: imageStyle || dramaStyle || undefined,
      size: body.size,
      referenceImages: Array.isArray(referenceImages) ? referenceImages as string[] : undefined,
      usePortraitReference,
      panelTextMode,
      frameType: body.frame_type,
      configId,
    })

    const [record] = db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.id, id)).all()
    logTaskSuccess('ImageAPI', 'generate', { generationId: id, provider: record?.provider })
    return created(c, record ? toSnakeCase(record) : null)
  } catch (err: any) {
    logTaskError('ImageAPI', 'generate', { error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /images/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  // 轮询单条时也清超时僵尸，避免前端一直「生图中」
  const [probe] = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id)).all()
  if (probe?.dramaId != null) reconcileStaleProcessingImageGenerations(probe.dramaId)
  const [row] = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id)).all()
  return success(c, row ? toSnakeCase(row) : null)
})

// GET /images — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')
  const gridOnly = c.req.query('grid_only') === '1' || c.req.query('grid_only') === 'true'

  let rows: typeof schema.imageGenerations.$inferSelect[] = []
  if (storyboardId) {
    rows = db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.storyboardId, Number(storyboardId)))
      .all()
  } else if (dramaId) {
    reconcileStaleProcessingImageGenerations(Number(dramaId))
    rows = db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.dramaId, Number(dramaId)))
      .all()
  } else {
    rows = db.select().from(schema.imageGenerations).all()
  }

  if (gridOnly) {
    rows = rows.filter(r =>
      r.status === 'completed'
      && String(r.frameType || '').startsWith('grid_')
      && !!(r.localPath?.trim()),
    )
  }

  return success(c, toSnakeCaseArray(rows))
})

// DELETE /images/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).run()
  return success(c)
})

export default app
