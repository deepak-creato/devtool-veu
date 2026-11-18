<script setup lang="ts">
import { fontStack } from './scene'
import { LIBRARY, SAMPLES, TEXT_PRESETS, sampleUri } from './samples'
import type { CanvasEditor } from './useCanvasEditor'

const props = defineProps<{ editor: CanvasEditor }>()
const ed = props.editor
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
</script>

<template>
  <div class="flex flex-col gap-4">
    <section v-for="g in LIBRARY" :key="g.group">
      <h3 class="text-muted-foreground mb-1.5 text-xs">{{ g.label }}</h3>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="k in Object.keys(SAMPLES[g.group])"
          :key="k"
          type="button"
          :title="cap(k)"
          :aria-label="`Add ${k} ${g.group}`"
          class="bg-muted hover:border-primary/40 flex aspect-square items-center justify-center rounded-lg border p-1 transition"
          @click="ed.addSample(g.group, k)"
        >
          <img :src="sampleUri(`sample:${g.group}/${k}`)" alt="" class="max-h-full max-w-full rounded" />
        </button>
      </div>
    </section>
    <section>
      <h3 class="text-muted-foreground mb-1.5 text-xs">Text</h3>
      <div class="flex flex-col gap-2">
        <button
          v-for="t in TEXT_PRESETS"
          :key="t.name"
          type="button"
          class="bg-muted hover:border-primary/40 h-11 rounded-lg border px-3 text-left text-lg transition"
          :style="{ fontFamily: fontStack(t.props.fontFamily), fontWeight: t.props.fontWeight }"
          @click="ed.addText(t)"
        >
          {{ t.name }}
        </button>
      </div>
    </section>
  </div>
</template>
