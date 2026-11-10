/**
 * dsh-remote — in-process ws-like pipe pair.
 *
 * Direct mode reuses the exact relay code path on the local web server: the
 * engine or GUI bridge speaks the same frames to one end of a pipe while a
 * RelayCore instance serves the other end. JSON text frames cross
 * serialization (so framing bugs show up locally too); binary splice frames
 * pass through by reference.
 *
 * Both ends expose the subset of the `ws` surface the plugin uses:
 *   send(obj)        JSON text frame
 *   sendRaw(buffer)  binary passthrough
 *   onMessage(cb)    cb(text | Buffer)
 *   onClose(cb), close()
 */
function makeEnd(getPeer) {
  const end = {
    open: true,
    messageHandlers: new Set(),
    closeHandlers: new Set(),
    send(obj) {
      if (!end.open) return
      const text = JSON.stringify(obj)
      const peer = getPeer()
      // Deliver on a microtask so neither side re-enters synchronously.
      queueMicrotask(() => {
        if (!end.open || !peer || !peer.open) return
        for (const handler of peer.messageHandlers) {
          try { handler(text) } catch { /* contained */ }
        }
      })
    },
    sendRaw(buffer) {
      if (!end.open) return
      const peer = getPeer()
      queueMicrotask(() => {
        if (!end.open || !peer || !peer.open) return
        for (const handler of peer.messageHandlers) {
          try { handler(buffer) } catch { /* contained */ }
        }
      })
    },
    sendText(text) {
      if (!end.open) return
      const peer = getPeer()
      queueMicrotask(() => {
        if (!end.open || !peer || !peer.open) return
        for (const handler of peer.messageHandlers) {
          try { handler(text) } catch { /* contained */ }
        }
      })
    },
    onMessage(handler) {
      end.messageHandlers.add(handler)
      return () => end.messageHandlers.delete(handler)
    },
    onClose(handler) {
      end.closeHandlers.add(handler)
      return () => end.closeHandlers.delete(handler)
    },
    close() {
      if (!end.open) return
      end.open = false
      const handlers = [...end.closeHandlers]
      end.messageHandlers.clear()
      end.closeHandlers.clear()
      for (const handler of handlers) handler()
      const peer = getPeer()
      if (peer && peer.open) peer.close()
    },
  }
  return end
}

export function createPipePair() {
  let peerOfA
  let peerOfB
  const a = makeEnd(() => peerOfA)
  const b = makeEnd(() => peerOfB)
  peerOfA = b
  peerOfB = a
  return [a, b]
}
