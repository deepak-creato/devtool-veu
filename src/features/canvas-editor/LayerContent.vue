<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ImageIcon, Star, Video } from '@lucide/vue'
import { sampleSvg } from './samples'
import { cssColor, fontStack } from './scene'
import type { Layer } from './types'

const props = defineProps<{
  layer: Layer
  resolve: (src: string | undefined) => string | undefined
  /** Scene time in ms; drives built-in sample videos. */
  time: number
  /** Edit mode: sample videos freeze on a still frame. */
  still: boolean
}>()

const l = computed(() => props.layer)
const src = computed(() => ('src' in l.value.props ? props.resolve(l.value.props.src) : undefined))
/** Built-in animated SVG standing in for a video (static, trusted markup). */
const sampleVideo = computed(() => (l.value.type === 'video' ? sampleSvg(l.value.props.src) : undefined))

const flip = computed(() => {
  const p = l.value.props as { flipX?: boolean; flipY?: boolean }
  return p.flipX || p.flipY ? `scale(${p.flipX ? -1 : 1}, ${p.flipY ? -1 : 1})` : undefined
})

/** Media is drawn into the full frame, then shifted so only the crop rect shows. */
const frameStyle = computed(() => {
  const c = l.value.type === 'image' || l.value.type === 'video' ? l.value.props.crop : undefined
  if (!c) return { position: 'absolute', inset: '0' } as const
  return {
    position: 'absolute',
    width: `${100 / c.w}%`,
    height: `${100 / c.h}%`,
    left: `${(-100 * c.x) / c.w}%`,
    top: `${(-100 * c.y) / c.h}%`,
  } as const
})

const mediaStyle = computed(() => {
  const p = l.value.props as { fit?: string; cornerRadius?: number }
  return { borderRadius: `${p.cornerRadius ?? 0}px` }
})

const elementFilter = computed(() => {
  if (l.value.type !== 'element') return undefined
  const p = l.value.props
  const w = p.outlineWidth ?? 0,
    c = cssColor(p.outlineColor, '#ffffff'),
    d = Math.round(w * 0.7)
  const f: string[] = []
  if (w > 0)
    for (const [x, y] of [[w, 0], [-w, 0], [0, w], [0, -w], [d, d], [-d, d], [d, -d], [-d, -d]])
      f.push(`drop-shadow(${x}px ${y}px 0 ${c})`)
  if ((p.shadowBlur ?? 0) > 0) f.push(`drop-shadow(0 ${Math.round(p.shadowBlur! / 2)}px ${p.shadowBlur}px rgba(0,0,0,.3))`)
  return f.join(' ') || 'none'
})

const textStyle = computed(() => {
  if (l.value.type !== 'text') return undefined
  const p = l.value.props
  // Shadow may be partial if only one field was edited in the panel.
  const sh = p.shadow as Partial<NonNullable<typeof p.shadow>> | undefined
  const s = sh ? { x: sh.x ?? 0, y: sh.y ?? 0, blur: sh.blur ?? 0, color: sh.color ?? 'rgba(0,0,0,.4)' } : undefined
  return {
    display: 'flex',
    alignItems: p.verticalAlign === 'top' ? 'flex-start' : p.verticalAlign === 'bottom' ? 'flex-end' : 'center',
    justifyContent: p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center',
    textAlign: p.align,
    fontFamily: fontStack(p.fontFamily),
    fontSize: `${p.fontSize}px`,
    fontWeight: String(p.fontWeight ?? 700),
    lineHeight: String(p.lineHeight ?? 1.2),
    color: cssColor(p.color, '#ffffff'),
    textShadow: s ? `${s.x}px ${s.y}px ${s.blur}px ${cssColor(s.color, 'rgba(0,0,0,.4)')}` : undefined,
  }
})

/** Placeholder when media can't be resolved: tint derived from the file name. */
const label = computed(() => ('src' in l.value.props ? l.value.props.src.split('/').pop() : '') || l.value.type)
const hue = computed(() => {
  let h = 0
  for (const c of label.value) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
})

const host = ref<HTMLElement | null>(null)
watch(
  [sampleVideo, () => props.time, () => props.still, () => l.value.animation?.in?.start],
  async () => {
    if (!sampleVideo.value) return
    await nextTick()
    const sv = host.value?.querySelector('svg[data-vid]') as SVGSVGElement | null
    if (!sv) return
    try {
      sv.pauseAnimations()
      const start = l.value.animation?.in?.start ?? 0
      sv.setCurrentTime(props.still ? 1 : (Math.max(0, props.time - start) / 1000) % 3)
    } catch {
      /* SMIL unsupported (e.g. test DOM) */
    }
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <!-- image / video -->
  <div v-if="l.type === 'image' || l.type === 'video'" ref="host" class="absolute inset-0 overflow-hidden" :style="mediaStyle">
    <div :style="frameStyle">
      <!-- eslint-disable-next-line vue/no-v-html -- sampleSvg returns static built-in markup only -->
      <div v-if="sampleVideo" class="size-full" :style="{ transform: flip }" v-html="sampleVideo" />
      <img
        v-else-if="src && l.type === 'image'"
        :src="src"
        :alt="l.name"
        draggable="false"
        class="block size-full"
        :style="{ objectFit: l.props.fit, transform: flip }"
      />
      <video
        v-else-if="src && l.type === 'video'"
        :src="src"
        :loop="l.props.loop"
        muted
        autoplay
        playsinline
        class="block size-full"
        :style="{ objectFit: l.props.fit, transform: flip }"
      />
      <div
        v-else
        class="flex size-full flex-col items-center justify-center gap-3 text-[40px] font-medium"
        :style="{ background: `hsl(${hue} 60% 82%)`, color: `hsl(${hue} 45% 25%)` }"
      >
        <component :is="l.type === 'video' ? Video : ImageIcon" :size="120" aria-hidden="true" />
        {{ label }}
      </div>
    </div>
  </div>

  <!-- sticker / cutout -->
  <template v-else-if="l.type === 'element'">
    <img
      v-if="src"
      :src="src"
      :alt="l.name"
      draggable="false"
      class="absolute inset-0 block size-full object-contain"
      :style="{ transform: flip, filter: elementFilter }"
    />
    <div
      v-else
      class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[40px] font-medium"
      :style="{ background: `hsl(${hue} 60% 82%)`, color: `hsl(${hue} 45% 25%)` }"
    >
      <Star :size="120" aria-hidden="true" />
      {{ label }}
    </div>
  </template>

  <!-- text -->
  <div v-else class="absolute inset-0 whitespace-pre-wrap" :style="textStyle">{{ l.props.text }}</div>
</template>
