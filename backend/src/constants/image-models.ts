export const DEFAULT_IMAGE_MODEL = 'doubao-seedream-3-0-t2i-250415'

export function resolveEpisodeImageModel(
  episode?: { imageModel?: string | null } | null,
  bodyModel?: string | null,
) {
  const picked = String(bodyModel || episode?.imageModel || '').trim()
  return picked || DEFAULT_IMAGE_MODEL
}
