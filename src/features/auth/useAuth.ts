import { readonly, ref } from 'vue'

const TOKEN_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'
const DEVICE_KEY = 'device_id'

export interface UserAccount {
  user_id: string
  name: string
  user_name: string
  full_number: string
}

interface VerifyOtpData {
  user_accounts: UserAccount[]
  token: string
  refresh_token: string
}

interface VerifyOtpEnvelope {
  status: boolean
  message: string
  data: VerifyOtpData | null
}

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* storage unavailable: session-only */
  }
}

function deviceId(): string {
  let id = read(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    write(DEVICE_KEY, id)
  }
  return id
}

const token = ref<string | null>(read(TOKEN_KEY))
const accounts = ref<UserAccount[]>([])

export function useAuth(baseUrl: string) {
  async function verifyOtp(input: { phone_number: string; country_code: string; otp: string }) {
    const res = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, device_id: deviceId(), device_type: 'web', location: null }),
    })
    let json: VerifyOtpEnvelope | null = null
    try {
      json = (await res.json()) as VerifyOtpEnvelope
    } catch {
      /* non-JSON body */
    }
    if (!res.ok || !json?.data?.token) throw new Error(json?.message || 'Login failed. Check the code and try again.')
    token.value = json.data.token
    accounts.value = json.data.user_accounts
    write(TOKEN_KEY, json.data.token)
    write(REFRESH_KEY, json.data.refresh_token)
  }

  function logout() {
    token.value = null
    accounts.value = []
    write(TOKEN_KEY, null)
    write(REFRESH_KEY, null)
  }

  return { token: readonly(token), accounts: readonly(accounts), verifyOtp, logout }
}

/** Never log the returned value. */
export const getToken = (): string => token.value ?? ''
