import type { Draft, DraftList, DraftsApi, Sources, ThumbnailUploadUrl } from './types'

export class DraftsApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'DraftsApiError'
    this.status = status
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createDraftsApi(
  baseUrl: string,
  getToken: () => string | Promise<string>,
  onUnauthorized?: () => void,
): DraftsApi {
  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await getToken()}` }
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    let json: { message?: string; data?: T } | null = null
    try {
      json = await res.json()
    } catch {
      /* non-JSON body */
    }
    if (res.status === 401) onUnauthorized?.()
    if (!res.ok) throw new DraftsApiError(res.status, json?.message ?? res.statusText)
    if (!json?.data) throw new DraftsApiError(res.status, 'Empty response')
    return json.data
  }
  const badId = () => Promise.reject(new DraftsApiError(400, 'Invalid draft id'))
  return {
    list: () => request<DraftList>('/posts/drafts'),
    get(draftId) {
      if (!UUID.test(draftId)) return badId()
      return request<Draft>(`/posts/drafts/${draftId}`)
    },
    update(draftId, body) {
      if (!UUID.test(draftId)) return badId()
      return request<Draft>(`/posts/drafts/${draftId}`, { method: 'PATCH', body })
    },
    thumbnailUploadUrl(draftId, mimeType) {
      if (!UUID.test(draftId)) return badId()
      return request<ThumbnailUploadUrl>(`/posts/drafts/${draftId}/thumbnail/upload-url`, {
        method: 'POST',
        body: { mime_type: mimeType },
      })
    },
  }
}

/** Join the CDN base and a relative path. Returns undefined when the path is missing. */
export function cdnUrl(cdn: string, path?: string): string | undefined {
  if (!path) return undefined
  return `${cdn.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** Best still image: thumbnail, then poster, then main. A video's main is an .m3u8, not an image. */
export function stillUrl(cdn: string, s: Sources, type: 'image' | 'video'): string | undefined {
  return cdnUrl(cdn, s.thumbnail?.default ?? s.poster?.default ?? (type === 'image' ? s.main?.default : undefined))
}
