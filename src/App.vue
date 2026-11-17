<script setup lang="ts">
import { ref } from 'vue'
import LoginForm from '@/features/auth/LoginForm.vue'
import { getToken, useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/button'
import { MediaUploader, createApi, createSocketOpener, type UploaderConfig } from '@/features/uploader'

const API_URL: string = import.meta.env.VITE_CREATO_API_URL ?? 'http://localhost:3000/api/v1'
const auth = useAuth(API_URL)

const config: UploaderConfig = {
  api: createApi(API_URL, getToken, auth.logout), // 401 -> back to login
  openSocket: import.meta.env.VITE_CREATO_WS_URL
    ? createSocketOpener(import.meta.env.VITE_CREATO_WS_URL, getToken)
    : undefined,
}

const readyPostId = ref<string | null>(null)
</script>

<template>
  <main class="p-6">
    <LoginForm v-if="!auth.token.value" :submit="auth.verifyOtp" />
    <template v-else>
      <div class="mx-auto mb-4 flex max-w-xl justify-end">
        <Button variant="outline" size="sm" @click="auth.logout">Log out</Button>
      </div>
      <MediaUploader :config="config" @ready="readyPostId = $event" />
      <p v-if="readyPostId" class="mt-4 text-center text-sm">Post {{ readyPostId }} is ready to publish.</p>
    </template>
  </main>
</template>
