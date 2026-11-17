import { ApiError } from './errors'
import type {
  InitialiseResult,
  UploadItem,
  UploaderApi,
  UploadStatus,
} from './types'

interface Envelope<T> {
  status: number | string | boolean
  message: string
  data: T
}

// Real response (verified): data is an array of { id, upload_url, file_url }.
// There is no post_id field: it is the 3rd path segment of file_url
// (original/<type>/<post_id>/<file_uuid>/source.<ext>).
interface RawUploadItem {
  id: string
  file_url: string
  upload_url: string
}

const toItem = (r: RawUploadItem): UploadItem => ({ id: r.id, key: r.file_url, upload_url: r.upload_url })

function postIdFrom(items: RawUploadItem[]): string {
  const id = items[0]?.file_url.split('/')[2]
  if (!id) throw new Error('Could not read post id from initialise response')
  return id
}

export function createApi(
  baseUrl: string,
  getToken: () => string | Promise<string>,
  onUnauthorized?: () => void,
): UploaderApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
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
    if (!res.ok) throw new ApiError(res.status, json?.message ?? res.statusText, json?.data ?? null)
    return json?.data as T
  }

  return {
    async initialise(body) {
      const d = await call<RawUploadItem[]>('POST', '/posts/initialise', body)
      return { post_id: postIdFrom(d), uploads: d.map(toItem) } satisfies InitialiseResult
    },
    async cancel(postId) {
      await call<null>('DELETE', `/posts/${postId}`)
    },
    async status(postId) {
      return (await call<UploadStatus | null>('GET', `/posts/${postId}/upload-status`)) ?? null
    },
  }
}

/** ASSUMPTION: 409 `data` carries the missing ids as `missing_file_ids`. */
export function missingIdsFrom(data: unknown): string[] {
  if (data && typeof data === 'object' && 'missing_file_ids' in data) {
    const v = (data as { missing_file_ids: unknown }).missing_file_ids
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  }
  return []
}
