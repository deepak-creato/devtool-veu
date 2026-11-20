<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { Code, Eye, LayoutGrid, Layers, Palette, Pause, Pencil, Play } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import BackgroundPanel from './BackgroundPanel.vue'
import ElementsLibrary from './ElementsLibrary.vue'
import LayersList from './LayersList.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import SceneJsonDialog from './SceneJsonDialog.vue'
import SceneStage from './SceneStage.vue'
import type { Scene } from './types'
import { useCanvasEditor } from './useCanvasEditor'

const props = defineProps<{ initial?: Scene }>()
const ed = useCanvasEditor(props.initial)
defineExpose({ editor: ed })

const tab = ref<'elements' | 'layers' | 'background'>('elements')
const TABS = [
  { id: 'elements', label: 'Elements', icon: LayoutGrid },
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'background', label: 'Background', icon: Palette },
] as const

// Fit the canvas into the middle area.
const mid = ref<HTMLElement | null>(null)
const box = ref({ w: 0, h: 0 })
useResizeObserver(mid, ([e]) => (box.value = { w: e.contentRect.width, h: e.contentRect.height }))
const scale = computed(() => {
  const c = ed.scene.value.canvas
  return Math.max(0.05, Math.min((box.value.w - 64) / c.width, (box.value.h - 64) / c.height))
})

// Playback loop.
let raf = 0,
  last = 0
function loop(now: number) {
  ed.tick(now - last)
  last = now
  raf = requestAnimationFrame(loop)
}
onMounted(() => {
  last = performance.now()
  raf = requestAnimationFrame(loop)
})
onUnmounted(() => cancelAnimationFrame(raf))

const json = ref<InstanceType<typeof SceneJsonDialog> | null>(null)

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.closest('dialog[open]'))) return
  if (ed.crop.value) {
    if (e.key === 'Enter') ed.finishCrop(true)
    if (e.key === 'Escape') ed.finishCrop(false)
    return
  }
  const l = ed.selected.value
  if (!l || ed.mode.value !== 'edit') return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    ed.removeLayer(l.id)
    e.preventDefault()
    return
  }
  const st = e.shiftKey ? 10 : 1
  const mv = ({ ArrowLeft: ['x', -st], ArrowRight: ['x', st], ArrowUp: ['y', -st], ArrowDown: ['y', st] } as const)[
    e.key as 'ArrowLeft'
  ]
  if (mv) {
    l[mv[0]] += mv[1]
    e.preventDefault()
  }
})
</script>

<template>
  <div
    class="bg-muted/40 text-foreground grid h-full min-h-[560px] grid-cols-[220px_minmax(0,1fr)_220px] grid-rows-[52px_minmax(0,1fr)_56px] overflow-hidden rounded-xl border text-sm lg:grid-cols-[280px_minmax(0,1fr)_280px]"
  >
    <!-- top bar -->
    <header class="bg-background col-span-3 flex items-center gap-3 border-b px-4">
      <span class="font-semibold">Canvas editor</span>
      <span class="text-muted-foreground text-xs">v2</span>
      <div class="flex-1" />
      <div class="flex overflow-hidden rounded-lg border" role="group" aria-label="Mode">
        <Button
          size="sm"
          :variant="ed.mode.value === 'edit' ? 'secondary' : 'ghost'"
          class="rounded-none"
          :aria-pressed="ed.mode.value === 'edit'"
          @click="ed.setMode('edit')"
        >
          <Pencil />Edit
        </Button>
        <Button
          size="sm"
          :variant="ed.mode.value === 'preview' ? 'secondary' : 'ghost'"
          class="rounded-none"
          :aria-pressed="ed.mode.value === 'preview'"
          @click="ed.setMode('preview')"
        >
          <Eye />Preview
        </Button>
      </div>
      <div class="flex-1" />
      <slot name="actions" :editor="ed" />
      <Button size="sm" variant="outline" @click="json?.open()"><Code />JSON</Button>
    </header>

    <!-- left: library / layers / background -->
    <aside class="bg-background flex min-h-0 flex-col border-r">
      <div class="flex border-b" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :class="[
            'flex h-12 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 text-[11px] transition',
            tab === t.id ? 'border-primary text-foreground' : 'text-muted-foreground border-transparent',
          ]"
          @click="tab = t.id"
        >
          <component :is="t.icon" class="size-4" aria-hidden="true" />{{ t.label }}
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto p-3" role="tabpanel">
        <ElementsLibrary v-if="tab === 'elements'" :editor="ed" />
        <LayersList v-else-if="tab === 'layers'" :editor="ed" />
        <BackgroundPanel v-else :editor="ed" />
      </div>
    </aside>

    <!-- stage -->
    <main
      ref="mid"
      class="relative flex min-h-0 min-w-0 items-center justify-center bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[20px_20px]"
    >
      <SceneStage :editor="ed" :scale="scale" />
      <p
        v-if="ed.crop.value"
        class="bg-background/90 absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border px-3 py-1 text-xs shadow"
      >
        Drag to crop · Enter applies · Esc cancels
      </p>
    </main>

    <!-- right: properties -->
    <aside class="bg-background min-h-0 overflow-auto border-l p-3">
      <PropertiesPanel :editor="ed" />
    </aside>

    <!-- timeline -->
    <footer class="bg-background col-span-3 flex items-center gap-3 border-t px-4">
      <Button size="icon-sm" variant="outline" :aria-label="ed.playing.value ? 'Pause' : 'Play'" @click="ed.togglePlay()">
        <Pause v-if="ed.playing.value" /><Play v-else />
      </Button>
      <input
        type="range"
        min="0"
        :max="ed.duration.value"
        step="10"
        :value="Math.round(ed.time.value)"
        aria-label="Timeline"
        class="flex-1"
        @input="ed.seek(+($event.target as HTMLInputElement).value)"
      />
      <span class="min-w-28 text-right text-xs tabular-nums">{{ Math.round(ed.time.value) }} / {{ ed.duration.value }} ms</span>
    </footer>

    <SceneJsonDialog ref="json" :editor="ed" />
  </div>
</template>
