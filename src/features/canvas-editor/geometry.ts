import { clamp } from './scene'
import type { Box, Crop } from './types'

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
/** Handle id with its position as a fraction of the box. */
export const HANDLES: readonly [Handle, number, number][] = [
  ['nw', 0, 0],
  ['n', 0.5, 0],
  ['ne', 1, 0],
  ['e', 1, 0.5],
  ['se', 1, 1],
  ['s', 0.5, 1],
  ['sw', 0, 1],
  ['w', 0, 0.5],
]
export const isCorner = (h: Handle) => h.length === 2

/** Rotate vector (vx, vy) by `deg` degrees. */
export function rotateVec(vx: number, vy: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a)
  return [vx * c - vy * s, vx * s + vy * c]
}
/** Screen-space delta into the layer's own (unrotated) axes. */
export const toLocal = (dx: number, dy: number, deg: number) => rotateVec(dx, dy, -deg)

/**
 * Resize a rotated box by dragging `handle` by (dx, dy) canvas px.
 * The opposite edge/corner stays fixed; corners keep aspect ratio.
 */
export function resizeBox(start: Box, rotation: number, handle: Handle, dx: number, dy: number, min = 20): Box {
  const [lx, ly] = toLocal(dx, dy, rotation)
  let w = start.width,
    h = start.height
  if (handle.includes('e')) w = start.width + lx
  if (handle.includes('w')) w = start.width - lx
  if (handle.includes('s')) h = start.height + ly
  if (handle.includes('n')) h = start.height - ly
  if (isCorner(handle)) {
    const k = Math.max(min / start.width, min / start.height, (w / start.width + h / start.height) / 2)
    w = start.width * k
    h = start.height * k
  }
  w = Math.max(min, w)
  h = Math.max(min, h)
  // Anchor = the fixed point, relative to the box centre.
  const anchor = (bw: number, bh: number): [number, number] => [
    handle.includes('e') ? -bw / 2 : handle.includes('w') ? bw / 2 : 0,
    handle.includes('s') ? -bh / 2 : handle.includes('n') ? bh / 2 : 0,
  ]
  const [ax, ay] = rotateVec(...anchor(start.width, start.height), rotation)
  const [bx, by] = rotateVec(...anchor(w, h), rotation)
  const cx = start.x + start.width / 2 + ax - bx,
    cy = start.y + start.height / 2 + ay - by
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: Math.round(w), height: Math.round(h) }
}

/** Rotation (deg, in [-180, 180)) that points the top handle from centre to pointer. */
export function angleTo(cx: number, cy: number, px: number, py: number, snap = false): number {
  let d = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90
  if (snap) d = Math.round(d / 15) * 15
  return Math.round((((d + 180) % 360) + 360) % 360 - 180)
}

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }

/** Expand a cropped layer to its full media frame, keeping the visible part in place. */
export function enterCrop(box: Box, rotation: number, c: Crop = FULL_CROP): Box {
  const fw = box.width / c.w,
    fh = box.height / c.h
  const [ox, oy] = rotateVec((0.5 - (c.x + c.w / 2)) * fw, (0.5 - (c.y + c.h / 2)) * fh, rotation)
  const cx = box.x + box.width / 2 + ox,
    cy = box.y + box.height / 2 + oy
  return { x: cx - fw / 2, y: cy - fh / 2, width: fw, height: fh }
}

/** Shrink a full frame to the crop rect. `crop` is undefined when nothing is cut. */
export function exitCrop(frame: Box, rotation: number, r: Crop): { box: Box; crop?: Crop } {
  const [ox, oy] = rotateVec((r.x + r.w / 2 - 0.5) * frame.width, (r.y + r.h / 2 - 0.5) * frame.height, rotation)
  const cx = frame.x + frame.width / 2 + ox,
    cy = frame.y + frame.height / 2 + oy
  const w = Math.round(frame.width * r.w),
    h = Math.round(frame.height * r.h)
  const box = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: w, height: h }
  const q = (v: number) => Math.round(v * 1e4) / 1e4
  return r.w < 0.999 || r.h < 0.999 ? { box, crop: { x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h) } } : { box }
}

/** Move (`'move'`) or resize the crop rect by (fx, fy) frame fractions, kept inside the frame. */
export function dragCrop(start: Crop, handle: Handle | 'move', fx: number, fy: number, min = 0.05): Crop {
  const r = { ...start }
  if (handle === 'move') {
    r.x = clamp(r.x + fx, 0, 1 - r.w)
    r.y = clamp(r.y + fy, 0, 1 - r.h)
    return r
  }
  if (handle.includes('w')) {
    const nx = clamp(r.x + fx, 0, r.x + r.w - min)
    r.w += r.x - nx
    r.x = nx
  }
  if (handle.includes('e')) r.w = clamp(r.w + fx, min, 1 - r.x)
  if (handle.includes('n')) {
    const ny = clamp(r.y + fy, 0, r.y + r.h - min)
    r.h += r.y - ny
    r.y = ny
  }
  if (handle.includes('s')) r.h = clamp(r.h + fy, min, 1 - r.y)
  return r
}
