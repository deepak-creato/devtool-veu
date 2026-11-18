import type { LayerAnimation, Scene, TextLayer } from './types'

/** Built-in placeholder media, addressed as `sample:<group>/<name>`. All markup here is static and trusted. */
const svg = (w: number, h: number, inner: string, o: { slice?: boolean; vid?: boolean } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="${o.slice ? 'xMidYMid slice' : 'xMidYMid meet'}"${o.vid ? ' data-vid="1" width="100%" height="100%"' : ''}>${inner}</svg>`
const anim = (a: string, v: string, begin = '0s') =>
  `<animate attributeName="${a}" values="${v}" dur="3s" begin="${begin}" repeatCount="indefinite"/>`
const windows = (x: number, y: number, w: number, h: number) => {
  let s = ''
  for (let r = 0; r < Math.floor(h / 50); r++)
    for (let c = 0; c < Math.floor(w / 40); c++)
      if ((r * 7 + c * 3 + x) % 4) s += `<rect x="${x + 12 + c * 40}" y="${y + 16 + r * 50}" width="18" height="26" fill="#FFD166"/>`
  return s
}

export const SAMPLES = {
  image: {
    sunset: svg(600, 800, '<rect width="600" height="800" fill="#FFB88C"/><circle cx="300" cy="380" r="110" fill="#FFE066"/><path d="M0 520 Q150 420 300 500 T600 480 V800 H0Z" fill="#7B5EA7"/><path d="M0 620 Q200 540 400 620 T600 600 V800 H0Z" fill="#3D2C6B"/>', { slice: true }),
    mountains: svg(600, 800, '<rect width="600" height="800" fill="#BDE0FE"/><circle cx="480" cy="160" r="50" fill="#FFF3B0"/><polygon points="0,600 180,260 360,600" fill="#7A8BA3"/><polygon points="200,600 400,200 600,600" fill="#5A6B86"/><polygon points="400,200 360,290 400,270 440,290" fill="#fff"/><rect y="600" width="600" height="200" fill="#6AA84F"/>', { slice: true }),
    flower: svg(600, 800, '<rect width="600" height="800" fill="#FFE5EC"/><rect x="294" y="400" width="12" height="400" fill="#4C9A5F"/><ellipse cx="350" cy="620" rx="55" ry="20" fill="#4C9A5F"/><g fill="#FF6FA5"><circle cx="300" cy="240" r="62"/><circle cx="369" cy="280" r="62"/><circle cx="369" cy="360" r="62"/><circle cx="300" cy="400" r="62"/><circle cx="231" cy="360" r="62"/><circle cx="231" cy="280" r="62"/></g><circle cx="300" cy="320" r="50" fill="#FFD166"/>', { slice: true }),
    city: svg(
      600,
      800,
      '<rect width="600" height="800" fill="#264653"/><circle cx="460" cy="140" r="50" fill="#F1FAEE"/><rect x="40" y="420" width="120" height="380" fill="#1D3557"/><rect x="170" y="320" width="140" height="480" fill="#2A4D69"/><rect x="320" y="460" width="110" height="340" fill="#1D3557"/><rect x="440" y="380" width="130" height="420" fill="#2A4D69"/>' +
        windows(40, 420, 120, 380) + windows(170, 320, 140, 480) + windows(320, 460, 110, 340) + windows(440, 380, 130, 420),
      { slice: true },
    ),
  },
  video: {
    wave: svg(600, 600, '<rect width="600" height="600" fill="#0077B6"/>' + [0, -1, -2].map((b) => `<circle cx="300" cy="300" r="0" fill="none" stroke="#CAF0F8" stroke-width="14">${anim('r', '0;300', `${b}s`)}${anim('opacity', '1;0', `${b}s`)}</circle>`).join(''), { slice: true, vid: true }),
    pulse: svg(600, 600, `<rect width="600" height="600" fill="#7209B7"/><circle cx="300" cy="300" r="80" fill="#F72585">${anim('r', '80;220;80')}</circle><circle cx="300" cy="300" r="40" fill="#FFB3D9">${anim('r', '40;110;40')}</circle>`, { slice: true, vid: true }),
    spin: svg(600, 600, '<rect width="600" height="600" fill="#FFB703"/><g><rect x="200" y="200" width="200" height="200" fill="#FB5607"/><rect x="250" y="250" width="100" height="100" fill="#fff"/><animateTransform attributeName="transform" type="rotate" values="0 300 300;360 300 300" dur="3s" repeatCount="indefinite"/></g>', { slice: true, vid: true }),
  },
  sticker: {
    star: svg(200, 200, '<polygon points="100,10 125,75 195,75 138,115 160,185 100,142 40,185 62,115 5,75 75,75" fill="#FFD43B" stroke="#F59F00" stroke-width="6" stroke-linejoin="round"/>'),
    heart: svg(200, 200, '<path d="M100 175 C20 120 20 50 70 40 C90 36 100 55 100 55 C100 55 110 36 130 40 C180 50 180 120 100 175Z" fill="#FF4D6D"/>'),
    sparkle: svg(200, 200, '<path d="M100 10 C105 70 130 95 190 100 C130 105 105 130 100 190 C95 130 70 105 10 100 C70 95 95 70 100 10Z" fill="#A5D8FF" stroke="#4DABF7" stroke-width="5" stroke-linejoin="round"/>'),
    smile: svg(200, 200, '<circle cx="100" cy="100" r="85" fill="#FFD43B"/><circle cx="70" cy="80" r="10" fill="#333"/><circle cx="130" cy="80" r="10" fill="#333"/><path d="M60 120 Q100 165 140 120" stroke="#333" stroke-width="10" fill="none" stroke-linecap="round"/>'),
    arrow: svg(200, 200, '<polygon points="20,75 120,75 120,35 185,100 120,165 120,125 20,125" fill="#FF6B6B"/>'),
    bolt: svg(200, 200, '<polygon points="115,10 50,110 95,110 80,190 150,80 105,80" fill="#FFD43B" stroke="#E67700" stroke-width="5" stroke-linejoin="round"/>'),
  },
  cutout: {
    cup: svg(200, 200, '<path d="M50 70 H140 V130 Q140 170 95 170 Q50 170 50 130Z" fill="#C9885A"/><path d="M140 85 Q178 85 178 115 Q178 142 140 142" stroke="#C9885A" stroke-width="12" fill="none"/><ellipse cx="95" cy="70" rx="45" ry="10" fill="#5C3A21"/><path d="M80 50 Q70 35 82 22 M105 50 Q95 35 107 22" stroke="#bbb" stroke-width="6" fill="none" stroke-linecap="round"/>'),
    plant: svg(200, 200, '<path d="M65 130 H135 L125 190 H75Z" fill="#D9774B"/><path d="M100 130 C60 110 50 60 70 30 C100 50 105 90 100 130Z" fill="#2F9E44"/><path d="M100 130 C140 110 150 60 130 30 C100 50 95 90 100 130Z" fill="#51CF66"/><path d="M100 130 C85 100 90 60 100 20 C112 60 115 100 100 130Z" fill="#37B24D"/>'),
    sunglasses: svg(200, 200, '<rect x="20" y="75" width="68" height="50" rx="18" fill="#212529"/><rect x="112" y="75" width="68" height="50" rx="18" fill="#212529"/><path d="M88 90 Q100 80 112 90" stroke="#212529" stroke-width="8" fill="none"/><path d="M30 85 L50 85 M122 85 L142 85" stroke="#868E96" stroke-width="5" stroke-linecap="round"/>'),
  },
} as const satisfies Record<string, Record<string, string>>

export type SampleGroup = keyof typeof SAMPLES

/** Raw SVG markup for a `sample:` src, or undefined. */
export function sampleSvg(src: string): string | undefined {
  if (!src.startsWith('sample:')) return undefined
  const [g, n] = src.slice(7).split('/')
  const group = (SAMPLES as Record<string, Record<string, string>>)[g]
  return group && Object.hasOwn(group, n) ? group[n] : undefined
}

const uriCache = new Map<string, string>()
export function sampleUri(src: string): string | undefined {
  const hit = uriCache.get(src)
  if (hit) return hit
  const s = sampleSvg(src)
  if (!s) return undefined
  const u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)
  uriCache.set(src, u)
  return u
}

/**
 * Resolve a layer src to a loadable URL:
 * `sample:` refs, absolute http(s) URLs, or paths relative to `base` (http(s) only).
 * Anything else (other schemes, protocol-relative, relative without base) gives undefined.
 */
export function resolveSrc(src: string | undefined, base = ''): string | undefined {
  const s = (src ?? '').trim()
  if (!s) return undefined
  if (s.startsWith('sample:')) return sampleUri(s)
  if (/^https?:\/\//i.test(s)) return s
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return undefined
  const b = base.trim()
  if (!/^https?:\/\//i.test(b)) return undefined
  return `${b.replace(/\/+$/, '')}/${s.replace(/^\/+/, '')}`
}

export const LIBRARY: { group: SampleGroup; label: string }[] = [
  { group: 'image', label: 'Images' },
  { group: 'video', label: 'Videos' },
  { group: 'sticker', label: 'Stickers' },
  { group: 'cutout', label: 'Cutouts' },
]

export interface TextPreset {
  name: string
  props: TextLayer['props']
  width: number
  height: number
}
export const TEXT_PRESETS: TextPreset[] = [
  { name: 'Title', width: 780, height: 200, props: { text: 'Big title', fontFamily: 'Poppins', fontSize: 96, fontWeight: 700, color: '#ffffff', align: 'center', shadow: { x: 2, y: 4, blur: 8, color: 'rgba(0,0,0,0.4)' } } },
  { name: 'Subtitle', width: 780, height: 140, props: { text: 'A short subtitle', fontFamily: 'Poppins', fontSize: 56, fontWeight: 500, color: '#ffffff', align: 'center', shadow: { x: 1, y: 2, blur: 6, color: 'rgba(0,0,0,0.35)' } } },
  { name: 'Caption', width: 620, height: 100, props: { text: 'Small caption text', fontFamily: 'Arial', fontSize: 40, fontWeight: 400, color: '#333333', align: 'left' } },
  { name: 'Quote', width: 760, height: 220, props: { text: 'Make it memorable', fontFamily: 'Georgia', fontSize: 64, fontWeight: 700, color: '#3C3489', align: 'center' } },
  { name: 'Neon', width: 700, height: 200, props: { text: 'NEON', fontFamily: 'Courier New', fontSize: 100, fontWeight: 700, color: '#ffffff', align: 'center', shadow: { x: 0, y: 0, blur: 24, color: '#F72585' } } },
]

const fx = (effect: NonNullable<LayerAnimation['in']>['effect'], start: number, duration = 500) => ({ effect, start, duration })
export const ANIM = {
  fade: (): LayerAnimation => ({ in: fx('fade', 0), out: fx('fade', 2500) }),
  slide: (): LayerAnimation => ({ in: fx('slide-up', 200, 600), out: fx('fade', 2500) }),
  zoom: (): LayerAnimation => ({ in: fx('zoom-in', 600), out: fx('fade', 2500) }),
}

/** Starter scene (pixels). */
export const sampleScene = (): Scene => ({
  canvas: {
    width: 1080,
    height: 1920,
    duration: 3000,
    background: { type: 'gradient', angle: 135, stops: [{ offset: 0, color: '#ffd1dc' }, { offset: 1, color: '#c3b1e1' }] },
  },
  layers: [
    { id: 'layer_1', type: 'image', name: 'Sunset', x: 60, y: 240, width: 540, height: 720, rotation: -6, opacity: 1, animation: { in: fx('fade', 0), out: fx('fade', 2500) }, props: { src: 'sample:image/sunset', fit: 'cover', cornerRadius: 24 } },
    { id: 'layer_2', type: 'video', name: 'Wave', x: 480, y: 780, width: 520, height: 520, rotation: 5, opacity: 1, animation: { in: fx('slide-up', 200, 600), out: fx('zoom-out', 2600, 400) }, props: { src: 'sample:video/wave', fit: 'cover', loop: true, muted: true, cornerRadius: 24 } },
    { id: 'layer_3', type: 'element', name: 'Cup cutout', x: 120, y: 1000, width: 360, height: 360, rotation: -10, opacity: 1, animation: { in: fx('slide-up', 900), out: fx('fade', 2600, 400) }, props: { kind: 'cutout', src: 'sample:cutout/cup', outlineColor: '#ffffff', outlineWidth: 10, shadowBlur: 16 } },
    { id: 'layer_4', type: 'element', name: 'Star sticker', x: 700, y: 200, width: 280, height: 280, rotation: 12, opacity: 1, animation: { in: fx('zoom-in', 800), out: fx('fade', 2600, 400) }, props: { kind: 'sticker', src: 'sample:sticker/star', outlineColor: '#ffffff', outlineWidth: 8, shadowBlur: 12 } },
    { id: 'layer_5', type: 'text', name: 'Title', x: 150, y: 1500, width: 780, height: 200, rotation: 0, opacity: 1, animation: { in: fx('zoom-in', 400), out: fx('fade', 2600, 400) }, props: { text: 'Hello World', fontFamily: 'Poppins', fontSize: 96, fontWeight: 700, color: '#ffffff', align: 'center', shadow: { x: 2, y: 4, blur: 8, color: 'rgba(0,0,0,0.4)' } } },
  ],
})
