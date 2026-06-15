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
