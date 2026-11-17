import { computed, getCurrentScope, onScopeDispose, reactive, readonly } from 'vue'
import { ApiError, PutError, makeError } from './errors'
import { missingIdsFrom } from './api'
import { putFile as defaultPut } from './s3'
import {
  TERMINAL_STATES,
  type FileSpec,
  type FileState,
  type PostState,
  type StartOptions,
  type UploadItem,
  type UploaderConfig,
  type UploaderError,
  type UploadStatus,
} from './types'
import { validateSelection } from './validation'

const MAX_PARALLEL = 3
const MAX_RETRIES = 3
const MAX_COMPLETE_ROUNDS = 3

interface Local {
  file: File
  checksum: string
  item?: UploadItem
}

const abortError = () => new DOMException('Aborted', 'AbortError')
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function waitOnline(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const onOnline = () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    const onAbort = () => {
      window.removeEventListener('online', onOnline)
      reject(abortError())
    }
    window.addEventListener('online', onOnline, { once: true })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const worker = async () => {
    while (i < items.length) await fn(items[i++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export function useMediaUploader(config: UploaderConfig) {
  const { api } = config
  const hashFile = config.hashFile
  const putFile = config.putFile ?? defaultPut
  const retryBaseMs = config.retryBaseMs ?? 500
  const silenceMs = config.socketSilenceMs ?? 10_000
  const pollMs = config.pollIntervalMs ?? 3_000

  const state = reactive({
    files: [] as FileState[],
    postId: null as string | null,
    postState: 'idle' as PostState,
    serverProgress: 0,
    error: null as UploaderError | null,
    busy: false,
  })

  const locals = new Map<string, Local>()
  let ctrl = new AbortController()
  let gen = 0
  let lastVersion = -1
  let sock: { close(): void } | null = null
  let silenceTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined

  const fileState = (id: string) => state.files.find((f) => f.id === id)

  const overallProgress = computed(() => {
    if (state.postState === 'ready') return 100
    if (state.postState === 'processing' || state.postState === 'uploaded') return state.serverProgress
    const total = state.files.reduce((s, f) => s + f.size, 0)
    if (!total) return 0
    return Math.round(state.files.reduce((s, f) => s + (f.size * f.progress) / 100, 0) / total)
  })

  // ---- tracking (socket + polling fallback) ----
  function stopPolling() {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
  function stopTracking() {
    stopPolling()
    clearTimeout(silenceTimer)
    sock?.close()
    sock = null
  }

  function applyStatus(s: UploadStatus, g: number) {
    if (g !== gen || s.version < lastVersion) return
    lastVersion = s.version
    state.postState = s.state
    state.serverProgress = s.progress
    if (!TERMINAL_STATES.includes(s.state)) return
    stopTracking()
    if (s.state === 'failed') state.error = makeError('processing_failed', s.error)
    else if (s.state === 'expired') state.error = makeError('expired')
    state.busy = false
  }

  async function poll(g: number, postId: string) {
    try {
      const s = await api.status(postId)
      if (s) applyStatus(s, g)
    } catch {
      /* transient; next tick retries */
    }
  }

  function startPolling(g: number, postId: string) {
    if (pollTimer || g !== gen) return
    void poll(g, postId)
    pollTimer = setInterval(() => void poll(g, postId), pollMs)
  }

  function startTracking(postId: string) {
    stopTracking()
    const g = gen
    const armSilence = () => {
      clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => startPolling(g, postId), silenceMs)
    }
    sock =
      config.openSocket?.(postId, {
        onStatus: (s) => {
          stopPolling()
          armSilence()
          applyStatus(s, g)
        },
        onClose: () => {
          clearTimeout(silenceTimer)
          startPolling(g, postId)
        },
      }) ?? null
    if (sock) armSilence()
    else startPolling(g, postId)
  }

  // ---- upload ----
  function failFile(id: string, message: string) {
    const f = fileState(id)
    if (f) {
      f.status = 'failed'
      f.error = message
    }
  }

  async function uploadOne(id: string, g: number): Promise<void> {
    const l = locals.get(id)
    const f = fileState(id)
    const postId = state.postId
    if (!l || !f || !postId || !l.item) return
    const signal = ctrl.signal
    let retries = 0
    f.status = 'uploading'
    f.progress = 0
    f.error = undefined
    for (;;) {
      try {
        await putFile({
          url: l.item.upload_url,
          file: l.file,
          mimeType: l.file.type,
          checksum: l.checksum,
          signal,
          onProgress: (loaded, total) => {
            if (g === gen && total) f.progress = Math.round((loaded / total) * 100)
          },
        })
        if (g !== gen) return
        f.status = 'uploaded'
        f.progress = 100
        return
      } catch (e) {
        if (g !== gen || isAbort(e)) return
        if (e instanceof PutError && e.status === 400) {
          // S3 rejected the digest: file changed after selection, or signed checksum mismatch.
          failFile(id, 'File changed or was corrupted. Re-select it and start again.')
          state.error = makeError('checksum_mismatch')
          return
        }
        try {
          if (e instanceof PutError && e.status === 0 && typeof navigator !== 'undefined' && !navigator.onLine) {
            state.error = makeError('network')
            await waitOnline(signal)
            state.error = null
            continue // network loss does not consume a retry
          }
          if (retries >= MAX_RETRIES) {
            failFile(id, 'Upload failed after several attempts.')
            return
          }
          retries++
          if (e instanceof PutError && e.status === 403 && api.refreshUrls) {
            const [fresh] = await api.refreshUrls(postId, [id])
            if (g !== gen) return
            if (fresh) l.item = fresh
          } else {
            await sleep(retryBaseMs * 2 ** (retries - 1), signal)
          }
        } catch (inner) {
          if (g !== gen || isAbort(inner)) return
          failFile(id, 'Upload failed after several attempts.')
          return
        }
        f.progress = 0
      }
    }
  }

  async function uploadAll(ids: string[], g: number) {
    await pool(ids, MAX_PARALLEL, (id) => uploadOne(id, g))
  }

  function allUploaded() {
    return state.files.length > 0 && state.files.every((f) => f.status === 'uploaded')
  }

  async function finish(g: number) {
    if (g !== gen) return
    if (state.error?.code === 'checksum_mismatch') {
      state.busy = false
      return
    }
    if (!allUploaded()) {
      state.error = makeError('upload_failed')
      state.busy = false
      return
    }
    state.error = null
    const postId = state.postId
    if (!postId) return
    const complete = api.complete
    if (!complete) {
      // No explicit complete step: processing starts server-side after the PUT.
      state.postState = 'processing'
      startTracking(postId)
      return
    }
    const files = [...locals].map(([id, l]) => ({ id, checksum_sha256: l.checksum }))
    for (let round = 0; round < MAX_COMPLETE_ROUNDS; round++) {
      try {
        const res = await complete(postId, files)
        if (g !== gen) return
        state.postState = res.state
        startTracking(postId)
        return
      } catch (e) {
        if (g !== gen) return
        if (e instanceof ApiError && e.status === 400) {
          state.postState = 'failed'
          state.error = makeError('checksum_mismatch')
          state.busy = false
          return
        }
        if (e instanceof ApiError && e.status === 409) {
          const missing = missingIdsFrom(e.data).filter((id) => locals.has(id))
          if (!missing.length) break
          for (const id of missing) {
            const f = fileState(id)
            if (f) f.status = 'queued'
          }
          await uploadAll(missing, g)
          if (g !== gen) return
          if (!allUploaded()) {
            state.error = makeError('upload_failed')
            state.busy = false
            return
          }
          continue
        }
        break
      }
    }
    state.error = makeError('unknown')
    state.busy = false
  }

  // ---- public API ----
  function reset() {
    gen++
    ctrl.abort()
    ctrl = new AbortController()
    stopTracking()
    locals.clear()
    lastVersion = -1
    Object.assign(state, {
      files: [],
      postId: null,
      postState: 'idle',
      serverProgress: 0,
      error: null,
      busy: false,
    })
  }

  async function cancel(): Promise<void> {
    const postId = state.postId
    reset()
    if (postId) {
      try {
        await api.cancel(postId)
      } catch {
        /* best effort; server expires pending posts */
      }
    }
  }

  async function start(files: File[], options: StartOptions = {}): Promise<void> {
    if (state.postId && !TERMINAL_STATES.includes(state.postState)) await cancel()
    else reset()
    const g = gen

    const errors = validateSelection(files, options.thumbnail, options.prompt)
    if (errors.length) {
      state.error = { code: 'validation', message: errors.join(' ') }
      return
    }

    state.busy = true
    const entries: { spec: FileSpec; role: FileState['role']; file: File }[] = [
      ...files.map((file) => ({ file, role: 'media' as const })),
      ...(options.thumbnail ? [{ file: options.thumbnail, role: 'thumbnail' as const }] : []),
    ].map(({ file, role }) => ({
      file,
      role,
      spec: { id: crypto.randomUUID(), name: file.name, mime_type: file.type, size: file.size },
    }))
    state.files = entries.map(({ spec, role }) => ({
      id: spec.id,
      name: spec.name,
      size: spec.size,
      mime_type: spec.mime_type,
      role,
      status: 'hashing',
      progress: 0,
    }))

    // 1) hash (worker, streamed)
    await pool(entries, MAX_PARALLEL, async ({ spec, file }) => {
      try {
        const checksum = hashFile ? await hashFile(file, ctrl.signal) : ''
        locals.set(spec.id, { file, checksum })
        const f = fileState(spec.id)
        if (g === gen && f) f.status = 'queued'
      } catch (e) {
        if (g === gen && !isAbort(e)) failFile(spec.id, 'Could not read this file.')
      }
    })
    if (g !== gen) return
    if (state.files.some((f) => f.status === 'failed')) {
      state.error = makeError('unknown', 'a file could not be read')
      state.busy = false
      return
    }

    // 2) initialise
    try {
      const res = await api.initialise({
        media_metadata: entries.filter((e) => e.role === 'media').map((e) => e.spec),
        thumbnail: entries.find((e) => e.role === 'thumbnail')?.spec,
        prompt: options.prompt || undefined,
      })
      if (g !== gen) return
      state.postId = res.post_id
      state.postState = 'pending'
      for (const item of res.uploads) {
        const l = locals.get(item.id)
        if (l) l.item = item
      }
    } catch (e) {
      if (g !== gen) return
      state.error =
        e instanceof ApiError && (e.status === 400 || e.status === 422)
          ? { code: 'validation', message: e.message }
          : makeError('unknown')
      state.busy = false
      return
    }

    // 3) upload, 4) complete
    await uploadAll(
      state.files.map((f) => f.id),
      g,
    )
    await finish(g)
  }

  async function retryFile(id: string): Promise<void> {
    const f = fileState(id)
    if (!f || f.status !== 'failed' || !state.postId || state.postState !== 'pending') return
    if (state.error?.code === 'checksum_mismatch') return // must re-initialise via start()
    const g = gen
    state.busy = true
    state.error = null
    await uploadOne(id, g)
    await finish(g)
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && pollTimer === undefined && state.postId && state.postState !== 'pending') {
      if (!TERMINAL_STATES.includes(state.postState)) void poll(gen, state.postId)
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  function dispose() {
    document.removeEventListener('visibilitychange', onVisible)
    const postId = state.postId
    const pending = state.postState === 'pending'
    gen++
    ctrl.abort()
    stopTracking()
    // Leaving mid-upload: remove the half-uploaded post. Processing continues server-side.
    if (postId && pending) void api.cancel(postId).catch(() => undefined)
  }
  if (getCurrentScope()) onScopeDispose(dispose)

  return { state: readonly(state), overallProgress, start, cancel, retryFile, dispose }
}

export type MediaUploader = ReturnType<typeof useMediaUploader>
