/**
 * 漫画解说 — 场景特效（FFmpeg 滤镜，零素材纯算法）
 * 按旁白/画面语义自动匹配，叠加在运镜 zoompan 之后
 */
import type { MotionComicVfxKind } from '../constants/motion-comic.js'

const COMPOSE_FPS = 25
const OUT_W = 1280
const OUT_H = 720

function durationToFrameCount(durationSec: number, fps = COMPOSE_FPS): number {
  return Math.max(1, Math.round(durationSec * fps))
}

function fmtSec(sec: number): string {
  return sec.toFixed(3)
}

/** 传送门圆心略偏下，贴近人像 */
const PORTAL_CY = `H*11/20`

function portalDistExpr(): string {
  return `sqrt(pow(X-W/2,2)+pow(Y-${PORTAL_CY},2))`
}

function buildPortalOpenFilter(frames: number): string {
  const openFrames = Math.max(10, Math.round(frames * 0.42))
  const d = portalDistExpr()
  const radius = `max(8,min(W,H)*0.46*min(1,N/${openFrames}))`
  return [
    `geq=lum='if(lt(${d},${radius}),8,if(lt(abs(${d}-${radius}),14),lum(X,Y)+55,lum(X,Y)))'`,
    `cb='if(lt(${d},${radius}),128,cb(X,Y))'`,
    `cr='if(lt(${d},${radius}),168,cr(X,Y))'`,
  ].join(':')
}

function buildPortalEnterFilter(frames: number): string {
  const shrinkFrames = Math.max(12, Math.round(frames * 0.55))
  const startHold = Math.max(0, Math.round(frames * 0.12))
  const d = portalDistExpr()
  const progress = `max(0,min(1,(N-${startHold})/${shrinkFrames}))`
  const radius = `max(0,min(W,H)*0.48*(1-${progress}))`
  return [
    `geq=lum='if(lt(${d},${radius}),if(gt(${radius},10),8,lum(X,Y)),lum(X,Y))'`,
    `cb='if(lt(${d},${radius}),if(gt(${radius},10),128,cb(X,Y)),cb(X,Y))'`,
    `cr='if(lt(${d},${radius}),if(gt(${radius},10),168,cr(X,Y)),cr(X,Y))'`,
  ].join(':')
}

function buildFlashDecayFilter(intensity = 100, decay = 5): string {
  return `geq=lum='lum(X,Y)+${intensity}*exp(-N/${decay})':cb='cb(X,Y)':cr='cr(X,Y)'`
}

function buildLightningFilter(frames: number): string {
  const half = Math.max(1, Math.floor(frames / 2))
  return [
    `geq=lum='lum(X,Y)+if(and(lt(N,${half}),eq(mod(N,16),0)),95,if(and(lt(N,${half}),eq(mod(N,16),1)),55,0))'`,
    `cb='cb(X,Y)'`,
    `cr='cr(X,Y)'`,
  ].join(':')
}

function buildScreenShakeFilter(): string {
  return [
    `crop=w=iw-48:h=ih-48:x='24+22*sin(N*0.65)':y='24+18*cos(N*0.85)'`,
    `scale=${OUT_W}:${OUT_H}:flags=bilinear`,
  ].join(',')
}

function buildMagicSparkleFilter(): string {
  return `geq=lum='lum(X,Y)+if(lt(mod(X+Y+N*2,27),4),38,0)':cb='cb(X,Y)':cr='cr(X,Y)'`
}

function buildSpeedLinesFilter(): string {
  return `geq=lum='lum(X,Y)*0.68+lum(X-5,Y)*0.22+lum(X-10,Y)*0.10':cb='cb(X,Y)':cr='cr(X,Y)'`
}

function buildRainMistFilter(): string {
  return [
    `eq=brightness=-0.05:contrast=0.9:saturation=0.88`,
    `geq=lum='if(eq(mod(Y+N,4),0),lum(X,Y)*0.88,lum(X,Y))':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

/** 下落雨丝 + 水滴粒子（竖向条纹随帧下移） */
function buildRainParticlesFilter(): string {
  return [
    `eq=brightness=-0.08:contrast=0.9:saturation=0.82`,
    `colorbalance=bs=0.06:rs=-0.02`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*7+N*2,103),2),lt(mod(Y+N*5+mod(X,17),37),4)),58,if(and(lt(mod(X*13+N*3,89),1),lt(mod(Y+N*7+mod(X,23),29),3)),38,0))':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X+N*2,47),2),lt(mod(Y+N*9+mod(X*3,31),52),7)),32,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `geq=lum='lum(X,Y)+if(and(eq(mod(X*11+N*4,67),0),lt(mod(Y+N*6,43),2)),75,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

/** 飘雪粒子（慢速、偏大、偏亮） */
function buildSnowParticlesFilter(): string {
  return [
    `eq=brightness=0.04:contrast=0.94:saturation=0.78`,
    `colorbalance=bs=0.08:rs=-0.03`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*5+N,73),3),lt(mod(Y+N*2+mod(X,29),61),5)),62,if(and(lt(mod(X*9+N,97),2),lt(mod(Y+N*3+mod(X,19),47),4)),42,0))':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `geq=lum='lum(X,Y)+if(and(eq(mod(X*17+N*2,83),0),lt(mod(Y+N*2,37),3)),80,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

/** 上升火星 / 火花 */
function buildFireSparksFilter(): string {
  return [
    `eq=saturation=1.15:contrast=1.08:brightness=0.02`,
    `colorbalance=rs=0.12:gs=0.04:bs=-0.08`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*3+N,59),2),lt(mod(Y-N*4+mod(X,23),47),3)),70,0)':cb='if(and(lt(mod(X*3+N,59),2),lt(mod(Y-N*4+mod(X,23),47),3)),110,cb(X,Y))':cr='if(and(lt(mod(X*3+N,59),2),lt(mod(Y-N*4+mod(X,23),47),3)),145,cr(X,Y))'`,
    `geq=lum='lum(X,Y)+if(and(eq(mod(X*7+N*3,41),0),lt(mod(Y-N*5,31),2)),85,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

/** 浮尘光斑（丁达尔 / 室内灰尘） */
function buildDustFloatFilter(): string {
  return [
    `eq=brightness=0.03:saturation=0.95:contrast=0.98`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X+N,53),2),lt(mod(Y-N*1+mod(X,37),67),2)),45,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `unsharp=5:5:0.35:5:5:0`,
  ].join(',')
}

/** 风沙横掠（细颗粒 + 横向拖影） */
function buildWindSandFilter(): string {
  return [
    `eq=brightness=-0.04:saturation=0.72:contrast=1.05`,
    `colorbalance=rs=0.06:gs=0.02:bs=-0.04`,
    `geq=lum='lum(X,Y)*0.82+lum(X-6+N,Y)*0.12+lum(X-12+N*2,Y)*0.06':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(Y+N*3,41),2),lt(mod(X+N*4,97),3)),35,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

function buildFilmGrainFilter(): string {
  return [
    `noise=c0s=6:c0f=t+u,c1s=0:c2s=0`,
    `eq=contrast=1.04:saturation=0.92`,
  ].join(',')
}

function buildGlitchFilter(frames: number): string {
  const half = Math.max(1, Math.floor(frames / 2))
  return [
    `rgbashift=rh='if(and(lt(N,${half}),eq(mod(N,11),0)),-10,0)':gh=0:bv='if(and(lt(N,${half}),eq(mod(N,11),0)),10,0)'`,
    `crop=w=iw-8:h=ih-8:x='4+if(eq(mod(N,13),0),6,0)':y='4+if(eq(mod(N,17),0),-4,0)'`,
    `scale=${OUT_W}:${OUT_H}:flags=bilinear`,
    `geq=lum='if(eq(mod(N,19),0),lum(X,Y)*0.7,lum(X,Y))':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

function buildHeartbeatFilter(): string {
  return [
    `geq=lum='lum(X,Y)*(0.88+0.12*abs(sin(N*0.55)))':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `vignette=angle=PI/4`,
  ].join(',')
}

function buildBloodSplashFilter(): string {
  return [
    `${buildFlashDecayFilter(60, 4)}`,
    `colorbalance=rs=0.18:gs=-0.06:bs=-0.06`,
    `eq=saturation=1.2:contrast=1.1`,
    `vignette=angle=PI/3.5`,
  ].join(',')
}

function buildStarTwinkleFilter(): string {
  return [
    `eq=brightness=0.02:saturation=0.9`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*19+Y*7+N,113),2),lt(mod(X+Y+N*3,47),3)),55,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `geq=lum='lum(X,Y)+if(and(eq(mod(X*23+N*2,71),0),eq(mod(Y*13+N,53),0)),65,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

function buildSmokeFadeFilter(durationSec: number): string {
  return [
    `eq=contrast=0.86:brightness=-0.07:saturation=0.82`,
    `geq=lum='lum(X,Y)*(0.93+0.07*sin(N/10))':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `fade=t=out:st=${fmtSec(Math.max(0, durationSec - 0.9))}:d=0.9`,
  ].join(',')
}

function buildFogHeavyFilter(): string {
  return [
    `eq=brightness=0.07:contrast=0.76:saturation=0.72`,
    `geq=lum='lum(X,Y)*0.82+48':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `vignette=angle=PI/2.8`,
  ].join(',')
}

function buildUnderwaterFilter(): string {
  return [
    `colorbalance=bs=0.28:rs=-0.06:gs=-0.03`,
    `eq=saturation=0.68:brightness=-0.06:contrast=0.94`,
    `gblur=sigma=0.9`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*5+N,67),2),lt(mod(Y-N*3+mod(X,19),53),4)),52,0)':cb='if(and(lt(mod(X*5+N,67),2),lt(mod(Y-N*3+mod(X,19),53),4)),118,cb(X,Y))':cr='cr(X,Y)'`,
  ].join(',')
}

function buildSunbeamFilter(): string {
  return [
    `eq=brightness=0.07:saturation=1.12:contrast=1.04`,
    `geq=lum='lum(X,Y)+if(lt(abs((X+Y)-W/2+N*2),22),55,if(lt(abs((X-Y)+N),18),42,0))':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `unsharp=5:5:0.4:5:5:0`,
  ].join(',')
}

function buildMoonlightFilter(): string {
  return [
    `colorbalance=bs=0.18:rs=-0.1:gs=-0.03`,
    `eq=brightness=-0.05:saturation=0.72:contrast=1.06`,
    `vignette=angle=PI/3.2`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*31+N,113),2),lt(mod(Y+N,67),2)),35,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

function buildPetalsFallFilter(): string {
  return [
    `eq=saturation=1.08:brightness=0.02`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*3+N,79),2),lt(mod(Y+N*2+mod(X,23),57),4)),48,0)':cb='if(and(lt(mod(X*3+N,79),2),lt(mod(Y+N*2+mod(X,23),57),4)),145,cb(X,Y))':cr='if(and(lt(mod(X*3+N,79),2),lt(mod(Y+N*2+mod(X,23),57),4)),132,cr(X,Y))'`,
    `geq=lum='lum(X,Y)+if(and(eq(mod(X*11+N,61),0),lt(mod(Y+N*3,41),2)),55,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

function buildLeavesFallFilter(): string {
  return [
    `eq=saturation=0.95:contrast=1.02`,
    `colorbalance=rs=0.08:gs=0.02:bs=-0.06`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*7+N,89),2),lt(mod(Y+N*1+mod(X,31),63),5)),42,0)':cb='if(and(lt(mod(X*7+N,89),2),lt(mod(Y+N*1+mod(X,31),63),5)),118,cb(X,Y))':cr='if(and(lt(mod(X*7+N,89),2),lt(mod(Y+N*1+mod(X,31),63),5)),108,cr(X,Y))'`,
  ].join(',')
}

function buildConfettiFilter(): string {
  return [
    `eq=saturation=1.15:brightness=0.03`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*2+N*3,43),2),lt(mod(Y+N*5+mod(X,17),37),3)),65,0)':cb='if(eq(mod(X+N,3),0),140,cb(X,Y))':cr='if(eq(mod(X+N,3),1),150,cr(X,Y))'`,
    `geq=lum='lum(X,Y)+if(and(eq(mod(X*13+N*4,53),0),lt(mod(Y+N*6,29),2)),75,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

function buildFocusBlurFilter(): string {
  return [
    `gblur=sigma=1.6`,
    `geq=lum='lum(X,Y)*(0.9+0.1*abs(sin(N*0.28)))':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `eq=contrast=0.93:brightness=0.01`,
  ].join(',')
}

function buildGoldShimmerFilter(): string {
  return [
    `eq=saturation=1.2:contrast=1.08:brightness=0.04`,
    `colorbalance=rs=0.1:gs=0.06:bs=-0.12`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*17+Y+N*2,97),3),lt(mod(X+Y,31),4)),50,0)':cb='if(and(lt(mod(X*17+Y+N*2,97),3),lt(mod(X+Y,31),4)),118,cb(X,Y))':cr='if(and(lt(mod(X*17+Y+N*2,97),3),lt(mod(X+Y,31),4)),145,cr(X,Y))'`,
  ].join(',')
}

function buildPoisonMistFilter(): string {
  return [
    `colorbalance=gs=0.12:rs=-0.04:bs=-0.06`,
    `eq=saturation=0.88:brightness=-0.03:contrast=0.92`,
    `geq=lum='lum(X,Y)*0.88+if(lt(mod(Y+N*2,23),3),25,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `vignette=angle=PI/3`,
  ].join(',')
}

function buildFrostSpreadFilter(frames: number): string {
  const spread = Math.max(10, Math.round(frames * 0.65))
  const d = `sqrt(pow(X,2)+pow(Y,2))`
  const edge = `min(W,H)*0.72*(N/${spread})`
  return [
    `colorbalance=bs=0.15:rs=-0.06:gs=0.02`,
    `eq=saturation=0.78:brightness=0.04:contrast=1.02`,
    `geq=lum='if(gt(${d},${edge}), lum(X,Y)*0.75+35, lum(X,Y))':cb='if(gt(${d},${edge}), 128, cb(X,Y))':cr='if(gt(${d},${edge}), 128, cr(X,Y))'`,
  ].join(',')
}

function buildSwordFlashFilter(): string {
  return [
    `geq=lum='lum(X,Y)+if(and(lt(abs(Y-H/2),6),lt(abs(X-mod(N*14,${OUT_W})),55)),120,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `eq=contrast=1.08`,
  ].join(',')
}

function buildTeleportFlashFilter(): string {
  return [
    `${buildFlashDecayFilter(110, 5)}`,
    `rgbashift=rh=-8:gh=0:bv=8`,
    `eq=saturation=1.1`,
  ].join(',')
}

function buildShadowCreepFilter(frames: number): string {
  const spread = Math.max(10, Math.round(frames * 0.7))
  const d = `sqrt(pow(X-W/2,2)+pow(Y-H/2,2))`
  const edge = `min(W,H)*0.55*(N/${spread})`
  return [
    `geq=lum='if(gt(${d},${edge}), lum(X,Y)*0.45, lum(X,Y))':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `vignette=angle=PI/3.5`,
  ].join(',')
}

function buildVhsRetroFilter(): string {
  return [
    `noise=c0s=8:c0f=t+u,c1s=0:c2s=0`,
    `eq=contrast=1.08:saturation=0.88`,
    `rgbashift=rh=-3:gh=0:bv=3`,
    `geq=lum='if(eq(mod(Y,3),0),lum(X,Y)*0.92,lum(X,Y))':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `crop=w=iw-4:h=ih-4:x='2+if(eq(mod(N,29),0),3,0)':y=2`,
    `scale=${OUT_W}:${OUT_H}:flags=bilinear`,
  ].join(',')
}

function buildBubbleRiseFilter(): string {
  return [
    `eq=brightness=0.02:saturation=0.95`,
    `geq=lum='lum(X,Y)+if(and(lt(mod(X*7+N,83),2),lt(mod(Y-N*4+mod(X,29),61),5)),55,0)':cb='if(and(lt(mod(X*7+N,83),2),lt(mod(Y-N*4+mod(X,29),61),5)),128,cb(X,Y))':cr='cr(X,Y)'`,
    `geq=lum='lum(X,Y)+if(and(eq(mod(X*19+N*2,71),0),lt(mod(Y-N*3,43),3)),70,0)':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(',')
}

function buildInkSpreadFilter(frames: number): string {
  const spread = Math.max(8, Math.round(frames * 0.5))
  const d = `sqrt(pow(X-W/2,2)+pow(Y-H/2,2))`
  const ink = `min(W,H)*0.5*(N/${spread})`
  return [
    `eq=saturation=0.35:contrast=1.15:brightness=-0.04`,
    `geq=lum='if(lt(${d},${ink}), lum(X,Y)*0.35, lum(X,Y))':cb='cb(X,Y)':cr='cr(X,Y)'`,
  ].join(':')
}

function buildMirrorRippleFilter(): string {
  return [
    `geq=lum='lum(X+3*sin((Y+N)*0.08),Y)':cb='cb(X,Y)':cr='cr(X,Y)'`,
    `eq=brightness=0.02:saturation=0.92:contrast=0.98`,
  ].join(':')
}

function buildNightVisionFilter(): string {
  return [
    `hue=s=0`,
    `colorchannelmixer=rr=0.1:rg=0.5:rb=0.1:gr=0.1:gg=0.7:gb=0.1:br=0.1:bg=0.4:bb=0.1`,
    `eq=contrast=1.2:brightness=0.02`,
    `vignette=angle=PI/4`,
  ].join(',')
}

export type MotionComicVfxResolveOptions = {
  expressionAction?: string | null
  sceneBackground?: string | null
  sceneContent?: string | null
}

/** 从旁白/画面描述推断场景特效（优先级：传送门 > 冲击 > 氛围 > 色调） */
export function resolveMotionComicVfxKind(
  text: string,
  options?: MotionComicVfxResolveOptions,
): MotionComicVfxKind {
  const merged = [
    text,
    options?.expressionAction,
    options?.sceneBackground,
    options?.sceneContent,
  ].map(s => String(s || '').trim()).filter(Boolean).join(' ')
  if (!merged) return 'none'

  if (/迈入|踏进|走进.*传送|进入.*传送|踏入.*门|钻进|跃入|跳入.*门|被.*吸.*进|消失.*门|走进.*黑洞|进入.*漩涡|走入.*光芒|穿过.*门|传送.*离开|踏入.*虚空|迈入.*门|一步.*踏入|身影.*消失|没入.*门|没入.*洞/.test(merged)) {
    return 'portal_enter'
  }
  if (/传送门.*(打开|开启|出现|显现|展开)|打开.*传送|开启.*传送|召唤.*(门|传送)|空间.*(裂缝|裂隙|撕裂)|出现.*(圆洞|黑洞|漩涡|光门)|凭空.*(出现|打开)|裂缝.*(张开|扩大)|圆洞.*扩大|黑洞.*(出现|张开)|开启.*(门|通道)/.test(merged)) {
    return 'portal_open'
  }
  if (/瞬移|闪现|化作.*光|消失.*(一道光|白光)|化为.*光点|闪身/.test(merged)) return 'teleport_flash'
  if (/剑光|刀光|寒光.*闪|刃光|一剑.*(斩|劈|划)|刀.*(斩|劈)/.test(merged)) return 'sword_flash'
  if (/爆炸|轰然|炸裂|爆开|火光冲天|蘑菇云|轰的一声/.test(merged)) return 'explosion_flash'
  if (/闪电|雷击|雷劈|电光|雷鸣|劈下|天雷/.test(merged)) return 'lightning'
  if (/地震|剧震|地动|一晃|震得|剧烈.*晃|摇晃|颤动|地动山摇/.test(merged)) return 'screen_shake'
  if (/醒来|睁眼|恢复意识|从.*黑.*中|眼前.*渐渐|渐渐.*清晰|苏醒/.test(merged)) return 'fade_from_black'
  if (/失去意识|眼前一黑|昏迷|陷入黑暗|意识.*消散|昏死|晕过去/.test(merged)) return 'fade_to_black'
  if (/回忆|想起|曾经|当年|往事|记忆|回溯|闪回|多年前/.test(merged)) return 'memory_sepia'
  if (/黑白|默片|失去.*颜色|色彩.*褪去|只剩.*黑白/.test(merged)) return 'black_white'
  if (/时间.*(停|静止|凝固)|定格|瞬间.*静止|万物.*静止/.test(merged)) return 'time_stop'
  if (/结冰|冰霜.*蔓延|霜.*(覆盖|结|冻)|冰封.*(蔓延|扩散)|凝冰/.test(merged)) return 'frost_spread'
  if (/下雪|雪花|大雪|飘雪|鹅毛.*雪|雪落|漫天.*雪/.test(merged)) return 'snow_particles'
  if (/暴雨|大雨|下雨|淋雨|倾盆|雨点|雨丝|雨打|雨水/.test(merged)) return 'rain_particles'
  if (/阴雨|细雨|薄雾.*雨|蒙蒙.*雨|微雨/.test(merged)) return 'rain_mist'
  if (/大雾|浓雾|迷雾|雾锁|白雾|雾霭|雾蒙蒙/.test(merged)) return 'fog_heavy'
  if (/水下|海底|潜入|深海|泳池.*底|水中/.test(merged)) return 'underwater'
  if (/阳光.*(穿透|洒|柱|束)|光束|圣光|光柱|丁达尔|神圣.*光/.test(merged)) return 'sunbeam'
  if (/月光|月夜|月色|银白.*月|皎月|明月/.test(merged)) return 'moonlight'
  if (/樱花|桃花|花瓣|落英|花雨|飘零.*花/.test(merged)) return 'petals_fall'
  if (/落叶|秋叶|枯叶|叶落|黄叶|枫叶/.test(merged)) return 'leaves_fall'
  if (/庆祝|婚礼|撒花|彩带|香槟|恭喜|庆典|节日.*狂欢/.test(merged)) return 'confetti'
  if (/失焦|视线.*模糊|醉|晕.*(眩|乎)|天旋地转|眼前.*发花/.test(merged)) return 'focus_blur'
  if (/黄金|金块|宝藏|元宝|金币|珠光宝气|金光.*闪闪/.test(merged)) return 'gold_shimmer'
  if (/毒气|瘴气|中毒|绿色.*烟雾|毒雾|剧毒/.test(merged)) return 'poison_mist'
  if (/阴影.*(蔓延|吞噬|侵蚀)|黑暗.*(蔓延|吞噬|笼罩)|黑影.*(爬|蔓延)/.test(merged)) return 'shadow_creep'
  if (/水墨|墨汁|晕染|泼墨|墨迹.*(扩散|蔓延)/.test(merged)) return 'ink_spread'
  if (/倒影|水面.*(波|纹)|镜子.*(波|晃)|涟漪|波光/.test(merged)) return 'mirror_ripple'
  if (/夜视|红外|热成像|暗中.*(观察|窥)/.test(merged)) return 'night_vision'
  if (/录像带|VHS|老电视|雪花屏|监控.*(画面|录像)/.test(merged)) return 'vhs_retro'
  if (/气泡|水泡|咕噜/.test(merged)) return 'bubble_rise'
  if (/冰|冷|寒|霜|冻|冰封|极寒/.test(merged)) return 'cold_tint'
  if (/暖|温馨|夕阳|黄昏|暖意/.test(merged)) return 'warm_glow'
  if (/恐怖|阴森|诡异|毛骨悚然|黑暗.*降临|鬼|尸/.test(merged)) return 'horror_dark'
  if (/鲜血|喷血|血流|溅血|血花|染血|伤口.*血/.test(merged)) return 'blood_splash'
  if (/梦|幻觉|恍惚|如同.*梦|梦中|虚幻/.test(merged)) return 'dream_blur'
  if (/雨|淋|水珠/.test(merged)) return 'rain_particles'
  if (/火|燃烧|火焰|火花|烈焰|着火|焚烧/.test(merged)) return 'fire_sparks'
  if (/风沙|沙尘|狂沙|飞沙|黄沙/.test(merged)) return 'wind_sand'
  if (/灰尘|浮尘|光斑|丁达尔|微粒|飘浮.*尘/.test(merged)) return 'dust_float'
  if (/星空|繁星|夜空|星光|闪烁.*星|满天星/.test(merged)) return 'star_twinkle'
  if (/心跳|心口|紧张.*跳|脉搏|胸腔.*震/.test(merged)) return 'heartbeat'
  if (/故障|信号.*干扰|花屏|闪屏|错乱|失真|干扰/.test(merged)) return 'glitch'
  if (/胶片|颗粒感|老电影|复古.*质感|噪点/.test(merged)) return 'film_grain'
  if (/极速|飞驰|穿梭|冲刺|疾驰|速度.*快|风驰电掣/.test(merged)) return 'speed_lines'
  if (/魔法|法术|灵光|符咒|阵法|光芒.*环绕|释放.*光|施法|法力/.test(merged)) return 'magic_sparkle'
  if (/烟雾|烟散|消散.*烟|尘土|灰飞|硝烟/.test(merged)) return 'smoke_fade'
  if (/重击|被打|一拳|击中|撞飞|吐血|猛击|巴掌/.test(merged)) return 'impact_hit'
  if (/觉醒|力量.*涌现|爆发.*力量|血脉.*觉醒|气势.*爆发|潜能.*爆发/.test(merged)) return 'awaken_power'

  return 'none'
}

export function motionComicVfxKindToLabel(kind: MotionComicVfxKind): string {
  switch (kind) {
    case 'portal_open': return '传送门展开'
    case 'portal_enter': return '踏入传送门'
    case 'explosion_flash': return '爆炸闪光'
    case 'lightning': return '闪电'
    case 'screen_shake': return '画面震动'
    case 'fade_from_black': return '由黑渐显'
    case 'fade_to_black': return '渐隐至黑'
    case 'memory_sepia': return '回忆褪色'
    case 'time_stop': return '时间静止'
    case 'cold_tint': return '冷色'
    case 'warm_glow': return '暖光'
    case 'horror_dark': return '恐怖暗角'
    case 'dream_blur': return '梦境柔焦'
    case 'rain_mist': return '细雨薄雾'
    case 'rain_particles': return '下雨粒子'
    case 'snow_particles': return '飘雪粒子'
    case 'fire_sparks': return '火星飞溅'
    case 'dust_float': return '浮尘光斑'
    case 'wind_sand': return '风沙横掠'
    case 'film_grain': return '胶片颗粒'
    case 'glitch': return '信号故障'
    case 'heartbeat': return '心跳脉冲'
    case 'blood_splash': return '溅血闪红'
    case 'star_twinkle': return '星空闪烁'
    case 'fog_heavy': return '浓雾弥漫'
    case 'underwater': return '水下气泡'
    case 'sunbeam': return '阳光光束'
    case 'moonlight': return '月光冷色'
    case 'petals_fall': return '花瓣飘落'
    case 'leaves_fall': return '落叶飘零'
    case 'confetti': return '庆祝彩屑'
    case 'focus_blur': return '失焦晕眩'
    case 'black_white': return '黑白默片'
    case 'gold_shimmer': return '金光闪烁'
    case 'poison_mist': return '毒气绿雾'
    case 'frost_spread': return '霜冻蔓延'
    case 'sword_flash': return '剑光闪过'
    case 'teleport_flash': return '瞬移闪光'
    case 'shadow_creep': return '阴影侵蚀'
    case 'vhs_retro': return '录像带雪花'
    case 'bubble_rise': return '气泡上升'
    case 'ink_spread': return '水墨晕染'
    case 'mirror_ripple': return '水面涟漪'
    case 'night_vision': return '夜视绿屏'
    case 'speed_lines': return '速度线'
    case 'magic_sparkle': return '魔法光点'
    case 'smoke_fade': return '烟雾消散'
    case 'impact_hit': return '冲击闪白'
    case 'awaken_power': return '觉醒爆发'
    default: return '无'
  }
}

/** 在运镜滤镜链后追加场景特效 */
export function appendMotionComicVfxFilter(
  cameraFilter: string,
  vfxKind: MotionComicVfxKind | undefined,
  durationSec: number,
  fps = COMPOSE_FPS,
): string {
  if (!vfxKind || vfxKind === 'none') return cameraFilter
  const vfx = buildMotionComicVfxFilter(vfxKind, durationSec, fps)
  if (!vfx) return cameraFilter
  return `${cameraFilter},${vfx}`
}

export function buildMotionComicVfxFilter(
  kind: MotionComicVfxKind,
  durationSec: number,
  fps = COMPOSE_FPS,
): string | null {
  if (kind === 'none') return null
  const frames = durationToFrameCount(durationSec, fps)

  switch (kind) {
    case 'portal_open':
      return `${buildPortalOpenFilter(frames)},format=yuv420p`
    case 'portal_enter':
      return `${buildPortalEnterFilter(frames)},format=yuv420p`
    case 'explosion_flash':
      return `${buildFlashDecayFilter(120, 4)},rgbashift=rh=-10:gh=0:bv=10,vignette=angle=PI/4,format=yuv420p`
    case 'lightning':
      return `${buildLightningFilter(frames)},rgbashift=rh=-6:gh=0:bv=6,format=yuv420p`
    case 'screen_shake':
      return `${buildScreenShakeFilter()},format=yuv420p`
    case 'fade_from_black':
      return `fade=t=in:st=0:d=${fmtSec(Math.min(0.7, durationSec * 0.35))}:c=black,format=yuv420p`
    case 'fade_to_black':
      return `fade=t=out:st=${fmtSec(Math.max(0, durationSec - Math.min(0.85, durationSec * 0.4)))}:d=${fmtSec(Math.min(0.85, durationSec * 0.4))}:c=black,format=yuv420p`
    case 'memory_sepia':
      return `eq=saturation=0.42:contrast=1.06:brightness=0.02,colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,format=yuv420p`
    case 'time_stop':
      return `colorbalance=bs=-0.12:rs=-0.04,eq=saturation=0.55:brightness=0.03,vignette=angle=PI/3,format=yuv420p`
    case 'cold_tint':
      return `colorbalance=bs=-0.22:rs=-0.1:gs=-0.03,eq=saturation=0.82:brightness=-0.02,format=yuv420p`
    case 'warm_glow':
      return `eq=saturation=1.2:brightness=0.05:contrast=1.04,unsharp=5:5:0.45:5:5:0,format=yuv420p`
    case 'horror_dark':
      return `vignette=angle=PI/3,eq=brightness=-0.12:saturation=0.62:contrast=1.14,format=yuv420p`
    case 'dream_blur':
      return `gblur=sigma=1.5,eq=brightness=0.05:saturation=1.1:contrast=0.96,format=yuv420p`
    case 'rain_mist':
      return `${buildRainMistFilter()},format=yuv420p`
    case 'rain_particles':
      return `${buildRainParticlesFilter()},format=yuv420p`
    case 'snow_particles':
      return `${buildSnowParticlesFilter()},format=yuv420p`
    case 'fire_sparks':
      return `${buildFireSparksFilter()},format=yuv420p`
    case 'dust_float':
      return `${buildDustFloatFilter()},format=yuv420p`
    case 'wind_sand':
      return `${buildWindSandFilter()},format=yuv420p`
    case 'film_grain':
      return `${buildFilmGrainFilter()},format=yuv420p`
    case 'glitch':
      return `${buildGlitchFilter(frames)},format=yuv420p`
    case 'heartbeat':
      return `${buildHeartbeatFilter()},format=yuv420p`
    case 'blood_splash':
      return `${buildBloodSplashFilter()},format=yuv420p`
    case 'star_twinkle':
      return `${buildStarTwinkleFilter()},format=yuv420p`
    case 'fog_heavy':
      return `${buildFogHeavyFilter()},format=yuv420p`
    case 'underwater':
      return `${buildUnderwaterFilter()},format=yuv420p`
    case 'sunbeam':
      return `${buildSunbeamFilter()},format=yuv420p`
    case 'moonlight':
      return `${buildMoonlightFilter()},format=yuv420p`
    case 'petals_fall':
      return `${buildPetalsFallFilter()},format=yuv420p`
    case 'leaves_fall':
      return `${buildLeavesFallFilter()},format=yuv420p`
    case 'confetti':
      return `${buildConfettiFilter()},format=yuv420p`
    case 'focus_blur':
      return `${buildFocusBlurFilter()},format=yuv420p`
    case 'black_white':
      return `hue=s=0,eq=contrast=1.08:brightness=0.02,format=yuv420p`
    case 'gold_shimmer':
      return `${buildGoldShimmerFilter()},format=yuv420p`
    case 'poison_mist':
      return `${buildPoisonMistFilter()},format=yuv420p`
    case 'frost_spread':
      return `${buildFrostSpreadFilter(frames)},format=yuv420p`
    case 'sword_flash':
      return `${buildSwordFlashFilter()},format=yuv420p`
    case 'teleport_flash':
      return `${buildTeleportFlashFilter()},format=yuv420p`
    case 'shadow_creep':
      return `${buildShadowCreepFilter(frames)},format=yuv420p`
    case 'vhs_retro':
      return `${buildVhsRetroFilter()},format=yuv420p`
    case 'bubble_rise':
      return `${buildBubbleRiseFilter()},format=yuv420p`
    case 'ink_spread':
      return `${buildInkSpreadFilter(frames)},format=yuv420p`
    case 'mirror_ripple':
      return `${buildMirrorRippleFilter()},format=yuv420p`
    case 'night_vision':
      return `${buildNightVisionFilter()},format=yuv420p`
    case 'speed_lines':
      return `${buildSpeedLinesFilter()},format=yuv420p`
    case 'magic_sparkle':
      return `${buildMagicSparkleFilter()},format=yuv420p`
    case 'smoke_fade':
      return `${buildSmokeFadeFilter(durationSec)},format=yuv420p`
    case 'impact_hit':
      return `${buildFlashDecayFilter(90, 3)},rgbashift=rh=-6:gh=0:bv=6,format=yuv420p`
    case 'awaken_power':
      return `${buildFlashDecayFilter(70, 6)},eq=saturation=1.25:brightness=0.06,unsharp=5:5:0.5:5:5:0,format=yuv420p`
    default:
      return null
  }
}
