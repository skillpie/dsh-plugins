/**
 * dsh-remote — shared wire constants and small helpers.
 *
 * Control channel (relay ↔ host, JSON text frames over one WebSocket):
 *   host → relay  { t:'hello', v, hostId, code, token, name, dsh }
 *                 { t:'hb' }                                  heartbeat, every 15s
 *                 { t:'res', id, ok, data?, error? }          command receipts
 *                 { t:'push', to, f }                          event push addressed to one visitor
 *   relay → host  { t:'hello', v, ok, token?, error? }         ack; token minted on first registration
 *                 { t:'hb' }                                   heartbeat echo
 *                 { t:'cmd', id, from, cmd, p? }               visitor command (from = visitor id)
 *
 * Visitor channel (relay ↔ browser, JSON text frames over /<code>/ws):
 *   relay → visitor { t:'welcome', v, visitor, host, sessions }
 *                   { t:'res', id, ok, data?, error? }
 *                   { t:'push', f }
 *   visitor → relay { t:'cmd', id, cmd, p? }
 *
 * Visitor command set lives in VISITOR_COMMANDS; 'visitor.hello' and
 * 'visitor.gone' are relay-internal and never offered to the console.
 */
import { randomInt, randomUUID, createHash } from 'node:crypto'

export const PROTOCOL_VERSION = 1

/** Exact upgrade path where hosts dial the relay. */
export const HOST_UPGRADE_PATH = '/dsh-remote/host'

/** Owner panel JSON API, same-origin and behind the web GUI's session auth. */
export const OWNER_API_PATH = '/dsh-remote/api'

/** Commands the visitor console may issue. */
export const VISITOR_COMMANDS = new Set([
  'host.info',
  'sessions.list',
  'sessions.state',
  'sessions.create',
  'sessions.send',
  'sessions.cancel',
  'sessions.observe',
  'sessions.unobserve',
])

/** Relay-internal commands bridged to the engine, invisible to the console. */
export const INTERNAL_COMMANDS = new Set(['visitor.hello', 'visitor.gone'])

/** An 8-digit code: 10000000..99999999, no leading zero. */
export function generateCode() {
  return String(randomInt(10_000_000, 100_000_000))
}

export function isValidCode(code) {
  return typeof code === 'string' && /^[1-9]\d{7}$/.test(code)
}

export function generateId() {
  return randomUUID()
}

/** Relay-side only: hosts carry plaintext tokens, the registry stores hashes. */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

/** Safe JSON frame parse with a hard byte cap. */
export function parseFrame(text, maxBytes = 64 * 1024) {
  if (typeof text !== 'string' || text.length > maxBytes) return null
  try {
    const frame = JSON.parse(text)
    return frame && typeof frame === 'object' ? frame : null
  } catch {
    return null
  }
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

/* ── GUI splice mode ────────────────────────────────────────────────────
 *
 * In `gui` mode the relay transparently mounts the host's real web GUI
 * under `/<code>/`: HTTP requests and the GUI's single mux WebSocket
 * (`/api/remote.mux`) are bridged frame-by-frame, the host side serving
 * them from its own web server over loopback with an automatically minted
 * owner session cookie.
 *
 * Frames (JSON text unless noted):
 *   relay → host  { t:'hreq',  id, m, p, h }     begin HTTP proxy request
 *                 { t:'hend',  id }               request body complete
 *                 { t:'wopen', id, p, h }         open spliced WebSocket
 *                 { t:'wclose', id, code, reason }
 *   host  → relay { t:'hres',  id, s, h, sc }     status, headers, set-cookie[]
 *                 { t:'hfail', id, error }
 *                 { t:'wok', id } / { t:'wfail', id, error }
 *                 { t:'wclose', id, code, reason }
 *   both          { t:'hchunk', id } (binary)     request/response body chunk
 *                 { t:'wdata', id }  (binary)     spliced socket bytes
 *
 * Binary envelope: `JSON(meta) 0x00 payload` — JSON never contains a raw
 * NUL, so the first 0x00 byte separates header from payload.
 */

export function encodeBin(meta, payload) {
  const header = Buffer.from(JSON.stringify(meta), 'utf8')
  const body = payload === undefined ? EMPTY : Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  return Buffer.concat([header, SEPARATOR, body])
}

export function decodeBin(buffer) {
  const at = buffer.indexOf(0)
  if (at === -1) return undefined
  try {
    const meta = JSON.parse(buffer.slice(0, at).toString('utf8'))
    return meta && typeof meta === 'object' ? { meta, payload: buffer.slice(at + 1) } : undefined
  } catch {
    return undefined
  }
}

const SEPARATOR = Buffer.from([0])
const EMPTY = Buffer.alloc(0)
