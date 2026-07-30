import crypto from 'node:crypto'

/** 有道智云文本翻译（需配置 YOUDAO_APP_KEY / YOUDAO_APP_SECRET） */
export async function youdaoTranslate(
  text: string,
  opts?: { from?: string; to?: string; appKey?: string; appSecret?: string },
): Promise<string> {
  const q = String(text || '').trim()
  if (!q) return ''

  const appKey = opts?.appKey || process.env.YOUDAO_APP_KEY || ''
  const appSecret = opts?.appSecret || process.env.YOUDAO_APP_SECRET || ''
  if (!appKey || !appSecret) {
    throw new Error('未配置 YOUDAO_APP_KEY / YOUDAO_APP_SECRET')
  }

  const salt = String(Date.now())
  const curtime = String(Math.round(Date.now() / 1000))
  const input = q.length <= 20 ? q : `${q.slice(0, 10)}${q.length}${q.slice(-10)}`
  const sign = crypto.createHash('sha256').update(appKey + input + salt + curtime + appSecret).digest('hex')

  const body = new URLSearchParams({
    q,
    from: opts?.from || 'zh-CHS',
    to: opts?.to || 'en',
    appKey,
    salt,
    sign,
    signType: 'v3',
    curtime,
  })

  const resp = await fetch('https://openapi.youdao.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await resp.json() as { errorCode?: string; translation?: string[]; l?: string }
  if (String(data.errorCode) !== '0') {
    throw new Error(`有道翻译失败: errorCode=${data.errorCode ?? 'unknown'}`)
  }
  return (data.translation || []).join(' ').trim()
}
