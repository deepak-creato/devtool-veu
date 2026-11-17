import { PutError } from './errors'
import type { PutFile } from './types'

/** XHR, not fetch: fetch has no upload progress. Never log `url` (presigned). */
export const putFile: PutFile = ({ url, file, mimeType, checksum, signal, onProgress }) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const xhr = new XMLHttpRequest()
    const onAbort = () => xhr.abort()
    signal.addEventListener('abort', onAbort)
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mimeType)
    // Only when the URL was signed with it; an unsigned extra header makes S3 answer 403.
    if (checksum) xhr.setRequestHeader('x-amz-checksum-sha256', checksum)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total)
    }
    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new PutError(xhr.status))
    }
    xhr.onerror = () => {
      cleanup()
      reject(new PutError(0))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    xhr.send(file)
  })
