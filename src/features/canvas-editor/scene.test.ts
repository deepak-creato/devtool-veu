import { describe, expect, it } from 'vitest'
import { angleTo, dragCrop, enterCrop, exitCrop, resizeBox } from './geometry'
import { resolveSrc, sampleScene } from './samples'
import { animState, backgroundCss, cssColor, fontStack, parseSceneV2, SceneError, toSceneV2 } from './scene'
import { useCanvasEditor } from './useCanvasEditor'

const v2 = (over: Record<string, unknown> = {}) => ({
  version: 2,
  canvas: { width: 1000, height: 2000, duration: 3000, background: { type: 'solid', color: '#ffffff' } },
  layers: [{ id: 'a', type: 'image', name: 'A', x: 0.1, y: 0.25, width: 0.5, height: 0.5, rotation: 0, opacity: 1, props: { src: 'sample:image/sunset', fit: 'cover' } }],
  ...over,
})

describe('parseSceneV2', () => {
  it('converts fractions to canvas pixels', () => {
    const s = parseSceneV2(v2())
    expect(s.layers[0]).toMatchObject({ x: 100, y: 500, width: 500, height: 1000 })
  })
  it('accepts a JSON string', () => expect(parseSceneV2(JSON.stringify(v2())).layers).toHaveLength(1))
  it('rejects version 1 and missing version', () => {
    expect(() => parseSceneV2(v2({ version: 1 }))).toThrow(/Only version 2/)
    const { version: _v, ...noVersion } = v2()
    expect(() => parseSceneV2(noVersion)).toThrow(/missing/)
  })
  it('rejects bad input with readable errors', () => {
    expect(() => parseSceneV2('nope')).toThrow(SceneError)
    expect(() => parseSceneV2(v2({ canvas: { width: 0, height: 10 } }))).toThrow(/positive/)
    expect(() => parseSceneV2(v2({ layers: 'x' }))).toThrow(/layers/)
    expect(() => parseSceneV2(v2({ layers: [{ type: 'text' }] }))).toThrow(/needs an id/)
    expect(() => parseSceneV2(v2({ layers: [{ id: 'z', type: 'shape' }] }))).toThrow(/unknown type/)
    expect(() => parseSceneV2(v2({ layers: [{ id: 'a', type: 'text' }, { id: 'a', type: 'text' }] }))).toThrow(/Duplicate/)
  })
  it('sanitizes colors, opacity, crop and animation', () => {
    const s = parseSceneV2(
      v2({
        canvas: { width: 100, height: 100, background: { type: 'gradient', stops: [{ offset: 2, color: 'red;x:y' }, { offset: 0, color: '#000' }] } },
        layers: [
          { id: 't', type: 'text', opacity: 5, props: { text: 'hi', color: 'url(x)' }, animation: { in: { effect: 'explode' }, out: { effect: 'fade', start: -5 } } },
          { id: 'i', type: 'image', props: { src: 'x', crop: { x: 0, y: 0, w: 1, h: 1 } } },
        ],
      }),
    )
    const [t, i] = s.layers
    expect(t.opacity).toBe(1)
    expect(t.type === 'text' && t.props.color).toBe('#ffffff')
    expect(t.animation).toEqual({ out: { effect: 'fade', start: 0, duration: 500 } })
    expect(i.type === 'image' && i.props.crop).toBeUndefined()
    expect(s.canvas.background).toEqual({ type: 'gradient', angle: 0, stops: [{ offset: 1, color: '#ffffff' }, { offset: 0, color: '#000' }] })
  })
})

describe('toSceneV2', () => {
  it('round-trips the sample scene', () => {
    const out = toSceneV2(sampleScene())
    expect(out.version).toBe(2)
    for (const l of out.layers) for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(l[k])).toBeLessThanOrEqual(1.5)
    const back = parseSceneV2(JSON.parse(JSON.stringify(out)))
    expect(back.layers.map((l) => [l.x, l.y, l.width, l.height].map(Math.round))).toEqual(
      sampleScene().layers.map((l) => [l.x, l.y, l.width, l.height]),
    )
  })
})

describe('animState', () => {
  const l = { animation: { in: { effect: 'slide-up' as const, start: 100, duration: 200 }, out: { effect: 'fade' as const, start: 1000, duration: 200 } } }
  it('hidden before in, offset during in, rest after, fading during out, hidden after out', () => {
    expect(animState(l, 50).visible).toBe(false)
    expect(animState(l, 100).ty).toBeCloseTo(120)
    expect(animState(l, 500)).toEqual({ tx: 0, ty: 0, scale: 1, opacity: 1, visible: true })
    const o = animState(l, 1100).opacity
    expect(o).toBeGreaterThan(0)
    expect(o).toBeLessThan(1)
    expect(animState(l, 1200).visible).toBe(false)
  })
})

describe('css safety', () => {
  it('cssColor accepts hex/rgb/hsl only', () => {
    expect(cssColor('rgba(0,0,0,0.4)', 'x')).toBe('rgba(0,0,0,0.4)')
    expect(cssColor('#abc', 'x')).toBe('#abc')
    expect(cssColor('red;background:url(x)', 'x')).toBe('x')
  })
  it('fontStack strips quotes and punctuation', () => expect(fontStack('Poppins"; x:1')).toBe('"Poppins x1", system-ui, sans-serif'))
  it('backgroundCss builds gradients', () =>
    expect(backgroundCss({ type: 'gradient', angle: 90, stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] })).toBe(
      'linear-gradient(90deg, #000 0%, #fff 100%)',
    ))
})

describe('resolveSrc', () => {
  it('handles samples, absolute, relative and unsafe sources', () => {
    expect(resolveSrc('sample:sticker/star')).toMatch(/^data:image\/svg\+xml/)
    expect(resolveSrc('sample:sticker/nope')).toBeUndefined()
    expect(resolveSrc('https://c/x.png')).toBe('https://c/x.png')
    expect(resolveSrc('a/b.png')).toBeUndefined()
    expect(resolveSrc('/a/b.png', 'https://cdn.x/')).toBe('https://cdn.x/a/b.png')
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil/x.png']) expect(resolveSrc(bad, 'https://cdn.x')).toBeUndefined()
    expect(resolveSrc('a.png', 'javascript:')).toBeUndefined()
  })
})

describe('geometry', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 }
  it('resize east keeps west edge', () => expect(resizeBox(box, 0, 'e', 50, 999)).toEqual({ x: 100, y: 100, width: 250, height: 100 }))
  it('resize corner keeps aspect and enforces minimum', () => {
    const r = resizeBox(box, 0, 'se', 200, 100)
    expect(r.width / r.height).toBeCloseTo(2)
    expect(resizeBox(box, 0, 'w', 1000, 0).width).toBe(20)
  })
  it('resize on a rotated box uses local axes', () => {
    // Rotated 90°: dragging the east handle down (screen +y) widens the box.
    expect(resizeBox(box, 90, 'e', 0, 40).width).toBe(240)
  })
  it('angleTo points up at 0 and snaps', () => {
    expect(angleTo(0, 0, 0, -10)).toBe(0)
    expect(angleTo(0, 0, 10, 0)).toBe(90)
    expect(angleTo(0, 0, 10, 1, true)).toBe(90)
  })
  it('enterCrop/exitCrop round-trip, including rotation', () => {
    const crop = { x: 0.2, y: 0.1, w: 0.5, h: 0.6 }
    for (const rot of [0, 33]) {
      const frame = enterCrop(box, rot, crop)
      const out = exitCrop(frame, rot, crop)
      expect(out.box).toEqual(box)
      expect(out.crop).toEqual(crop)
    }
    expect(exitCrop(box, 0, { x: 0, y: 0, w: 1, h: 1 }).crop).toBeUndefined()
  })
  it('dragCrop stays inside the frame', () => {
    expect(dragCrop({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 'move', 1, 1)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
    expect(dragCrop({ x: 0, y: 0, w: 1, h: 1 }, 'nw', 0.2, 0.3)).toEqual({ x: 0.2, y: 0.3, w: 0.8, h: 0.7 })
    expect(dragCrop({ x: 0, y: 0, w: 1, h: 1 }, 'e', -2, 0).w).toBe(0.05)
  })
})

describe('useCanvasEditor', () => {
  it('adds, reorders and removes layers', () => {
    const ed = useCanvasEditor()
    const n = ed.scene.value.layers.length
    const l = ed.addSample('sticker', 'heart')
    expect(ed.scene.value.layers).toHaveLength(n + 1)
    expect(ed.selectedId.value).toBe(l.id)
    ed.moveLayer(l.id, -1)
    expect(ed.scene.value.layers[n - 1].id).toBe(l.id)
    ed.removeLayer(l.id)
    expect(ed.scene.value.layers.find((x) => x.id === l.id)).toBeUndefined()
  })
  it('crop cancel restores, apply writes props.crop', () => {
    const ed = useCanvasEditor()
    const before = JSON.parse(JSON.stringify(ed.find('layer_1')))
    ed.startCrop('layer_1')
    ed.crop.value!.rect = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }
    ed.finishCrop(false)
    expect(ed.find('layer_1')).toEqual(before)
    ed.startCrop('layer_1')
    ed.crop.value!.rect = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }
    ed.finishCrop(true)
    const l = ed.find('layer_1')!
    expect(l.type === 'image' && l.props.crop).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })
    expect(l.width).toBe(270)
    ed.resetCrop('layer_1')
    expect(l.type === 'image' && l.props.crop).toBeUndefined()
    expect(ed.find('layer_1')!.width).toBe(before.width)
  })
  it('loadV2 keeps the current scene on error and replaces it on success', () => {
    const ed = useCanvasEditor()
    const prev = ed.scene.value
    expect(() => ed.loadV2({ version: 1, canvas: {}, layers: [] })).toThrow()
    expect(ed.scene.value).toBe(prev)
    ed.loadV2(v2())
    expect(ed.scene.value.layers.map((l) => l.id)).toEqual(['a'])
    expect(ed.exportV2().layers[0]).toMatchObject({ x: 0.1, y: 0.25, width: 0.5, height: 0.5 })
  })
  it('animation effect none removes the phase; setting one fills defaults', () => {
    const ed = useCanvasEditor()
    const l = ed.find('layer_5')!
    ed.setAnimation(l, 'in', 'none')
    expect(l.animation?.in).toBeUndefined()
    ed.setAnimation(l, 'in', 'fade')
    expect(l.animation?.in).toEqual({ effect: 'fade', start: 0, duration: 500 })
  })
})
