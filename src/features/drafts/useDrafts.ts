import { reactive, readonly } from 'vue'
import type { Draft, DraftList, DraftsApi } from './types'

export function useDrafts(api: DraftsApi) {
  const state = reactive({
    list: null as DraftList | null,
    selected: null as Draft | null,
    loadingList: false,
    loadingDraft: false,
    error: null as string | null,
  })
  let listReq = 0
  let draftReq = 0

  async function refresh() {
    const req = ++listReq
    state.loadingList = true
    state.error = null
    try {
      const l = await api.list()
      if (req === listReq) state.list = l
    } catch (e) {
      if (req === listReq) state.error = e instanceof Error ? e.message : 'Could not load drafts.'
    } finally {
      if (req === listReq) state.loadingList = false
    }
  }

  async function open(draftId: string) {
    const req = ++draftReq
    state.loadingDraft = true
    state.error = null
    try {
      const d = await api.get(draftId)
      if (req === draftReq) state.selected = d
    } catch (e) {
      if (req === draftReq) state.error = e instanceof Error ? e.message : 'Could not load draft.'
    } finally {
      if (req === draftReq) state.loadingDraft = false
    }
  }

  function close() {
    draftReq++
    state.selected = null
    state.loadingDraft = false
  }

  return { state: readonly(state), refresh, open, close }
}
