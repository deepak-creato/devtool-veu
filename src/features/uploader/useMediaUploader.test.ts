import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, PutError } from './errors'
import type { PutFile, SocketHandlers, UploaderApi, UploadStatus } from './types'
import { useMediaUploader } from './useMediaUploader'

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' })
const status = (state: UploadStatus['state'], version: number, progress = 0): UploadStatus => ({
  state,
  progress,
  version,
  updated_at: '',
})

function setup(overrides: { api?: Partial<UploaderApi>; put?: PutFile; socket?: boolean } = {}) {
  let handlers: SocketHandlers | undefined
  const closeSock = vi.fn()
  const api: UploaderApi = {
    initialise: vi.fn(async (body) => ({
      post_id: 'p1',
      uploads: [...body.media_metadata, ...(body.thumbnail ? [body.thumbnail] : [])].map((m) => ({
        id: m.id,
        key: `k/${m.id}`,
        upload_url: `https://s3.test/${m.id}`,
      })),
    })),
    complete: vi.fn(async () => ({ state: 'uploaded' as const })),
    refreshUrls: vi.fn(async (_p: string, ids: string[]) => ids.map((id) => ({ id, key: 'k', upload_url: `https://s3.test/fresh-${id}` }))),
    cancel: vi.fn(async () => undefined),
    status: vi.fn(async () => null),
    ...overrides.api,
  }
  const put: PutFile = overrides.put ?? vi.fn(async ({ onProgress }) => onProgress(10, 10))
  const up = useMediaUploader({
    api,
    hashFile: async (f) => `sum-${f.name}`,
    putFile: put,
    openSocket:
      overrides.socket === false
        ? undefined
        : (_id, h) => {
            handlers = h
            return { close: closeSock }
          },
    retryBaseMs: 1,
    socketSilenceMs: 10_000,
    pollIntervalMs: 3_000,
  })
  return { up, api, put, socket: () => handlers!, closeSock }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useMediaUploader', () => {
  it('happy path: upload, complete, ws progress to ready', async () => {
    const { up, api, socket } = setup()
    await up.start([file('a.png'), file('b.png')])
    expect(up.state.files.map((f) => f.status)).toEqual(['uploaded', 'uploaded'])
    expect(api.complete).toHaveBeenCalledWith('p1', [
      expect.objectContaining({ checksum_sha256: 'sum-a.png' }),
      expect.objectContaining({ checksum_sha256: 'sum-b.png' }),
    ])
    expect(up.state.postState).toBe('uploaded')
    socket().onStatus(status('processing', 2, 50))
    expect(up.overallProgress.value).toBe(50)
    socket().onStatus(status('ready', 3, 100))
    expect(up.state.postState).toBe('ready')
    expect(up.overallProgress.value).toBe(100)
  })

  it('limits to 3 parallel PUTs', async () => {
    let running = 0
    let peak = 0
    const put: PutFile = async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
    }
    const { up } = setup({ put })
    const p = up.start(Array.from({ length: 6 }, (_, i) => file(`${i}.png`, 10 + i)))
    await vi.advanceTimersByTimeAsync(100)
    await p
    expect(peak).toBe(3)
  })

  it('403 -> refresh-urls for that file only -> success', async () => {
    const urls: string[] = []
    let first = true
    const put: PutFile = async ({ url }) => {
      urls.push(url)
      if (first) {
        first = false
        throw new PutError(403)
      }
    }
    const { up, api } = setup({ put })
    await up.start([file('a.png')])
    expect(api.refreshUrls).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.refreshUrls!).mock.calls[0][1]).toHaveLength(1)
    expect(urls[1]).toContain('fresh-')
    expect(up.state.files[0].status).toBe('uploaded')
  })

  it('retries 3 times then fails the file; retryFile recovers', async () => {
    let fail = true
    const put: PutFile = vi.fn(async () => {
      if (fail) throw new PutError(500)
    })
    const { up, api } = setup({ put })
    const p = up.start([file('a.png')])
    await vi.advanceTimersByTimeAsync(50)
    await p
    expect(put).toHaveBeenCalledTimes(4) // 1 + 3 retries
    expect(up.state.error?.code).toBe('upload_failed')
    expect(api.complete).not.toHaveBeenCalled()
    fail = false
    await up.retryFile(up.state.files[0].id)
    expect(api.complete).toHaveBeenCalled()
    expect(up.state.error).toBeNull()
  })

  it('409 on complete -> uploads missing file -> completes again', async () => {
    let calls = 0
    const { up, api, put } = setup({
      api: {
        complete: vi.fn(async (_p, files) => {
          if (calls++ === 0) throw new ApiError(409, 'missing', { missing_file_ids: [files[1].id] })
          return { state: 'uploaded' as const }
        }),
      },
    })
    await up.start([file('a.png'), file('b.png')])
    expect(api.complete).toHaveBeenCalledTimes(2)
    expect(vi.mocked(put).mock.calls.length).toBe(3) // a, b, b again
    expect(up.state.postState).toBe('uploaded')
  })

  it('400 on complete -> checksum_mismatch, failed, no tracking', async () => {
    const { up } = setup({
      api: {
        complete: vi.fn(async () => {
          throw new ApiError(400, 'checksum', null)
        }),
      },
    })
    await up.start([file('a.png')])
    expect(up.state.postState).toBe('failed')
    expect(up.state.error?.code).toBe('checksum_mismatch')
    expect(up.state.busy).toBe(false)
  })

  it('cancel mid-upload aborts PUT, calls DELETE, resets', async () => {
    let aborted = false
    const put: PutFile = ({ signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        }),
      )
    const { up, api } = setup({ put })
    const p = up.start([file('a.png')])
    await vi.advanceTimersByTimeAsync(1)
    await up.cancel()
    await p
    expect(aborted).toBe(true)
    expect(api.cancel).toHaveBeenCalledWith('p1')
    expect(up.state.files).toEqual([])
    expect(up.state.postState).toBe('idle')
    expect(api.complete).not.toHaveBeenCalled()
  })

  it('socket close falls back to polling every 3s until ready', async () => {
    const statuses = [status('processing', 1, 40), status('ready', 2, 100)]
    const { up, api, socket } = setup({ api: { status: vi.fn(async () => statuses.shift() ?? null) } })
    await up.start([file('a.png')])
    socket().onClose()
    await vi.advanceTimersByTimeAsync(0)
    expect(up.state.postState).toBe('processing')
    await vi.advanceTimersByTimeAsync(3000)
    expect(up.state.postState).toBe('ready')
    await vi.advanceTimersByTimeAsync(9000)
    expect(api.status).toHaveBeenCalledTimes(2) // stopped at terminal state
  })

  it('socket silent for 10s falls back to polling', async () => {
    const { up, api } = setup({ api: { status: vi.fn(async () => status('processing', 1, 10)) } })
    await up.start([file('a.png')])
    await vi.advanceTimersByTimeAsync(9_000)
    expect(api.status).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_100)
    expect(api.status).toHaveBeenCalledTimes(1)
  })

  it('validation error blocks initialise', async () => {
    const { up, api } = setup()
    await up.start([])
    expect(up.state.error?.code).toBe('validation')
    expect(api.initialise).not.toHaveBeenCalled()
  })

  it('processing failure maps to a clear message', async () => {
    const { up, socket } = setup()
    await up.start([file('a.png')])
    socket().onStatus({ ...status('failed', 2), error: 'transcode' })
    expect(up.state.error?.code).toBe('processing_failed')
  })
})
