import { afterEach, describe, expect, it, vi } from 'vitest'
import { cdnUrl, createDraftsApi, stillUrl } from './api'
import { useDrafts } from './useDrafts'
import type { DraftsApi } from './types'

const ID = '66666666-6666-4666-8666-666666666666'
const mockFetch = (status: number, body: unknown) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', f)
  return f
}
afterEach(() => vi.unstubAllGlobals())

describe('drafts api', () => {
  it('GET /posts/drafts with bearer token', async () => {
    const f = mockFetch(200, { status: true, data: { cdn: 'https://cdn', drafts: [] } })
    const r = await createDraftsApi('http://x/api/v1', () => 'tok').list()
    expect(r.drafts).toEqual([])
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://x/api/v1/posts/drafts')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('GET /posts/drafts/:id; rejects a malformed id without a request', async () => {
    const f = mockFetch(200, { status: true, data: { draft_id: ID } })
    const api = createDraftsApi('http://x', () => 't')
    await expect(api.get(ID)).resolves.toMatchObject({ draft_id: ID })
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(`http://x/posts/drafts/${ID}`)
    await expect(api.get('../x')).rejects.toMatchObject({ status: 400 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('401 calls onUnauthorized and throws', async () => {
    mockFetch(401, { message: 'no' })
    const out = vi.fn()
    await expect(createDraftsApi('http://x', () => 't', out).list()).rejects.toMatchObject({ status: 401 })
    expect(out).toHaveBeenCalled()
  })

  it('PATCH /posts/drafts/:id sends the JSON body', async () => {
    const f = mockFetch(200, { status: true, data: { draft_id: ID } })
    await expect(createDraftsApi('http://x', () => 't').update(ID, { caption: 'hi' })).resolves.toMatchObject({ draft_id: ID })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://x/posts/drafts/${ID}`)
    expect(init.method).toBe('PATCH')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"caption":"hi"}')
  })

  it('POST thumbnail upload-url; rejects a malformed id without a request', async () => {
    const data = { upload_url: 'https://s3/put', file_url: `posts/draft-thumbnail/${ID}/a.webp`, expires_in: 3600 }
    const f = mockFetch(201, { status: true, data })
    const api = createDraftsApi('http://x', () => 't')
    await expect(api.thumbnailUploadUrl(ID, 'image/webp')).resolves.toEqual(data)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://x/posts/drafts/${ID}/thumbnail/upload-url`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"mime_type":"image/webp"}')
    await expect(api.update('../x', {})).rejects.toMatchObject({ status: 400 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('cdn url join and still choice', () => {
    expect(cdnUrl('https://c/', '/a/b.jpg')).toBe('https://c/a/b.jpg')
    expect(cdnUrl('https://c', undefined)).toBeUndefined()
    expect(stillUrl('https://c', { main: { default: '/m.m3u8' }, poster: { default: '/p.jpg' } }, 'video')).toBe('https://c/p.jpg')
    expect(stillUrl('https://c', { main: { default: '/m.m3u8' } }, 'video')).toBeUndefined()
    expect(stillUrl('https://c', { main: { default: '/m.jpg' } }, 'image')).toBe('https://c/m.jpg')
  })
})

describe('useDrafts', () => {
  it('latest open() wins; errors surface', async () => {
    const api: DraftsApi = {
      list: vi.fn(async () => ({ cdn: 'c', drafts: [] })),
      get: vi.fn(async (id: string) => {
        if (id === 'slow') await new Promise((r) => setTimeout(r, 20))
        if (id === 'bad') throw new Error('nope')
        return { draft_id: id } as never
      }),
      update: vi.fn(),
      thumbnailUploadUrl: vi.fn(),
    }
    const d = useDrafts(api)
    const a = d.open('slow')
    await d.open('fast')
    await a
    expect(d.state.selected?.draft_id).toBe('fast')
    await d.open('bad')
    expect(d.state.error).toBe('nope')
    d.close()
    expect(d.state.selected).toBeNull()
  })
})
