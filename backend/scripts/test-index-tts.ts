/**
 * IndexTTS2 冒烟测试 — 需先完成 setup-index-tts.ps1
 * 用法：cd backend && npx tsx scripts/test-index-tts.ts
 */
import { checkIndexTtsHealth, generateIndexTtsTTS } from '../src/services/index-tts-tts.js'
import { listGptSovitsVoices } from '../src/services/gpt-sovits-tts.js'

async function main() {
  console.log('==> IndexTTS2 health check...')
  const health = await checkIndexTtsHealth()
  console.log(JSON.stringify(health, null, 2))
  if (!health.ok) process.exit(1)

  const voices = await listGptSovitsVoices()
  const voice = voices[0]
  if (!voice) throw new Error('data/gptsovits/voices.json 中没有可用参考音')

  console.log(`==> synth test voice=${voice.voice_id} ref=${voice.ref_audio_path}`)
  const path = await generateIndexTtsTTS(
    '这是一段 IndexTTS2 情感配音测试，语气要自然、有感染力。',
    `gsv:${voice.voice_id}`,
    { emotionText: '体验人生解说，情绪饱满、节奏沉稳' },
  )
  console.log('==> OK:', path)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
