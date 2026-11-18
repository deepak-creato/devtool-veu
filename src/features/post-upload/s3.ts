import { PutError } from './errors'
import type { PutFile } from './types'

/**
 * Raw-body PUT to a presigned URL. Only Content-Type is set (it must equal the
 * mime_type sent at initialise, else S3 answers 403). No auth or custom headers.
 * XHR, not fetch: fetch has no upload progress. Never log `url`.
 */
export const putFile: PutFile = ({ url, file, mimeType, signal, onProgress }) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const xhr = new XMLHttpRequest()
    const onAbort = () => xhr.abort()
    signal.addEventListener('abort', onAbort)
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mimeType)
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
