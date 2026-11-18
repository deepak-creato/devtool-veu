import { computed, getCurrentScope, onScopeDispose, reactive, readonly } from 'vue'
import { ApiError, PutError } from './errors'
import { putFile as defaultPut } from './s3'
import type {
  FileSpec,
  FileState,
  InitialiseBody,
  Phase,
  StartOptions,
  UploadEventName,
  UploadItem,
  UploaderDeps,
  UploadStatus,
} from './types'
import { validateSelection } from './validation'

/** Presigned URLs and server-side tracking both last 1 hour. */
const URL_TTL_MS = 3_600_000
/** Treat a URL as expired slightly early so a PUT does not start right at the edge. */
const URL_MARGIN_MS = 30_000
const MAX_PUT_ATTEMPTS = 3
const MAX_RESTARTS = 1

type PutResult = 'ok' | 'expired' | 'failed' | 'aborted'

interface Local {
  file: File
  spec: FileSpec
  role: FileState['role']
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

const isEventName = (n: unknown): n is UploadEventName => n === 'upload' || n === 'upload_ack' || n === 'upload_error'

export function usePostUpload(deps: UploaderDeps) {
  const { api, socket } = deps
  const putFile = deps.putFile ?? defaultPut
  const now = deps.now ?? Date.now
  const makeId = deps.makeId ?? (() => crypto.randomUUID())
  const pollMs = deps.pollMs ?? 5_000
  const retryBaseMs = deps.retryBaseMs ?? 500

  const state = reactive({
    phase: 'picking' as Phase,
    files: [] as FileState[],
    postId: null as string | null,
    /** Server processing progress, 0-99 until draft_ready. Never decreases. */
    serverProgress: 0,
    /** Server-provided errors (upload_error) are stored verbatim; never pass through i18n. */
    error: null as string | null,
  })

  const locals = new Map<string, Local>()
  let body: InitialiseBody | null = null
  let ctrl = new AbortController()
  let gen = 0
  let initialisedAt = 0
  let restartsLeft = MAX_RESTARTS
  let lastVersion = Number.NEGATIVE_INFINITY
  let pollTimer: ReturnType<typeof setInterval> | undefined

  const fileState = (id: string) => state.files.find((f) => f.id === id)
  const urlExpired = () => now() - initialisedAt >= URL_TTL_MS - URL_MARGIN_MS
  const tracking = () => state.phase === 'uploading' || state.phase === 'upload_failed' || state.phase === 'processing'

  const overallProgress = computed(() => {
    if (state.phase === 'draft_ready') return 100
    if (state.phase === 'processing' || state.phase === 'failed') return state.serverProgress
    const total = state.files.reduce((s, f) => s + f.size, 0)
    if (!total) return 0
    return Math.round(state.files.reduce((s, f) => s + (f.size * f.progress) / 100, 0) / total)
  })

  // ---- phase + tracking ----
  function setPhase(p: Phase) {
    state.phase = p
    syncPolling()
  }

  function stopPolling() {
    clearInterval(pollTimer)
    pollTimer = undefined
  }

  /** Poll only while processing and the socket is NOT healthy: never a tight loop beside a live socket. */
  function syncPolling() {
    stopPolling()
    if (state.phase === 'processing' && !socket.isConnected()) {
      pollTimer = setInterval(() => void checkStatus(), pollMs)
    }
  }

  function bumpProgress(p: unknown) {
    if (typeof p !== 'number' || !Number.isFinite(p)) return
    const capped = Math.min(Math.max(p, 0), 99)
    if (capped > state.serverProgress) state.serverProgress = capped
  }

  function draftReady() {
    if (state.phase === 'draft_ready') return // idempotent: duplicate acks do nothing
    const postId = state.postId
    state.serverProgress = 100
    state.error = null
    setPhase('draft_ready')
    deps.storage?.clear()
    if (postId) deps.onDraftReady?.(postId)
  }

  function fail(message: string) {
    if (state.phase === 'failed' || state.phase === 'draft_ready') return
    state.error = message
    setPhase('failed')
    deps.storage?.clear()
  }

  function handleEvent(name: UploadEventName, raw: unknown) {
    if (!tracking() || !state.postId) return
    const p = raw as { success?: unknown; data?: { post_id?: unknown; progress?: unknown }; error?: unknown } | null
    if (!p || typeof p !== 'object' || !p.data || p.data.post_id !== state.postId) return
    if (name === 'upload_error') {
      fail(typeof p.error === 'string' && p.error ? p.error : 'Processing failed.')
    } else if (p.success === false) {
      return
    } else if (name === 'upload_ack') {
      draftReady()
    } else {
      bumpProgress(p.data.progress)
    }
  }

  function applyStatus(s: UploadStatus) {
    if (!tracking() || s.post_id !== state.postId) return
    if (!(s.version > lastVersion)) return // only newer versions apply
    lastVersion = s.version
    if (s.state === 'completed') draftReady()
    else if (s.state === 'failed') fail(s.error || 'Processing failed.')
    else bumpProgress(s.progress)
  }

  async function checkStatus() {
    const postId = state.postId
    const g = gen
    if (!postId || !tracking()) return
    try {
      const s = await api.status(postId)
      if (g !== gen || postId !== state.postId) return
      if (s) applyStatus(s)
      else if (state.phase === 'processing' && now() - initialisedAt >= URL_TTL_MS) {
        fail('The upload expired. Please start again.') // server stops tracking after 1 hour
      } // null otherwise: processing has not reported yet, keep waiting
    } catch {
      /* transient; next trigger retries */
    }
  }

  async function connectSocket() {
    try {
      await socket.connect()
    } catch {
      /* fall back to polling */
    }
    syncPolling()
  }

  // ---- upload ----
  async function uploadOne(id: string, g: number): Promise<PutResult> {
    const l = locals.get(id)
    const f = fileState(id)
    if (!l?.item || !f) return 'failed'
    const signal = ctrl.signal
    f.status = 'uploading'
    f.progress = 0
    for (let attempt = 1; ; attempt++) {
      try {
        await putFile({
          url: l.item.upload_url,
          file: l.file,
          mimeType: l.spec.mime_type, // exactly what was sent at initialise
          signal,
          onProgress: (loaded, total) => {
            if (g === gen && total) f.progress = Math.round((loaded / total) * 100)
          },
        })
        if (g !== gen) return 'aborted'
        f.status = 'uploaded'
        f.progress = 100
        return 'ok'
      } catch (e) {
        if (g !== gen || isAbort(e)) return 'aborted'
        f.progress = 0
        // 403 = signature/URL expired: retrying the same URL cannot help.
        if (e instanceof PutError && e.status === 403) {
          f.status = 'failed'
          return 'expired'
        }
        const retryable = e instanceof PutError && (e.status === 0 || e.status >= 500)
        if (!retryable || attempt >= MAX_PUT_ATTEMPTS) {
          f.status = 'failed'
          return 'failed'
        }
        if (urlExpired()) {
          f.status = 'failed'
          return 'expired'
        }
        try {
          await sleep(retryBaseMs * 2 ** (attempt - 1), signal)
        } catch {
          return 'aborted'
        }
        if (urlExpired()) {
          f.status = 'failed'
          return 'expired'
        }
      }
    }
  }

  async function uploadAndFinish(ids: string[], g: number) {
    setPhase('uploading')
    state.error = null
    const results = await Promise.all(ids.map((id) => uploadOne(id, g)))
    if (g !== gen || state.phase !== 'uploading') return // reset, or a socket event already ended the flow
    if (results.includes('aborted')) return
    if (results.includes('expired')) {
      if (restartsLeft > 0) {
        restartsLeft--
        await run(g) // expired URL: start again from initialise
        return
      }
      state.error = 'The upload link expired again. Please start over.'
      deps.storage?.clear()
      setPhase('picking')
      return
    }
    if (results.includes('failed') || state.files.some((f) => f.status !== 'uploaded')) {
      state.error = 'Some files could not be uploaded. Retry the failed files.'
      setPhase('upload_failed')
      return
    }
    // All PUTs 200: processing. Do not fake 100.
    const postId = state.postId
    if (postId) deps.storage?.save({ post_id: postId, initialised_at: initialisedAt, stage: 'processing' })
    setPhase('processing')
    void checkStatus() // catches events missed while uploading; data null = keep waiting
  }

  async function run(g: number) {
    if (!body) return
    setPhase('initialising')
    state.error = null
    state.postId = null
    state.serverProgress = 0
    lastVersion = Number.NEGATIVE_INFINITY
    for (const f of state.files) {
      f.status = 'queued'
      f.progress = 0
    }
    // Socket first: events sent before it connects are lost. If it cannot connect, polling covers it.
    await connectSocket()
    if (g !== gen) return
    try {
      const res = await api.initialise(body)
      if (g !== gen) return
      state.postId = res.post_id
      initialisedAt = now()
      for (const [id, l] of locals) l.item = res.uploads.get(id)
      if ([...locals.values()].some((l) => !l.item)) throw new Error('Initialise response is missing an upload item')
    } catch (e) {
      if (g !== gen) return
      state.postId = null
      state.error =
        e instanceof ApiError && e.status >= 400 && e.status < 500
          ? e.message || 'The server rejected the upload.'
          : 'Could not start the upload. Please try again.'
      setPhase('picking')
      return // no PUT is made
    }
    deps.storage?.save({ post_id: state.postId!, initialised_at: initialisedAt, stage: 'uploading' })
    await uploadAndFinish([...locals.keys()], g)
  }

  // ---- public API ----
  function reset() {
    gen++
    ctrl.abort()
    ctrl = new AbortController()
    stopPolling()
    locals.clear()
    body = null
    deps.storage?.clear()
    Object.assign(state, { phase: 'picking', files: [], postId: null, serverProgress: 0, error: null })
  }

  async function start(files: File[], options: StartOptions = {}): Promise<void> {
    if (state.phase !== 'picking') return
    const errors = validateSelection(files, options.thumbnail, options.prompt)
    if (errors.length) {
      state.error = errors.join(' ')
      return
    }
    gen++
    ctrl.abort()
    ctrl = new AbortController()
    const g = gen
    locals.clear()
    const entries = [
      ...files.map((file) => ({ file, role: 'media' as const })),
      ...(options.thumbnail ? [{ file: options.thumbnail, role: 'thumbnail' as const }] : []),
    ].map(({ file, role }) => ({
      file,
      role,
      spec: { id: makeId(), name: file.name, mime_type: file.type, size: file.size } satisfies FileSpec,
    }))
    for (const e of entries) locals.set(e.spec.id, { file: e.file, spec: e.spec, role: e.role })
    state.files = entries.map(({ spec, role }) => ({
      id: spec.id,
      name: spec.name,
      size: spec.size,
      mime_type: spec.mime_type,
      role,
      status: 'queued',
      progress: 0,
    }))
    body = {
      media_metadata: entries.filter((e) => e.role === 'media').map((e) => e.spec),
      thumbnail: entries.find((e) => e.role === 'thumbnail')?.spec,
      prompt: options.prompt || undefined,
    }
    restartsLeft = MAX_RESTARTS
    await run(g)
  }

  /** Re-PUT failed files with the same URL, or restart from initialise when the URL expired. */
  async function retryFailed(): Promise<void> {
    if (state.phase !== 'upload_failed') return
    const g = gen
    if (urlExpired()) {
      restartsLeft = MAX_RESTARTS
      await run(g)
      return
    }
    await uploadAndFinish(
      state.files.filter((f) => f.status === 'failed').map((f) => f.id),
      g,
    )
  }

  /** On launch: pick up a persisted post_id, then fetch its status. */
  async function resume(): Promise<void> {
    if (state.phase !== 'picking' || !deps.storage) return
    const p = deps.storage.load()
    if (!p) return
    if (now() - p.initialised_at >= URL_TTL_MS) {
      deps.storage.clear()
      return
    }
    if (p.stage === 'uploading') {
      deps.storage.clear() // files are gone after a restart: cannot continue the PUTs
      state.error = 'The previous upload was interrupted. Please start again.'
      return
    }
    gen++
    state.postId = p.post_id
    initialisedAt = p.initialised_at
    lastVersion = Number.NEGATIVE_INFINITY
    state.serverProgress = 0
    setPhase('processing')
    await connectSocket() // connect first so no event is lost, then catch up via status
    await checkStatus()
  }

  // ---- lifecycle wiring ----
  const offEvent = socket.onEvent((name, payload) => {
    if (isEventName(name)) handleEvent(name, payload)
  })
  const offReconnect = socket.onReconnect(() => {
    syncPolling()
    void checkStatus()
  })
  const offDisconnect = socket.onDisconnect(syncPolling)

  const onResume = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    void checkStatus()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onResume)
  if (typeof window !== 'undefined') window.addEventListener('online', onResume)

  function dispose() {
    gen++
    ctrl.abort()
    stopPolling()
    offEvent()
    offReconnect()
    offDisconnect()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onResume)
    if (typeof window !== 'undefined') window.removeEventListener('online', onResume)
    socket.disconnect()
  }
  if (getCurrentScope()) onScopeDispose(dispose)

  return { state: readonly(state), overallProgress, start, retryFailed, resume, reset, dispose }
}

export type PostUpload = ReturnType<typeof usePostUpload>
