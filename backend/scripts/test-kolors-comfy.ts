/**
 * Kolors 中文直出 ComfyUI 冒烟测试
 * 用法: npx tsx scripts/test-kolors-comfy.ts
 */
import fs from 'node:fs'
import path from 'node:path'

const COMFY_BASE = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '')
const OUT_DIR = path.resolve('..', 'data', 'static', '_kolors_test')

const workflow = {
  '6': {
    class_type: 'DownloadAndLoadKolorsModel',
    inputs: { model: 'Kwai-Kolors/Kolors', precision: 'fp16' },
  },
  '13': {
    class_type: 'LoadChatGLM3',
    inputs: { chatglm3_checkpoint: 'chatglm3-8bit.safetensors' },
  },
  '12': {
    class_type: 'KolorsTextEncode',
    inputs: {
      chatglm3_model: ['13', 0],
      prompt: '16:9横屏，现代高质量电影感动漫插画，大学宿舍清晨，浅色木质双层床，年轻男性程序员穿灰色连帽卫衣，位于卧室窗前单手扶框揉眼，笔记本电脑和杂乱充电线，窗帘缝隙射入晨光',
      negative_prompt: '低质量，模糊，水印，文字，畸形，多余肢体',
      num_images_per_prompt: 1,
    },
  },
  '14': {
    class_type: 'KolorsSampler',
    inputs: {
      kolors_model: ['6', 0],
      kolors_embeds: ['12', 0],
      width: 1024,
      height: 576,
      seed: 204001,
      steps: 20,
      cfg: 5,
      scheduler: 'EulerDiscreteScheduler',
    },
  },
  '11': {
    class_type: 'VAELoader',
    inputs: { vae_name: 'kolors_vae_fp16.safetensors' },
  },
  '10': {
    class_type: 'VAEDecode',
    inputs: { samples: ['14', 0], vae: ['11', 0] },
  },
  '9': {
    class_type: 'SaveImage',
    inputs: { filename_prefix: 'huobao/kolors_test', images: ['10', 0] },
  },
}

async function comfyUrl(p: string) {
  return `${COMFY_BASE}${p}`
}

async function waitForComfy(maxSec = 180) {
  const start = Date.now()
  while (Date.now() - start < maxSec * 1000) {
    try {
      const r = await fetch(await comfyUrl('/system_stats'), { signal: AbortSignal.timeout(5000) })
      if (r.ok) return
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('ComfyUI 未在 8188 端口就绪')
}

async function pollHistory(promptId: string, maxSec = 600) {
  const start = Date.now()
  while (Date.now() - start < maxSec * 1000) {
    const r = await fetch(await comfyUrl(`/history/${promptId}`))
    const data = await r.json() as Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> }>
    const item = data[promptId]
    if (item?.outputs) return item
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`超时未拿到结果: ${promptId}`)
}

async function main() {
  console.log('等待 ComfyUI...')
  await waitForComfy()

  const objectInfo = await fetch(await comfyUrl('/object_info'))
  const info = await objectInfo.json() as Record<string, unknown>
  for (const node of ['DownloadAndLoadKolorsModel', 'LoadChatGLM3', 'KolorsSampler', 'KolorsTextEncode']) {
    if (!info[node]) throw new Error(`ComfyUI 未加载节点 ${node}，请确认 ComfyUI-KwaiKolorsWrapper 已安装并重启`)
  }
  console.log('Kolors 节点已注册')

  const body = { prompt: workflow, client_id: 'huobao-kolors-test' }
  const queued = await fetch(await comfyUrl('/prompt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const qj = await queued.json() as { prompt_id?: string; error?: string; node_errors?: unknown }
  if (!qj.prompt_id) {
    console.error(qj)
    throw new Error(`提交失败: ${qj.error || 'unknown'}`)
  }
  console.log('已提交 prompt_id:', qj.prompt_id)

  const hist = await pollHistory(qj.prompt_id)
  const images = Object.values(hist.outputs || {}).flatMap(o => o.images || [])
  if (!images.length) throw new Error('无输出图片')

  const img = images[0]
  const viewUrl = await comfyUrl(`/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`)
  const bin = await fetch(viewUrl)
  if (!bin.ok) throw new Error(`下载失败: ${viewUrl}`)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const outPath = path.join(OUT_DIR, img.filename)
  fs.writeFileSync(outPath, Buffer.from(await bin.arrayBuffer()))
  console.log('生图成功:', outPath)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
