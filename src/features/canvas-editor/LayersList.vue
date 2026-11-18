<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp, Image, Layers, Star, Trash2, Type, Video } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { CanvasEditor } from './useCanvasEditor'

const props = defineProps<{ editor: CanvasEditor }>()
const ed = props.editor
const ICONS = { image: Image, video: Video, text: Type, element: Star }
/** Front-most first. */
const rows = computed(() => [...ed.scene.value.layers].reverse())
const last = computed(() => ed.scene.value.layers.length - 1)
const index = (id: string) => ed.scene.value.layers.findIndex((l) => l.id === id)
</script>

<template>
  <div class="flex flex-col gap-1">
    <p class="text-muted-foreground mb-1 text-xs">Top of list = front</p>
    <div v-if="!rows.length" class="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
      <Layers class="size-7" aria-hidden="true" />No layers yet.
    </div>
    <div
      v-for="l in rows"
      :key="l.id"
      :class="[
        'flex cursor-pointer items-center gap-1 rounded-lg border px-1.5 py-1 text-sm',
        l.id === ed.selectedId.value ? 'border-primary/40 bg-muted' : 'hover:bg-muted/50',
      ]"
      @click="ed.select(l.id)"
    >
      <component :is="ICONS[l.type]" class="size-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate">{{ l.name || l.id }}</span>
      <Button size="icon-xs" variant="ghost" aria-label="Bring forward" :disabled="index(l.id) === last" @click.stop="ed.moveLayer(l.id, 1)">
        <ArrowUp />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Send backward" :disabled="index(l.id) === 0" @click.stop="ed.moveLayer(l.id, -1)">
        <ArrowDown />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Delete layer" @click.stop="ed.removeLayer(l.id)"><Trash2 /></Button>
    </div>
  </div>
</template>
