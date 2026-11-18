import { computed, ref } from 'vue'
import { enterCrop, exitCrop, FULL_CROP } from './geometry'
import { ANIM, resolveSrc, sampleScene, type SampleGroup, type TextPreset } from './samples'
import { parseSceneV2, toSceneV2 } from './scene'
import type { Background, Box, Crop, Layer, LayerAnimation, Scene, SceneV2 } from './types'

export type EditorMode = 'edit' | 'preview'

export interface CropSession {
  id: string
  /** Layer as it was before cropping started; restored on cancel. */
  snapshot: Layer
  /** Full media frame while cropping (canvas px). */
  frame: Box
  rect: Crop
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const hasCrop = (l: Layer): l is Extract<Layer, { type: 'image' | 'video' }> => l.type === 'image' || l.type === 'video'

export function useCanvasEditor(initial: Scene = sampleScene()) {
  const scene = ref<Scene>(clone(initial))
  const selectedId = ref<string | null>(scene.value.layers.at(-1)?.id ?? null)
  const mode = ref<EditorMode>('edit')
  const time = ref(0)
  const playing = ref(false)
  /** Base URL for relative media paths. */
  const base = ref('')
  const crop = ref<CropSession | null>(null)

  const selected = computed(() => scene.value.layers.find((l) => l.id === selectedId.value) ?? null)
  const find = (id: string) => scene.value.layers.find((l) => l.id === id)
  const resolve = (src: string | undefined) => resolveSrc(src, base.value)

  function select(id: string | null) {
    if (crop.value) return
    selectedId.value = id
  }

  function setMode(m: EditorMode) {
    if (m === 'preview' && crop.value) finishCrop(true)
    mode.value = m
    if (m === 'edit') playing.value = false
  }

  function nextId() {
    let n = scene.value.layers.length + 1
    while (scene.value.layers.some((l) => l.id === `layer_${n}`)) n++
    return `layer_${n}`
  }

  /** Add a layer centred on the canvas (staggered so repeats don't stack exactly). */
  function addLayer(l: Omit<Layer, 'id' | 'x' | 'y' | 'rotation' | 'opacity'> & Partial<Pick<Layer, 'rotation' | 'opacity'>>) {
    if (crop.value) finishCrop(true)
    const { width: W, height: H } = scene.value.canvas
    const k = (scene.value.layers.length % 6) * 40
    const layer = {
      rotation: 0,
      opacity: 1,
      ...l,
      id: nextId(),
      x: Math.round((W - l.width) / 2) + k,
      y: Math.round((H - l.height) / 2) + k,
    } as Layer
    scene.value.layers.push(layer)
    selectedId.value = layer.id
    return layer
  }

  function addSample(group: SampleGroup, key: string) {
    const src = `sample:${group}/${key}`
    const name = cap(key)
    if (group === 'image') return addLayer({ type: 'image', name, width: 540, height: 720, animation: ANIM.fade(), props: { src, fit: 'cover', cornerRadius: 24 } })
    if (group === 'video') return addLayer({ type: 'video', name, width: 520, height: 520, animation: ANIM.slide(), props: { src, fit: 'cover', loop: true, muted: true, cornerRadius: 24 } })
    const cutout = group === 'cutout'
    const size = cutout ? 360 : 280
    return addLayer({
      type: 'element',
      name: `${name} ${group}`,
      width: size,
      height: size,
      animation: ANIM.zoom(),
      props: { kind: group, src, outlineColor: '#ffffff', outlineWidth: cutout ? 10 : 8, shadowBlur: cutout ? 16 : 12 },
    })
  }

  function addText(p: TextPreset) {
    return addLayer({ type: 'text', name: p.name, width: p.width, height: p.height, animation: ANIM.zoom(), props: clone(p.props) })
  }

  /** dir +1 = towards the front (later in the array). */
  function moveLayer(id: string, dir: 1 | -1) {
    if (crop.value) return
    const ls = scene.value.layers
    const i = ls.findIndex((l) => l.id === id),
      j = i + dir
    if (i < 0 || j < 0 || j >= ls.length) return
    ;[ls[i], ls[j]] = [ls[j], ls[i]]
  }

  function removeLayer(id: string) {
    if (crop.value) return
    const ls = scene.value.layers
    const i = ls.findIndex((l) => l.id === id)
    if (i < 0) return
    ls.splice(i, 1)
    if (selectedId.value === id) selectedId.value = ls.at(-1)?.id ?? null
  }

  function setAnimation(l: Layer, slot: keyof LayerAnimation, effect: string) {
    if (effect === 'none') {
      if (l.animation) delete l.animation[slot]
      return
    }
    l.animation ??= {}
    const cur = l.animation[slot]
    l.animation[slot] = {
      ...cur,
      effect: effect as NonNullable<LayerAnimation['in']>['effect'],
      start: cur?.start ?? (slot === 'in' ? 0 : Math.max(0, scene.value.canvas.duration - 500)),
      duration: cur?.duration ?? 500,
    }
  }

  function setBackground(b: Background) {
    scene.value.canvas.background = b
  }

  // ---- crop ----
  function startCrop(id: string) {
    const l = find(id)
    if (!l || !hasCrop(l) || crop.value) return
    const frame = enterCrop(l, l.rotation, l.props.crop)
    crop.value = { id, snapshot: clone(l), frame, rect: { ...(l.props.crop ?? FULL_CROP) } }
    Object.assign(l, frame)
    delete l.props.crop
    selectedId.value = id
    mode.value = 'edit'
    playing.value = false
  }

  function finishCrop(apply: boolean) {
    const c = crop.value
    if (!c) return
    crop.value = null
    const i = scene.value.layers.findIndex((l) => l.id === c.id)
    if (i < 0) return
    if (!apply) {
      scene.value.layers[i] = c.snapshot
      return
    }
    const l = scene.value.layers[i]
    if (!hasCrop(l)) return
    // Frame may have moved/rotated since crop started (rotation is read live).
    const { box, crop: cut } = exitCrop({ x: l.x, y: l.y, width: l.width, height: l.height }, l.rotation, c.rect)
    Object.assign(l, box)
    if (cut) l.props.crop = cut
  }

  function resetCrop(id: string) {
    startCrop(id)
    if (crop.value) crop.value.rect = { ...FULL_CROP }
    finishCrop(true)
  }

  // ---- timeline ----
  const duration = computed(() => scene.value.canvas.duration)
  function togglePlay() {
    playing.value = !playing.value
    if (playing.value) setMode('preview')
  }
  function seek(ms: number) {
    playing.value = false
    setMode('preview')
    time.value = Math.min(duration.value, Math.max(0, ms))
  }
  /** Advance playback by dt ms (loops). */
  function tick(dt: number) {
    if (!playing.value) return
    time.value += dt
    if (time.value > duration.value) time.value = 0
  }

  // ---- import / export (version 2 only) ----
  function exportV2(): SceneV2 {
    return toSceneV2(scene.value)
  }
  /** Throws SceneError on invalid input; leaves the current scene untouched in that case. */
  function loadV2(input: unknown) {
    const next = parseSceneV2(input)
    crop.value = null
    scene.value = next
    selectedId.value = next.layers.at(-1)?.id ?? null
    time.value = 0
  }
  function reset() {
    crop.value = null
    scene.value = sampleScene()
    selectedId.value = scene.value.layers.at(-1)?.id ?? null
    time.value = 0
  }

  return {
    scene,
    selectedId,
    selected,
    mode,
    time,
    playing,
    duration,
    base,
    crop,
    find,
    resolve,
    select,
    setMode,
    addLayer,
    addSample,
    addText,
    moveLayer,
    removeLayer,
    setAnimation,
    setBackground,
    startCrop,
    finishCrop,
    resetCrop,
    togglePlay,
    seek,
    tick,
    exportV2,
    loadV2,
    reset,
  }
}

export type CanvasEditor = ReturnType<typeof useCanvasEditor>
