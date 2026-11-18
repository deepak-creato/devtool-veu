export class ApiError extends Error {
  readonly status: number
  /** Backend message key, e.g. common.FILE.FILES_MAX_LENGTH. */
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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
