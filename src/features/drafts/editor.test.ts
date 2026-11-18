import { describe, expect, it } from 'vitest'
import { fontSizeCq, layerBox, parseCanvasBase, parseEditorState, safeColor } from './editor'

const sample = JSON.stringify({
  post_id: 'p',
  canvas: { width: 1080, height: 1920 },
  layers: [
    { id: 'f', name: 'frame', x: 262, y: 359, width: 556, height: 866, rotation: 0, opacity: 1, type: 'element', props: { kind: 'frame', src: 'a/f.png' } },
    { id: 'i', name: 'primary', x: 300, y: 397, width: 480, height: 790, rotation: 0, opacity: 1, type: 'image', props: { src: 'a/i.webp', fit: 'cover' } },
    { id: 's', name: 'sticker', x: 620, y: 1593, width: 130, height: 130, rotation: 10, opacity: 0.5, type: 'element', props: { kind: 'sticker', src: 'a/s.png' } },
    { id: 't', name: 't', x: 48, y: 69, width: 984, height: 242, rotation: 0, opacity: 1, type: 'text', props: { text: 'Hi', fontFamily: 'handwritten', fontSize: 84, color: '#2b2118', align: 'center' } },
    { id: 'x', name: 'unknown', x: 0, y: 0, width: 1, height: 1, type: 'video', props: { src: 'v' } },
  ],
})

describe('parseEditorState', () => {
  it('parses canvas and known layers in order; skips unknown types', () => {
    const s = parseEditorState(sample)
    expect(s.canvas).toEqual({ width: 1080, height: 1920 })
    expect(s.layers.map((l) => l.type)).toEqual(['element', 'image', 'element', 'text'])
    expect(s.layers[2].opacity).toBe(0.5)
  })
  it('handles empty, invalid and missing state', () => {
    for (const raw of ['{}', 'not json', '', null, undefined, '[]', '{"layers":"x"}'])
      expect(parseEditorState(raw as string).layers).toEqual([])
    expect(parseEditorState('{}').canvas).toEqual({ width: 1080, height: 1920 })
  })
  it('clamps opacity and ignores bad canvas', () => {
    const s = parseEditorState(JSON.stringify({ canvas: { width: 0, height: -1 }, layers: [{ id: 'a', type: 'image', opacity: 9, props: { src: 'x' } }] }))
    expect(s.canvas.width).toBe(1080)
    expect(s.layers[0].opacity).toBe(1)
  })
})

describe('parseEditorState version 2', () => {
  const v2 = { canvas: { width: 1000, height: 2000 }, layers: [{ id: 'a', type: 'image', x: 0.1, y: 0.25, width: 0.5, height: 0.5, props: { src: 'x' } }] }
  const box = (s: ReturnType<typeof parseEditorState>) => {
    const { x, y, width, height } = s.layers[0]
    return { x, y, width, height }
  }
  const px = { x: 100, y: 500, width: 500, height: 1000 }
  it('scales fractional geometry when json version is 2', () =>
    expect(box(parseEditorState(JSON.stringify({ ...v2, version: 2 })))).toEqual(px))
  it('scales when draft editor_version is 2', () => expect(box(parseEditorState(JSON.stringify(v2), 2))).toEqual(px))
  it('scales when every layer is within 0..1 and no version given', () =>
    expect(box(parseEditorState(JSON.stringify(v2)))).toEqual(px))
  it('leaves pixel documents alone', () => expect(parseEditorState(sample).layers[1].x).toBe(300))
})

describe('layout helpers', () => {
  it('layerBox gives canvas percentages and rotation', () => {
    const s = parseEditorState(sample)
    const b = layerBox(s.layers[2], s.canvas)
    expect(b.left).toBe(`${(620 / 1080) * 100}%`)
    expect(b.transform).toBe('rotate(10deg)')
    expect(layerBox(s.layers[0], s.canvas).transform).toBeUndefined()
  })
  it('fontSizeCq scales by canvas width', () => expect(fontSizeCq(108, { width: 1080 })).toBe('10cqw'))
  it('safeColor rejects non-hex', () => {
    expect(safeColor('#2b2118')).toBe('#2b2118')
    expect(safeColor('red;background:url(x)')).toBe('#000000')
  })
})

describe('parseCanvasBase', () => {
  it('hex colour, relative path, absolute url, junk', () => {
    expect(parseCanvasBase('#000000')).toEqual({ kind: 'color', color: '#000000' })
    expect(parseCanvasBase('/bg/a.jpg')).toEqual({ kind: 'image', src: '/bg/a.jpg' })
    expect(parseCanvasBase('https://c/x.png')).toEqual({ kind: 'image', src: 'https://c/x.png' })
    for (const j of ['', null, undefined, 'javascript:alert(1)', 'data:text/html,x', '//evil/x.png'])
      expect(parseCanvasBase(j)).toEqual({ kind: 'color', color: '#000000' })
  })
})

describe('draftToScene', () => {
  it('maps layers to editor scene with absolute CDN urls', async () => {
    const { draftToScene } = await import('./toScene')
    const s = draftToScene({ cdn: 'https://cdn/', editor_state: sample, editor_version: 1, canvas_background: 'bg/a.webp' } as never)
    expect(s.canvas).toMatchObject({ width: 1080, height: 1920, background: { type: 'image', src: 'https://cdn/bg/a.webp' } })
    expect(s.layers.map((l) => l.type)).toEqual(['element', 'image', 'element', 'text'])
    expect(s.layers[0]).toMatchObject({ type: 'element', props: { kind: 'sticker', src: 'https://cdn/a/f.png' } })
    expect(s.layers[1]).toMatchObject({ x: 300, props: { src: 'https://cdn/a/i.webp', fit: 'cover' } })
    expect(s.layers[3]).toMatchObject({ props: { fontFamily: 'Segoe Print', color: '#2b2118' } })
  })
})
