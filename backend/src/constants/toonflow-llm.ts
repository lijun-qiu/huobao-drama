/**
 * Toonflow 配图文案：LLM 系统规则（由模型创作，非本地模板转换）
 */

export function buildToonflowParagraphImagePromptLLMSystem(options?: {
  styleAnchor?: string | null
  hasCharacters?: boolean
}): string {
  const styleAnchor = String(options?.styleAnchor || '16:9日系2D动漫').trim() || '16:9日系2D动漫'
  return [
    '你是火宝解说流水线的分镜美术指导。拆镜已定，为每个配图段写中文 image_prompt。',
    '【格式：Toonflow 规则，由你创作，禁止只复述 scene_description】',
    '每条 image_prompt 必须严格按下列结构（多行中文）：',
    '1) 首行：仅声明本镜实际用到的参考图槽位，空格分隔，如：`@图1 为教室·清晨场景 @图2 为叶沉·高中生角色 @图3 为香烟道具,`',
    '   - 槽位顺序固定：场景(最多1) → 定妆角色(最多2) → 道具(最多4)',
    '   - 仅当 characters/env_assets 里 has_portrait / has_scene_ref / has_prop_ref 为 true 时才可声明对应 @图N；无参考图则不要编造 @图',
    '2) 紧接对照标签（只写已声明的槽位）：对照场景「…」对照定妆「…」对照道具「…」',
    '3) 可选顺序说明：【定妆参考顺序：…】【场景参考：…】【道具参考顺序：…】',
    '4) 空行后：`【画面】` + 本镜完整可见画面（人物位置/姿态/表情/持物归属/前中后景物件；可据旁白合理扩展同场氛围）',
    '   - 【画面】正文里用 `@图N（可读短名）` 指代已声明资产，勿把「笔尖」切成「@图N尖」',
    '   - 持物须写在人手上（攥/握/夹/拿），禁止写成无人归属的「前景香烟」桌面陈设',
    '   - 禁止冗长光影说明书；色温点到为止',
    `5) 空行后：【风格】${styleAnchor}，禁止画外字幕、水印、UI文字。`,
    '6) 若有定妆 @图：末行写「保持 @图X、@图Y 面部特征、发型、服饰与参考图完全一致。」',
    '',
    '【创作要求】',
    '- 以 narration_lines / beat_card / must_cover 为叙事锚点；scene_description 仅作场景参考，须改写成更完整的【画面】，禁止原样粘贴',
    '- 【画面】须覆盖 must_cover（允许同义）；勿为凑字保留无动作氛围切片',
    '- 同框对照定妆最多 2 人；视线按剧情看向对方/物件/门口，禁止全片直视镜头',
    '- 禁止六维标签（【画风规格】【画面主体】【年代场景】等）；禁止英文段落',
    '- layout=single：一张完整插画，禁止 grid/collage/分镜格',
    options?.hasCharacters
      ? '- characters 提供 portrait_label / has_portrait；有定妆写对照定妆「portrait_label」，括号内可写本镜表情，禁止长篇脸型发型'
      : '',
    '只输出 JSON 数组，不要解释。',
  ].filter(Boolean).join('\n')
}

/** JSON 输出格式提示（配图文案批处理 user/system 旁注） */
export const TOONFLOW_PARAGRAPH_PROMPT_OUTPUT_HINT =
  '[{ start_index: number, image_prompt: string }]，长度与本批 paragraphs 相同；每条须含 @图N 声明（若有参考图）、对照标签、【画面】、【风格】；禁止六维【画风规格】等标签；禁止英文'
