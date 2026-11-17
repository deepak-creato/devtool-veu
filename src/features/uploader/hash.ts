type WorkerReply = { ok: true; checksum: string } | { ok: false; error: string }

export function hashFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' })
    const done = () => {
      signal.removeEventListener('abort', onAbort)
      worker.terminate()
    }
    const onAbort = () => {
      done()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort)
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      done()
      if (e.data.ok) resolve(e.data.checksum)
      else reject(new Error(e.data.error))
    }
    worker.onerror = () => {
      done()
      reject(new Error('Could not read file'))
    }
    worker.postMessage(file)
  })
}
