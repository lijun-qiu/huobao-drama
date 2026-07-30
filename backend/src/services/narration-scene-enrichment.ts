/**
 * 配图文案：规则抽取每段场景 enrichment（地点/载体/道具/动作），
 * 注入 LLM 输入，让关思考时仍能写准陈设，不靠模型空想。
 */

import { compressTimelineNarrationLines } from '../constants/art-styles.js'

export type NarrationSceneEnrichment = {
  place?: string
  carriers: string[]
  props: string[]
  prior_props: string[]
  actions: string[]
  atmosphere: string[]
  timeline_snip?: string
  detect_scene?: string
  /** 给模型的短指令 */
  must_use: string
}

type LexEntry = { re: RegExp; label: string }

const PLACE_LEX: LexEntry[] = [
  { re: /浴室|卫生间|洗手间|洗澡间/, label: '浴室卫生间' },
  { re: /客厅|起居室/, label: '客厅' },
  { re: /卧室|宿舍|寝室|床铺/, label: '卧室或宿舍' },
  { re: /厨房|食堂/, label: '厨房' },
  { re: /教室|课堂|讲台/, label: '教室' },
  { re: /办公室|工位|写字楼/, label: '办公室' },
  { re: /走廊|过道|楼道|玄关/, label: '走廊玄关' },
  { re: /街道|马路|路口|巷子/, label: '室外街道' },
  { re: /公园|广场/, label: '公园广场' },
  { re: /咖啡|奶茶店|餐厅|饭店|食堂/, label: '餐饮店' },
  { re: /商场|超市|便利店/, label: '商场或便利店' },
  { re: /夜市|摊位|地摊|市场/, label: '夜市或摊位' },
  { re: /店铺|门面|店里|柜台/, label: '临街店铺' },
  { re: /医院|病房|诊室/, label: '医院' },
  { re: /车站|地铁|车厢/, label: '车站或车厢' },
  { re: /阳台/, label: '阳台' },
  { re: /卫生间镜前|镜子前/, label: '镜前' },
]

const CARRIER_LEX: LexEntry[] = [
  { re: /茶几/, label: '茶几' },
  { re: /餐桌|饭桌/, label: '餐桌' },
  { re: /书桌|课桌|办公桌/, label: '书桌' },
  { re: /床头柜|床头/, label: '床头柜' },
  { re: /沙发/, label: '沙发' },
  { re: /洗手台|盥洗台|台盆/, label: '洗手台' },
  { re: /镜(?:子|面|台)/, label: '镜子' },
  { re: /窗台|落地窗|窗帘/, label: '窗与窗帘' },
  { re: /货架|展架|置物架/, label: '货架' },
  { re: /柜台|吧台/, label: '柜台' },
  { re: /摊位|台面/, label: '摊位台面' },
  { re: /床|被褥|枕头/, label: '床铺' },
  { re: /冰箱/, label: '冰箱' },
  { re: /电视(?:机|柜)?|电视墙/, label: '电视与柜' },
  { re: /衣柜|衣架/, label: '衣柜' },
  { re: /地面|地板|瓷砖/, label: '地面' },
  { re: /墙(?:壁|面)|海报墙/, label: '墙面' },
]

/** 可入画的具体名词（非泛称） */
const PROP_LEX: LexEntry[] = [
  { re: /啤酒罐|啤酒瓶|啤酒/, label: '啤酒罐' },
  { re: /烟盒|香烟|打火机/, label: '烟盒' },
  { re: /遥控器/, label: '遥控器' },
  { re: /手机|屏幕|充电器/, label: '手机' },
  { re: /电脑|笔记本|键盘|显示器/, label: '电脑' },
  { re: /水杯|茶杯|马克杯|咖啡杯|碗|盘子|筷子/, label: '餐具杯盏' },
  { re: /水瓶|保温杯|矿泉水/, label: '水瓶' },
  { re: /牙刷|牙膏|洗面奶|化妆品|护肤品/, label: '洗漱化妆品' },
  { re: /毛巾|浴巾/, label: '毛巾' },
  { re: /钥匙|门锁|门把手/, label: '门与钥匙' },
  { re: /书包|背包|手提包|箱包/, label: '箱包' },
  { re: /书本|课本|笔记本|便签|纸笔/, label: '书本纸笔' },
  { re: /台灯|落地灯|吊灯|吸顶灯/, label: '灯具' },
  { re: /绿植|盆栽|花瓶/, label: '绿植' },
  { re: /相框|照片/, label: '相框' },
  { re: /时钟|挂钟|闹铃/, label: '时钟' },
  { re: /雨伞|雨衣/, label: '雨具' },
  { re: /鞋子|拖鞋|运动鞋/, label: '鞋子' },
  { re: /衣服|外套|衬衫|T恤|睡衣/, label: '衣物' },
  { re: /花衬衫|喇叭裤|蛤蟆镜/, label: '服装配饰' },
  { re: /账本|收银|发票/, label: '账本票据' },
  { re: /自行车|手推车|板车/, label: '车子' },
  { re: /货物|货箱|纸箱/, label: '货箱' },
  { re: /零食|槟榔|瓜子/, label: '小食' },
]

const ACTION_LEX: LexEntry[] = [
  { re: /坐(?:在|着|姿)|僵直坐|瘫坐/, label: '坐姿' },
  { re: /站立|站着|站在/, label: '站立' },
  { re: /躺|侧卧|趴/, label: '躺卧' },
  { re: /抬(?:手|臂)|伸手|举手/, label: '抬手' },
  { re: /握|攥|捏/, label: '手部握持' },
  { re: /触|摸|按|轻抚|轻触/, label: '手部触碰' },
  { re: /推门|开门|关门|敲门/, label: '开关门' },
  { re: /看|盯|望|注视|视线/, label: '视线落点' },
  { re: /整理|摆放|陈列|收拾/, label: '整理陈列' },
  { re: /喝|吃|抽/, label: '饮食动作' },
  { re: /走|迈|踏|奔跑/, label: '走动' },
  { re: /哭|笑|皱眉|沉默/, label: '表情反应' },
]

const ATMOSPHERE_LEX: LexEntry[] = [
  { re: /清晨|早上|早晨/, label: '清晨' },
  { re: /午后|午间|中午/, label: '午间' },
  { re: /傍晚|黄昏/, label: '黄昏' },
  { re: /夜晚|夜里|深夜|凌晨/, label: '夜晚' },
  { re: /雨|潮湿|水汽/, label: '潮湿雨意' },
  { re: /冷光|白炽|冷白/, label: '冷白光' },
  { re: /暖黄|台灯|柔光/, label: '暖光' },
  { re: /霓虹|夜市灯/, label: '霓虹' },
  { re: /安静|寂静|空旷/, label: '安静' },
  { re: /喧闹|嘈杂|热闹/, label: '喧闹' },
]

const RELATION_PROP_RES: RegExp[] = [
  /(?:拿着|握着|端着|抱着|提着|夹着)([^，。！？；、\s]{1,8})/g,
  /(?:放着|摆着|摆放|陈列|堆着)(?:着)?([^，。！？；、\s]{1,10})/g,
  /(?:桌上|茶几上|柜台上|床上|窗台上|架子上)(?:的)?([^，。！？；、\s]{1,10})/g,
]

const STOP_PROP = /^(他|她|我|你|自己|什么|一个|一些|东西|物品|家伙|样子|时候|地方)$/
const VERB_PROP_PREFIX = /^(摆着|放着|拿着|握着|端着|抱着|提着|堆着|陈列)/

function pushUnique(list: string[], label: string, max = 8): void {
  const raw = String(label || '').trim().replace(/[的了着过]$/, '')
  if (!raw) return
  const parts = raw.split(/[与和、及]/).map(s => s.trim()).filter(Boolean)
  for (const part of parts.length ? parts : [raw]) {
    let s = part.trim()
    if (VERB_PROP_PREFIX.test(s)) s = s.replace(VERB_PROP_PREFIX, '').trim()
    if (!s || s.length < 2 || s.length > 12) continue
    if (STOP_PROP.test(s)) continue
    if (list.includes(s)) continue
    if (list.length >= max) return
    list.push(s)
  }
}

function matchLex(text: string, lex: LexEntry[], max = 6): string[] {
  const out: string[] = []
  for (const { re, label } of lex) {
    if (re.test(text)) pushUnique(out, label, max)
  }
  return out
}

function extractRelationProps(text: string, max = 6): string[] {
  const out: string[] = []
  for (const re of RELATION_PROP_RES) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) && out.length < max) {
      pushUnique(out, m[1], max)
    }
  }
  return out
}

function firstPlace(text: string): string | undefined {
  for (const { re, label } of PLACE_LEX) {
    if (re.test(text)) return label
  }
  return undefined
}

function samePlaceFamily(a?: string, b?: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const norm = (s: string) => s.replace(/或.+$/, '')
  return norm(a) === norm(b) || a.includes(b) || b.includes(a)
}

/**
 * 从本段旁白 + prior 抽取场景 enrichment。
 * prior 只取最近窗口，避免与全文膨胀。
 */
export function buildNarrationSceneEnrichment(options: {
  narrationLines: string[]
  priorLines?: string[]
  detectSceneDescription?: string | null
  priorWindowLines?: number
}): NarrationSceneEnrichment | null {
  const current = (options.narrationLines || []).map(s => String(s || '').trim()).filter(Boolean)
  const priorAll = (options.priorLines || []).map(s => String(s || '').trim()).filter(Boolean)
  const priorWin = priorAll.slice(-(options.priorWindowLines ?? 20))
  const detect = String(options.detectSceneDescription || '').trim()

  const currentText = current.join('，')
  const priorText = priorWin.join('，')
  const blob = [currentText, priorText, detect].filter(Boolean).join('，')
  if (!blob.trim()) return null

  const place = firstPlace(currentText) || firstPlace(detect) || firstPlace(priorText)
  const carriers = matchLex(`${currentText}，${detect}`, CARRIER_LEX, 4)
  if (!carriers.length) {
    for (const c of matchLex(priorText, CARRIER_LEX, 3)) pushUnique(carriers, c, 4)
  }

  const props: string[] = []
  for (const p of extractRelationProps(currentText, 6)) pushUnique(props, p, 8)
  for (const p of matchLex(currentText, PROP_LEX, 8)) pushUnique(props, p, 8)
  for (const p of extractRelationProps(detect, 4)) pushUnique(props, p, 8)
  for (const p of matchLex(detect, PROP_LEX, 4)) pushUnique(props, p, 8)

  const priorProps: string[] = []
  const priorPlace = firstPlace(priorText)
  const priorCarriers = matchLex(priorText, CARRIER_LEX, 4)
  const carrierOverlap = carriers.some(c => priorCarriers.includes(c))
  // 同场才延续 prior 物件：地点一致，或载体重合；换房间不串道具
  const inherit = samePlaceFamily(place, priorPlace)
    || carrierOverlap
    || (!place && !priorPlace && !carriers.length)

  if (inherit || carrierOverlap) {
    for (const p of extractRelationProps(priorText, 6)) pushUnique(priorProps, p, 6)
    for (const p of matchLex(priorText, PROP_LEX, 6)) pushUnique(priorProps, p, 6)
    if (props.length < 2) {
      for (const p of priorProps) pushUnique(props, p, 8)
    }
  }

  const actions = matchLex(currentText, ACTION_LEX, 5)
  const atmosphere = matchLex(`${currentText}，${detect}`, ATMOSPHERE_LEX, 3)
  const timelineSnip = compressTimelineNarrationLines(
    [...priorWin.slice(-8), ...current],
  ) || undefined

  if (!place && !carriers.length && !props.length && !actions.length && !detect) {
    return null
  }

  const mustParts = [
    place ? `地点写「${place}」` : '',
    carriers.length ? `载体优先写：${carriers.join('、')}` : '',
    props.length ? `物件清单须入【年代场景】：${props.join('、')}` : '',
    priorProps.length && inherit ? `同场可延续：${priorProps.slice(0, 4).join('、')}` : '',
    actions.length ? `动作写入【核心细节动作】：${actions.join('、')}` : '',
  ].filter(Boolean)

  return {
    place,
    carriers,
    props,
    prior_props: priorProps,
    actions,
    atmosphere,
    timeline_snip: timelineSnip,
    detect_scene: detect || undefined,
    must_use: mustParts.join('；') || '须写具体地点+至少2个可辨认物件，禁止空泛场所',
  }
}
