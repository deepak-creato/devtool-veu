<script setup lang="ts">
import { computed } from 'vue'
import type { Background } from './types'
import type { CanvasEditor } from './useCanvasEditor'

const props = defineProps<{ editor: CanvasEditor }>()
const ed = props.editor
const bg = computed(() => ed.scene.value.canvas.background)

const hex6 = (c: string | undefined, d: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : d)
const colorA = computed(() =>
  hex6(bg.value.type === 'solid' ? bg.value.color : bg.value.type === 'gradient' ? bg.value.stops[0]?.color : undefined, '#ffd1dc'),
)
const colorB = computed(() => hex6(bg.value.type === 'gradient' ? bg.value.stops.at(-1)?.color : undefined, '#c3b1e1'))
const imageSrc = computed(() => (bg.value.type === 'image' ? bg.value.src : ''))

function update(patch: { type?: Background['type']; a?: string; b?: string; src?: string }) {
  const type = patch.type ?? bg.value.type
  const a = patch.a ?? colorA.value,
    b = patch.b ?? colorB.value
  if (type === 'solid') ed.setBackground({ type: 'solid', color: a })
  else if (type === 'gradient')
    ed.setBackground({
      type: 'gradient',
      angle: bg.value.type === 'gradient' ? bg.value.angle : 135,
      stops: [
        { offset: 0, color: a },
        { offset: 1, color: b },
      ],
    })
  else ed.setBackground({ type: 'image', src: patch.src ?? (imageSrc.value || 'sample:image/mountains'), fit: 'cover' })
}

const val = (e: Event) => (e.target as HTMLInputElement).value
const inputCls = 'border-input bg-background h-8 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
</script>

<template>
  <div class="grid grid-cols-2 gap-2 text-xs">
    <h2 class="col-span-2 text-sm font-semibold">Background</h2>
    <label class="col-span-2 flex flex-col gap-0.5">
      <span class="text-muted-foreground">Type</span>
      <select :class="inputCls" :value="bg.type" @change="update({ type: val($event) as Background['type'] })">
        <option value="solid">Solid</option>
        <option value="gradient">Gradient</option>
        <option value="image">Image</option>
      </select>
    </label>
    <template v-if="bg.type !== 'image'">
      <label class="flex flex-col gap-0.5">
        <span class="text-muted-foreground">Color {{ bg.type === 'gradient' ? 'A' : '' }}</span>
        <input type="color" :class="[inputCls, 'p-0.5']" :value="colorA" @input="update({ a: val($event) })" />
      </label>
      <label v-if="bg.type === 'gradient'" class="flex flex-col gap-0.5">
        <span class="text-muted-foreground">Color B</span>
        <input type="color" :class="[inputCls, 'p-0.5']" :value="colorB" @input="update({ b: val($event) })" />
      </label>
    </template>
    <label v-else class="col-span-2 flex flex-col gap-0.5">
      <span class="text-muted-foreground">Image source</span>
      <input type="text" :class="inputCls" :value="imageSrc" @change="update({ src: val($event) })" />
    </label>
  </div>
</template>
