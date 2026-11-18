<script setup lang="ts">
import { computed, type DeepReadonly } from 'vue'
import { cdnUrl } from './api'
import { fontSizeCq, fontStack, layerBox, parseCanvasBase, parseEditorState, safeColor } from './editor'
import type { Draft } from './types'

const props = defineProps<{ draft: DeepReadonly<Draft> }>()

const editor = computed(() => parseEditorState(props.draft.editor_state))
const url = (p: string) => cdnUrl(props.draft.cdn, p)
const base = computed(() => parseCanvasBase(props.draft.canvas_background))
const baseSrc = computed(() => {
  const b = base.value
  if (b.kind !== 'image') return undefined
  return /^https?:/i.test(b.src) ? b.src : cdnUrl(props.draft.cdn, b.src)
})
</script>

<template>
  <!-- container-type lets text size scale with the canvas width (cqw) -->
  <div
    class="relative w-full max-w-sm overflow-hidden rounded-xl border"
    :style="{
      aspectRatio: `${editor.canvas.width} / ${editor.canvas.height}`,
      background: base.kind === 'color' ? base.color : '#000000',
      containerType: 'inline-size',
    }"
    role="img"
    :aria-label="draft.caption || 'Draft canvas'"
  >
    <img v-if="baseSrc" :src="baseSrc" alt="" class="absolute inset-0 size-full object-cover" />
    <template v-for="l in editor.layers" :key="l.id">
      <img
        v-if="l.type === 'image'"
        :src="url(l.props.src)"
        :alt="l.name"
        class="absolute"
        :style="{ ...layerBox(l, editor.canvas), objectFit: l.props.fit }"
      />
      <img
        v-else-if="l.type === 'element'"
        :src="url(l.props.src)"
        :alt="l.props.kind"
        class="absolute object-contain"
        :style="layerBox(l, editor.canvas)"
      />
      <div
        v-else
        class="absolute flex items-center leading-tight whitespace-pre-wrap"
        :style="{
          ...layerBox(l, editor.canvas),
          color: safeColor(l.props.color),
          fontFamily: fontStack(l.props.fontFamily),
          fontSize: fontSizeCq(l.props.fontSize, editor.canvas),
          textAlign: l.props.align,
          justifyContent: l.props.align === 'left' ? 'flex-start' : l.props.align === 'right' ? 'flex-end' : 'center',
        }"
      >
        <span class="w-full">{{ l.props.text }}</span>
      </div>
    </template>
  </div>
</template>
