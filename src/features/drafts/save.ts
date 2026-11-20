import { parseSceneV2, toSceneV2, type Scene } from '@/features/canvas-editor'
import { DraftsApiError } from './api'
import type { Draft, DraftsApi, DraftUpdate, ThumbnailMimeType } from './types'

/** editor_version the editor saves: a version 2 scene (layer geometry as canvas fractions). */
export const SCENE_EDITOR_VERSION = 2

export type DraftRef = Pick<Draft, 'draft_id' | 'cdn'>

const THUMBNAIL_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'] satisfies ThumbnailMimeType[]
const hasScheme = (src: string) => /^[a-z][a-z0-9+.-]*:/i.test(src)

/** Absolute CDN url back to the relative path the draft stores. Other srcs are kept. */
function toRelative(cdn: string, src: string): string {
  const base = `${cdn.replace(/\/+$/, '')}/`
  return cdn && src.startsWith(base) ? src.slice(base.length) : src
}

/** Relative path to an absolute CDN url. `sample:` and http(s) srcs are kept. */
function toAbsolute(cdn: string, src: string): string {
  if (!src || hasScheme(src) || !cdn) return src
  return `${cdn.replace(/\/+$/, '')}/${src.replace(/^\/+/, '')}`
}

function mapSrcs(scene: Scene, fn: (src: string) => string): void {
  for (const l of scene.layers) if ('src' in l.props) l.props.src = fn(l.props.src)
  if (scene.canvas.background.type === 'image') scene.canvas.background.src = fn(scene.canvas.background.src)
}

/**
 * Editor scene to PATCH fields: editor_state as a version 2 scene with relative
 * media paths. canvas_background is sent only for a hex colour or an image, the
 * two forms the draft field holds; a gradient lives in editor_state only.
 */
export function sceneToDraftUpdate(scene: Scene, cdn: string): DraftUpdate {
  const v2 = toSceneV2(scene)
  mapSrcs(v2, (src) => toRelative(cdn, src))
  const update: DraftUpdate = { editor_state: JSON.stringify(v2), editor_version: SCENE_EDITOR_VERSION }
  const bg = v2.canvas.background
  if (bg.type === 'solid' && /^#[0-9a-f]{3,8}$/i.test(bg.color)) update.canvas_background = bg.color
  else if (bg.type === 'image' && bg.src && !hasScheme(bg.src)) update.canvas_background = bg.src
  return update
}

/** The scene a previous editor save stored, with absolute media urls; undefined for any other editor_state. */
export function savedScene(draft: Pick<Draft, 'cdn' | 'editor_state' | 'editor_version'>): Scene | undefined {
  if (draft.editor_version !== SCENE_EDITOR_VERSION) return undefined
  let scene: Scene
  try {
    scene = parseSceneV2(draft.editor_state)
  } catch {
    return undefined
  }
  mapSrcs(scene, (src) => toAbsolute(draft.cdn, src))
  return scene
}

/** PUT a blob to a presigned URL. Content-Type must match the type it was signed for. Never log `url`. */
export async function putBlob(url: string, blob: Blob, mimeType: ThumbnailMimeType): Promise<void> {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob })
  if (!res.ok) throw new DraftsApiError(res.status, 'Thumbnail upload failed')
}

/**
 * Saves the editor scene to the draft. With a thumbnail: get an upload URL,
 * PUT the image, then send its key in the same PATCH as the scene.
 */
export async function saveDraft(
  api: DraftsApi,
  draft: DraftRef,
  scene: Scene,
  thumbnail?: Blob,
  put: typeof putBlob = putBlob,
): Promise<Draft> {
  const body = sceneToDraftUpdate(scene, draft.cdn)
  if (thumbnail) {
    if (!THUMBNAIL_TYPES.includes(thumbnail.type)) throw new DraftsApiError(400, `Unsupported thumbnail type: ${thumbnail.type}`)
    const mimeType = thumbnail.type as ThumbnailMimeType
    const { upload_url, file_url } = await api.thumbnailUploadUrl(draft.draft_id, mimeType)
    await put(upload_url, thumbnail, mimeType)
    body.thumbnail_key = file_url
  }
  return api.update(draft.draft_id, body)
}
