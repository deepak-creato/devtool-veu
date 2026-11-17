import type { UploaderError } from './types'

export class ApiError extends Error {
  readonly status: number
  readonly data: unknown
  constructor(status: number, message: string, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export class PutError extends Error {
  /** HTTP status, or 0 for a network failure. */
  readonly status: number
  constructor(status: number) {
    super(`PUT failed (${status})`)
    this.name = 'PutError'
    this.status = status
  }
}

export const MESSAGES = {
  checksum_mismatch:
    'Upload verification failed (checksum, size or type mismatch). Please start the upload again.',
  upload_failed: 'A file could not be uploaded after several attempts. Retry the failed file.',
  processing_failed: 'The server could not process your media. Please try again.',
  expired: 'The upload expired. Please start again.',
  network: 'Network connection lost. The upload will resume when you are back online.',
  unknown: 'Something went wrong. Please try again.',
} as const

export function makeError(code: Exclude<UploaderError['code'], 'validation'>, detail?: string): UploaderError {
  return { code, message: detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code] }
}
