<script setup lang="ts">
import { ref } from 'vue'
import { X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { SceneError } from './scene'
import type { CanvasEditor } from './useCanvasEditor'

const props = defineProps<{ editor: CanvasEditor }>()
const ed = props.editor

const dlg = ref<HTMLDialogElement | null>(null)
const text = ref('')
const error = ref('')
const copied = ref(false)

const current = () => JSON.stringify(ed.exportV2(), null, 2)

function open() {
  if (ed.crop.value) ed.finishCrop(true)
  text.value = current()
  error.value = ''
  dlg.value?.showModal()
}
function apply() {
  try {
    ed.loadV2(text.value)
    error.value = ''
    dlg.value?.close()
  } catch (e) {
    error.value = e instanceof SceneError ? e.message : String(e)
  }
}
function reset() {
  ed.reset()
  text.value = current()
  error.value = ''
}
async function copy() {
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    error.value = 'Clipboard not available.'
  }
}
function download() {
  const url = URL.createObjectURL(new Blob([current()], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'scene.v2.json' })
  a.click()
  URL.revokeObjectURL(url)
}

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dlg"
    class="bg-background text-foreground m-auto w-[min(720px,92vw)] rounded-xl border p-4 shadow-xl backdrop:bg-black/40"
    aria-labelledby="scene-json-title"
  >
    <div class="mb-3 flex items-center">
      <h2 id="scene-json-title" class="flex-1 text-sm font-semibold">Scene JSON <span class="text-muted-foreground font-normal">(version 2)</span></h2>
      <Button size="icon-sm" variant="ghost" aria-label="Close" @click="dlg?.close()"><X /></Button>
    </div>
    <label class="mb-3 flex flex-col gap-0.5 text-xs">
      <span class="text-muted-foreground">Base URL for relative media (optional)</span>
      <input
        v-model.trim="ed.base.value"
        type="url"
        placeholder="https://cdn.example.com/"
        class="border-input bg-background h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </label>
    <textarea
      v-model="text"
      spellcheck="false"
      aria-label="Scene JSON"
      class="border-input bg-background h-80 w-full resize-y rounded-md border p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    />
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" @click="apply">Apply JSON</Button>
      <Button size="sm" variant="outline" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</Button>
      <Button size="sm" variant="outline" @click="download">Download</Button>
      <Button size="sm" variant="outline" @click="reset">Reset sample</Button>
      <span v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</span>
    </div>
  </dialog>
</template>
