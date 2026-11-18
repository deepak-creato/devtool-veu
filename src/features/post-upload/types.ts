/** State machine from the backend contract (section 6). DraftReady is the end state; publish is out of scope. */
export type Phase =
  | 'picking'
  | 'initialising'
  | 'uploading'
  | 'upload_failed'
  | 'processing'
  | 'failed'
  | 'draft_ready'

export type FileStatus = 'queued' | 'uploading' | 'uploaded' | 'failed'

export interface FileSpec {
  id: string
  name: string
  mime_type: string
  size: number
}

export interface InitialiseBody {
  media_metadata: FileSpec[]
  thumbnail?: FileSpec
  prompt?: string
}

export interface UploadItem {
  id: string
  upload_url: string
  file_url: string
}

export interface InitialiseResult {
  post_id: string
  /** Keyed by client id: never match by array index. */
  uploads: Map<string, UploadItem>
}

export type UploadEventName = 'upload' | 'upload_ack' | 'upload_error'

export interface UploadEventPayload {
  success: boolean
  type: 'user'
  data: { post_id: string; progress: number }
  error?: string
}

export interface UploadStatus {
  post_id: string
  state: 'processing' | 'completed' | 'failed'
  progress: number
  version: number
  updated_at: string
  event_type: UploadEventName
  error?: string
}

export interface PostUploadApi {
  initialise(body: InitialiseBody): Promise<InitialiseResult>
  /** Resolves null when the server has no status yet (data: null). */
  status(postId: string): Promise<UploadStatus | null>
}

export interface UploadSocket {
  /** Resolves once connected; rejects on timeout or auth failure. */
  connect(): Promise<void>
  isConnected(): boolean
  onEvent(cb: (event: UploadEventName, payload: unknown) => void): () => void
  /** Fires on every (re)connect after the first. */
  onReconnect(cb: () => void): () => void
  onDisconnect(cb: () => void): () => void
  disconnect(): void
}

export type PutFile = (args: {
  url: string
  file: File
  mimeType: string
  signal: AbortSignal
  onProgress: (loaded: number, total: number) => void
}) => Promise<void>

export interface PersistedUpload {
  post_id: string
  /** ms epoch of the successful initialise: URLs and server tracking last 1 hour. */
  initialised_at: number
  /** 'uploading' cannot resume: the files are gone after a restart. */
  stage: 'uploading' | 'processing'
}

export interface UploadStorage {
  load(): PersistedUpload | null
  save(p: PersistedUpload): void
  clear(): void
}

export interface StartOptions {
  thumbnail?: File
  prompt?: string
}

export interface UploaderDeps {
  api: PostUploadApi
  socket: UploadSocket
  putFile?: PutFile
  storage?: UploadStorage
  now?: () => number
  makeId?: () => string
  /** Poll interval while the socket is NOT connected. Default 5000. */
  pollMs?: number
  retryBaseMs?: number
  onDraftReady?: (postId: string) => void
}

export interface FileState {
  id: string
  name: string
  size: number
  mime_type: string
  role: 'media' | 'thumbnail'
  status: FileStatus
  progress: number
}
