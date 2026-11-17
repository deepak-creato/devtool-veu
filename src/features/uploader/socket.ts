import type { SocketHandle, SocketHandlers, UploadStatus } from './types'

// ASSUMPTION: socket protocol is unconfirmed. Auth + subscribe is sent as the
// first message (keeps the token out of the URL and logs).
export function createSocketOpener(wsUrl: string, getToken: () => string | Promise<string>) {
  return (postId: string, h: SocketHandlers): SocketHandle | null => {
    if (typeof WebSocket === 'undefined') return null
    const ws = new WebSocket(wsUrl)
    ws.onopen = async () => {
      ws.send(JSON.stringify({ type: 'subscribe', post_id: postId, token: await getToken() }))
    }
    ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as Partial<UploadStatus> & { post_id?: string }
        if (msg.post_id && msg.post_id !== postId) return
        if (msg.state) h.onStatus(msg as UploadStatus)
      } catch {
        /* ignore malformed frame */
      }
    }
    ws.onclose = () => h.onClose()
    ws.onerror = () => h.onClose()
    return { close: () => ws.close() }
  }
}
