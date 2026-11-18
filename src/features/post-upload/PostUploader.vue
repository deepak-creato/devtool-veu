<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ImagePlus, X } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { UploaderDeps } from './types'
import { usePostUpload } from './usePostUpload'

const props = defineProps<{ deps: UploaderDeps }>()
const emit = defineEmits<{ draftReady: [postId: string] }>()

// Draft ready is NOT "published": the post is created later, when the user publishes the draft.
const uploader = usePostUpload({
  ...props.deps,
  onDraftReady: (id) => {
    props.deps.onDraftReady?.(id)
    emit('draftReady', id)
  },
})
const { state, overallProgress } = uploader

const MAX_FILES = 10
const picker = ref<HTMLInputElement | null>(null)
const thumbnail = ref<File | undefined>()
const prompt = ref('')

interface Tile {
  file: File
  url: string
  isVideo: boolean
}
const tiles = ref<Tile[]>([])
const files = computed(() => tiles.value.map((t) => t.file))

const picking = computed(() => state.phase === 'picking')
const canStart = computed(() => picking.value && files.value.length > 0)
const phaseLabel = computed(
  () =>
    ({
      picking: 'Ready',
      initialising: 'Preparing',
      uploading: 'Uploading',
      upload_failed: 'Upload failed',
      processing: 'Processing',
      failed: 'Failed',
      draft_ready: 'Draft ready',
    })[state.phase],
)

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? []).slice(0, MAX_FILES - tiles.value.length)
  for (const file of picked) tiles.value.push({ file, url: URL.createObjectURL(file), isVideo: file.type.startsWith('video/') })
  input.value = ''
}
function removeTile(i: number) {
  const [t] = tiles.value.splice(i, 1)
  if (t) URL.revokeObjectURL(t.url)
}
function clearTiles() {
  tiles.value.forEach((t) => URL.revokeObjectURL(t.url))
  tiles.value = []
  thumbnail.value = undefined
  prompt.value = ''
}
onBeforeUnmount(() => tiles.value.forEach((t) => URL.revokeObjectURL(t.url)))
onMounted(() => void uploader.resume())

function onThumb(e: Event) {
  thumbnail.value = (e.target as HTMLInputElement).files?.[0]
}
function submit() {
  void uploader.start(files.value, { thumbnail: thumbnail.value, prompt: prompt.value })
}
function startAgain() {
  uploader.reset() // Failed / DraftReady -> Picking
  clearTiles()
}
watch(() => state.phase, (p) => { if (p === 'picking' && !state.files.length) clearTiles() })

const variant = (s: string) => (s === 'failed' ? 'destructive' : s === 'uploaded' ? 'default' : 'secondary')
</script>

<template>
  <Card class="mx-auto w-full max-w-xl">
    <CardHeader>
      <CardTitle>Create post</CardTitle>
      <CardDescription>1–10 images or videos, optional thumbnail.</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <div class="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
        <div class="flex flex-wrap justify-center gap-3">
          <div
            v-for="(t, i) in tiles"
            :key="t.url"
            class="group relative size-36 overflow-hidden rounded-xl border bg-background"
          >
            <video v-if="t.isVideo" :src="t.url" muted class="size-full object-cover" />
            <img v-else :src="t.url" :alt="t.file.name" class="size-full object-cover" />
            <button
              v-if="picking"
              type="button"
              :aria-label="`Remove ${t.file.name}`"
              class="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
              @click="removeTile(i)"
            >
              <X class="size-3.5" />
            </button>
          </div>
          <button
            v-if="tiles.length < MAX_FILES"
            type="button"
            :disabled="!picking"
            class="text-muted-foreground hover:bg-muted flex size-36 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs transition disabled:opacity-50"
            @click="picker?.click()"
          >
            <ImagePlus class="size-6" />
            Add
          </button>
        </div>
        <input ref="picker" type="file" multiple accept="image/*,video/*" class="hidden" @change="onFiles" />
        <span class="text-muted-foreground text-xs">{{ tiles.length }}/{{ MAX_FILES }} images</span>
      </div>
      <label class="flex flex-col gap-1 text-sm">
        Thumbnail (optional)
        <input type="file" accept="image/*" :disabled="!picking" class="text-sm" @change="onThumb" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Prompt (optional)
        <textarea
          v-model="prompt"
          maxlength="2000"
          :disabled="!picking"
          rows="3"
          class="rounded-md border bg-transparent p-2 text-sm"
        />
      </label>

      <Alert v-if="state.error" variant="destructive" role="alert">
        <AlertTitle>{{ state.phase === 'failed' ? 'Processing failed' : 'Upload problem' }}</AlertTitle>
        <AlertDescription>{{ state.error }}</AlertDescription>
      </Alert>

      <ul v-if="state.files.length" class="flex flex-col gap-3">
        <li v-for="f in state.files" :key="f.id" class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2 text-sm">
            <span class="truncate">{{ f.name }}<span v-if="f.role === 'thumbnail'"> (thumbnail)</span></span>
            <span class="flex items-center gap-2">
              <Badge :variant="variant(f.status)">{{ f.status }}</Badge>
            </span>
          </div>
          <Progress :model-value="f.progress" />
                  </li>
      </ul>

      <div v-if="state.files.length" class="flex flex-col gap-1">
        <div class="flex justify-between text-sm">
          <span>{{ phaseLabel }}</span>
          <span>{{ overallProgress }}%</span>
        </div>
        <Progress :model-value="overallProgress" />
      </div>

      <div class="flex gap-2">
        <Button v-if="picking" :disabled="!canStart" @click="submit">Create post</Button>
        <Button v-if="state.phase === 'upload_failed'" @click="uploader.retryFailed()">Retry failed files</Button>
        <Button v-if="state.phase === 'upload_failed' || state.phase === 'failed'" variant="outline" @click="startAgain">
          Start again
        </Button>
        <Button v-if="state.phase === 'draft_ready'" variant="outline" @click="startAgain">New post</Button>
      </div>
      <p v-if="state.phase === 'draft_ready'" class="text-sm">Draft ready. Publish it to create the post.</p>
    </CardContent>
  </Card>
</template>
