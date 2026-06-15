/** 4022 网关 Kling 图像模型（https://api.4022543.xyz/pricing?keyword=kling） */
export const KLING_IMAGE_MODELS = [
  {
    value: 'kling-v1-5',
    label: 'Kling V1.5',
    priceT2i: 0.17,
    priceI2i: 0.34,
    supportsT2i: true,
    supportsI2i: true,
    supportsMulti: false,
    note: '4022 推荐默认；支持 image_reference=subject 同脸参考',
  },
  {
    value: 'kling-v1',
    label: 'Kling V1',
    priceT2i: 0.0425,
    priceI2i: 0.0425,
    supportsT2i: true,
    supportsI2i: true,
    supportsMulti: false,
    note: '4022 低价；图生图仅传 image，不支持 image_reference',
  },
  {
    value: 'kling-v2',
    label: 'Kling V2',
    priceT2i: 0.17,
    priceI2i: 0.34,
    priceMulti: 0.68,
    supportsT2i: true,
    supportsI2i: true,
    supportsMulti: true,
  },
  {
    value: 'kling-v2-new',
    label: 'Kling V2 New',
    priceI2i: 0.34,
    supportsT2i: false,
    supportsI2i: true,
    supportsMulti: false,
    note: '仅图生图，需参考图',
  },
  {
    value: 'kling-v2-1',
    label: 'Kling V2.1',
    priceT2i: 0.17,
    priceMulti: 0.68,
    supportsT2i: true,
    supportsI2i: false,
    supportsMulti: true,
    note: '4022 部分分组无渠道；单图参考请用 V1',
  },
  {
    value: 'kling-v3',
    label: 'Kling V3',
    priceT2i: 0.17,
    priceI2i: 0.34,
    supportsT2i: true,
    supportsI2i: true,
    supportsMulti: false,
    note: '以 4022 实际上线为准',
  },
] as const

export type KlingImageModelValue = typeof KLING_IMAGE_MODELS[number]['value']

export function getKlingModelMeta(model?: string | null) {
  const key = String(model || '').trim().toLowerCase()
  return KLING_IMAGE_MODELS.find(item => item.value === key) || null
}

export function klingModelSupportsSingleReference(model?: string | null): boolean {
  const meta = getKlingModelMeta(model)
  if (!meta) return String(model || '').startsWith('kling-')
  return meta.supportsI2i
}

export function klingModelRequiresReference(model?: string | null): boolean {
  const meta = getKlingModelMeta(model)
  return !!meta && meta.supportsT2i === false && meta.supportsI2i === true
}
