/**
 * Agnes 定妆参考预处理：将近白棚光背景换成深藏青，
 * 避免多图合成塌成白底角色设定拼贴。
 */
export const AGNES_PORTRAIT_DARK_BG = '#0f172a'
const AGNES_DARK_RGB = { r: 15, g: 23, b: 42 }

export async function convertPortraitRefWhiteBgToAgnesDark(
  input: Buffer | string,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const src = typeof input === 'string' && input.startsWith('data:')
    ? Buffer.from(input.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    : input
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r >= 232 && g >= 232 && b >= 232) {
      data[i] = AGNES_DARK_RGB.r
      data[i + 1] = AGNES_DARK_RGB.g
      data[i + 2] = AGNES_DARK_RGB.b
    } else if (r >= 245 && g >= 245 && b >= 240) {
      data[i] = AGNES_DARK_RGB.r
      data[i + 1] = AGNES_DARK_RGB.g
      data[i + 2] = AGNES_DARK_RGB.b
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}
