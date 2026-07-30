import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { downloadFile, getAbsolutePath } from '../utils/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

export function extractAudioFromVideo(videoAbsPath: string, outputAbsPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputAbsPath), { recursive: true })
  return new Promise((resolve, reject) => {
    ffmpeg(videoAbsPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .format('mp3')
      .output(outputAbsPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

export async function saveRemoteMediaAsBgmAudio(mediaUrl: string): Promise<string> {
  const lower = mediaUrl.toLowerCase()
  if (/\.(mp3|wav|m4a|aac)(\?|$)/i.test(lower)) {
    return downloadFile(mediaUrl, 'audio')
  }

  const videoRelative = await downloadFile(mediaUrl, 'temp')
  const videoAbs = getAbsolutePath(videoRelative)
  const filename = `${uuid()}.mp3`
  const outputAbs = path.join(STORAGE_ROOT, 'audio', filename)
  await extractAudioFromVideo(videoAbs, outputAbs)

  try {
    fs.unlinkSync(videoAbs)
  } catch {}

  return `static/audio/${filename}`
}

/** 保存 data:audio/...;base64,... 或纯 base64 为本地 BGM mp3 */
export function saveBase64MediaAsBgmAudio(dataUrlOrBase64: string, ext = 'mp3'): string {
  const raw = String(dataUrlOrBase64 || '').trim()
  if (!raw) throw new Error('空音频数据')
  const comma = raw.indexOf(',')
  const b64 = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw
  const buf = Buffer.from(b64, 'base64')
  if (buf.length < 256) throw new Error('音频数据过短，可能未生成成功')
  const filename = `${uuid()}.${ext.replace(/^\./, '')}`
  const dir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(dir, { recursive: true })
  const outputAbs = path.join(dir, filename)
  fs.writeFileSync(outputAbs, buf)
  return `static/audio/${filename}`
}
