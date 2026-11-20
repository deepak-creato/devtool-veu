import { cssColor, fontStack, type Fit, type Layer, type Scene } from '@/features/canvas-editor'

/** Longest side of the rendered thumbnail, in px. */
const MAX_SIDE = 720

export interface RenderedThumbnail {
  blob: Blob
  /** Layers that could not be drawn: videos, and images that failed to load (often CDN CORS). */
  skipped: number
}

type Rect = { x: number; y: number; w: number; h: number }

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Without CORS a cross-origin image would taint the canvas and toBlob would throw.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Source and destination rects that draw `src` into `box` the way CSS object-fit does. */
function fitRects(src: Rect, box: Rect, fit: Fit): [Rect, Rect] {
  if (fit === 'fill') return [src, box]
  const s = fit === 'cover' ? Math.max(box.w / src.w, box.h / src.h) : Math.min(box.w / src.w, box.h / src.h)
  if (fit === 'contain') {
    const w = src.w * s,
      h = src.h * s
    return [src, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }]
  }
  const w = box.w / s,
    h = box.h / s
  return [{ x: src.x + (src.w - w) / 2, y: src.y + (src.h - h) / 2, w, h }, box]
}

/**
 * Draws media like the editor does: the full image is fitted into a frame,
 * the frame is sized and shifted by the crop, and only the box shows.
 */
function drawMedia(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: Rect,
  fit: Fit,
  crop?: { x: number; y: number; w: number; h: number },
) {
  const frame = crop
    ? { x: box.x - (crop.x * box.w) / crop.w, y: box.y - (crop.y * box.h) / crop.h, w: box.w / crop.w, h: box.h / crop.h }
    : box
  const [s, d] = fitRects({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }, frame, fit)
  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.w, box.h)
  ctx.clip()
  ctx.drawImage(img, s.x, s.y, s.w, s.h, d.x, d.y, d.w, d.h)
  ctx.restore()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > width) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

function drawText(ctx: CanvasRenderingContext2D, l: Extract<Layer, { type: 'text' }>) {
  const p = l.props
  const lineHeight = p.fontSize * (p.lineHeight ?? 1.2)
  ctx.font = `${p.fontWeight ?? 700} ${p.fontSize}px ${fontStack(p.fontFamily)}`
  ctx.fillStyle = cssColor(p.color, '#ffffff')
  ctx.textAlign = p.align
  ctx.textBaseline = 'middle'
  if (p.shadow) {
    ctx.shadowOffsetX = p.shadow.x ?? 0
    ctx.shadowOffsetY = p.shadow.y ?? 0
    ctx.shadowBlur = p.shadow.blur ?? 0
    ctx.shadowColor = cssColor(p.shadow.color, 'rgba(0,0,0,.4)')
  }
  const lines = wrap(ctx, p.text, l.width)
  const total = lines.length * lineHeight
  const top = p.verticalAlign === 'top' ? 0 : p.verticalAlign === 'bottom' ? l.height - total : (l.height - total) / 2
  const x = p.align === 'left' ? 0 : p.align === 'right' ? l.width : l.width / 2
  lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * (i + 0.5)))
}

/**
 * Renders the scene at time 0 (no animation) to a WebP thumbnail, or PNG where
 * the browser cannot encode WebP. Video layers are not drawn.
 * @param resolve - Turns a layer src into a loadable URL (the editor's `resolve`)
 */
export async function renderSceneThumbnail(
  scene: Scene,
  resolve: (src: string | undefined) => string | undefined,
): Promise<RenderedThumbnail> {
  const { width: W, height: H, background: bg } = scene.canvas
  const k = Math.min(1, MAX_SIDE / Math.max(W, H))
  const el = document.createElement('canvas')
  el.width = Math.round(W * k)
  el.height = Math.round(H * k)
  const ctx = el.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.scale(k, k)

  const layers = scene.layers.filter((l) => l.visible !== false)
  const srcs = new Set<string>()
  if (bg.type === 'image') srcs.add(bg.src)
  for (const l of layers) if (l.type === 'image' || l.type === 'element') srcs.add(l.props.src)
  const images = new Map<string, HTMLImageElement | null>()
  await Promise.all(
    [...srcs].map(async (src) => {
      const url = resolve(src)
      images.set(src, url ? await loadImage(url) : null)
    }),
  )

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  if (bg.type === 'solid') {
    ctx.fillStyle = cssColor(bg.color, '#ffffff')
    ctx.fillRect(0, 0, W, H)
  } else if (bg.type === 'gradient') {
    // CSS angle: 0deg points up, clockwise.
    const a = (bg.angle * Math.PI) / 180
    const dx = Math.sin(a),
      dy = -Math.cos(a)
    const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2
    const g = ctx.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half)
    for (const s of bg.stops) g.addColorStop(Math.min(1, Math.max(0, s.offset)), cssColor(s.color, '#ffffff'))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  } else {
    const img = images.get(bg.src)
    if (img) drawMedia(ctx, img, { x: 0, y: 0, w: W, h: H }, bg.fit)
  }

  let skipped = 0
  for (const l of layers) {
    const img = l.type === 'image' || l.type === 'element' ? images.get(l.props.src) : undefined
    if (l.type === 'video' || img === null) {
      skipped++
      continue
    }
    ctx.save()
    ctx.globalAlpha = l.opacity
    // Rotate about the layer centre, then draw in layer-local coordinates.
    ctx.translate(l.x + l.width / 2, l.y + l.height / 2)
    ctx.rotate((l.rotation * Math.PI) / 180)
    ctx.translate(-l.width / 2, -l.height / 2)
    const box = { x: 0, y: 0, w: l.width, h: l.height }
    if (l.type === 'text') drawText(ctx, l)
    else if (img) {
      const p = l.props as { flipX?: boolean; flipY?: boolean; cornerRadius?: number }
      if (p.flipX || p.flipY) {
        ctx.translate(p.flipX ? l.width : 0, p.flipY ? l.height : 0)
        ctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1)
      }
      if (p.cornerRadius) {
        ctx.beginPath()
        ctx.roundRect(0, 0, l.width, l.height, p.cornerRadius)
        ctx.clip()
      }
      if (l.type === 'image') drawMedia(ctx, img, box, l.props.fit, l.props.crop)
      else drawMedia(ctx, img, box, 'contain')
    }
    ctx.restore()
  }

  const blob = await new Promise<Blob | null>((resolve) => el.toBlob(resolve, 'image/webp', 0.85))
  if (!blob) throw new Error('Could not encode the thumbnail')
  return { blob, skipped }
}
