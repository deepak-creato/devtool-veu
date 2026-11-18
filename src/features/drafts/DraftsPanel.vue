<script setup lang="ts">
import { onMounted } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cdnUrl, stillUrl } from './api'
import DraftCanvas from './DraftCanvas.vue'
import type { DraftsApi } from './types'
import { useDrafts } from './useDrafts'

const props = defineProps<{ api: DraftsApi }>()
const d = useDrafts(props.api)
const { state } = d
defineExpose({ refresh: d.refresh })

onMounted(() => void d.refresh())
const fmt = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <Card class="mx-auto w-full max-w-xl">
    <CardHeader>
      <CardTitle>{{ state.selected ? 'Draft' : 'Drafts' }}</CardTitle>
      <CardDescription>
        {{ state.selected ? state.selected.caption || 'No caption' : 'Uploaded drafts waiting to be published.' }}
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <Alert v-if="state.error" variant="destructive" role="alert">
        <AlertDescription>{{ state.error }}</AlertDescription>
      </Alert>

      <!-- detail -->
      <template v-if="state.selected">
        <Button variant="outline" size="sm" class="self-start" @click="d.close()">Back to drafts</Button>
        <DraftCanvas :draft="state.selected" />
        <p class="text-muted-foreground text-xs">
          {{ state.selected.media.length }} media: {{ state.selected.media.map((m) => `${m.name} (${m.type})`).join(', ') }}
        </p>
        <p v-if="state.selected.hashtags.length" class="text-sm">
          <span v-for="h in state.selected.hashtags" :key="h" class="mr-2">#{{ h }}</span>
        </p>
        <p v-if="state.selected.tagged_users.length" class="text-muted-foreground text-xs">
          {{ state.selected.tagged_users.length }} tagged user(s)
        </p>
        <p class="text-muted-foreground text-xs">Updated {{ fmt(state.selected.updated_at) }}</p>
      </template>

      <!-- list -->
      <template v-else>
        <p v-if="state.loadingList && !state.list" class="text-muted-foreground text-sm">Loading…</p>
        <p v-else-if="state.list && !state.list.drafts.length" class="text-muted-foreground text-sm">No drafts yet.</p>
        <ul v-if="state.list" class="flex flex-col gap-2">
          <li v-for="x in state.list.drafts" :key="x.draft_id">
            <button
              type="button"
              :disabled="state.loadingDraft"
              class="hover:bg-muted flex w-full items-center gap-3 rounded-lg border p-2 text-left transition disabled:opacity-50"
              @click="d.open(x.draft_id)"
            >
              <img
                v-if="stillUrl(state.list.cdn, x.cover_sources, x.cover_type) ?? cdnUrl(state.list.cdn, x.cover_sources.main?.default)"
                :src="stillUrl(state.list.cdn, x.cover_sources, x.cover_type) ?? cdnUrl(state.list.cdn, x.cover_sources.main?.default)"
                alt=""
                class="size-16 shrink-0 rounded-md border object-cover"
              />
              <div v-else class="bg-muted size-16 shrink-0 rounded-md" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm">{{ x.caption_snippet || 'No caption' }}</p>
                <p class="text-muted-foreground text-xs">{{ fmt(x.updated_at) }}</p>
              </div>
              <Badge variant="secondary">{{ x.cover_type }}</Badge>
            </button>
          </li>
        </ul>
        <Button variant="outline" size="sm" class="self-start" :disabled="state.loadingList" @click="d.refresh()">
          Refresh
        </Button>
      </template>
    </CardContent>
  </Card>
</template>
