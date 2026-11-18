/**
 * Canvas scene types.
 *
 * In memory the editor works in canvas pixels (`Scene`). The only wire format is
 * version 2 (`SceneV2`): identical shape, but layer x/y/width/height are fractions
 * of the canvas width/height. Version 1 (pixel) documents are rejected.
 */

export const EFFECTS = ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'zoom-out'] as const
export type Effect = (typeof EFFECTS)[number]

export interface AnimPhase {
  effect: Effect
  /** ms from scene start */
  start: number
  /** ms */
  duration: number
  params?: { distance?: number }
}
export interface LayerAnimation {
  in?: AnimPhase
  out?: AnimPhase
}

/** Visible part of the media, as fractions of the full frame. */
export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

export type Fit = 'cover' | 'contain' | 'fill'
export type Align = 'left' | 'center' | 'right'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface LayerBase extends Box {
  id: string
  name: string
  rotation: number
  opacity: number
  visible?: boolean
  animation?: LayerAnimation
}

export interface ImageLayer extends LayerBase {
  type: 'image'
  props: { src: string; fit: Fit; cornerRadius?: number; flipX?: boolean; flipY?: boolean; crop?: Crop }
}
export interface VideoLayer extends LayerBase {
  type: 'video'
  props: {
    src: string
    fit: Fit
    loop?: boolean
    muted?: boolean
    cornerRadius?: number
    flipX?: boolean
    flipY?: boolean
    crop?: Crop
  }
}
export interface ElementLayer extends LayerBase {
  type: 'element'
  props: {
    kind: 'sticker' | 'cutout'
    src: string
    outlineColor?: string
    outlineWidth?: number
    shadowBlur?: number
    flipX?: boolean
    flipY?: boolean
  }
}
export interface TextShadow {
  x: number
  y: number
  blur: number
  color: string
}
export interface TextLayer extends LayerBase {
  type: 'text'
  props: {
    text: string
    fontFamily: string
    fontSize: number
    fontWeight?: number
    lineHeight?: number
    color: string
    align: Align
    verticalAlign?: 'top' | 'middle' | 'bottom'
    shadow?: TextShadow
  }
}
export type Layer = ImageLayer | VideoLayer | ElementLayer | TextLayer
export type LayerType = Layer['type']

export type Background =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; angle: number; stops: { offset: number; color: string }[] }
  | { type: 'image'; src: string; fit: Fit }

export interface Canvas {
  width: number
  height: number
  /** ms */
  duration: number
  background: Background
}

/** In-memory scene: layer geometry in canvas pixels. */
export interface Scene {
  canvas: Canvas
  layers: Layer[]
}

/** Wire format: layer geometry as fractions of the canvas. */
export interface SceneV2 extends Scene {
  version: 2
}
