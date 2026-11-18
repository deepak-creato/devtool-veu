import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApi } from './api'
import { ApiError, PutError } from './errors'
import { putFile as realPut } from './s3'
import type {
  InitialiseBody,
  PersistedUpload,
  PostUploadApi,
  PutFile,
  UploadEventName,
  UploadSocket,
  UploadStatus,
  UploadStorage,
} from './types'
import { usePostUpload } from './usePostUpload'

const POST = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type })

function fakeSocket(connected = true) {
  let ev: ((n: UploadEventName, p: unknown) => void) | undefined
  let rc: (() => void) | undefined
  let dc: (() => void) | undefined
  const s = {
    connected,
    connectFails: false,
    connect: vi.fn(async () => {
      if (s.connectFails) throw new Error('nope')
      s.connected = true
    }),
    isConnected: () => s.connected,
    onEvent: (cb: typeof ev) => ((ev = cb), () => {}),
    onReconnect: (cb: () => void) => ((rc = cb), () => {}),
    onDisconnect: (cb: () => void) => ((dc = cb), () => {}),
    disconnect: vi.fn(),
    emit: (n: UploadEventName, postId: string, progress: number, extra: Record<string, unknown> = {}) =>
      ev?.(n, { success: n !== 'upload_error', type: 'user', data: { post_id: postId, progress }, ...extra }),
    reconnect: () => ((s.connected = true), rc?.()),
    drop: () => ((s.connected = false), dc?.()),
  }
  return s as typeof s & UploadSocket
}

function memStorage(initial: PersistedUpload | null = null) {
  let v = initial
  const st: UploadStorage & { value: () => PersistedUpload | null } = {
    load: () => v,
    save: (p) => void (v = p),
    clear: () => void (v = null),
    value: () => v,
  }
  return st
}

/** Echo api: one item per spec, shuffled, thumbnail appended last (as the real server does). */
function echoApi(overrides: Partial<PostUploadApi> = {}) {
  const calls: InitialiseBody[] = []
  const api: PostUploadApi & { calls: InitialiseBody[] } = {
    calls,
    initialise: vi.fn(async (body: InitialiseBody) => {
      calls.push(body)
      const uploads = new Map()
      const media = [...body.media_metadata].reverse() // shuffled vs request order
      for (const m of media) {
        const kind = m.mime_type.startsWith('video') ? 'video' : 'image'
        uploads.set(m.id, { id: m.id, upload_url: `https://s3/${m.id}`, file_url: `original/${kind}/${POST}/a/source.x` })
      }
      if (body.thumbnail)
        uploads.set(body.thumbnail.id, { id: body.thumbnail.id, upload_url: `https://s3/${body.thumbnail.id}`, file_url: `posts/thumbnail/${OTHER}/r.jpg` })
      return { post_id: POST, uploads }
    }),
    status: vi.fn(async () => null),
    ...overrides,
  }
  return api
}

const okPut = (): PutFile & ReturnType<typeof vi.fn> => vi.fn(async () => {}) as never

function setup(o: { api?: PostUploadApi; put?: PutFile; socket?: ReturnType<typeof fakeSocket>; storage?: ReturnType<typeof memStorage>; now?: () => number; onDraftReady?: (id: string) => void } = {}) {
  const socket = o.socket ?? fakeSocket()
  const api = o.api ?? echoApi()
  const storage = o.storage ?? memStorage()
  const put = o.put ?? okPut()
  const up = usePostUpload({ api, socket, putFile: put, storage, retryBaseMs: 1, pollMs: 1000, now: o.now, onDraftReady: o.onDraftReady })
  return { up, api, socket, storage, put }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('happy path', () => {
  it('1. image: PUT -> upload 30/60/99 -> ack => draft_ready, bar never goes back', async () => {
    const ready = vi.fn()
    const { up, socket } = setup({ onDraftReady: ready })
    await up.start([file('a.jpg', 'image/jpeg')])
    expect(up.state.phase).toBe('processing')
    const seen: number[] = []
    for (const p of [30, 60, 99]) {
      socket.emit('upload', POST, p)
      seen.push(up.overallProgress.value)
    }
    expect(seen).toEqual([30, 60, 99])
    expect(up.state.phase).toBe('processing') // never fakes 100
    socket.emit('upload_ack', POST, 100)
    expect(up.state.phase).toBe('draft_ready')
    expect(up.overallProgress.value).toBe(100)
    expect(ready).toHaveBeenCalledWith(POST)
  })
})

describe('initialise + S3', () => {
  it('2. carousel (2 img + 1 video) + thumbnail, shuffled: each file PUT to its own url, post_id parsed', async () => {
    const put = okPut()
    const { up, api } = setup({ put })
    const files = [file('1.jpg', 'image/jpeg'), file('2.png', 'image/png'), file('3.mp4', 'video/mp4')]
    const thumb = file('t.jpg', 'image/jpeg')
    await up.start(files, { thumbnail: thumb })
    expect(up.state.postId).toBe(POST) // not the thumbnail's id
    const calls = (put as unknown as { mock: { calls: [{ url: string; file: File }][] } }).mock.calls.map((c) => c[0])
    expect(calls).toHaveLength(4)
    const body = (api as ReturnType<typeof echoApi>).calls[0]
    const idByName = new Map([...body.media_metadata, body.thumbnail!].map((m) => [m.name, m.id]))
    for (const c of calls) expect(c.url).toBe(`https://s3/${idByName.get(c.file.name)}`)
    expect(up.state.phase).toBe('processing')
  })

  it('3. video/mp4 PUT sends exactly Content-Type video/mp4, no other headers', async () => {
    vi.useRealTimers()
    const headers: Record<string, string> = {}
    let sentBody: unknown
    class FakeXhr {
      status = 200
      upload: Record<string, unknown> = {}
      onload?: () => void
      onerror?: () => void
      onabort?: () => void
      open() {}
      setRequestHeader(k: string, v: string) {
        headers[k] = v
      }
      send(b: unknown) {
        sentBody = b
        queueMicrotask(() => this.onload?.())
      }
      abort() {}
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const f = file('v.mp4', 'video/mp4')
    await realPut({ url: 'https://s3/x', file: f, mimeType: 'video/mp4', signal: new AbortController().signal, onProgress() {} })
    vi.unstubAllGlobals()
    expect(headers).toEqual({ 'Content-Type': 'video/mp4' })
    expect(sentBody).toBe(f) // raw bytes, not FormData
  })

  it('3b. initialise parsing against the real createApi (shuffled response, thumbnail last)', async () => {
    vi.useRealTimers()
    const body: InitialiseBody = {
      media_metadata: [
        { id: 'a', name: 'a.jpg', mime_type: 'image/jpeg', size: 1 },
        { id: 'b', name: 'b.mp4', mime_type: 'video/mp4', size: 1 },
      ],
      thumbnail: { id: 't', name: 't.jpg', mime_type: 'image/jpeg', size: 1 },
    }
    const resp = {
      status: true,
      message: 'post.OPERATIONS.POST_CREATED',
      data: [
        { id: 'b', upload_url: 'u-b', file_url: `original/video/${POST}/x/source.mp4` },
        { id: 'a', upload_url: 'u-a', file_url: `original/image/${POST}/y/source.jpg` },
        { id: 't', upload_url: 'u-t', file_url: `posts/thumbnail/${OTHER}/z.jpg` },
      ],
    }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(resp), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await createApi('http://x', () => 'tok').initialise(body)
    vi.unstubAllGlobals()
    expect(r.post_id).toBe(POST)
    expect(r.uploads.get('a')!.upload_url).toBe('u-a')
    expect(r.uploads.get('t')!.upload_url).toBe('u-t')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
})

describe('events', () => {
  it('4. out-of-order progress: 60 then 40 shows 60', async () => {
    const { up, socket } = setup()
    await up.start([file('a.jpg', 'image/jpeg')])
    socket.emit('upload', POST, 60)
    socket.emit('upload', POST, 40)
    expect(up.overallProgress.value).toBe(60)
  })

  it('5. other post_id events are ignored', async () => {
    const ready = vi.fn()
    const { up, socket } = setup({ onDraftReady: ready })
    await up.start([file('a.jpg', 'image/jpeg')])
    socket.emit('upload', OTHER, 70)
    socket.emit('upload_error', OTHER, 0, { error: 'boom' })
    socket.emit('upload_ack', OTHER, 100)
    expect(up.state.phase).toBe('processing')
    expect(up.overallProgress.value).toBe(0)
    expect(ready).not.toHaveBeenCalled()
  })

  it('6. duplicate upload_ack: single transition and single callback', async () => {
    const ready = vi.fn()
    const { up, socket } = setup({ onDraftReady: ready })
    await up.start([file('a.jpg', 'image/jpeg')])
    socket.emit('upload_ack', POST, 100)
    socket.emit('upload_ack', POST, 100)
    expect(up.state.phase).toBe('draft_ready')
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('7. upload_error shows the exact server text and state failed', async () => {
    const { up, socket } = setup()
    await up.start([file('a.jpg', 'image/jpeg')])
    socket.emit('upload_error', POST, 0, { error: 'Media processing failed' })
    expect(up.state.phase).toBe('failed')
    expect(up.state.error).toBe('Media processing failed')
    up.reset()
    expect(up.state.phase).toBe('picking') // Failed -> Picking
  })
})

describe('validation + initialise errors', () => {
  it('8. 400 on initialise (0 and 11 files): error shown, no PUT', async () => {
    const put = okPut()
    const api = echoApi({
      initialise: vi.fn(async () => {
        throw new ApiError(400, 'common.FILE.FILES_MAX_LENGTH')
      }),
    })
    const { up } = setup({ api, put })
    await up.start([])
    expect(up.state.error).toBeTruthy() // blocked client side
    expect(api.initialise).not.toHaveBeenCalled()
    await up.start(Array.from({ length: 11 }, (_, i) => file(`${i}.jpg`, 'image/jpeg')))
    expect(api.initialise).not.toHaveBeenCalled()
    // server-side 400 (e.g. client check bypassed)
    await up.start([file('a.jpg', 'image/jpeg')])
    expect(up.state.phase).toBe('picking')
    expect(up.state.error).toBe('common.FILE.FILES_MAX_LENGTH')
    expect(put).not.toHaveBeenCalled()
  })

  it('9. prompt of 2001 chars is blocked client side', async () => {
    const { up, api } = setup()
    await up.start([file('a.jpg', 'image/jpeg')], { prompt: 'x'.repeat(2001) })
    expect(api.initialise).not.toHaveBeenCalled()
    expect(up.state.error).toMatch(/2000/)
    expect(up.state.phase).toBe('picking')
  })

  it('does not send caption/tags/location', async () => {
    const { up, api } = setup()
    await up.start([file('a.jpg', 'image/jpeg')], { prompt: 'hi' })
    expect(Object.keys((api as ReturnType<typeof echoApi>).calls[0]).sort()).toEqual(['media_metadata', 'prompt', 'thumbnail'])
  })
})

describe('PUT retry + expiry', () => {
  it('10. PUT fails once then succeeds with the same URL', async () => {
    let n = 0
    const urls: string[] = []
    const put: PutFile = async ({ url }) => {
      urls.push(url)
      if (n++ === 0) throw new PutError(500)
    }
    const { up } = setup({ put })
    const p = up.start([file('a.jpg', 'image/jpeg')])
    await vi.runAllTimersAsync()
    await p
    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe(urls[1])
    expect(up.state.phase).toBe('processing')
  })

  it('11. 403 on PUT: restarts from initialise once, then stops (no endless retry)', async () => {
    const put: PutFile = vi.fn(async () => {
      throw new PutError(403)
    })
    const { up, api } = setup({ put })
    const p = up.start([file('a.jpg', 'image/jpeg')])
    await vi.runAllTimersAsync()
    await p
    expect(api.initialise).toHaveBeenCalledTimes(2)
    expect(put).toHaveBeenCalledTimes(2)
    expect(up.state.phase).toBe('picking')
    expect(up.state.error).toMatch(/expired/i)
  })

  it('11b. exhausted PUT retries -> upload_failed; retryFailed re-PUTs with same URL', async () => {
    let fail = true
    const urls: string[] = []
    const put: PutFile = async ({ url }) => {
      urls.push(url)
      if (fail) throw new PutError(0)
    }
    const { up } = setup({ put })
    const p = up.start([file('a.jpg', 'image/jpeg')])
    await vi.runAllTimersAsync()
    await p
    expect(up.state.phase).toBe('upload_failed')
    fail = false
    await up.retryFailed()
    expect(up.state.phase).toBe('processing')
    expect(new Set(urls).size).toBe(1)
  })

  it('11c. retryFailed after 1h restarts from initialise', async () => {
    let t = 0
    let fail = true
    const put: PutFile = async () => {
      if (fail) throw new PutError(0)
    }
    const { up, api } = setup({ put, now: () => t })
    const p = up.start([file('a.jpg', 'image/jpeg')])
    await vi.runAllTimersAsync()
    await p
    expect(up.state.phase).toBe('upload_failed')
    fail = false
    t = 3_600_000
    await up.retryFailed()
    expect(api.initialise).toHaveBeenCalledTimes(2)
    expect(up.state.phase).toBe('processing')
  })
})

describe('fallback status + resume', () => {
  const st = (o: Partial<UploadStatus>): UploadStatus => ({
    post_id: POST, state: 'processing', progress: 50, version: 5, updated_at: 'x', event_type: 'upload', ...o,
  })

  it('12. disconnect then reconnect: status fetched, restored, older version ignored', async () => {
    const status = vi.fn<(id: string) => Promise<UploadStatus | null>>(async () => null)
    const { up, socket } = setup({ api: echoApi({ status }) })
    await up.start([file('a.jpg', 'image/jpeg')])
    status.mockClear()
    socket.drop()
    socket.reconnect()
    status.mockResolvedValueOnce(st({ version: 5, progress: 70 }))
    socket.reconnect()
    await vi.advanceTimersByTimeAsync(0)
    expect(status).toHaveBeenCalledWith(POST)
    expect(up.overallProgress.value).toBe(70)
    status.mockResolvedValueOnce(st({ version: 4, progress: 20 })) // older
    socket.reconnect()
    await vi.advanceTimersByTimeAsync(0)
    expect(up.overallProgress.value).toBe(70)
    status.mockResolvedValueOnce(st({ version: 6, state: 'completed', progress: 100, event_type: 'upload_ack' }))
    socket.reconnect()
    await vi.advanceTimersByTimeAsync(0)
    expect(up.state.phase).toBe('draft_ready')
  })

  it('no polling while socket is healthy; polls while it is down', async () => {
    const status = vi.fn(async () => null)
    const { up, socket } = setup({ api: echoApi({ status }) })
    await up.start([file('a.jpg', 'image/jpeg')])
    status.mockClear()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(status).not.toHaveBeenCalled()
    socket.drop()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(status.mock.calls.length).toBe(3) // 1s interval; not a tight loop
  })

  it('13. app killed mid-processing, relaunched: post_id restored, status fetched, UI resumed', async () => {
    const storage = memStorage()
    const a = setup({ storage })
    await a.up.start([file('a.jpg', 'image/jpeg')])
    expect(storage.value()).toMatchObject({ post_id: POST, stage: 'processing' })
    a.up.dispose()
    // relaunch
    const status = vi.fn(async () => st({ version: 9, progress: 80 }))
    const b = setup({ storage, api: echoApi({ status }) })
    await b.up.resume()
    expect(b.up.state.postId).toBe(POST)
    expect(b.up.state.phase).toBe('processing')
    expect(status).toHaveBeenCalledWith(POST)
    expect(b.up.overallProgress.value).toBe(80)
    b.socket.emit('upload_ack', POST, 100)
    expect(b.up.state.phase).toBe('draft_ready')
    expect(storage.value()).toBeNull()
  })

  it('13b. relaunch after kill mid-PUT or after 1h does not resume', async () => {
    const mid = setup({ storage: memStorage({ post_id: POST, initialised_at: 0, stage: 'uploading' }), now: () => 1000 })
    await mid.up.resume()
    expect(mid.up.state.phase).toBe('picking')
    expect(mid.up.state.error).toMatch(/interrupted/)
    const old = setup({ storage: memStorage({ post_id: POST, initialised_at: 0, stage: 'processing' }), now: () => 3_600_001 })
    await old.up.resume()
    expect(old.up.state.phase).toBe('picking')
    expect(old.api.status).not.toHaveBeenCalled()
  })

  it('14. status data null keeps Processing, no error', async () => {
    const { up, socket } = setup()
    await up.start([file('a.jpg', 'image/jpeg')])
    socket.reconnect()
    await vi.advanceTimersByTimeAsync(0)
    expect(up.state.phase).toBe('processing')
    expect(up.state.error).toBeNull()
  })

  it('status failed shows error; completed is draft ready', async () => {
    const status = vi.fn(async () => st({ state: 'failed', error: 'Bad media', event_type: 'upload_error' }))
    const { up, socket } = setup({ api: echoApi({ status }) })
    await up.start([file('a.jpg', 'image/jpeg')])
    socket.reconnect()
    await vi.advanceTimersByTimeAsync(0)
    expect(up.state.phase).toBe('failed')
    expect(up.state.error).toBe('Bad media')
  })
})

describe('socket before initialise', () => {
  it('15a. socket not connected at tap: connects BEFORE initialise', async () => {
    const socket = fakeSocket(false)
    const order: string[] = []
    socket.connect.mockImplementation(async () => {
      order.push('connect')
      socket.connected = true
    })
    const api = echoApi({
      initialise: vi.fn(async (b: InitialiseBody) => {
        order.push('initialise')
        return echoApi().initialise(b)
      }),
    })
    const { up } = setup({ socket, api })
    await up.start([file('a.jpg', 'image/jpeg')])
    expect(order).toEqual(['connect', 'initialise'])
  })

  it('15b. connect fails: falls back to polling and still completes', async () => {
    const socket = fakeSocket(false)
    socket.connectFails = true
    const status = vi.fn(async () => null)
    const { up } = setup({ socket, api: echoApi({ status }) })
    await up.start([file('a.jpg', 'image/jpeg')])
    expect(up.state.phase).toBe('processing')
    status.mockClear()
    status.mockResolvedValue({ post_id: POST, state: 'completed', progress: 100, version: 1, updated_at: 'x', event_type: 'upload_ack' } as never)
    await vi.advanceTimersByTimeAsync(1000)
    expect(up.state.phase).toBe('draft_ready')
  })
})
