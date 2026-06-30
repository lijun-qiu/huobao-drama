const BASE = '/api/v1'

async function req<T = any>(method: string, path: string, body?: any, options?: { signal?: AbortSignal }): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' }, signal: options?.signal }
  if (body) opts.body = JSON.stringify(body)

  const start = performance.now()
  console.log(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', body || '')

  try {
    const resp = await fetch(`${BASE}${path}`, opts)
    const json = await resp.json()
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json.code && json.code >= 400)) {
      console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(json.message || `${resp.status}`)
    }

    console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json.data ?? json
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cABORT %c${ms}ms`, 'color:#888', 'color:#ffa726', 'color:#ffa726;font-weight:bold', 'color:#888')
      throw new Error('请求已取消')
    }
    if (!err.message?.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    throw err
  }
}

export const api = {
  get: <T = any>(p: string, options?: { signal?: AbortSignal }) => req<T>('GET', p, undefined, options),
  post: <T = any>(p: string, b?: any, options?: { signal?: AbortSignal }) => req<T>('POST', p, b, options),
  put: <T = any>(p: string, b?: any, options?: { signal?: AbortSignal }) => req<T>('PUT', p, b, options),
  del: <T = any>(p: string, options?: { signal?: AbortSignal }) => req<T>('DELETE', p, undefined, options),
}

async function readJsonErrorMessage(resp: Response) {
  try {
    const json = await resp.json()
    return String(json.message || resp.status)
  } catch {
    return String(await resp.text() || resp.status)
  }
}

async function readSseJsonEvents(
  resp: Response,
  onEvent: (payload: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  if (!resp.ok) throw new Error(await readJsonErrorMessage(resp))
  if (!resp.body) throw new Error('无响应流')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    if (signal?.aborted) throw new Error('请求已取消')
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data) continue
        try {
          onEvent(JSON.parse(data) as Record<string, unknown>)
        } catch {
          // ignore malformed chunk
        }
      }
    }
  }
}

export const dramaAPI = {
  list: () => api.get<{ items: any[] }>('/dramas'),
  get: (id: number) => api.get(`/dramas/${id}`),
  create: (data: any) => api.post('/dramas', data),
  update: (id: number, data: any) => api.put(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
}

export const episodeAPI = {
  create: (data: any) => api.post('/episodes', data),
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  characters: (id: number) => api.get(`/episodes/${id}/characters`),
  scenes: (id: number) => api.get(`/episodes/${id}/scenes`),
  storyboards: (id: number) => api.get(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
  narrationStoryboardBreakdown: (
    id: number,
    options?: { script?: string; text_model?: string; text_thinking?: boolean },
  ) => api.post(`/episodes/${id}/narration-storyboard-breakdown`, options || {}),
  narrationStoryboardChatStream: async (
    id: number,
    data: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      text_model?: string
      text_thinking?: boolean
      action?: 'run'
      script?: string
    },
    options?: {
      signal?: AbortSignal
      onDelta?: (content: string) => void
      onThinking?: (content: string) => void
      onStatus?: (content: string) => void
      onProgress?: (payload: Record<string, unknown>) => void
    },
  ) => {
    const resp = await fetch(`${BASE}/episodes/${id}/narration-storyboard-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...data, stream: true }),
      signal: options?.signal,
    })

    let result: {
      reply: string
      model?: string
      text_thinking?: boolean
      breakdown?: Record<string, unknown>
    } | null = null
    let streamError: Error | null = null

    await readSseJsonEvents(resp, payload => {
      if (payload.type === 'delta' && typeof payload.content === 'string') {
        options?.onDelta?.(payload.content)
        return
      }
      if (payload.type === 'thinking' && typeof payload.content === 'string') {
        options?.onThinking?.(payload.content)
        return
      }
      if (payload.type === 'status' && typeof payload.content === 'string') {
        options?.onStatus?.(payload.content)
        return
      }
      if (payload.type === 'storyboard_done') {
        options?.onProgress?.(payload)
        return
      }
      if (payload.type === 'error') {
        streamError = new Error(String(payload.message || '生成失败'))
        return
      }
      if (payload.type === 'done') {
        result = {
          reply: String(payload.reply || ''),
          model: payload.model ? String(payload.model) : undefined,
          text_thinking: payload.text_thinking as boolean | undefined,
          breakdown: payload.breakdown as Record<string, unknown> | undefined,
        }
      }
    }, options?.signal)

    if (streamError) throw streamError
    if (!result?.reply) throw new Error('AI 未返回内容')
    return result
  },
  narrationScriptChat: (
    id: number,
    data: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      text_model?: string
      text_thinking?: boolean
    },
    options?: { signal?: AbortSignal },
  ) => api.post(`/episodes/${id}/narration-script-chat`, data, options),
  narrationScriptEmphasis: (
    id: number,
    data: { script: string; text_model?: string; text_thinking?: boolean },
    options?: { signal?: AbortSignal },
  ) => api.post(`/episodes/${id}/narration-script-emphasis`, data, options),
  narrationScriptChatStream: async (
    id: number,
    data: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      text_model?: string
      text_thinking?: boolean
    },
    options?: {
      signal?: AbortSignal
      onDelta?: (content: string) => void
      onThinking?: (content: string) => void
    },
  ) => {
    const resp = await fetch(`${BASE}/episodes/${id}/narration-script-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...data, stream: true }),
      signal: options?.signal,
    })

    let result: {
      reply: string
      model?: string
      text_thinking?: boolean
    } | null = null
    let streamError: Error | null = null

    await readSseJsonEvents(resp, payload => {
      if (payload.type === 'delta' && typeof payload.content === 'string') {
        options?.onDelta?.(payload.content)
        return
      }
      if (payload.type === 'thinking' && typeof payload.content === 'string') {
        options?.onThinking?.(payload.content)
        return
      }
      if (payload.type === 'error') {
        streamError = new Error(String(payload.message || '生成失败'))
        return
      }
      if (payload.type === 'done') {
        result = {
          reply: String(payload.reply || ''),
          model: payload.model ? String(payload.model) : undefined,
          text_thinking: payload.text_thinking as boolean | undefined,
        }
      }
    }, options?.signal)

    if (streamError) throw streamError
    if (!result?.reply) throw new Error('AI 未返回内容')
    return result
  },
  narrationImageBreakdown: (
    id: number,
    options?: {
      style?: string
      image_detect_mode?: 'paragraph' | 'conservative' | 'balanced'
      retry_missing_prompts?: boolean
      text_model?: string
      text_thinking?: boolean
    },
    fetchOptions?: { signal?: AbortSignal },
  ) => api.post(`/episodes/${id}/narration-image-breakdown`, options || {}, fetchOptions),
  cancelNarrationImageBreakdown: (id: number) =>
    api.post(`/episodes/${id}/narration-image-breakdown/cancel`),
  narrationImageBreakdownStatus: (id: number) =>
    api.get(`/episodes/${id}/narration-image-breakdown-status`),
  narrationImageDetect: (
    id: number,
    options?: {
      style?: string
      image_detect_mode?: 'paragraph' | 'conservative'
      detect_batch_threshold?: number
      detect_batch_size?: number
      text_model?: string
      text_thinking?: boolean
    },
  ) => api.post(`/episodes/${id}/narration-image-detect`, options || {}),
  narrationImageDetectChatStream: async (
    id: number,
    data: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      text_model?: string
      text_thinking?: boolean
      action?: 'run'
      style?: string
      image_detect_mode?: 'paragraph' | 'conservative'
      detect_batch_threshold?: number
      detect_batch_size?: number
    },
    options?: {
      signal?: AbortSignal
      onDelta?: (content: string) => void
      onThinking?: (content: string) => void
      onStatus?: (content: string) => void
      onProgress?: (payload: Record<string, unknown>) => void
    },
  ) => {
    const resp = await fetch(`${BASE}/episodes/${id}/narration-image-detect-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...data, stream: true }),
      signal: options?.signal,
    })

    let result: {
      reply: string
      model?: string
      text_thinking?: boolean
      detect?: { summary?: string }
    } | null = null
    let streamError: Error | null = null

    await readSseJsonEvents(resp, payload => {
      if (payload.type === 'delta' && typeof payload.content === 'string') {
        options?.onDelta?.(payload.content)
        return
      }
      if (payload.type === 'thinking' && typeof payload.content === 'string') {
        options?.onThinking?.(payload.content)
        return
      }
      if (payload.type === 'status' && typeof payload.content === 'string') {
        options?.onStatus?.(payload.content)
        return
      }
      if (payload.type === 'detect_done') {
        options?.onProgress?.(payload)
        return
      }
      if (payload.type === 'error') {
        streamError = new Error(String(payload.message || '生成失败'))
        return
      }
      if (payload.type === 'done') {
        result = {
          reply: String(payload.reply || ''),
          model: payload.model ? String(payload.model) : undefined,
          text_thinking: payload.text_thinking as boolean | undefined,
          detect: payload.detect as { summary?: string } | undefined,
        }
      }
    }, options?.signal)

    if (streamError) throw streamError
    if (!result?.reply) throw new Error('AI 未返回内容')
    return result
  },
  narrationImagePromptChatStream: async (
    id: number,
    data: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      text_model?: string
      text_thinking?: boolean
      action?: 'run' | 'retry_missing'
      style?: string
      prompt_batch_size?: number
    },
    options?: {
      signal?: AbortSignal
      onDelta?: (content: string) => void
      onThinking?: (content: string) => void
      onStatus?: (content: string) => void
      onProgress?: (payload: Record<string, unknown>) => void
    },
  ) => {
    const resp = await fetch(`${BASE}/episodes/${id}/narration-image-prompt-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...data, stream: true }),
      signal: options?.signal,
    })

    let result: {
      reply: string
      model?: string
      text_thinking?: boolean
      prompt?: { summary?: string }
    } | null = null
    let streamError: Error | null = null

    await readSseJsonEvents(resp, payload => {
      if (payload.type === 'delta' && typeof payload.content === 'string') {
        options?.onDelta?.(payload.content)
        return
      }
      if (payload.type === 'thinking' && typeof payload.content === 'string') {
        options?.onThinking?.(payload.content)
        return
      }
      if (payload.type === 'status' && typeof payload.content === 'string') {
        options?.onStatus?.(payload.content)
        return
      }
      if (payload.type === 'prompt_done') {
        options?.onProgress?.(payload)
        return
      }
      if (payload.type === 'error') {
        streamError = new Error(String(payload.message || '生成失败'))
        return
      }
      if (payload.type === 'done') {
        result = {
          reply: String(payload.reply || ''),
          model: payload.model ? String(payload.model) : undefined,
          text_thinking: payload.text_thinking as boolean | undefined,
          prompt: payload.prompt as { summary?: string } | undefined,
        }
      }
    }, options?.signal)

    if (streamError) throw streamError
    if (!result?.reply) throw new Error('AI 未返回内容')
    return result
  },
  narrationImagePrompts: (
    id: number,
    options?: {
      style?: string
      retry_missing_prompts?: boolean
      prompt_batch_size?: number
      test_batch_index?: number
      text_model?: string
      text_thinking?: boolean
    },
  ) => api.post(`/episodes/${id}/narration-image-prompts`, options || {}),
  narrationImageAudit: (id: number) => api.get(`/episodes/${id}/narration-image-audit`),
  narrationImageOptimize: (id: number, options?: { storyboard_ids?: number[] }) =>
    api.post(`/episodes/${id}/narration-image-optimize`, options || {}),
  narrationImageRestore: (id: number, options?: { storyboard_ids?: number[] }) =>
    api.post(`/episodes/${id}/narration-image-restore`, options || {}),
  importNarrationStoryboardDesc: (id: number, text: string) =>
    api.post(`/episodes/${id}/import-narration-storyboard-desc`, { text }),
  importNarrationImageDesc: (id: number, text: string) =>
    api.post(`/episodes/${id}/import-narration-image-desc`, { text }),
  /** @deprecated 等同 narrationStoryboardBreakdown */
  narrationBreakdown: (id: number, options?: { style?: string; script?: string; image_detect_mode?: 'paragraph' | 'conservative' | 'balanced' }) =>
    api.post(`/episodes/${id}/narration-storyboard-breakdown`, { script: options?.script }),
  extractNarrationCharacters: (id: number, options?: { script?: string; style?: string; text_model?: string; text_thinking?: boolean }) =>
    api.post(`/episodes/${id}/extract-narration-characters`, options || {}),
  linkNarrationCharacters: (id: number) => api.post(`/episodes/${id}/link-narration-characters`),
  generateOpeningVideo: (id: number, options?: { count?: number }) =>
    api.post(`/episodes/${id}/generate-opening-video`, options || {}),
  openingVideoStatus: (id: number) => api.get(`/episodes/${id}/opening-video`),
  openingPickedImagesZipUrl: (id: number) => `/api/v1/episodes/${id}/opening-picked-images.zip`,
  exportOpeningPickedImages: async (id: number, options?: { count?: number }) => {
    const resp = await fetch(`/api/v1/episodes/${id}/opening-picked-images/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    })
    const contentType = resp.headers.get('content-type') || ''
    if (!resp.ok) {
      if (contentType.includes('json')) {
        const json = await resp.json()
        throw new Error(json?.message || `${resp.status}`)
      }
      throw new Error(`${resp.status}`)
    }
    return resp.blob()
  },
  generateTitleVideo: (id: number) => api.post(`/episodes/${id}/generate-title-video`, {}),
  titleVideoStatus: (id: number) => api.get(`/episodes/${id}/title-video`),
  uploadOpeningAudio: (id: number, audioPath: string, subtitleText?: string) =>
    api.post(`/episodes/${id}/opening-audio`, {
      audio_path: audioPath,
      ...(subtitleText !== undefined ? { subtitle_text: subtitleText } : {}),
    }),
  generateOpeningAudio: (id: number, options?: { subtitle_text?: string; local_tts_engine?: 'edge' | 'voicebox'; local_voice?: string; tts_speed?: number; voicebox_instruct?: string; voicebox_model_size?: '0.6B' | '1.7B' }) =>
    api.post(`/episodes/${id}/generate-opening-audio`, options || {}),
  splitNarrationAudio: (id: number, audioPaths: string | string[]) =>
    api.post(`/episodes/${id}/split-narration-audio`, {
      audio_paths: Array.isArray(audioPaths) ? audioPaths : [audioPaths],
    }),
  transcribeNarrationAudio: (id: number, audioPaths: string | string[]) =>
    api.post(`/episodes/${id}/transcribe-narration-audio`, {
      audio_paths: Array.isArray(audioPaths) ? audioPaths : [audioPaths],
    }),
  cropNarrationImages: (id: number) => api.post(`/episodes/${id}/crop-narration-images`, {}),
  restoreNarrationImages: (id: number) => api.post(`/episodes/${id}/restore-narration-images`, {}),
  clearNarrationImages: (id: number) => api.post(`/episodes/${id}/clear-narration-images`, {}),
  clearNarrationImagePrompts: (id: number) => api.post(`/episodes/${id}/clear-narration-image-prompts`, {}),
  clearNarrationTts: (id: number) => api.post(`/episodes/${id}/clear-narration-tts`, {}),
  clearComposedVideos: (id: number) => api.post(`/episodes/${id}/clear-composed-videos`, {}),
}

export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
  generateTTS: (id: number, options?: { force?: boolean; async?: boolean; local_tts?: boolean; local_tts_engine?: 'edge' | 'voicebox'; local_voice?: string; tts_speed?: number; voicebox_instruct?: string; voicebox_model_size?: '0.6B' | '1.7B'; unit_tts?: boolean; tts_text?: string }) =>
    api.post(`/storyboards/${id}/generate-tts`, options || {}),
  uploadTTS: (id: number, audioPath: string) =>
    api.post(`/storyboards/${id}/upload-tts`, { audio_path: audioPath }),
  scanNarrationImage: (id: number, options?: { text_model?: string; text_thinking?: boolean }) =>
    api.post(`/storyboards/${id}/scan-narration-image`, options || {}),
  resolveCharacters: (id: number) => api.post(`/storyboards/${id}/resolve-characters`, {}),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const uploadAPI = {
  image: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const resp = await fetch(`${BASE}/upload/image`, { method: 'POST', body: form })
    const json = await resp.json()
    if (!resp.ok || (json.code && json.code >= 400)) {
      throw new Error(json.message || `${resp.status}`)
    }
    return json.data ?? json
  },
  audio: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const resp = await fetch(`${BASE}/upload/audio`, { method: 'POST', body: form })
    const json = await resp.json()
    if (!resp.ok || (json.code && json.code >= 400)) {
      throw new Error(json.message || `${resp.status}`)
    }
    return json.data ?? json
  },
}

export const characterAPI = {
  create: (data: any) => api.post('/characters', data),
  update: (id: number, data: any) => api.put(`/characters/${id}`, data),
  getPortraitPrompt: (id: number, episodeId: number, options?: { useReference?: boolean }) => {
    const query = new URLSearchParams({ episode_id: String(episodeId) })
    if (options?.useReference === false) query.set('use_reference', 'false')
    return api.get<{ prompt: string }>(`/characters/${id}/portrait-prompt?${query.toString()}`)
  },
  voiceSample: (id: number, episodeId: number) => api.post(`/characters/${id}/generate-voice-sample`, { episode_id: episodeId }),
  generateImage: (id: number, episodeId: number, options?: { useReference?: boolean }) =>
    api.post(`/characters/${id}/generate-image`, {
      episode_id: episodeId,
      use_reference: options?.useReference !== false,
    }),
  recognizePortrait: (id: number, episodeId: number) => api.post(`/characters/${id}/recognize-portrait`, { episode_id: episodeId }),
  generateAppearance: (id: number, data: { episode_id?: number; script?: string; content?: string; text_model?: string; text_thinking?: boolean }) =>
    api.post(`/characters/${id}/generate-appearance`, data),
  batchImages: (ids: number[], episodeId: number, options?: { useReference?: boolean }) =>
    api.post('/characters/batch-generate-images', {
      character_ids: ids,
      episode_id: episodeId,
      use_reference: options?.useReference !== false,
    }),
}

export const sceneAPI = {
  generateImage: (id: number, episodeId: number) => api.post(`/scenes/${id}/generate-image`, { episode_id: episodeId }),
}

export const imageAPI = {
  generate: (d: any) => api.post('/images', d),
  get: (id: number) => api.get(`/images/${id}`),
  list: (params?: { drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get(`/images${query.size ? `?${query.toString()}` : ''}`)
  },
}
export const gridAPI = {
  prompt: (d: any) => api.post('/grid/prompt', d),
  generate: (d: any) => api.post('/grid/generate', d),
  status: (id: number) => api.get(`/grid/status/${id}`),
  split: (d: any) => api.post('/grid/split', d),
}
export const videoAPI = {
  generate: (d: any) => api.post('/videos', d),
  get: (id: number) => api.get(`/videos/${id}`),
}
export const composeAPI = {
  shot: (id: number) => api.post(`/compose/storyboards/${id}/compose`),
  all: (epId: number, options?: { only_remaining?: boolean; storyboard_ids?: number[] }) =>
    api.post(`/compose/episodes/${epId}/compose-all`, {
      only_remaining: options?.only_remaining !== false,
      storyboard_ids: options?.storyboard_ids,
    }),
  cancel: (epId: number) => api.post(`/compose/episodes/${epId}/compose/cancel`),
  status: (epId: number) => api.get(`/compose/episodes/${epId}/compose-status`),
}
export const mergeAPI = {
  merge: (epId: number, options?: { cancel_running?: boolean; bgm_music_id?: number; bgm_volume?: number; include_opening_video?: boolean; clip_limit?: number }) =>
    api.post(`/merge/episodes/${epId}/merge`, {
      cancel_running: options?.cancel_running !== false,
      bgm_music_id: options?.bgm_music_id,
      bgm_volume: options?.bgm_volume,
      include_opening_video: options?.include_opening_video === true,
      clip_limit: options?.clip_limit,
    }),
  mergeOpening: (epId: number, options?: { cancel_running?: boolean }) =>
    api.post(`/merge/episodes/${epId}/merge/opening`, {
      cancel_running: options?.cancel_running !== false,
    }),
  mergeTitle: (epId: number, options?: { cancel_running?: boolean }) =>
    api.post(`/merge/episodes/${epId}/merge/title`, {
      cancel_running: options?.cancel_running !== false,
    }),
  cancel: (epId: number) => api.post(`/merge/episodes/${epId}/merge/cancel`),
  status: (epId: number) => api.get(`/merge/episodes/${epId}/merge`),
}
export const aiConfigAPI = {
  list: (t?: string) => api.get(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (d: any) => api.post('/ai-configs', d),
  update: (id: number, d: any) => api.put(`/ai-configs/${id}`, d),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (d: any) => api.post('/ai-configs/test', d),
  huobaoPreset: (apiKey: string) => api.post('/ai-configs/huobao-preset', { api_key: apiKey }),
}

export const agentConfigAPI = {
  list: () => api.get('/agent-configs'),
  get: (id: number) => api.get(`/agent-configs/${id}`),
  create: (d: any) => api.post('/agent-configs', d),
  update: (id: number, d: any) => api.put(`/agent-configs/${id}`, d),
  del: (id: number) => api.del(`/agent-configs/${id}`),
}

export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (id: string) => api.get(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string) => api.put(`/skills/${id}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
}

export const voicesAPI = {
  list: (provider?: string, options?: { model_size?: '0.6B' | '1.7B' }) => {
    const params = new URLSearchParams()
    if (provider) params.set('provider', provider)
    if (options?.model_size) params.set('model_size', options.model_size)
    const query = params.toString()
    return api.get(`/ai-voices${query ? `?${query}` : ''}`)
  },
  sync: () => api.post('/ai-voices/sync', {}),
  voiceboxHealth: () => api.get('/ai-voices/voicebox/health'),
  previewLocal: (options?: {
    local_tts_engine?: 'edge' | 'voicebox'
    local_voice?: string
    tts_speed?: number
    voicebox_instruct?: string
    voicebox_model_size?: '0.6B' | '1.7B'
    text?: string
  }) => api.post('/ai-voices/preview', options || {}),
  previewTts: (options?: {
    text?: string
    local_tts?: boolean
    local_tts_engine?: 'edge' | 'voicebox'
    local_voice?: string
    voice_id?: string
    config_id?: number | null
    tts_speed?: number
    voicebox_instruct?: string
    voicebox_model_size?: '0.6B' | '1.7B'
  }) => api.post('/ai-voices/preview', options || {}),
}

export const musicAPI = {
  list: (params?: { episode_id?: number; drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.episode_id) query.set('episode_id', String(params.episode_id))
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get(`/music${query.size ? `?${query.toString()}` : ''}`)
  },
  get: (id: number) => api.get(`/music/${id}`),
  suggestDescription: (data: {
    episode_id?: number
    storyboard_id?: number
    model?: string
    description?: string
    content?: string
  }) => api.post('/music/suggest-description', data),
  generate: (data: {
    episode_id?: number
    drama_id?: number
    storyboard_id?: number
    description?: string
    prompt?: string
    content?: string
    model?: string
    config_id?: number
    auto_apply?: boolean
  }) => api.post('/music/generate', data),
  apply: (id: number, storyboardId: number) => api.post(`/music/${id}/apply`, { storyboard_id: storyboardId }),
  applyAll: (id: number, episodeId: number) => api.post(`/music/${id}/apply-all`, { episode_id: episodeId }),
  sync: (id: number) => api.post(`/music/${id}/sync`, {}),
  resumePending: (data?: { episode_id?: number; drama_id?: number }) => api.post('/music/resume-pending', data || {}),
  upload: (data: {
    drama_id?: number
    episode_id?: number
    path: string
    title?: string
    description?: string
  }) => api.post('/music/upload', data),
  del: (id: number) => api.del(`/music/${id}`),
}
