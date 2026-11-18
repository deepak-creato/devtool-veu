export type CoverType = 'image' | 'video'

/** Paths are relative: prefix with the response `cdn`. */
export interface Sources {
  main?: { default: string }
  poster?: { default: string }
  thumbnail?: { default: string }
}

export interface DraftSummary {
  draft_id: string
  caption_snippet: string
  cover_type: CoverType
  cover_sources: Sources
  created_at: string
  updated_at: string
}

export interface DraftList {
  cdn: string
  drafts: DraftSummary[]
}

export interface DraftMedia {
  id: string
  name: string
  type: CoverType
  sources: Sources
  meta: { width: number; height: number; duration?: number }
  layer: {
    z_index: number
    transform: { x: number; y: number; width: number; height: number; rotation: number }
    settings: { autoplay?: boolean; muted?: boolean; loop?: boolean; volume?: number }
  }
}

export interface Draft {
  cdn: string
  draft_id: string
  user_id: string
  caption: string
  media: DraftMedia[]
  canvas_background: string
  cover_type: CoverType
  cover_sources: Sources
  tagged_users: { user_id: string; area: { x: number; y: number; width: number; height: number } }[]
  sound_id: string
  hashtags: string[]
  location_id: string
  hide_like_count: boolean
  moderate_comments: boolean
  is_sponsored: boolean
  turn_off_all_comments: boolean
  editor_state: string
  editor_version: number
  created_at: string
  updated_at: string
  story_plan: string
}

export interface DraftsApi {
  list(): Promise<DraftList>
  get(draftId: string): Promise<Draft>
}
