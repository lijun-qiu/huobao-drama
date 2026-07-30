/**
 * Kolors 中文生图冒烟测试
 * 用法: npx tsx scripts/test-kolors-gen.ts
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  copyComfyImageOutput,
  injectKolorsWorkflow,
  loadWorkflowTemplate,
  queueComfyPrompt,
  waitForComfyPrompt,
  waitForComfyServer,
} from '../src/services/comfyui-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../data/_test_kolors.png')

const PROMPT = [
  '16:9横屏，现代高质量电影感动漫插画，新海诚风格，细腻线稿，柔和赛璐璐。',
  '画面主体：青年男性程序员，黑色短发，身穿灰色连帽卫衣，位于宿舍窗前单手扶框揉眼。',
  '年代场景：大学宿舍清晨，浅色木质双层床，桌面二手笔记本电脑与杂乱充电线。',
  '光影色调：清晨暖黄色日光穿透薄纱窗帘，窗帘缝隙射入光束在地板形成光斑。',
  '镜头视角：中近景侧前方，强调人物与宿舍陈设。',
].join(' ')

async function main() {
  console.log('等待 ComfyUI...')
  const online = await waitForComfyServer(120_000)
  if (!online) throw new Error('ComfyUI 未启动 (http://127.0.0.1:8188)')

  const prompt = loadWorkflowTemplate('kolors')
  injectKolorsWorkflow(prompt, {
    positive: PROMPT,
    negative: '低质量，模糊，文字，水印，畸形，多余肢体',
    width: 1024,
    height: 576,
    seed: Date.now() % 1_000_000_000,
    steps: 25,
    cfg: 5,
  })

  console.log('提交 Kolors 任务...')
  const promptId = await queueComfyPrompt(prompt)
  console.log('prompt_id:', promptId)
  const outputs = await waitForComfyPrompt(promptId, 600_000)
  const rel = copyComfyImageOutput(outputs, 'images')
  const abs = path.resolve(__dirname, '../../', rel.replace(/^static\//, 'data/static/'))
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.copyFileSync(abs, OUT)
  console.log('OK ->', OUT)
}

main().catch(err => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
