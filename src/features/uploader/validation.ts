// ASSUMPTION: mirror of server rules. Confirm against the Creato API docs.
export const LIMITS = {
  minFiles: 1,
  maxFiles: 10,
  maxPromptLength: 2000,
  image: {
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxBytes: 20 * 1024 * 1024,
  },
  video: {
    types: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxBytes: 500 * 1024 * 1024,
  },
  thumbnailMaxBytes: 5 * 1024 * 1024,
} as const

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`

function checkFile(file: File, allowImage: boolean, allowVideo: boolean, maxVideo: number, maxImage: number): string | null {
  const isImage = (LIMITS.image.types as readonly string[]).includes(file.type)
  const isVideo = (LIMITS.video.types as readonly string[]).includes(file.type)
  if (!((allowImage && isImage) || (allowVideo && isVideo))) {
    return `"${file.name}" has an unsupported type (${file.type || 'unknown'}).`
  }
  if (file.size === 0) return `"${file.name}" is empty.`
  const max = isVideo ? maxVideo : maxImage
  if (file.size > max) return `"${file.name}" is larger than ${mb(max)}.`
  return null
}

export const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

/** Returns error messages; empty array means valid. */
export function validateSelection(files: File[], thumbnail?: File, prompt?: string): string[] {
  const errors: string[] = []
  if (files.length < LIMITS.minFiles || files.length > LIMITS.maxFiles) {
    errors.push(`Select between ${LIMITS.minFiles} and ${LIMITS.maxFiles} files.`)
  }
  const seen = new Set<string>()
  for (const f of files) {
    const k = fileKey(f)
    if (seen.has(k)) errors.push(`"${f.name}" was selected more than once.`)
    seen.add(k)
    const e = checkFile(f, true, true, LIMITS.video.maxBytes, LIMITS.image.maxBytes)
    if (e) errors.push(e)
  }
  if (thumbnail) {
    const e = checkFile(thumbnail, true, false, 0, LIMITS.thumbnailMaxBytes)
    if (e) errors.push(`Thumbnail: ${e}`)
  }
  if (prompt && prompt.length > LIMITS.maxPromptLength) {
    errors.push(`Prompt must be at most ${LIMITS.maxPromptLength} characters.`)
  }
  return errors
}
