<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue'
import { useEventListener } from '@vueuse/core'
import { RotateCw } from '@lucide/vue'
import LayerContent from './LayerContent.vue'
import { angleTo, dragCrop, HANDLES, isCorner, resizeBox, toLocal, type Handle } from './geometry'
import { animState, backgroundCss } from './scene'
import type { Box, Crop, Layer } from './types'
import type { CanvasEditor } from './useCanvasEditor'

const props = defineProps<{
  editor: CanvasEditor
  /** Screen px per canvas px. */
  scale: number
}>()

const ed = props.editor
const S = computed(() => props.scale)
const canvas = computed(() => ed.scene.value.canvas)
const editing = computed(() => ed.mode.value === 'edit')
const layers = computed(() => ed.scene.value.layers.filter((l) => l.visible !== false))
const bg = computed(() => canvas.value.background)
const bgImage = computed(() => (bg.value.type === 'image' ? ed.resolve(bg.value.src) : undefined))
const ACCENT = '#378ADD'

function layerStyle(l: Layer): CSSProperties {
  const base = {
    left: `${l.x}px`,
    top: `${l.y}px`,
    width: `${l.width}px`,
    height: `${l.height}px`,
  }
  if (editing.value) {
    const cropping = ed.crop.value?.id === l.id
    return {
      ...base,
      transform: `rotate(${l.rotation}deg)`,
      opacity: String(l.opacity),
      cursor: cropping ? 'default' : 'move',
      outline: l.id === ed.selectedId.value ? `${3 / S.value}px solid ${ACCENT}` : undefined,
    }
  }
  const a = animState(l, ed.time.value)
  return {
    ...base,
    visibility: a.visible ? 'visible' : 'hidden',
    transform: `translate(${a.tx}px, ${a.ty}px) rotate(${l.rotation}deg) scale(${a.scale})`,
    opacity: String(l.opacity * a.opacity),
  }
}

/** Selection handles: only in edit mode, not while cropping. */
const handlesFor = computed(() => (editing.value && !ed.crop.value ? ed.selected.value : null))
const handleSize = (h: Handle) => (isCorner(h) ? 14 : 12) / S.value

// ---- pointer interactions ----
type Drag =
  | { kind: 'move'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'resize'; id: string; handle: Handle; sx: number; sy: number; box: Box; rotation: number }
  | { kind: 'rotate'; id: string }
  | { kind: 'crop'; handle: Handle | 'move'; sx: number; sy: number; rect: Crop }
const drag = ref<Drag | null>(null)
const stageEl = ref<HTMLElement | null>(null)

function onLayerDown(l: Layer, e: PointerEvent) {
  if (!editing.value || ed.crop.value) return
  e.preventDefault()
  ed.select(l.id)
  drag.value = { kind: 'move', id: l.id, sx: e.clientX, sy: e.clientY, ox: l.x, oy: l.y }
}
function onResizeDown(l: Layer, handle: Handle, e: PointerEvent) {
  drag.value = {
    kind: 'resize',
    id: l.id,
    handle,
    sx: e.clientX,
    sy: e.clientY,
    box: { x: l.x, y: l.y, width: l.width, height: l.height },
    rotation: l.rotation,
  }
}
function onRotateDown(l: Layer) {
  drag.value = { kind: 'rotate', id: l.id }
}
function onCropDown(e: PointerEvent) {
  const c = ed.crop.value
  if (!c) return
  const h = (e.target as HTMLElement).dataset.h as Handle | undefined
  drag.value = { kind: 'crop', handle: h ?? 'move', sx: e.clientX, sy: e.clientY, rect: { ...c.rect } }
}
function onDblClick(l: Layer) {
  if (editing.value && !ed.crop.value && (l.type === 'image' || l.type === 'video')) ed.startCrop(l.id)
}
function onBackgroundDown(e: PointerEvent) {
  if (editing.value && e.target === e.currentTarget) ed.select(null)
}

useEventListener(window, 'pointermove', (e: PointerEvent) => {
  const d = drag.value
  if (!d) return
  const s = S.value
  if (d.kind === 'crop') {
    const c = ed.crop.value,
      l = c && ed.find(c.id)
    if (!c || !l) return
    const [lx, ly] = toLocal((e.clientX - d.sx) / s, (e.clientY - d.sy) / s, l.rotation)
    c.rect = dragCrop(d.rect, d.handle, lx / l.width, ly / l.height)
    return
  }
  const l = ed.find(d.id)
  if (!l) return
  if (d.kind === 'move') {
    l.x = Math.round(d.ox + (e.clientX - d.sx) / s)
    l.y = Math.round(d.oy + (e.clientY - d.sy) / s)
  } else if (d.kind === 'resize') {
    Object.assign(l, resizeBox(d.box, d.rotation, d.handle, (e.clientX - d.sx) / s, (e.clientY - d.sy) / s))
  } else if (stageEl.value) {
    const b = stageEl.value.getBoundingClientRect()
    l.rotation = angleTo(b.left + (l.x + l.width / 2) * s, b.top + (l.y + l.height / 2) * s, e.clientX, e.clientY, e.shiftKey)
  }
})
useEventListener(window, 'pointerup', () => (drag.value = null))
useEventListener(window, 'pointercancel', () => (drag.value = null))
</script>

<template>
  <div
    ref="stageEl"
    class="relative touch-none overflow-hidden rounded bg-white shadow-xl ring-1 ring-black/10 select-none"
    :style="{ width: `${canvas.width * S}px`, height: `${canvas.height * S}px` }"
  >
    <div
      class="absolute top-0 left-0 origin-top-left overflow-hidden"
      :style="{ width: `${canvas.width}px`, height: `${canvas.height}px`, transform: `scale(${S})`, background: backgroundCss(bg) }"
      @pointerdown="onBackgroundDown"
    >
      <img
        v-if="bgImage"
        :src="bgImage"
        alt=""
        draggable="false"
        class="pointer-events-none absolute inset-0 size-full"
        :style="{ objectFit: bg.type === 'image' ? bg.fit : 'cover' }"
      />

      <div
        v-for="l in layers"
        :key="l.id"
        class="absolute box-border"
        :style="layerStyle(l)"
        @pointerdown="onLayerDown(l, $event)"
        @dblclick="onDblClick(l)"
      >
        <LayerContent :layer="l" :resolve="ed.resolve" :time="ed.time.value" :still="editing" />

        <!-- crop rect over the full media frame -->
        <div
          v-if="editing && ed.crop.value?.id === l.id"
          data-h="move"
          class="absolute box-border cursor-move"
          :style="{
            left: `${ed.crop.value.rect.x * 100}%`,
            top: `${ed.crop.value.rect.y * 100}%`,
            width: `${ed.crop.value.rect.w * 100}%`,
            height: `${ed.crop.value.rect.h * 100}%`,
            boxShadow: '0 0 0 99999px rgba(0,0,0,.55)',
            outline: `${2 / S}px solid #fff`,
            background:
              'linear-gradient(#fff6 1px, transparent 1px) 0 33.3% / 100% 33.3%, linear-gradient(90deg, #fff6 1px, transparent 1px) 33.3% 0 / 33.3% 100%',
          }"
          @pointerdown.prevent.stop="onCropDown"
        >
          <div
            v-for="[h, fx, fy] in HANDLES"
            :key="h"
            :data-h="h"
            class="absolute box-border rounded-full bg-white"
            :style="{
              left: `${fx * 100}%`,
              top: `${fy * 100}%`,
              width: `${16 / S}px`,
              height: `${16 / S}px`,
              margin: `${-8 / S}px 0 0 ${-8 / S}px`,
              border: `${2 / S}px solid ${ACCENT}`,
              cursor: `${h}-resize`,
            }"
          />
        </div>
      </div>

      <!-- resize / rotate handles for the selected layer -->
      <div
        v-if="handlesFor"
        class="pointer-events-none absolute"
        :style="{
          left: `${handlesFor.x}px`,
          top: `${handlesFor.y}px`,
          width: `${handlesFor.width}px`,
          height: `${handlesFor.height}px`,
          transform: `rotate(${handlesFor.rotation}deg)`,
        }"
      >
        <div
          v-for="[h, fx, fy] in HANDLES"
          :key="h"
          role="presentation"
          class="pointer-events-auto absolute box-border bg-white"
          :style="{
            left: `${fx * 100}%`,
            top: `${fy * 100}%`,
            width: `${handleSize(h)}px`,
            height: `${handleSize(h)}px`,
            margin: `${-handleSize(h) / 2}px 0 0 ${-handleSize(h) / 2}px`,
            border: `${2 / S}px solid ${ACCENT}`,
            borderRadius: isCorner(h) ? '50%' : `${2 / S}px`,
            cursor: `${h}-resize`,
          }"
          @pointerdown.prevent.stop="onResizeDown(handlesFor, h, $event)"
        />
        <div
          class="absolute left-1/2"
          :style="{ top: `${-30 / S}px`, width: `${2 / S}px`, height: `${30 / S}px`, marginLeft: `${-1 / S}px`, background: ACCENT }"
        />
        <div
          title="Rotate (Shift snaps to 15°)"
          class="pointer-events-auto absolute left-1/2 box-border flex cursor-grab items-center justify-center rounded-full bg-white"
          :style="{
            top: `${-30 / S}px`,
            width: `${18 / S}px`,
            height: `${18 / S}px`,
            margin: `${-9 / S}px 0 0 ${-9 / S}px`,
            border: `${2 / S}px solid ${ACCENT}`,
            color: ACCENT,
          }"
          @pointerdown.prevent.stop="onRotateDown(handlesFor)"
        >
          <RotateCw :size="10 / S" aria-hidden="true" />
        </div>
      </div>
    </div>
  </div>
</template>
