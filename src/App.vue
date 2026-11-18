<script setup lang="ts">
import { ref } from 'vue'
import LoginForm from '@/features/auth/LoginForm.vue'
import { getToken, useAuth } from '@/features/auth/useAuth'
import { DraftsPanel, createDraftsApi } from '@/features/drafts'
import { CanvasEditor } from '@/features/canvas-editor'
import { Button } from '@/components/ui/button'
import { PostUploader, createApi, createUploadSocket, localUploadStorage, type UploaderDeps } from '@/features/post-upload'

const API_URL: string = import.meta.env.VITE_CREATO_API_URL ?? 'http://localhost:3000/api/v1'
const auth = useAuth(API_URL)

const WS_URL: string = import.meta.env.VITE_CREATO_WS_URL ?? 'http://localhost:3001'

const deps: UploaderDeps = {
  api: createApi(API_URL, getToken, auth.logout), // 401 -> back to login
  socket: createUploadSocket(WS_URL, getToken),
  storage: localUploadStorage(),
}

const draftPostId = ref<string | null>(null)
const draftsApi = createDraftsApi(API_URL, getToken, auth.logout)
const tab = ref<'create' | 'drafts' | 'editor'>('create')
</script>

<template>
  <main class="p-6">
    <LoginForm v-if="!auth.token.value" :submit="auth.verifyOtp" />
    <template v-else>
      <div :class="['mx-auto mb-4 flex justify-between', tab === 'editor' ? 'max-w-none' : 'max-w-xl']">
        <div class="flex gap-2">
          <Button :variant="tab === 'create' ? 'default' : 'outline'" size="sm" @click="tab = 'create'">Create</Button>
          <Button :variant="tab === 'drafts' ? 'default' : 'outline'" size="sm" @click="tab = 'drafts'">Drafts</Button>
          <Button :variant="tab === 'editor' ? 'default' : 'outline'" size="sm" @click="tab = 'editor'">Editor</Button>
        </div>
        <Button variant="outline" size="sm" @click="auth.logout">Log out</Button>
      </div>
      <div v-show="tab === 'create'">
        <PostUploader :deps="deps" @draft-ready="draftPostId = $event" />
        <p v-if="draftPostId" class="mt-4 text-center text-sm">
          Draft {{ draftPostId }} is ready.
          <button type="button" class="underline" @click="tab = 'drafts'">View drafts</button>
        </p>
      </div>
      <DraftsPanel v-if="tab === 'drafts'" :api="draftsApi" />
      <div v-if="tab === 'editor'" class="h-[calc(100vh-7rem)]"><CanvasEditor /></div>
    </template>
  </main>
</template>
