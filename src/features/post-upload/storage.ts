import type { PersistedUpload, UploadStorage } from './types'

const KEY = 'post_upload_pending'

export function localUploadStorage(): UploadStorage {
  return {
    load() {
      try {
        const raw = localStorage.getItem(KEY)
        if (!raw) return null
        const p = JSON.parse(raw) as Partial<PersistedUpload>
        if (typeof p.post_id === 'string' && typeof p.initialised_at === 'number' && (p.stage === 'uploading' || p.stage === 'processing'))
          return p as PersistedUpload
      } catch {
        /* unavailable or corrupt */
      }
      return null
    },
    save(p) {
      try {
        localStorage.setItem(KEY, JSON.stringify(p))
      } catch {
        /* session-only */
      }
    },
    clear() {
      try {
        localStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
    },
  }
}
