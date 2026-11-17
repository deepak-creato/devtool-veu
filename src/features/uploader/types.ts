export type PostState =
  | 'idle'
  | 'pending'
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'expired'

export const TERMINAL_STATES: readonly PostState[] = ['ready', 'failed', 'cancelled', 'expired']

export type FileStatus = 'queued' | 'hashing' | 'uploading' | 'uploaded' | 'failed'

export interface FileSpec {
  id: string
  name: string
  mime_type: string
  size: number
}

export interface UploadItem {
  id: string
  key: string
  upload_url: string
}

export interface InitialiseResult {
  post_id: string
  uploads: UploadItem[]
}

export interface UploadStatus {
  state: PostState
  progress: number
  version: number
  updated_at: string
  error?: string
}

export interface CompleteFile {
  id: string
  checksum_sha256: string
}

export type UploaderErrorCode =
  | 'validation'
  | 'checksum_mismatch'
  | 'upload_failed'
  | 'processing_failed'
  | 'expired'
  | 'network'
  | 'unknown'

export interface UploaderError {
  code: UploaderErrorCode
  message: string
}

export interface FileState {
  id: string
  name: string
  size: number
  mime_type: string
  role: 'media' | 'thumbnail'
  status: FileStatus
  progress: number // 0-100
  error?: string
}

export interface StartOptions {
  thumbnail?: File
  prompt?: string
}

export interface SocketHandle {
  close(): void
}

export interface SocketHandlers {
  onStatus(status: UploadStatus): void
  onClose(): void
}

export interface UploaderApi {
  initialise(body: {
    media_metadata: FileSpec[]
    thumbnail?: FileSpec
    prompt?: string
  }): Promise<InitialiseResult>
  /** Optional: absent when the backend has no explicit complete step (S3 event drives processing). */
  complete?(postId: string, files: CompleteFile[]): Promise<{ state: PostState }>
  /** Optional: absent when the backend cannot re-sign URLs. */
  refreshUrls?(postId: string, fileIds: string[]): Promise<UploadItem[]>
  cancel(postId: string): Promise<void>
  status(postId: string): Promise<UploadStatus | null>
}

export type PutFile = (args: {
  url: string
  file: File
  mimeType: string
  checksum: string
  signal: AbortSignal
  onProgress: (loaded: number, total: number) => void
}) => Promise<void>

export interface UploaderConfig {
  api: UploaderApi
  /** Hash a file off the main thread; resolves base64 SHA-256. When omitted, no checksum is computed or sent. */
  hashFile?: (file: File, signal: AbortSignal) => Promise<string>
  putFile?: PutFile
  /** Open the status socket. Return null when no socket is available (polling only). */
  openSocket?: (postId: string, handlers: SocketHandlers) => SocketHandle | null
  retryBaseMs?: number
  socketSilenceMs?: number
  pollIntervalMs?: number
}
