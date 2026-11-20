import type { DeepReadonly } from 'vue'
import type { Layer, Scene } from '@/features/canvas-editor'
import { cdnUrl } from './api'
import { parseCanvasBase, parseEditorState, safeColor } from './editor'
import { savedScene } from './save'
import type { Draft } from './types'

/** Draft font keys -> a concrete family the editor can name directly. */
const FONT_NAMES: Record<string, string> = {
  handwritten: 'Segoe Print',
  sans: 'system-ui',
  serif: 'Georgia',
  mono: 'ui-monospace',
}

/** Absolute http(s) URLs pass through; relative paths are prefixed with the draft CDN. */
const abs = (cdn: string, src: string) => (/^https?:\/\//i.test(src) ? src : (cdnUrl(cdn, src) ?? ''))

/**
 * Convert a draft into an in-memory (pixel) editor scene. Media srcs become absolute CDN URLs.
 * A scene the editor saved earlier is loaded as is, so nothing the editor supports is lost.
 */
export function draftToScene(draft: DeepReadonly<Draft>): Scene {
  const saved = savedScene(draft)
  if (saved) return saved
  const ed = parseEditorState(draft.editor_state, draft.editor_version)
  const bg = parseCanvasBase(draft.canvas_background)
  const layers: Layer[] = ed.layers.map((l, i) => {
    const base = {
      id: l.id || `layer_${i + 1}`,
      name: l.name || l.id || `Layer ${i + 1}`,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      rotation: l.rotation,
      opacity: l.opacity,
    }
    if (l.type === 'image') return { ...base, type: 'image', props: { src: abs(draft.cdn, l.props.src), fit: l.props.fit } }
    if (l.type === 'element')
      return {
        ...base,
        type: 'element',
        props: { kind: l.props.kind === 'cutout' ? 'cutout' : 'sticker', src: abs(draft.cdn, l.props.src) },
      }
    return {
      ...base,
      type: 'text',
      props: {
        text: l.props.text,
        fontFamily: FONT_NAMES[l.props.fontFamily] ?? l.props.fontFamily,
        fontSize: l.props.fontSize,
        lineHeight: 1.25,
        color: safeColor(l.props.color),
        align: l.props.align,
        verticalAlign: 'middle',
      },
    }
  })
  // Layer ids must be unique in the editor.
  const seen = new Set<string>()
  for (const l of layers) {
    while (seen.has(l.id)) l.id += '_'
    seen.add(l.id)
  }
  return {
    canvas: {
      width: ed.canvas.width,
      height: ed.canvas.height,
      duration: 3000,
      background:
        bg.kind === 'color'
          ? { type: 'solid', color: bg.color }
          : { type: 'image', src: abs(draft.cdn, bg.src), fit: 'cover' },
    },
    layers,
  }
}
