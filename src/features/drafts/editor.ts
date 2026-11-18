/** editor_state is a JSON *string*. Layers paint in array order (first = bottom). Coordinates are canvas pixels. */
interface LayerBase {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}
export interface ImageLayer extends LayerBase {
  type: 'image'
  props: { src: string; fit: 'cover' | 'contain' | 'fill' }
}
export interface ElementLayer extends LayerBase {
  type: 'element'
  props: { kind: string; src: string }
}
export interface TextLayer extends LayerBase {
  type: 'text'
  props: { text: string; fontFamily: string; fontSize: number; color: string; align: 'left' | 'center' | 'right' }
}
export type EditorLayer = ImageLayer | ElementLayer | TextLayer

export interface EditorState {
  canvas: { width: number; height: number }
  layers: EditorLayer[]
}

const DEFAULT_CANVAS = { width: 1080, height: 1920 }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)

/** Defensive parse: bad JSON, empty "{}" or unknown layer types never throw; they just yield fewer layers. */
export function parseEditorState(raw: string | null | undefined): EditorState {
  let j: unknown
  try {
    j = raw ? JSON.parse(raw) : null
  } catch {
    j = null
  }
  const out: EditorState = { canvas: { ...DEFAULT_CANVAS }, layers: [] }
  if (!isObj(j)) return out
  if (isObj(j.canvas)) {
    const w = num(j.canvas.width, 0)
    const h = num(j.canvas.height, 0)
    if (w > 0 && h > 0) out.canvas = { width: w, height: h }
  }
  if (!Array.isArray(j.layers)) return out
  for (const l of j.layers) {
    if (!isObj(l) || !isObj(l.props)) continue
    const base = {
      id: str(l.id),
      name: str(l.name),
      x: num(l.x, 0),
      y: num(l.y, 0),
      width: num(l.width, 0),
      height: num(l.height, 0),
      rotation: num(l.rotation, 0),
      opacity: Math.min(1, Math.max(0, num(l.opacity, 1))),
    }
    const p = l.props
    if (l.type === 'image' && str(p.src)) {
      const fit = p.fit === 'contain' || p.fit === 'fill' ? p.fit : 'cover'
      out.layers.push({ ...base, type: 'image', props: { src: str(p.src), fit } })
    } else if (l.type === 'element' && str(p.src)) {
      out.layers.push({ ...base, type: 'element', props: { kind: str(p.kind), src: str(p.src) } })
    } else if (l.type === 'text' && str(p.text)) {
      const align = p.align === 'left' || p.align === 'right' ? p.align : 'center'
      out.layers.push({
        ...base,
        type: 'text',
        props: { text: str(p.text), fontFamily: str(p.fontFamily, 'sans'), fontSize: num(p.fontSize, 32), color: str(p.color, '#000'), align },
      })
    }
  }
  return out
}

const FONTS: Record<string, string> = {
  handwritten: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive",
  sans: 'system-ui, sans-serif',
  serif: 'Georgia, serif',
  mono: 'ui-monospace, monospace',
}
export const fontStack = (family: string) => FONTS[family] ?? `${family}, system-ui, sans-serif`

/** Only accept #rgb/#rrggbb/#rrggbbaa, so a hostile color string never reaches CSS. */
export const safeColor = (c: string, fallback = '#000000') =>
  /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) ? c : fallback

/** Positions as % of the canvas so the layout scales with its container. */
export function layerBox(l: LayerBase, canvas: { width: number; height: number }) {
  return {
    left: `${(l.x / canvas.width) * 100}%`,
    top: `${(l.y / canvas.height) * 100}%`,
    width: `${(l.width / canvas.width) * 100}%`,
    height: `${(l.height / canvas.height) * 100}%`,
    transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
    opacity: String(l.opacity),
  }
}
/** Font size relative to canvas width, via container query units on the canvas element. */
export const fontSizeCq = (px: number, canvas: { width: number }) => `${(px / canvas.width) * 100}cqw`

export type CanvasBase = { kind: 'color'; color: string } | { kind: 'image'; src: string }

/**
 * canvas_background is either a hex colour ("#000000") or an image: a relative CDN path
 * or an absolute http(s) URL. Anything else (empty, other schemes) falls back to black.
 */
export function parseCanvasBase(v: string | null | undefined): CanvasBase {
  const t = (v ?? '').trim()
  if (/^#[0-9a-f]{3,8}$/i.test(t)) return { kind: 'color', color: safeColor(t) }
  if (/^https?:\/\//i.test(t)) return { kind: 'image', src: t }
  if (t && !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith('//')) return { kind: 'image', src: t }
  return { kind: 'color', color: '#000000' }
}
