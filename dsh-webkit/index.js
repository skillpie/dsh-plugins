/**
 * Host half of dsh-webkit.
 *
 * The Client half picks elements out of the right-Sidebar browser. The browser
 * iframe is sandboxed with `allow-same-origin`, but it loads the *target*
 * origin, so a cross-origin page never exposes `contentDocument` to the DSH
 * page and no picker can run inside it. This route closes that gap: it fetches
 * the page server-side (no CORS, no page sandbox), strips everything that could
 * execute on the DSH origin, re-bases relative URLs onto the final address and
 * serves the result from the DSH origin itself. The Client half then mounts that
 * snapshot in an overlay iframe whose document the page *can* reach.
 *
 * The snapshot is served with `script-src 'none'`, so even a stripping miss
 * cannot run code on the application origin. The picker needs no script inside
 * the frame: it is parent-context code operating on the child document.
 */
const ROUTE_PREFIX = '/webkit'
const MAX_BYTES = 4 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000

/** Escapes a value for a double-quoted HTML attribute. */
function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * A failure the Client half can read back: the overlay iframe shows this page,
 * and the parent inspects `body[data-webkit-error]`.
 */
function errorPage(message) {
  const safe = escapeAttribute(message)
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<title>Webkit Snapshot</title>',
    '<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;',
    'font:13px/1.6 system-ui,sans-serif;color:#9b9b9b;background:transparent}</style>',
    `</head><body data-webkit-error="${safe}"><p>${safe}</p></body></html>`,
  ].join('')
}

/**
 * Removes every construct that could execute on the application origin.
 *
 * `script-src 'none'` already blocks execution, but stripping keeps the snapshot
 * honest: a stripped page cannot phone home, cannot navigate the top frame
 * through `<meta http-equiv="refresh">`, and cannot smuggle markup through a
 * same-origin `srcdoc` child.
 */
function stripActiveContent(html) {
  let out = html
  // Scripts, with and without bodies, in any attribute order.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  out = out.replace(/<script\b[^>]*\/?>/gi, '')
  // A CSP meta would apply the *target's* policy to our snapshot; a refresh meta
  // could navigate this frame away (or to a javascript: URL).
  out = out.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?(?:content-security-policy(?:-report-only)?|refresh)["']?[^>]*>/gi,
    '',
  )
  // An existing <base> would fight the one this route injects.
  out = out.replace(/<base\b[^>]*>/gi, '')
  // Same-origin child documents: srcdoc content inherits our origin.
  out = out.replace(/\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Inline event handlers.
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Script-bearing URLs.
  out = out.replace(
    /\s(href|src|action|formaction|xlink:href)\s*=\s*(?:"\s*(?:javascript|data:text\/html)[^"]*"|'\s*(?:javascript|data:text\/html)[^']*')/gi,
    ' $1="#"',
  )
  return out
}

/** Re-bases relative URLs on the address the page actually resolved to. */
function withBase(html, baseUrl) {
  const head = `<base href="${escapeAttribute(baseUrl)}">`
    + '<meta name="referrer" content="no-referrer">'
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (tag) => tag + head)
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (tag) => tag + head)
  return head + html
}

/** Decodes bytes using the response charset, then the document's own meta. */
function decodeBody(buffer, contentType) {
  let charset = /charset\s*=\s*"?([\w-]+)/i.exec(contentType ?? '')?.[1]
  if (charset === undefined) {
    const head = new TextDecoder('latin1').decode(buffer.subarray(0, 4096))
    charset = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1]
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

/**
 * Serves one snapshot per request.
 * @param req - the HTTP request; `url` carries `?url=<encoded target>`.
 * @param res - the HTTP response.
 */
async function serveSnapshot(req, res) {
  const fail = (message) => {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "script-src 'none'; object-src 'none'; base-uri *; frame-ancestors 'self'",
      'x-content-type-options': 'nosniff',
    })
    res.end(errorPage(message))
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fail('仅支持 GET')
    return
  }

  const requested = new URL(req.url ?? '/', 'http://dsh.internal').searchParams.get('url')
  if (requested === null || requested === '') {
    fail('缺少 url 参数')
    return
  }

  let target
  try {
    target = new URL(requested)
  } catch {
    fail('url 参数不是合法地址')
    return
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    fail(`不支持的协议 ${target.protocol}`)
    return
  }

  let response
  try {
    response = await fetch(target.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Webkit/1.0',
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`抓取失败：${reason}`)
    return
  }

  if (!response.ok) {
    fail(`目标返回 HTTP ${response.status}`)
    return
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    fail(`该地址不是 HTML 页面（${contentType || '未知类型'}）`)
    return
  }

  const declared = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    fail(`页面过大（${Math.round(declared / 1024)} KB，上限 ${MAX_BYTES / 1024 / 1024} MB）`)
    return
  }

  let buffer
  try {
    buffer = await response.arrayBuffer()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`读取失败：${reason}`)
    return
  }
  if (buffer.byteLength > MAX_BYTES) {
    fail(`页面过大（${Math.round(buffer.byteLength / 1024)} KB，上限 ${MAX_BYTES / 1024 / 1024} MB）`)
    return
  }

  const finalUrl = response.url === '' ? target.href : response.url
  const html = withBase(stripActiveContent(decodeBody(buffer, contentType)), finalUrl)

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    // Belt and braces: no script of any kind may run in this document, and only
    // the application origin may frame it.
    'content-security-policy': "script-src 'none'; object-src 'none'; base-uri *; frame-ancestors 'self'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(html)
}

/** Services the Client half reads a snapshot through. */
export const inject = ['webServer']

/**
 * Mounts the snapshot route.
 * @param ctx - the Host plugin context.
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: `${ROUTE_PREFIX}/snapshot`,
      handler: (req, res) => serveSnapshot(req, res),
    }),
    'dsh-webkit: snapshot route',
  )
}
