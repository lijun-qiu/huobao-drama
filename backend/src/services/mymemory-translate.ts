/** MyMemory 免费机器翻译（无需 API Key；注册邮箱可提升日额度） */

const MYMEMORY_MAX_CHARS = 480

type MyMemoryResponse = {
  responseStatus?: number
  responseDetails?: string
  responseData?: { translatedText?: string }
}

async function mymemoryTranslateChunk(
  text: string,
  email?: string,
): Promise<string> {
  const q = String(text || '').trim()
  if (!q) return ''

  const params = new URLSearchParams({
    q,
    langpair: 'zh-CN|en',
  })
  if (email) params.set('de', email)

  const resp = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
    signal: AbortSignal.timeout(30_000),
  })
  const data = await resp.json() as MyMemoryResponse
  if (Number(data.responseStatus) !== 200) {
    throw new Error(`MyMemory 翻译失败: ${data.responseDetails || data.responseStatus || 'unknown'}`)
  }
  const out = String(data.responseData?.translatedText || '').trim()
  if (!out) throw new Error('MyMemory 翻译结果为空')
  return out
}

function splitMyMemoryChunks(text: string): string[] {
  const chunks: string[] = []
  let rest = String(text || '').trim()
  while (rest.length > MYMEMORY_MAX_CHARS) {
    let cut = rest.lastIndexOf('，', MYMEMORY_MAX_CHARS)
    if (cut < MYMEMORY_MAX_CHARS * 0.4) cut = rest.lastIndexOf('。', MYMEMORY_MAX_CHARS)
    if (cut < MYMEMORY_MAX_CHARS * 0.4) cut = rest.lastIndexOf('；', MYMEMORY_MAX_CHARS)
    if (cut < 40) cut = MYMEMORY_MAX_CHARS
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).replace(/^[，。；\s]+/, '').trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

export async function mymemoryTranslate(
  text: string,
  opts?: { email?: string },
): Promise<string> {
  const q = String(text || '').trim()
  if (!q) return ''
  const email = opts?.email || process.env.MYMEMORY_EMAIL || ''

  if (q.length <= MYMEMORY_MAX_CHARS) {
    return mymemoryTranslateChunk(q, email)
  }

  const parts = await Promise.all(
    splitMyMemoryChunks(q).map(chunk => mymemoryTranslateChunk(chunk, email)),
  )
  return parts.join(' ').trim()
}
