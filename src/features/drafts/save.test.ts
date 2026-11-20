import { describe, expect, it, vi } from 'vitest'
import type { Scene } from '@/features/canvas-editor'
import { saveDraft, savedScene, sceneToDraftUpdate } from './save'
import type { Draft, DraftsApi } from './types'

const ID = '66666666-6666-4666-8666-666666666666'
const CDN = 'https://cdn.example.com'
const KEY = `posts/draft-thumbnail/${ID}/a1b2c3d4e5.webp`

const scene = (background: Scene['canvas']['background'] = { type: 'solid', color: '#112233' }): Scene => ({
  canvas: { width: 1000, height: 2000, duration: 3000, background },
  layers: [
    {
      id: 'photo',
      name: 'Photo',
      type: 'image',
      x: 100,
      y: 200,
      width: 500,
      height: 1000,
      rotation: 0,
      opacity: 1,
      props: { src: `${CDN}/posts/m1/main.jpg`, fit: 'cover' },
    },
    {
      id: 'star',
      name: 'Star',
      type: 'element',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      props: { kind: 'sticker', src: 'sample:sticker/star' },
    },
  ],
})

const makeApi = () => {
  const api = {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(async () => ({ draft_id: ID }) as Draft),
    thumbnailUploadUrl: vi.fn(async () => ({ upload_url: 'https://s3/put', file_url: KEY, expires_in: 3600 })),
  }
  return api satisfies DraftsApi
}

describe('sceneToDraftUpdate', () => {
  it('stores a version 2 scene with relative CDN paths and the colour background', () => {
    const u = sceneToDraftUpdate(scene(), `${CDN}/`)
    const saved = JSON.parse(u.editor_state!)
    expect(u.editor_version).toBe(2)
    expect(u.canvas_background).toBe('#112233')
    expect(saved.version).toBe(2)
    expect(saved.layers[0]).toMatchObject({ x: 0.1, y: 0.1, width: 0.5, height: 0.5, props: { src: 'posts/m1/main.jpg' } })
    expect(saved.layers[1].props.src).toBe('sample:sticker/star')
  })

  it('sends an image background as a relative path and leaves a gradient out', () => {
    expect(sceneToDraftUpdate(scene({ type: 'image', src: `${CDN}/bg/a.webp`, fit: 'cover' }), CDN).canvas_background).toBe('bg/a.webp')
    const g = sceneToDraftUpdate(scene({ type: 'gradient', angle: 90, stops: [] }), CDN)
    expect(g).not.toHaveProperty('canvas_background')
  })

  it('round-trips through savedScene', () => {
    const u = sceneToDraftUpdate(scene(), CDN)
    const back = savedScene({ cdn: CDN, editor_state: u.editor_state!, editor_version: u.editor_version! })
    expect(back?.layers.map((l) => [l.x, l.y, 'src' in l.props ? l.props.src : ''])).toEqual([
      [100, 200, `${CDN}/posts/m1/main.jpg`],
      [0, 0, 'sample:sticker/star'],
    ])
  })

  it('savedScene ignores other editor versions and bad JSON', () => {
    expect(savedScene({ cdn: CDN, editor_state: '{"version":2}', editor_version: 1 })).toBeUndefined()
    expect(savedScene({ cdn: CDN, editor_state: 'nope', editor_version: 2 })).toBeUndefined()
  })
})

describe('saveDraft', () => {
  it('saves only the scene when there is no thumbnail', async () => {
    const api = makeApi()
    const put = vi.fn()
    await saveDraft(api, { draft_id: ID, cdn: CDN }, scene(), undefined, put)
    expect(api.thumbnailUploadUrl).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(api.update).toHaveBeenCalledWith(ID, expect.not.objectContaining({ thumbnail_key: expect.anything() }))
  })

  it('uploads the thumbnail, then sends its key with the scene', async () => {
    const api = makeApi()
    const put = vi.fn(async () => {})
    const blob = new Blob(['x'], { type: 'image/webp' })
    await saveDraft(api, { draft_id: ID, cdn: CDN }, scene(), blob, put)
    expect(api.thumbnailUploadUrl).toHaveBeenCalledWith(ID, 'image/webp')
    expect(put).toHaveBeenCalledWith('https://s3/put', blob, 'image/webp')
    expect(api.update).toHaveBeenCalledWith(ID, expect.objectContaining({ thumbnail_key: KEY, editor_version: 2 }))
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(api.update.mock.invocationCallOrder[0])
  })

  it('does not save when the upload fails', async () => {
    const api = makeApi()
    const put = vi.fn(async () => {
      throw new Error('403')
    })
    await expect(saveDraft(api, { draft_id: ID, cdn: CDN }, scene(), new Blob(['x'], { type: 'image/png' }), put)).rejects.toThrow('403')
    expect(api.update).not.toHaveBeenCalled()
  })

  it('rejects an unsupported thumbnail type before any request', async () => {
    const api = makeApi()
    await expect(saveDraft(api, { draft_id: ID, cdn: CDN }, scene(), new Blob(['x'], { type: 'image/gif' }))).rejects.toMatchObject({
      status: 400,
    })
    expect(api.thumbnailUploadUrl).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
  })
})
