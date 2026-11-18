import { EFFECTS } from './types'
import type { AnimPhase, Background, Crop, Effect, Fit, Layer, LayerAnimation, Scene, SceneV2, TextShadow } from './types'

export class SceneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SceneError'
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const optBool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)

/** Drop undefined keys so exported JSON stays clean. */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]
  return o
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FN = /^(?:rgb|hsl)a?\([\d.\s,%/+-]+\)$/i
/** Accept hex and rgb()/hsl() only, so a hostile string never reaches CSS. */
export const cssColor = (v: unknown, fallback: string) => {
  const t = typeof v === 'string' ? v.trim() : ''
  return HEX.test(t) || FN.test(t) ? t : fallback
}
/** Letters, digits, spaces and dashes only; always ends with a generic fallback. */
export const fontStack = (family: string) => {
  const clean = family.replace(/[^\w\s-]/g, '').trim()
  return clean ? `"${clean}", system-ui, sans-serif` : 'system-ui, sans-serif'
}

const fit = (v: unknown): Fit => (v === 'contain' || v === 'fill' ? v : 'cover')

function phase(v: unknown): AnimPhase | undefined {
  if (!isObj(v) || !EFFECTS.includes(v.effect as Effect)) return undefined
  const p: AnimPhase = {
    effect: v.effect as Effect,
    start: Math.max(0, num(v.start, 0)),
    duration: Math.max(1, num(v.duration, 500)),
  }
  if (isObj(v.params) && optNum(v.params.distance) !== undefined) p.params = { distance: v.params.distance as number }
  return p
}
function animation(v: unknown): LayerAnimation | undefined {
  if (!isObj(v)) return undefined
  const a = compact({ in: phase(v.in), out: phase(v.out) })
  return a.in || a.out ? a : undefined
}
function crop(v: unknown): Crop | undefined {
  if (!isObj(v)) return undefined
  const x = clamp(num(v.x, 0)),
    y = clamp(num(v.y, 0))
  const w = clamp(num(v.w, 1), 0.01, 1 - x),
    h = clamp(num(v.h, 1), 0.01, 1 - y)
  return w >= 0.999 && h >= 0.999 ? undefined : { x, y, w, h }
}
function shadow(v: unknown): TextShadow | undefined {
  if (!isObj(v)) return undefined
  return { x: num(v.x, 0), y: num(v.y, 0), blur: Math.max(0, num(v.blur, 0)), color: cssColor(v.color, 'rgba(0,0,0,0.4)') }
}

export function parseBackground(v: unknown): Background {
  if (isObj(v)) {
    if (v.type === 'solid') return { type: 'solid', color: cssColor(v.color, '#ffffff') }
    if (v.type === 'gradient') {
      const stops = (Array.isArray(v.stops) ? v.stops : [])
        .filter(isObj)
        .map((s) => ({ offset: clamp(num(s.offset, 0)), color: cssColor(s.color, '#ffffff') }))
      if (stops.length >= 2) return { type: 'gradient', angle: num(v.angle, 0), stops }
      if (stops.length === 1) return { type: 'solid', color: stops[0].color }
    }
    if (v.type === 'image' && str(v.src)) return { type: 'image', src: str(v.src), fit: fit(v.fit) }
  }
  return { type: 'solid', color: '#ffffff' }
}

const LAYER_TYPES = ['image', 'video', 'element', 'text'] as const

function parseLayer(l: unknown, i: number, W: number, H: number): Layer {
  if (!isObj(l)) throw new SceneError(`Layer ${i + 1} must be an object.`)
  const id = str(l.id)
  if (!id) throw new SceneError(`Layer ${i + 1} needs an id.`)
  if (!LAYER_TYPES.includes(l.type as Layer['type']))
    throw new SceneError(`Layer "${id}" has unknown type "${String(l.type)}".`)
  const p = isObj(l.props) ? l.props : {}
  const base = compact({
    id,
    name: str(l.name, id),
    x: num(l.x, 0) * W,
    y: num(l.y, 0) * H,
    width: Math.max(0, num(l.width, 0)) * W,
    height: Math.max(0, num(l.height, 0)) * H,
    rotation: num(l.rotation, 0),
    opacity: clamp(num(l.opacity, 1)),
    visible: optBool(l.visible),
    animation: animation(l.animation),
  })
  const media = {
    src: str(p.src),
    fit: fit(p.fit),
    cornerRadius: optNum(p.cornerRadius),
    flipX: optBool(p.flipX),
    flipY: optBool(p.flipY),
    crop: crop(p.crop),
  }
  switch (l.type as Layer['type']) {
    case 'image':
      return { ...base, type: 'image', props: compact(media) }
    case 'video':
      return { ...base, type: 'video', props: compact({ ...media, loop: optBool(p.loop), muted: optBool(p.muted) }) }
    case 'element':
      return {
        ...base,
        type: 'element',
        props: compact({
          kind: p.kind === 'cutout' ? 'cutout' : 'sticker',
          src: str(p.src),
          outlineColor: p.outlineColor === undefined ? undefined : cssColor(p.outlineColor, '#ffffff'),
          outlineWidth: optNum(p.outlineWidth),
          shadowBlur: optNum(p.shadowBlur),
          flipX: optBool(p.flipX),
          flipY: optBool(p.flipY),
        }),
      }
    case 'text': {
      const va = p.verticalAlign
      return {
        ...base,
        type: 'text',
        props: compact({
          text: str(p.text),
          fontFamily: str(p.fontFamily, 'sans-serif'),
          fontSize: Math.max(1, num(p.fontSize, 48)),
          fontWeight: optNum(p.fontWeight),
          lineHeight: optNum(p.lineHeight),
          color: cssColor(p.color, '#ffffff'),
          align: p.align === 'left' || p.align === 'right' ? p.align : 'center',
          verticalAlign: va === 'top' || va === 'middle' || va === 'bottom' ? va : undefined,
          shadow: shadow(p.shadow),
        }),
      }
    }
  }
}

/**
 * Parse a version 2 scene (JSON string or object) into an in-memory pixel scene.
 * Throws SceneError with a user-facing message on anything it can't use.
 */
export function parseSceneV2(input: unknown): Scene {
  let j = input
  if (typeof input === 'string') {
    try {
      j = JSON.parse(input)
    } catch (e) {
      throw new SceneError(`Invalid JSON: ${(e as Error).message}`)
    }
  }
  if (!isObj(j)) throw new SceneError('Scene must be a JSON object.')
  if (j.version !== 2)
    throw new SceneError(`Unsupported scene version: ${j.version === undefined ? 'missing' : String(j.version)}. Only version 2 is supported.`)
  if (!isObj(j.canvas)) throw new SceneError('Scene needs a "canvas" object.')
  const W = num(j.canvas.width, 0),
    H = num(j.canvas.height, 0)
  if (W <= 0 || H <= 0) throw new SceneError('Canvas width and height must be positive numbers.')
  if (!Array.isArray(j.layers)) throw new SceneError('Scene needs a "layers" array.')
  const layers = j.layers.map((l, i) => parseLayer(l, i, W, H))
  const ids = new Set<string>()
  for (const l of layers) {
    if (ids.has(l.id)) throw new SceneError(`Duplicate layer id "${l.id}".`)
    ids.add(l.id)
  }
  return {
    canvas: { width: W, height: H, duration: Math.max(100, num(j.canvas.duration, 3000)), background: parseBackground(j.canvas.background) },
    layers,
  }
}

const R5 = (v: number) => Math.round(v * 1e5) / 1e5

/** Serialize to the version 2 wire format (geometry as canvas fractions, 5 decimals). */
export function toSceneV2(scene: Scene): SceneV2 {
  const s: Scene = JSON.parse(JSON.stringify(scene))
  const { width: W, height: H } = s.canvas
  return {
    version: 2,
    canvas: s.canvas,
    layers: s.layers.map((l) => ({ ...l, x: R5(l.x / W), y: R5(l.y / H), width: R5(l.width / W), height: R5(l.height / H) })),
  }
}

export interface AnimState {
  tx: number
  ty: number
  scale: number
  opacity: number
  visible: boolean
}

/** Transform/opacity offsets for a layer at `time` ms. */
export function animState(l: Pick<Layer, 'animation'>, time: number): AnimState {
  const st: AnimState = { tx: 0, ty: 0, scale: 1, opacity: 1, visible: true }
  const a = l.animation ?? {}
  // k: 0 = at rest, 1 = fully "away". sgn: +1 entering, -1 leaving.
  const run = (an: AnimPhase, k: number, sgn: number) => {
    const d = an.params?.distance ?? 120
    switch (an.effect) {
      case 'fade':
        st.opacity *= 1 - k
        break
      case 'slide-up':
        st.ty += sgn * d * k
        break
      case 'slide-down':
        st.ty -= sgn * d * k
        break
      case 'slide-left':
        st.tx += sgn * d * k
        break
      case 'slide-right':
        st.tx -= sgn * d * k
        break
      case 'zoom-in':
        st.scale *= 1 - 0.5 * k * sgn
        st.opacity *= 1 - k
        break
      case 'zoom-out':
        st.scale *= 1 + 0.5 * k * sgn
        st.opacity *= 1 - k
        break
    }
  }
  if (a.in) {
    if (time < a.in.start) st.visible = false
    else run(a.in, 1 - easeOut(clamp((time - a.in.start) / a.in.duration)), 1)
  }
  if (a.out && time >= a.out.start) {
    const p = clamp((time - a.out.start) / a.out.duration)
    if (p >= 1) st.visible = false
    else run(a.out, easeOut(p), -1)
  }
  return st
}

/** CSS background for solid/gradient; image backgrounds are drawn as an <img> instead. */
export function backgroundCss(b: Background): string {
  if (b.type === 'solid') return cssColor(b.color, '#ffffff')
  if (b.type === 'gradient')
    return `linear-gradient(${num(b.angle, 0)}deg, ${b.stops
      .map((s) => `${cssColor(s.color, '#ffffff')} ${Math.round(clamp(s.offset) * 100)}%`)
      .join(', ')})`
  return '#dddddd'
}
