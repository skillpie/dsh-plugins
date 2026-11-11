/**
 * dsh-remote — host-side visitor file download route.
 *
 * Visitors of the real GUI have no way to save a generated file locally: the
 * built-in file menu only hands paths to the Host desktop (open / reveal),
 * which is invisible to a remote browser. This route reads a file from this
 * host's disk and streams it back with `Content-Disposition: attachment`,
 * so the visitor's browser opens its own save dialog.
 *
 * The route registers on the HOST's own web server under `/dsh-remote-file`;
 * visitor requests reach it through the tunnel (relay prefix proxy or direct
 * pipe) with the bridge-minted owner cookie attached. Everything else is
 * gated by a shared-secret key derived from the host id (`?k=` or the
 * `x-dsh-remote-key` header) so loopback strangers cannot read arbitrary
 * files. The same derivation runs on the relay to stamp the key into the
 * visitor shim, so no protocol change carries it.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'

/** Largest file one download may serve. */
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024

const MIME_BY_EXT = new Map([
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.tsv', 'text/tab-separated-values; charset=utf-8'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.doc', 'application/msword'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pdf', 'application/pdf'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.yml', 'text/yaml; charset=utf-8'],
  ['.yaml', 'text/yaml; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.zip', 'application/zip'],
  ['.gz', 'application/gzip'],
  ['.mp4', 'video/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
])

export function mimeOf(name) {
  const at = name.lastIndexOf('.')
  if (at === -1) return 'application/octet-stream'
  return MIME_BY_EXT.get(name.slice(at).toLowerCase()) ?? 'application/octet-stream'
}

/** attachment disposition with an UTF-8 form plus an ASCII fallback. */
export function dispositionOf(name) {
  const clean = String(name ?? '').replace(/[\r\n]/g, ' ').trim() || 'download'
  const fallback = clean.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(clean)}`
}

/**
 * Shared secret gating the host's file route. Derived from the host id only,
 * so it survives token regeneration and needs no protocol change: the relay
 * derives the same value from the hello hostId to stamp the visitor shim.
 */
export function fileRouteKey(hostId) {
  return createHash('sha256').update(`dsh-remote-file:v1:${hostId}`).digest('hex').slice(0, 32)
}

/** Constant-time-ish comparison for short hex strings. */
function keyMatches(given, expected) {
  const a = Buffer.from(String(given ?? ''))
  const b = Buffer.from(String(expected ?? ''))
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < b.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Register the download route on the host web server.
 * @param services { webServer: object with register(route) → disposer }
 * @param key string from fileRouteKey(identity.hostId)
 * @param log fn(kind, text)
 * @returns disposer
 */
export function registerFileRoute({ webServer, key, log = () => {} }) {
  return webServer.register({
    kind: 'prefix',
    path: '/dsh-remote-file',
    handler: (req, res) => {
      try {
        void handle(req, res)
      } catch (error) {
        log('file-route', `下载路由处理异常（已隔离）: ${error?.message ?? error}`)
        try { res.writeHead(500).end() } catch { try { res.destroy() } catch { /* gone */ } }
      }
    },
  })

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const send = (status, text) => {
      if (res.headersSent) { try { res.destroy() } catch { res.end() } ; return }
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(`${text}\n`)
    }
    if (!url.pathname.startsWith('/dsh-remote-file')) return send(404, 'not found')
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'method not allowed')
    // Loopback strangers and forged pages must not read files; only requests
    // carrying the key survive (the visitor shim stamps it, tunnel or direct).
    const given = url.searchParams.get('k') ?? req.headers['x-dsh-remote-key'] ?? ''
    if (!keyMatches(given, key)) return send(403, 'bad download key')
    const filePath = url.searchParams.get('path') ?? ''
    if (!filePath || !filePath.startsWith('/') || filePath.includes('\0')) return send(400, 'path must be absolute')
    let info
    try {
      info = await stat(filePath)
    } catch {
      return send(404, 'file not found')
    }
    if (!info.isFile()) return send(404, 'not a regular file')
    if (info.size > MAX_DOWNLOAD_BYTES) return send(413, 'file too large')
    const name = filePath.split('/').pop() || 'download'
    let stream
    try {
      stream = createReadStream(filePath)
    } catch (error) {
      return send(404, `file unreadable: ${error?.message ?? error}`)
    }
    res.writeHead(200, {
      'Content-Type': mimeOf(name),
      'Content-Length': String(info.size),
      'Content-Disposition': dispositionOf(name),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    stream.on('error', (error) => {
      log('file-route', `下载流中断: ${error?.message ?? error}`)
      try { res.destroy() } catch { res.end() }
    })
    req.on('close', () => { try { stream.destroy() } catch { /* gone */ } })
    if (req.method === 'HEAD') {
      stream.destroy()
      res.end()
      return
    }
    stream.pipe(res)
  }
}
