<script setup lang="ts">
import { ref } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const props = defineProps<{
  submit: (v: { phone_number: string; country_code: string; otp: string }) => Promise<void>
}>()

const countryCode = ref('+91')
const phone = ref('')
const otp = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

async function onSubmit() {
  error.value = null
  loading.value = true
  try {
    await props.submit({ phone_number: phone.value.trim(), country_code: countryCode.value.trim(), otp: otp.value.trim() })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Login failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Card class="mx-auto w-full max-w-sm">
    <CardHeader>
      <CardTitle>Log in</CardTitle>
      <CardDescription>Enter your phone number and one-time code.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex gap-2">
          <div class="flex w-20 flex-col gap-1">
            <Label for="cc">Code</Label>
            <Input id="cc" v-model="countryCode" inputmode="tel" autocomplete="tel-country-code" required />
          </div>
          <div class="flex flex-1 flex-col gap-1">
            <Label for="phone">Phone number</Label>
            <Input id="phone" v-model="phone" inputmode="numeric" autocomplete="tel-national" required />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <Label for="otp">OTP</Label>
          <Input id="otp" v-model="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
        </div>
        <Alert v-if="error" variant="destructive" role="alert">
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>
        <Button type="submit" :disabled="loading || !phone || otp.length < 4">
          {{ loading ? 'Verifying…' : 'Log in' }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
