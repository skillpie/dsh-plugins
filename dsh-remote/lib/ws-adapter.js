/**
 * dsh-remote — adapter from a raw `ws` socket to the small surface the
 * plugin uses:
 *   send(obj)          JSON text frame
 *   sendRaw(buffer)    binary frame (GUI splice payloads)
 *   onMessage(cb)      cb(text | Buffer) — text for JSON frames, Buffer for binary
 *   onClose(cb), close()
 */
export function adaptSocket(raw) {
  const end = {
    open: raw.readyState === 1,
    send(obj) {
      if (raw.readyState !== 1) return
      raw.send(JSON.stringify(obj))
    },
    sendRaw(buffer) {
      if (raw.readyState !== 1) return
      raw.send(buffer, { binary: true })
    },
    sendText(text) {
      if (raw.readyState !== 1) return
      raw.send(text)
    },
    onMessage(handler) {
      const listener = (data, isBinary) => {
        try {
          handler(isBinary ? data : String(data))
        } catch {
          // A listener bug must never crash the host process.
        }
      }
      raw.on('message', listener)
      return () => raw.off('message', listener)
    },
    onClose(handler) {
      const listener = () => {
        try { handler() } catch { /* contained */ }
      }
      raw.on('close', listener)
      return () => raw.off('close', listener)
    },
    close() {
      try { raw.close(1000) } catch { raw.terminate() }
    },
    raw,
  }
  raw.on('close', () => { end.open = false })
  return end
}
