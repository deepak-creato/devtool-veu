<script setup lang="ts">
import { computed } from 'vue'
import { Check, Crop, MousePointer2, RefreshCw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { EFFECTS, type Layer } from './types'
import type { CanvasEditor } from './useCanvasEditor'

const props = defineProps<{ editor: CanvasEditor }>()
const ed = props.editor

type Field = { path: string; label: string; type: 'number' | 'text' | 'color' | 'select'; options?: readonly string[]; wide?: boolean; group?: string }

const FX = ['none', ...EFFECTS] as const
const FONTS = ['Poppins', 'Georgia', 'Courier New', 'Arial'] as const

function fieldsFor(l: Layer): Field[] {
  const f: Field[] = [
    { path: 'x', label: 'X', type: 'number', group: 'Position & size' },
    { path: 'y', label: 'Y', type: 'number' },
    { path: 'width', label: 'Width', type: 'number' },
    { path: 'height', label: 'Height', type: 'number' },
    { path: 'rotation', label: 'Rotation', type: 'number' },
    { path: 'opacity', label: 'Opacity', type: 'number' },
  ]
  if (l.type === 'image' || l.type === 'video')
    f.push(
      { path: 'props.src', label: 'Source', type: 'text', wide: true, group: 'Content' },
      { path: 'props.fit', label: 'Fit', type: 'select', options: ['cover', 'contain', 'fill'] },
      { path: 'props.cornerRadius', label: 'Corner radius', type: 'number' },
    )
  if (l.type === 'element')
    f.push(
      { path: 'props.kind', label: 'Kind', type: 'select', options: ['sticker', 'cutout'], group: 'Content' },
      { path: 'props.src', label: 'Source', type: 'text', wide: true },
      { path: 'props.outlineWidth', label: 'Outline width', type: 'number' },
      { path: 'props.outlineColor', label: 'Outline color', type: 'color' },
      { path: 'props.shadowBlur', label: 'Shadow blur', type: 'number' },
    )
  if (l.type === 'text')
    f.push(
      { path: 'props.text', label: 'Text', type: 'text', wide: true, group: 'Content' },
      { path: 'props.fontFamily', label: 'Font', type: 'select', options: FONTS },
      { path: 'props.fontSize', label: 'Font size', type: 'number' },
      { path: 'props.color', label: 'Color', type: 'color' },
      { path: 'props.align', label: 'Align', type: 'select', options: ['left', 'center', 'right'] },
      { path: 'props.shadow.blur', label: 'Shadow blur', type: 'number' },
    )
  f.push(
    { path: 'animation.in.effect', label: 'Effect', type: 'select', options: FX, group: 'Animate in' },
    { path: 'animation.in.start', label: 'Start (ms)', type: 'number' },
    { path: 'animation.in.duration', label: 'Duration (ms)', type: 'number' },
    { path: 'animation.out.effect', label: 'Effect', type: 'select', options: FX, group: 'Animate out' },
    { path: 'animation.out.start', label: 'Start (ms)', type: 'number' },
    { path: 'animation.out.duration', label: 'Duration (ms)', type: 'number' },
  )
  return f
}

type Obj = Record<string, unknown>
const getP = (o: unknown, path: string) => path.split('.').reduce<unknown>((a, k) => (a == null ? a : (a as Obj)[k]), o)
function setP(o: Obj, path: string, v: unknown) {
  const k = path.split('.')
  let a = o
  for (const key of k.slice(0, -1)) a = (a[key] ??= {}) as Obj
  a[k[k.length - 1]] = v
}

const l = computed(() => ed.selected.value)
const fields = computed(() => (l.value ? fieldsFor(l.value) : []))
const cropping = computed(() => ed.crop.value?.id === l.value?.id)
const canCrop = computed(() => l.value?.type === 'image' || l.value?.type === 'video')
const hasCrop = computed(() => !!l.value && (l.value.type === 'image' || l.value.type === 'video') && !!l.value.props.crop)

function value(f: Field) {
  const v = getP(l.value, f.path)
  if (f.path.endsWith('.effect')) return (v as string | undefined) ?? 'none'
  if (f.type === 'color') return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'
  return v ?? ''
}
/** Animation timing fields only make sense once an effect is set. */
const disabled = (f: Field) => /^animation\.(in|out)\.(start|duration)$/.test(f.path) && getP(l.value, f.path.replace(/\.\w+$/, '.effect')) == null

function onInput(f: Field, e: Event) {
  const layer = l.value
  if (!layer) return
  const raw = (e.target as HTMLInputElement | HTMLSelectElement).value
  if (f.path.endsWith('.effect')) return ed.setAnimation(layer, f.path.split('.')[1] as 'in' | 'out', raw)
  if (f.type === 'number') {
    const n = parseFloat(raw)
    if (!Number.isFinite(n)) return // ignore partial input like "-" or ""
    setP(layer as unknown as Obj, f.path, f.path === 'opacity' ? Math.min(1, Math.max(0, n)) : n)
  } else setP(layer as unknown as Obj, f.path, raw)
}

const inputCls =
  'border-input bg-background focus-visible:ring-ring/50 h-8 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-50'
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold">{{ l ? `${l.name || l.id} · ${l.type}` : 'Properties' }}</h2>

    <div v-if="!l" class="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
      <MousePointer2 class="size-7" aria-hidden="true" />
      Select a layer on the canvas<br />or add one from Elements.
    </div>

    <template v-else>
      <div v-if="canCrop" class="flex gap-2">
        <template v-if="cropping">
          <Button size="sm" class="flex-1" @click="ed.finishCrop(true)"><Check />Apply</Button>
          <Button size="sm" variant="outline" class="flex-1" @click="ed.finishCrop(false)"><X />Cancel</Button>
        </template>
        <template v-else>
          <Button size="sm" variant="outline" class="flex-1" :disabled="!!ed.crop.value" @click="ed.startCrop(l.id)"><Crop />Crop</Button>
          <Button v-if="hasCrop" size="sm" variant="outline" class="flex-1" :disabled="!!ed.crop.value" @click="ed.resetCrop(l.id)">
            <RefreshCw />Reset crop
          </Button>
        </template>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <template v-for="f in fields" :key="f.path">
          <p v-if="f.group" class="text-muted-foreground col-span-2 mt-2 text-[11px] font-semibold tracking-wide uppercase">{{ f.group }}</p>
          <label :class="['flex flex-col gap-0.5 text-xs', f.wide && 'col-span-2']">
            <span class="text-muted-foreground">{{ f.label }}</span>
            <select v-if="f.type === 'select'" :class="inputCls" :value="value(f)" @change="onInput(f, $event)">
              <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
            </select>
            <input
              v-else
              :class="[inputCls, f.type === 'color' && 'p-0.5']"
              :type="f.type"
              :step="f.path === 'opacity' ? 0.05 : undefined"
              :value="value(f)"
              :disabled="disabled(f)"
              @input="onInput(f, $event)"
            />
          </label>
        </template>
      </div>
    </template>
  </div>
</template>
