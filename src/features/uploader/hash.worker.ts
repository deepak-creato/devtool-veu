import { sha256 } from '@noble/hashes/sha2.js'

// Streams the file in chunks: memory stays flat for large videos.
self.onmessage = async (e: MessageEvent<File>) => {
  try {
    const h = sha256.create()
    const reader = e.data.stream().getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      h.update(value)
    }
    const bytes = h.digest()
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    self.postMessage({ ok: true, checksum: btoa(bin) })
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'hash failed' })
  }
}
