import { io, type Socket } from 'socket.io-client'
import type { UploadEventName, UploadSocket } from './types'

const EVENTS: UploadEventName[] = ['upload', 'upload_ack', 'upload_error']

/**
 * ASSUMPTION (not in contract): the JWT is passed as handshake `auth.token`.
 * Adjust `auth` if ws-gateway reads it from a header or query instead.
 */
export function createUploadSocket(
  wsUrl: string,
  getToken: () => string | Promise<string>,
  opts: { path?: string; connectTimeoutMs?: number } = {},
): UploadSocket {
  const timeoutMs = opts.connectTimeoutMs ?? 5000
  let socket: Socket | null = null
  let everConnected = false
  const eventCbs = new Set<(e: UploadEventName, p: unknown) => void>()
  const reconnectCbs = new Set<() => void>()
  const disconnectCbs = new Set<() => void>()

  function ensure(): Socket {
    if (socket) return socket
    const s = io(wsUrl, {
      path: opts.path,
      autoConnect: false,
      transports: ['websocket'],
      auth: (cb) => {
        void Promise.resolve(getToken()).then((token) => cb({ token }))
      },
    })
    for (const name of EVENTS) s.on(name, (payload: unknown) => eventCbs.forEach((cb) => cb(name, payload)))
    s.on('connect', () => {
      if (everConnected) reconnectCbs.forEach((cb) => cb())
      everConnected = true
    })
    s.on('disconnect', () => disconnectCbs.forEach((cb) => cb()))
    socket = s
    return s
  }

  return {
    connect() {
      const s = ensure()
      if (s.connected) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => done(new Error('socket connect timeout')), timeoutMs)
        const onOk = () => done()
        const onErr = (e: Error) => done(e)
        function done(err?: Error) {
          clearTimeout(timer)
          s.off('connect', onOk)
          s.off('connect_error', onErr)
          if (err) reject(err)
          else resolve()
        }
        s.once('connect', onOk)
        s.once('connect_error', onErr)
        s.connect()
      })
    },
    isConnected: () => socket?.connected ?? false,
    onEvent(cb) {
      eventCbs.add(cb)
      return () => eventCbs.delete(cb)
    },
    onReconnect(cb) {
      reconnectCbs.add(cb)
      return () => reconnectCbs.delete(cb)
    },
    onDisconnect(cb) {
      disconnectCbs.add(cb)
      return () => disconnectCbs.delete(cb)
    },
    disconnect() {
      socket?.disconnect()
      socket = null
      everConnected = false
    },
  }
}
