/**
 * Flux 配图文案 LLM 翻译术语表（仅注入 system prompt；只含万能结构/构图词，无剧本特例）
 */
export const FLUX_TRANSLATE_GLOSSARY_LINES = [
  '对照定妆「label」 → matching reference portrait for character "label" (NEVER "contrasting makeup", NEVER makeup)',
  '对照定妆 → matching reference portrait (match the character design sheet)',
  '定妆 → character reference portrait / character design reference',
  '电影感日系动漫 / 电影感动漫 → cinematic anime illustration',
  '赛璐璐 → cel shading',
  '线稿 / 干净线稿 → clean lineart',
  '头身比 → body proportions',
  '非Q版 → not chibi',
  '无配角 → no supporting characters',
  '近景 → close-up, shoulders visible (有姿态/动作时规则覆盖为 MCU chest-up)',
  '中近景 → MCU chest-up, hands in frame (Camera 由规则模板覆盖，勿意译)',
  '中景 → medium shot',
  '中远景 → medium-wide shot',
  '全景 / 远景 → wide establishing shot',
  '过肩 → over-the-shoulder shot',
  '头高约占画面高度X% → subject head about X% of frame height (framing cue, keep the number)',
  '须可见坐姿肩线与手部 → sitting shoulders and hands must remain visible',
  '须可见上半身与手部 → upper body and hands must remain visible',
  '从头顶到脚完整入镜 → full body from head to feet in frame',
  '镜头朝向主人公上半身与… → camera aimed at the subject upper body and …',
  '俯视 / 俯视角度 → high-angle view (NEVER leave 俯视 in output)',
  '仰视 / 仰视角度 → low-angle view (NEVER leave 仰视 in output)',
  '平视 → eye-level camera',
  '背景虚化 → shallow depth of field with softly blurred background',
  '轮廓光 → rim light',
  '无文字无水印 → no text, no watermark',
  'CRITICAL: zero Chinese characters (汉字) in output — translate every CJK token to English',
  'When monitors, laptops, phones, or tablets appear: describe VISIBLE on-screen UI/content — never leave screens as blank black panels',
  '【核心细节动作】must describe physical hand/body interaction, not only facial mood words',
  'Prefer concrete English nouns/verbs (sit, raise hand, hold, mirror, desk) over abstract mood words',
] as const

export function buildFluxTranslateGlossaryBlock(): string {
  return [
    'PROJECT GLOSSARY (mandatory; use exactly these renderings):',
    ...FLUX_TRANSLATE_GLOSSARY_LINES.map(line => `- ${line}`),
  ].join('\n')
}
