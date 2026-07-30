/**
 * Flux 分镜 prompt 运行时增强：补全屏幕内容、强化与中文一致的具体动作。
 */
import { compressFluxEnglishPrompt, parseFluxEnglishSections } from '../constants/flux-prompt-compact.js'

function sanitizeFluxPrompt(text: string): string {
  return String(text || '')
    .replace(/score_\d+(?:_up)?,?\s*/gi, '')
    .replace(/source_anime,?\s*/gi, '')
    .replace(/,\s*,+/g, ', ')
    .replace(/\.\s*\./g, '.')
    .replace(/^,\s*|,\s*$/g, '')
    .trim()
}

function parseChineseFluxSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {}
  for (const m of String(raw || '').matchAll(/【([^：]+)：([^】]+)】/g)) {
    sections[m[1].trim()] = m[2].trim()
  }
  return sections
}

function collapseContext(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(' ')
}

function hasDisplayDevice(text: string): boolean {
  return /monitor|display|laptop|computer|keyboard|mouse|phone|smartphone|tablet|dual.?monitor|screen glow|desk setup|workstation/i.test(text)
    || /显示器|电脑|笔记本|手机|屏幕|键盘|鼠标|平板|双屏|工位|办公/.test(text)
}

function hasScreenContent(text: string): boolean {
  return /showing|displaying|on (?:the )?(?:monitor|screen|phone|laptop|display)|IDE|code editor|chat app|browser window|dashboard|game HUD|message bubbles|syntax-highlighted|application UI|not blank|app windows|webpage|terminal panel|spreadsheet|video call/i.test(text)
}

function hasScreenFacingHint(text: string): boolean {
  return /screen facing|facing (?:the )?(?:viewer|camera)|three-?quarter|visible (?:UI|screen content)|screens? (?:toward|towards)|正面|略侧|朝向镜头|可见(?:亮屏|屏幕|界面|UI)/i.test(text)
}

type EraBucket = 'modern' | '90s' | '80s' | 'unknown'

function inferEraBucket(text: string): EraBucket {
  const t = String(text || '')
  // 时代氛围词优先于设备型号（避免「现代+CRT误植」被判成九十年代）
  if (/八十年代|80年代|改革开放初期/.test(t)) return '80s'
  if (/九十年代|90年代|千禧年?代?/.test(t)) return '90s'
  if (/现代|当代|现今|如今/.test(t)) return 'modern'
  if (/煤油灯|二八杠/.test(t)) return '80s'
  if (/CRT|显像管|米色显示器|BP机|寻呼机|功能机|直板机|大哥大/.test(t)) return '90s'
  if (/智能手机|全面屏|液晶|超薄笔记本|触屏|平板/.test(t)) return 'modern'
  return 'unknown'
}

function hasEraPropClash(text: string): boolean {
  const t = String(text || '')
  const hasCrt = /CRT|显像管|米色(?:厚)?显示器|厚显示器|cathode|beige monitor/i.test(t)
  const hasModernPeripheral =
    /超薄|巧克力键盘|chiclet|slim keyboard|全面屏|智能手机|smartphone|触屏手机|薄边框笔记本|thin[- ]bezel|现代键鼠/i.test(t)
  const hasModernScreen = /液晶|LED\s*monitor|flat[- ]screen|超薄笔记本|laptop/i.test(t)
  const hasRetroPhone = /BP机|寻呼机|功能机|直板机|大哥大|flip phone|feature phone/i.test(t)
  return (hasCrt && hasModernPeripheral) || (hasModernScreen && hasRetroPhone && hasCrt)
}

function eraPropSuiteHint(era: EraBucket): string {
  if (era === '90s' || era === '80s') {
    return 'period-consistent 1990s beige CRT monitor facing viewer at slight three-quarter angle with visible screen content, thick-keycap keyboard, optional feature phone screen facing viewer, NO modern smartphone, NO chiclet slim keyboard, NOT device backs'
  }
  return 'period-consistent modern flat LCD or laptop screen facing viewer at slight three-quarter angle with visible UI, modern slim keyboard and smartphone screen facing viewer, NO beige CRT monitor, NOT phone back or monitor rear casing'
}

function inferScreenFacingHint(ctx: string): string {
  if (!hasDisplayDevice(ctx)) return ''
  if (hasScreenFacingHint(ctx)) return ''
  if (/手机|phone|smartphone|handheld/i.test(ctx)) {
    return 'phone held at slight three-quarter angle with bright screen facing viewer showing UI content, NOT phone back casing, NOT camera module facing camera'
  }
  return 'monitor or laptop screen facing viewer at slight three-quarter angle with visible UI content on screen, NOT device rear casing, NOT blank black screen only'
}

function isLightingOnlyAction(action: string): boolean {
  const a = String(action || '').trim()
  if (!a) return false
  const lighting = /蓝光|屏幕光|光晕|映照|轮廓线|专注感|数据流|屏幕 glow|monitor glow|contour|focused expression/i.test(a)
  const physical = /敲|打|握|拿|滑|点|按|举|抬|转|走|跑|坐|站|靠|推|拉|吃|喝|读|写|操作|交互|typing|hands|fingers|holding|scrolling|clicking|typing|grasp|lean|reach|pick|drink|eat|walk|run|stand|sit/i.test(a)
  return lighting && !physical
}

type ScreenRule = { test: RegExp; content: string }

const SCREEN_CONTENT_RULES: ScreenRule[] = [
  {
    test: /编程|写代码|敲代码|vscode|ide|终端|terminal|debug|调试|developer|coding|programming|程序员|代码流|数据流/i,
    content: 'monitor showing IDE with syntax-highlighted code editor and terminal panel, colorful code blocks on screen not blank',
  },
  {
    test: /打字|敲键盘|typing|keyboard|输入|撰写|写文档|word|excel|ppt|办公文档|文档编辑/i,
    content: 'monitor showing document editor or spreadsheet with visible text lines and UI toolbar, lit screen with content',
  },
  {
    test: /手机|phone|刷|微信|短信|聊天|message|通知|来电|app/i,
    content: 'phone held at slight three-quarter angle, bright screen facing viewer showing chat app message bubbles and icons, visible UI, NOT phone back',
  },
  {
    test: /游戏|game|steam|打游戏|电竞/i,
    content: 'screen showing video game HUD and colorful gameplay scene, active game display',
  },
  {
    test: /视频|直播|会议|zoom|call|facetime|网课|上课/i,
    content: 'monitor showing video conference grid with participant thumbnails and call UI',
  },
  {
    test: /数据|图表|dashboard|分析|报表|stock|股票|k线|可视化|metrics/i,
    content: 'monitor showing data dashboard with charts graphs and metrics panels, analytics UI on screen',
  },
  {
    test: /浏览|网页|网站|search|百度|google|上网/i,
    content: 'browser window with webpage layout navigation bar and content area on monitor',
  },
  {
    test: /设计|figma|ps|photoshop|画图|绘图|canvas/i,
    content: 'monitor showing design software canvas with layers panel and colorful artwork',
  },
  {
    test: /显示器|monitor|电脑|laptop|笔记本|屏幕|screen|dual monitor|双屏|键盘|mouse|工位|办公/i,
    content: 'monitor or laptop screen facing viewer at slight three-quarter angle, lit with colorful productivity application windows, not blank black display, NOT monitor rear casing',
  },
]

function inferScreenContentHint(ctx: string): string {
  if (!hasDisplayDevice(ctx)) return ''
  if (hasScreenContent(ctx)) return ''
  for (const rule of SCREEN_CONTENT_RULES) {
    if (rule.test.test(ctx)) return rule.content
  }
  return ''
}

type ActionRule = { test: RegExp; phrase: string }

const ACTION_BOOST_RULES: ActionRule[] = [
  { test: /敲键盘|打字|typing|键盘|transparent glass keyboard/i, phrase: 'fingers actively typing on keyboard, hands on desk' },
  { test: /鼠标|mouse|点击|click/i, phrase: 'hand on mouse clicking, other hand on keyboard' },
  { test: /电脑交互|与电脑|computer|monitor|显示器|办公/i, phrase: 'working at computer, eyes on monitor while hands operate keyboard and mouse' },
  { test: /手机|phone|刷|微信|短信/i, phrase: 'holding smartphone at slight angle with bright screen facing viewer, thumb scrolling UI, looking at phone not camera' },
  { test: /滑|scroll|浏览/i, phrase: 'scrolling on device screen with finger or mouse' },
  { test: /写|write|撰写|记录/i, phrase: 'writing or note-taking at desk with visible hand motion' },
  { test: /喝|coffee|茶|杯/i, phrase: 'lifting cup to drink, natural hand gesture' },
  { test: /揉眼|扶框|window frame|rubbing eye/i, phrase: 'one hand on window frame, other hand rubbing sleepy eye' },
  { test: /推门|开门|enter|walk in/i, phrase: 'pushing door open while stepping into room' },
  { test: /坐|sitting|坐姿/i, phrase: 'seated at desk in natural working posture' },
  { test: /站|standing|站立/i, phrase: 'standing in scene with weight shifted naturally' },
]

function inferConcreteActionPhrase(ctx: string, actionCn: string, actionEn: string): string {
  const merged = collapseContext(ctx, actionCn, actionEn)
  const lightingOnly = isLightingOnlyAction(actionCn) || isLightingOnlyAction(actionEn)
  if (!lightingOnly && /hands?|fingers|typing|holding|clicking|scrolling|pushing|pulling|drinking|writing|rubbing|stepping|working at/i.test(actionEn)) {
    return ''
  }
  for (const rule of ACTION_BOOST_RULES) {
    if (rule.test.test(merged)) return rule.phrase
  }
  if (lightingOnly && hasDisplayDevice(merged)) {
    return 'actively working at desk, hands on keyboard, eyes on monitor'
  }
  return ''
}

function actionEnTooVague(actionEn: string): boolean {
  const a = String(actionEn || '').trim()
  if (!a) return true
  if (a.length < 28) return true
  return isLightingOnlyAction(a)
    || /interacting with (?:the )?computer|focused expression|monitor glow|screen (?:blue )?light/i.test(a)
      && !/typing|clicking|holding|scrolling|writing|pushing|drinking|hand|finger|mouse|keyboard/i.test(a)
}

function isSectionTruncated(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return true
  if (/\b(and|with|or|mult|mechan|transpar|keyboar|highligh|display|relatio|intera|interact|relationsh)\s*\.?\s*$/i.test(t)) return true
  if (/\([^)]*$/.test(t)) return true
  if (/,\s*$/.test(t)) return true
  return false
}

const SCENE_PROP_MAP: Array<[RegExp, string]> = [
  [/现代办公空间|办公室|工位/, 'modern office workspace'],
  [/深夜工作室|工作室/, 'late-night studio workspace'],
  [/深灰色金属框架办公桌|金属框架办公桌/, 'dark grey metal-frame desk'],
  [/木质桌面/, 'wooden desktop surface'],
  [/透明玻璃键盘/, 'transparent glass keyboard on desk'],
  [/机械键盘/, 'mechanical keyboard on desk'],
  [/机械鼠标/, 'mechanical computer mouse on desk'],
  [/多接口USB设备盒|USB设备/, 'multi-port USB hub and cable box on desk'],
  [/电脑机箱/, 'computer tower case edge visible in background'],
  [/双屏|双显示器|两台显示器/, 'dual monitors on desk'],
  [/显示器|屏幕/, 'computer monitor on desk'],
  [/笔记本电脑|笔记本/, 'laptop computer on desk'],
  [/充电线|线束/, 'charging cables and power strip on desk'],
  [/双层床|上下铺|上下床/, 'bunk bed frame with wrinkled bedsheets'],
]

function extractPropsEnFromChineseScene(sceneCn: string): string {
  const items: string[] = []
  for (const [re, en] of SCENE_PROP_MAP) {
    if (re.test(sceneCn) && !items.some(i => i.includes(en.split(' ')[0]))) items.push(en)
  }
  return items.join(', ')
}

function extractActionEnFromChinese(actionCn: string, subjectCn: string): string {
  const merged = `${actionCn} ${subjectCn}`
  if (/双手快速敲键|快速敲键|敲键|敲键盘|打字/.test(merged)) {
    return 'both hands fast typing on mechanical keyboard, fingers on keycaps'
  }
  if (/双手捧|双手握|双手举|双手抬|双手紧|双手放在|双手搭/.test(merged)) return ''
  if (/敲键盘|打字|typing/.test(merged)) return 'fingers actively typing on keyboard'
  if (/滑|scroll|浏览/.test(merged)) return 'scrolling on screen with finger or mouse'
  if (/揉眼|扶框/.test(merged)) return 'one hand on window frame, other hand rubbing eye'
  if (/坐姿|坐在|办公桌前/.test(merged)) return 'sitting at desk in working posture'
  return ''
}

function hasSupportingCharacterMention(subjectCn: string, actionCn: string): boolean {
  const merged = `${subjectCn} ${actionCn}`
  return /室友|同学|配偶|伴侣|对面.{0,8}(?:站|坐|探|递)|两人|双人|交流|互动|递过|探身|并肩|过肩/.test(merged)
}

function extractSupportingCharactersFromChinese(subjectCn: string, actionCn: string): string {
  const parts: string[] = []
  const merged = `${subjectCn} ${actionCn}`
  if (hasSupportingCharacterMention(subjectCn, actionCn)) {
    if (/#627b8d|低饱和便装/.test(merged)) {
      parts.push('supporting character in frame wearing muted #627b8d casual clothes, distinct from protagonist')
    } else {
      parts.push('second person in scene with clear spatial relationship to protagonist, low-saturation casual outfit')
    }
  }
  if (/递过|递给|交给|hand(?:ing)? over|passing/.test(actionCn)) {
    parts.push('supporting character leaning forward handing an object to protagonist')
  }
  if (/指着屏幕|指屏幕|指向|gesturing toward/.test(actionCn)) {
    parts.push('supporting character gesturing toward shared screen or object')
  }
  return parts.join(', ')
}

function extractSubjectsEnFromChinese(subjectCn: string, actionCn = ''): string {
  const parts: string[] = ['protagonist matching reference portrait same face and hairstyle']
  const support = extractSupportingCharactersFromChinese(subjectCn, actionCn)
  if (support) parts.push(support)
  if (/男性|男/.test(subjectCn)) parts.push('masculine facial features')
  if (/黑色略?凌乱短发/.test(subjectCn)) parts.push('messy black short hair')
  if (/大眼睛带高光/.test(subjectCn)) parts.push('large expressive eyes with catchlights')
  if (/#9ca3af|连帽卫衣|灰色卫衣|#d0dae5|浅灰色连帽卫衣/.test(subjectCn)) parts.push('wearing light grey hoodie')
  if (/双手快速敲键/.test(subjectCn)) parts.push('both hands on keyboard')
  if (/坐姿|坐在/.test(subjectCn)) parts.push('sitting at desk')
  if (/无配角|单人/.test(subjectCn) && !hasSupportingCharacterMention(subjectCn, actionCn)) {
    parts.push('solo subject, no supporting characters')
  }
  return parts.join(', ')
}

function isMirrorSceneContext(...parts: Array<string | undefined | null>): boolean {
  const merged = collapseContext(...parts)
  return /全身镜|落地镜|穿衣镜|镜面|镜中|镜子|照镜子|映出.{0,6}(?:自己|背影|人)|反射|mirror|reflection/i.test(merged)
}

function isHandheldSceneContext(...parts: Array<string | undefined | null>): boolean {
  const merged = collapseContext(...parts)
  return /手持|握着|拿着|持手机|端着|举着|捧着|贴耳|刷手机|把手机|手机贴|看手机|holding (?:a )?(?:phone|cup|bag)|hand(?:held)? phone/i.test(merged)
    || (/(?:左手|右手|双手|left hand|right hand).{0,16}(?:持|握|拿|把|hold|holding)/i.test(merged)
      && /手机|杯|袋|phone|cup|bag|tablet|平板/i.test(merged))
}

function applyHandheldAnatomyEnrichment(
  sections: Record<string, string>,
  cnSections: Record<string, string>,
): void {
  const merged = collapseContext(
    cnSections['核心细节动作'],
    cnSections['画面主体'],
    cnSections['年代场景'],
    sections['Action and interaction'],
    sections['Subjects in frame'],
  )
  if (!isHandheldSceneContext(merged)) return

  const leanHold = /(?:撑|扶|按|抵).{0,4}墙|lean(?:ing)? (?:on|against) (?:the )?wall|hand on wall/i.test(merged)
    && /持|握|拿|hold|holding|phone|手机/i.test(merged)

  mergeSectionBody(
    sections,
    'Action and interaction',
    leanHold
      ? 'shoulder lightly against wall without hand bracing wall, right hand holding object at chest, left hand naturally at side, anatomy exactly two arms two hands five fingers each, no third hand, no fused fingers'
      : 'anatomy exactly two arms two hands, clear left-right hand roles for held object, five normal fingers, no third hand, no extra limbs from torso, no fused or missing fingers',
  )
  mergeSectionBody(
    sections,
    'Subjects in frame',
    'single protagonist with exactly two arms and two hands only, no extra hands',
  )
}

function applyMirrorSceneEnrichment(
  sections: Record<string, string>,
  cnSections: Record<string, string>,
): void {
  const merged = collapseContext(
    cnSections['年代场景'],
    cnSections['核心细节动作'],
    cnSections['镜头视角'],
    cnSections['画面主体'],
    sections['Environment and era'],
    sections['Action and interaction'],
    sections['Camera and composition'],
  )
  if (!isMirrorSceneContext(merged)) return

  mergeSectionBody(
    sections,
    'Environment and era',
    'exactly one full-length standing mirror with frame, no second mirror, no extra small wall mirrors',
  )
  mergeSectionBody(
    sections,
    'Action and interaction',
    'standing near the single mirror looking toward own reflection without touching the glass, exact left-right mirrored pose of the same two hands held objects and expression, anatomy exactly two arms two hands, no third hand reaching into the mirror',
  )
  mergeSectionBody(
    sections,
    'Subjects in frame',
    'single protagonist plus one optical mirror reflection only, reflection is mirrored optics not a second person, no extra limbs',
  )
  const camEn = sections['Camera and composition'] || ''
  if (!/single full-length mirror|one mirror only/i.test(camEn)) {
    sections['Camera and composition'] = camEn
      ? `${camEn}, one mirror only in frame, medium shot eye-level`
      : 'medium shot eye-level, one full-length mirror only, protagonist and matching mirrored reflection visible'
  }
}

function repairSectionsFromChinese(
  sections: Record<string, string>,
  cnSections: Record<string, string>,
): void {
  const sceneCn = cnSections['年代场景'] || ''
  const actionCn = cnSections['核心细节动作'] || ''
  const subjectCn = cnSections['画面主体'] || ''

  if (sceneCn) {
    const propsEn = extractPropsEnFromChineseScene(sceneCn)
    const envEn = sections['Environment and era'] || ''
    if (propsEn) {
      if (!envEn || isSectionTruncated(envEn)) {
        const cleaned = envEn
          ? envEn.replace(/\b(and|with|or|mult|mechan|transpar|keyboar|scattered|displaying)\s*\.?\s*$/i, '').replace(/,\s*$/, '').trim()
          : ''
        sections['Environment and era'] = [cleaned, propsEn].filter(Boolean).join(', ')
      } else if (!propsEn.split(', ').every(p => envEn.toLowerCase().includes(p.split(' ')[0].toLowerCase()))) {
        mergeSectionBody(sections, 'Environment and era', propsEn)
      }
    }
  }

  if (actionCn || subjectCn) {
    const actionBoost = extractActionEnFromChinese(actionCn, subjectCn)
    const actionEn = sections['Action and interaction'] || ''
    if (actionBoost && (isLightingOnlyAction(actionCn) || isSectionTruncated(actionEn) || actionEnTooVague(actionEn))) {
      mergeSectionBody(sections, 'Action and interaction', actionBoost)
    }
  }

  if (subjectCn) {
    const subjRepair = extractSubjectsEnFromChinese(subjectCn, actionCn)
    const subjEn = sections['Subjects in frame'] || ''
    const needsSupport = hasSupportingCharacterMention(subjectCn, actionCn)
      && !/roommate|supporting character|second (?:person|figure)|two people/i.test(subjEn)
    if (subjRepair && (isSectionTruncated(subjEn) || !/reference portrait|same face/i.test(subjEn) || needsSupport)) {
      sections['Subjects in frame'] = subjEn && !isSectionTruncated(subjEn) && !needsSupport
        ? `${subjRepair}, ${subjEn.replace(/\([^)]*$/g, '').replace(/,\s*$/, '')}`
        : subjRepair
    }
  }

  const camCn = cnSections['镜头视角'] || ''
  const camEn = sections['Camera and composition'] || ''
  const mergedCn = `${camCn} ${actionCn} ${subjectCn} ${sceneCn}`
  const dynamicFraming = resolveDynamicFramingFromChinese(camCn, actionCn, subjectCn, sceneCn)
  if (dynamicFraming && !/percent of frame|约占画面|head height|头高/i.test(`${camEn} ${camCn}`)) {
    mergeSectionBody(sections, 'Camera and composition', dynamicFraming)
  }
  if (/全身|从头到脚|头顶到脚|完整入镜|进门|推门|行走|走进|走出|站立/.test(mergedCn)
    && !/full body|head to feet|全身|wide establishing|long shot/i.test(camEn)) {
    sections['Camera and composition'] = /全景|远景|环境建立|全貌|阵列|establishing/.test(mergedCn)
      ? 'wide establishing shot, protagonist visible head to feet within environment, cinematic depth'
      : 'medium full-body shot eye-level, protagonist head to feet fully visible in scene context'
  } else if (camCn && (isSectionTruncated(camEn) || /\b(?:relatio|intera|interact|relationsh|rela)\.?\s*$/i.test(camEn))) {
    if (/互动|关系|两人|双人|交流|对峙|递物|并肩|对视/.test(`${camCn} ${actionCn} ${subjectCn}`)) {
      sections['Camera and composition'] = 'medium shot eye-level, capturing two-person interaction and spatial relationship in scene'
    }
  }
}

function sceneHasRichEnvironment(sceneCn: string, envEn: string): boolean {
  const merged = `${sceneCn} ${envEn}`
  if (!merged.trim()) return false
  const depthLayers = (merged.match(/前景|中景|后景|foreground|midground|background/gi) || []).length
  const propHits = (merged.match(/桌|椅|床|沙发|门|窗|墙|柜|架|屏|键盘|鼠标|显示器|电脑|工位|office|desk|monitor|keyboard|room|wall|window|door|shelf|bed|sofa|table|chair|street|摊位|货架|茶几|挂钟|灯/gi) || []).length
  return depthLayers >= 2 || propHits >= 3 || sceneCn.trim().length >= 48
}

/** 据中文景别/动作/场景/姿态推断：优先头高占比，全身占比按姿态分档 */
function resolveDynamicFramingFromChinese(
  camCn: string,
  actionCn: string,
  subjectCn: string,
  sceneCn: string,
): string | null {
  const merged = `${camCn} ${actionCn} ${subjectCn} ${sceneCn}`
  const sitting = /坐姿|端坐|僵直坐|坐在|蜷坐|跪坐|sitting|seated/i.test(merged)
  const lying = /侧卧|躺卧|仰卧|趴|低位|lying|reclining/i.test(merged)
  const standingFull = /全身|从头到脚|头顶到脚|完整入镜|进门|推门|行走|走进|走出|站立|full body|head to feet/i.test(merged)

  if (/大特写|特写|面部特写|close.?up|extreme close/i.test(merged)) {
    // 有坐姿/肢体动作时避免映射成 face-only close-up
    if (sitting || /抬|触|握|端|伸手|双手|右手|左手|扶|按|坐姿|僵直/.test(merged)) {
      return 'medium close-up, protagonist head height about 22-30 percent of frame height, upper body and hands visible with action and nearby props, not face-only'
    }
    return 'close shot showing head and upper body, protagonist head height about 28-35 percent of frame height, shoulder line or a hint of hands visible, environment partially visible at edges, not face-only portrait'
  }
  if (/中近景|medium close/i.test(merged)) {
    return 'medium close-up, protagonist head height about 22-30 percent of frame height, props and environment context clearly visible around subject, hands and posture readable'
  }
  if (/全景|远景|环境建立|全貌|establishing|wide shot|long shot/i.test(merged)) {
    return 'wide establishing shot eye-level, protagonist head height about 5-10 percent of frame height, layered foreground midground background clearly visible, environment dominates frame, cinematic depth of field'
  }
  if (/中远景|medium-wide|medium wide/i.test(merged)) {
    const bodyTier = sitting
      ? 'seated figure about 22-34 percent of frame height'
      : lying
        ? 'reclining figure about 18-30 percent of frame height'
        : standingFull
          ? 'standing full body about 28-40 percent of frame height'
          : 'figure about 22-34 percent of frame height'
    return `medium-wide shot eye-level, protagonist head height about 10-16 percent of frame height, ${bodyTier}, foreground midground background props clearly visible, environment occupies majority of frame`
  }
  if (/双人|两人|对话|递物|过肩|对视|并肩|interaction|two.?person|two people/i.test(merged)) {
    return 'medium shot eye-level, two-person interaction with clear spatial relationship, protagonist head height about 14-20 percent of frame height, shared environment clearly visible'
  }
  if (standingFull) {
    if (sitting) {
      return 'medium shot eye-level, seated pose, protagonist head height about 14-20 percent of frame height, seated torso-and-head about 22-34 percent of frame height, environment and props occupy majority of frame'
    }
    if (lying) {
      return 'medium-wide shot eye-level, reclining or low pose, protagonist head height about 10-16 percent of frame height, body about 18-30 percent of frame height, environment visible around subject'
    }
    return 'medium full-body shot eye-level, protagonist head to feet visible, head height about 10-14 percent of frame height, standing full body about 28-40 percent of frame height, environment and props occupy majority of frame'
  }
  if (sitting) {
    return 'medium shot eye-level, seated pose, protagonist head height about 16-24 percent of frame height, seated torso-and-head about 22-34 percent of frame height, environment supports the action'
  }
  if (/近景(?!特写)|medium shot(?! close)/i.test(merged) && !/中远景|全景|远景/.test(merged)) {
    return 'medium shot eye-level, protagonist head height about 16-24 percent of frame height, environment supports the action and fills background'
  }
  if (/前景|中景|后景/.test(sceneCn) && sceneHasRichEnvironment(sceneCn, '')) {
    return 'medium-wide shot eye-level, protagonist head height about 10-16 percent of frame height, layered foreground midground background props clearly visible, environment dominates frame'
  }
  return null
}

function prefersCloseFraming(camCn: string, actionCn: string, subjectCn: string): boolean {
  const merged = `${camCn} ${actionCn} ${subjectCn}`
  return /近景|中近景|特写|面部|情绪|汗珠|颤抖|瞳孔|表情|close.?up|medium close|bust|胸像|半身/i.test(merged)
    && !/全景|远景|中远景|全身|从头到脚|establishing|wide/i.test(merged)
}

function cameraTooPortrait(camEn: string, camCn: string): boolean {
  const merged = `${camEn} ${camCn}`.toLowerCase()
  if (/full body|head to feet|head-to-feet|wide establishing|long shot|medium full-body|environmental|全身|从头到脚|头顶到脚|全景|远景|medium-wide|head height|头高|5-10 percent|10-16 percent|10-14 percent|environment dominates/i.test(merged)) {
    return false
  }
  return /close.?up|bust|portrait framing|中近景|近景|特写|upper body|waist.?up|胸像|半身|大头|face only|面部/i.test(merged)
    || !camEn.trim()
    || camEn.trim().length < 36
}

/** 场景丰富但镜头偏半身特写 → 按中文景别推断动态占比（非一律 30–40%） */
function applyEnvironmentalFramingEnrichment(
  sections: Record<string, string>,
  cnSections: Record<string, string>,
): void {
  const sceneCn = cnSections['年代场景'] || ''
  const envEn = sections['Environment and era'] || ''
  const camCn = cnSections['镜头视角'] || ''
  const camEn = sections['Camera and composition'] || ''
  const actionCn = cnSections['核心细节动作'] || ''
  const subjectCn = cnSections['画面主体'] || ''
  if (!sceneHasRichEnvironment(sceneCn, envEn)) return
  if (prefersCloseFraming(camCn, actionCn, subjectCn)) return

  if (envEn && envEn.length < 48) {
    mergeSectionBody(
      sections,
      'Environment and era',
      'detailed interior or location with visible furniture props walls and spatial depth, environment visible in frame',
    )
  }

  if (!cameraTooPortrait(camEn, camCn)) return

  const framing = resolveDynamicFramingFromChinese(camCn, actionCn, subjectCn, sceneCn)
    || 'medium-wide shot eye-level, protagonist head height about 10-16 percent of frame height, desk walls furniture and props occupy majority of frame, environmental storytelling composition not bust close-up'

  sections['Camera and composition'] = camEn
    ? `${framing}, ${camEn.replace(/\b(?:close-up|bust shot|portrait framing|medium close-up)\b/gi, 'medium-wide shot')}`
    : framing
}

function mergeSectionBody(sections: Record<string, string>, label: string, addition: string): void {
  const extra = String(addition || '').trim()
  if (!extra) return
  const body = sections[label] || ''
  if (body && new RegExp(extra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 24), 'i').test(body)) return
  sections[label] = body ? `${extra}, ${body}` : extra
}

function rebuildEnglishFromSections(sections: Record<string, string>, prefix: string[]): string {
  const order = [
    'Action and interaction',
    'Environment and era',
    'Camera and composition',
    'Lighting and color',
    'Subjects in frame',
    'Art style spec',
    'Render quality',
  ] as const
  const parts: string[] = [...prefix]
  for (const label of order) {
    const body = sections[label]
    if (!body) continue
    parts.push(`${label}: ${body}`)
  }
  return parts.join('. ')
}

function ensureChinesePropsPresent(text: string, sceneCn: string): string {
  if (!sceneCn.trim()) return text
  const required: Array<[RegExp, string]> = [
    [/机械鼠标/, 'mechanical mouse'],
    [/多接口USB设备盒|USB设备/, 'USB hub'],
    [/透明玻璃键盘/, 'glass keyboard'],
    [/机械键盘/, 'mechanical keyboard'],
    [/电脑机箱/, 'computer tower'],
  ]
  const missing = required.filter(([re, token]) => re.test(sceneCn) && !new RegExp(token, 'i').test(text))
  if (!missing.length) return text
  const add = missing.map(([, token]) => token).join(', ')
  if (/Environment and era:/i.test(text)) {
    return text.replace(
      /(Environment and era:\s*)([^.]+)/i,
      `$1$2, ${add}`,
    )
  }
  return `${text}. Environment and era: ${add}`
}

export function enrichFluxStoryboardPrompt(english: string, chineseSource?: string | null): string {
  let text = sanitizeFluxPrompt(String(english || '').trim())
  const chinese = String(chineseSource || '').trim()
  if (!text && !chinese) return text

  const cnSections = parseChineseFluxSections(chinese)
  const sections = parseFluxEnglishSections(text)
  const ctx = collapseContext(
    chinese,
    text,
    cnSections['年代场景'],
    cnSections['核心细节动作'],
    cnSections['镜头视角'],
    cnSections['画面主体'],
    sections['Environment and era'],
    sections['Action and interaction'],
    sections['Camera and composition'],
  )

  const screenHint = inferScreenContentHint(ctx)
  const facingHint = inferScreenFacingHint(ctx)
  const era = inferEraBucket(ctx)
  const eraClash = hasEraPropClash(ctx) || (hasDisplayDevice(ctx) && era !== 'unknown' && /CRT|显像管|chiclet|全面屏|smartphone|超薄键盘/i.test(ctx) && (
    (era === 'modern' && /CRT|显像管|米色显示器/i.test(ctx))
    || ((era === '90s' || era === '80s') && /全面屏|smartphone|chiclet|超薄键盘|薄边框/i.test(ctx))
  ))
  const eraHint = eraClash || (hasDisplayDevice(ctx) && era !== 'unknown' && !/period-consistent|统一.*年代|年代统一/i.test(ctx))
    ? eraPropSuiteHint(era === 'unknown' ? (/CRT|显像管|米色/i.test(ctx) ? '90s' : 'modern') : era)
    : ''
  const actionCn = cnSections['核心细节动作'] || ''
  const actionEn = sections['Action and interaction'] || ''
  const actionBoost = inferConcreteActionPhrase(ctx, actionCn, actionEn)

  if (screenHint) {
    mergeSectionBody(sections, 'Environment and era', screenHint)
  }
  if (facingHint) {
    // 动作维更不易被 Environment 压缩裁掉
    mergeSectionBody(sections, 'Action and interaction', facingHint)
  }
  if (eraHint) {
    mergeSectionBody(sections, 'Environment and era', eraHint)
  }

  repairSectionsFromChinese(sections, cnSections)
  applyMirrorSceneEnrichment(sections, cnSections)
  applyHandheldAnatomyEnrichment(sections, cnSections)
  applyEnvironmentalFramingEnrichment(sections, cnSections)

  if (actionBoost && actionEnTooVague(actionEn)) {
    mergeSectionBody(sections, 'Action and interaction', actionBoost)
  } else if (actionBoost && actionCn && isLightingOnlyAction(actionCn)) {
    mergeSectionBody(sections, 'Action and interaction', actionBoost)
  }

  const prefix: string[] = []
  if ((screenHint || facingHint) && !hasScreenContent(text)) {
    prefix.push('screens and devices face viewer at slight three-quarter angle with visible UI content, not empty black panels, not device backs')
  } else if (facingHint) {
    prefix.push('device screens face viewer, not phone backs or monitor rear casings')
  }
  if (eraHint) {
    prefix.push(eraHint)
  }
  if (
    sceneHasRichEnvironment(cnSections['年代场景'] || '', sections['Environment and era'] || '')
    && !prefersCloseFraming(cnSections['镜头视角'] || '', cnSections['核心细节动作'] || '', cnSections['画面主体'] || '')
  ) {
    prefix.push('environmental anime scene illustration not character portrait poster, detailed background furniture and props clearly visible')
  }

  if (Object.keys(sections).length >= 2) {
    text = rebuildEnglishFromSections(sections, prefix)
    text = compressFluxEnglishPrompt(text)
    text = ensureChinesePropsPresent(text, cnSections['年代场景'] || '')
  } else if (prefix.length || screenHint || facingHint || eraHint || actionBoost) {
    const extras = [...prefix, screenHint, facingHint, eraHint, actionBoost].filter(Boolean).join(', ')
    text = extras ? `${extras}. ${text}` : text
    text = compressFluxEnglishPrompt(text)
  }

  return text.replace(/,\s*,/g, ', ').replace(/\band,\s*/gi, '').replace(/\s{2,}/g, ' ').trim()
}
