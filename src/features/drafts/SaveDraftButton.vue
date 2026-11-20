<script setup lang="ts">
import { ref } from 'vue'
import { Save } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { CanvasEditorState } from '@/features/canvas-editor'
import { saveDraft, type DraftRef } from './save'
import { renderSceneThumbnail } from './thumbnail'
import type { Draft, DraftsApi } from './types'

const props = defineProps<{ api: DraftsApi; draft: DraftRef; editor: CanvasEditorState }>()
const emit = defineEmits<{ saved: [draft: Draft] }>()

const withThumbnail = ref(true)
const saving = ref(false)
const status = ref<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)

async function save() {
  saving.value = true
  status.value = null
  try {
    const scene = props.editor.scene.value
    let thumbnail: Blob | undefined
    let skipped = 0
    if (withThumbnail.value) {
      const rendered = await renderSceneThumbnail(scene, props.editor.resolve)
      thumbnail = rendered.blob
      skipped = rendered.skipped
    }
    const saved = await saveDraft(props.api, props.draft, scene, thumbnail)
    emit('saved', saved)
    status.value = skipped
      ? { kind: 'warn', text: `Saved. ${skipped} layer(s) are missing from the thumbnail (videos, or images the CDN blocks via CORS).` }
      : { kind: 'ok', text: 'Saved' }
  } catch (e) {
    status.value = { kind: 'error', text: e instanceof Error ? e.message : 'Could not save the draft.' }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <span
      v-if="status"
      role="status"
      :title="status.text"
      :class="[
        'max-w-48 truncate text-xs',
        status.kind === 'error' ? 'text-destructive' : status.kind === 'warn' ? 'text-amber-600' : 'text-muted-foreground',
      ]"
    >
      {{ status.text }}
    </span>
    <label class="text-muted-foreground flex items-center gap-1.5 text-xs">
      <input v-model="withThumbnail" type="checkbox" :disabled="saving" />
      Update thumbnail
    </label>
    <Button size="sm" :disabled="saving" @click="save"><Save />{{ saving ? 'Saving…' : 'Save draft' }}</Button>
  </div>
</template>
