<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { UploaderConfig } from './types'
import { useMediaUploader } from './useMediaUploader'

const props = defineProps<{ config: UploaderConfig }>()
const emit = defineEmits<{ ready: [postId: string] }>()

const uploader = useMediaUploader(props.config)
const { state, overallProgress } = uploader

const files = ref<File[]>([])
const thumbnail = ref<File | undefined>()
const prompt = ref('')

const active = computed(() => state.busy)
const canStart = computed(() => files.value.length > 0 && !active.value)
const hasFailedFile = computed(() => state.files.some((f) => f.status === 'failed'))
const canRetry = computed(() => hasFailedFile.value && state.error?.code === 'upload_failed')

function onFiles(e: Event) {
  files.value = Array.from((e.target as HTMLInputElement).files ?? [])
}
function onThumb(e: Event) {
  thumbnail.value = (e.target as HTMLInputElement).files?.[0]
}
function submit() {
  void uploader.start(files.value, { thumbnail: thumbnail.value, prompt: prompt.value })
}

watch(
  () => state.postState,
  (s) => {
    if (s === 'ready' && state.postId) emit('ready', state.postId)
  },
)

const variant = (s: string) => (s === 'failed' ? 'destructive' : s === 'uploaded' ? 'default' : 'secondary')
</script>

<template>
  <Card class="mx-auto w-full max-w-xl">
    <CardHeader>
      <CardTitle>Upload media</CardTitle>
      <CardDescription>1–10 images or videos, optional thumbnail.</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <label class="flex flex-col gap-1 text-sm">
        Files
        <input type="file" multiple accept="image/*,video/*" :disabled="active" class="text-sm" @change="onFiles" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Thumbnail (optional)
        <input type="file" accept="image/*" :disabled="active" class="text-sm" @change="onThumb" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Prompt (optional)
        <textarea
          v-model="prompt"
          maxlength="2000"
          :disabled="active"
          rows="3"
          class="rounded-md border bg-transparent p-2 text-sm"
        />
      </label>

      <Alert v-if="state.error" variant="destructive" role="alert">
        <AlertTitle>Upload problem</AlertTitle>
        <AlertDescription>{{ state.error.message }}</AlertDescription>
      </Alert>

      <ul v-if="state.files.length" class="flex flex-col gap-3">
        <li v-for="f in state.files" :key="f.id" class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2 text-sm">
            <span class="truncate">{{ f.name }}<span v-if="f.role === 'thumbnail'"> (thumbnail)</span></span>
            <span class="flex items-center gap-2">
              <Badge :variant="variant(f.status)">{{ f.status }}</Badge>
              <Button
                v-if="f.status === 'failed' && canRetry"
                size="sm"
                variant="outline"
                @click="uploader.retryFile(f.id)"
              >
                Retry
              </Button>
            </span>
          </div>
          <Progress :model-value="f.progress" />
          <p v-if="f.error" class="text-destructive text-xs">{{ f.error }}</p>
        </li>
      </ul>

      <div v-if="state.files.length" class="flex flex-col gap-1">
        <div class="flex justify-between text-sm">
          <span>{{ state.postState === 'idle' ? 'Preparing' : state.postState }}</span>
          <span>{{ overallProgress }}%</span>
        </div>
        <Progress :model-value="overallProgress" />
      </div>

      <div class="flex gap-2">
        <Button :disabled="!canStart" @click="submit">Upload</Button>
        <Button v-if="state.files.length && state.postState !== 'ready'" variant="outline" @click="uploader.cancel()">
          Cancel
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
