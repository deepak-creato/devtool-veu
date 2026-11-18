import { ApiError } from './errors'
import type { InitialiseBody, InitialiseResult, PostUploadApi, UploadItem, UploadStatus } from './types'

interface Envelope<T> {
  status: boolean
  message: string
  data: T
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isUuidV4 = (s: string) => UUID_V4.test(s)

/** post_id = path segment right after original/image/ or original/video/. Never from the thumbnail url. */
const MEDIA_URL = /^original\/(?:image|video)\/([^/]+)\//
export function postIdFromFileUrl(fileUrl: string): string | null {
  return MEDIA_URL.exec(fileUrl)?.[1] ?? null
}

export function createApi(
  baseUrl: string,
  getToken: () => string | Promise<string>,
  onUnauthorized?: () => void,
): PostUploadApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<Envelope<T>> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    let json: Envelope<T> | null = null
    try {
      json = (await res.json()) as Envelope<T>
    } catch {
      /* empty or non-JSON body */
    }
    if (res.status === 401) onUnauthorized?.()
    if (!res.ok) throw new ApiError(res.status, json?.message ?? res.statusText)
    return json as Envelope<T>
  }

  return {
    async initialise(body: InitialiseBody): Promise<InitialiseResult> {
      const env = await call<UploadItem[]>('POST', '/posts/initialise', body)
      const list = env?.data
      if (!Array.isArray(list)) throw new Error('Unexpected initialise response')
      const mediaIds = new Set(body.media_metadata.map((m) => m.id))
      let postId: string | null = null
      for (const it of list) {
        if (!mediaIds.has(it.id)) continue
        const p = postIdFromFileUrl(it.file_url)
        if (!p) throw new Error('Could not read post id from initialise response')
        if (postId && postId !== p) throw new Error('Media items disagree on post id')
        postId = p
      }
      if (!postId) throw new Error('Could not read post id from initialise response')
      return { post_id: postId, uploads: new Map(list.map((it) => [it.id, it])) }
    },
    async status(postId: string): Promise<UploadStatus | null> {
      if (!isUuidV4(postId)) throw new Error('post_id is not a UUID v4')
      const env = await call<UploadStatus | null>('GET', `/posts/${postId}/upload-status`)
      return env?.data ?? null
    },
  }
}
