import { generateEdgeTTS } from '../src/services/edge-tts-local.js'

const samples = [
  '28 岁摆地摊成 80 年代万元户，',
  '1985 年的春天，',
  '可进入 2000 年之后，',
  '他说："你好"，这是测试——配音！',
]

for (const text of samples) {
  try {
    const path = await generateEdgeTTS(text, 'zh-CN-YunxiNeural')
    console.log('OK', text.slice(0, 30), '->', path)
  } catch (err: any) {
    console.log('FAIL', text.slice(0, 30), '->', err.message)
  }
}
