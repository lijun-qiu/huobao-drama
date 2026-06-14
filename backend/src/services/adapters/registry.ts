/**
 * Provider Adapter 注册表
 * 根据 provider 名称返回对应的 Adapter 实例
 */
import { MiniMaxImageAdapter } from './minimax-image'
import { MiniMaxVideoAdapter } from './minimax-video'
import { MiniMaxTTSAdapter } from './minimax-tts'
import { OpenAIImageAdapter } from './openai-image'
import { GeminiImageAdapter } from './gemini-image'
import { VolcEngineImageAdapter } from './volcengine-image'
import { VolcEngineVideoAdapter } from './volcengine-video'
import { ViduVideoAdapter } from './vidu-video'
import { AliImageAdapter } from './ali-image'
import { AliVideoAdapter } from './ali-video'
import { KlingImageAdapter } from './kling-image'
import type { ImageProviderAdapter, VideoProviderAdapter, TTSProviderAdapter, AIConfig } from './types'

// 图片 Adapter 注册表
export const imageAdapters: Record<string, ImageProviderAdapter> = {
  minimax: new MiniMaxImageAdapter(),
  openai: new OpenAIImageAdapter(),
  gemini: new GeminiImageAdapter(),
  volcengine: new VolcEngineImageAdapter(),
  ali: new AliImageAdapter(),
  kling: new KlingImageAdapter(),
  // Chatfire 豆包绘画仍走 OpenAI 兼容格式
  chatfire: new OpenAIImageAdapter(),
}

// 视频 Adapter 注册表
export const videoAdapters: Record<string, VideoProviderAdapter> = {
  minimax: new MiniMaxVideoAdapter(),
  volcengine: new VolcEngineVideoAdapter(),
  vidu: new ViduVideoAdapter(),
  ali: new AliVideoAdapter(),
  // Chatfire 视频 - 待确认 API 格式
}

// TTS Adapter 注册表
export const ttsAdapters: Record<string, TTSProviderAdapter> = {
  minimax: new MiniMaxTTSAdapter(),
}

export function getTTSAdapter(provider: string): TTSProviderAdapter {
  return ttsAdapters[provider.toLowerCase()] || ttsAdapters['minimax']
}

/**
 * 获取图片 Adapter
 * @param provider 厂商名称
 * @returns 对应的 Adapter，未知厂商返回 MiniMax 默认
 */
export function getImageAdapter(provider: string): ImageProviderAdapter {
  return imageAdapters[provider.toLowerCase()] || imageAdapters['minimax']
}

/** 按模型名自动选择适配器（剧集可单独选模型，与全局 provider 可不一致） */
export function resolveImageAdapter(config: AIConfig, model?: string | null): ImageProviderAdapter {
  const m = String(model || config.model || '').toLowerCase()
  if (m.startsWith('kling-')) {
    return imageAdapters.kling
  }
  if (m.startsWith('doubao-seedream') || m.startsWith('seedream')) {
    return imageAdapters.chatfire
  }
  if (config.provider.toLowerCase() === 'kling') {
    return imageAdapters.kling
  }
  return getImageAdapter(config.provider)
}

export function resolveImageProvider(config: AIConfig, model?: string | null): string {
  const m = String(model || config.model || '').toLowerCase()
  if (m.startsWith('kling-')) return 'kling'
  if (m.startsWith('doubao-seedream') || m.startsWith('seedream')) return 'chatfire'
  if (config.provider.toLowerCase() === 'kling') return 'kling'
  return config.provider
}

/**
 * 获取视频 Adapter
 * @param provider 厂商名称
 * @returns 对应的 Adapter，未知厂商返回 MiniMax 默认
 */
export function getVideoAdapter(provider: string): VideoProviderAdapter {
  return videoAdapters[provider.toLowerCase()] || videoAdapters['minimax']
}
