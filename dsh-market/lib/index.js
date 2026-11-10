/**
 * @skillpie/dsh-market — Cordis entry (host half).
 *
 * Serves POST /dsh-market/api for the browser panel:
 *   { action: 'search',   query, limit }  → { ok, results }
 *   { action: 'installed' }               → { ok, skills }
 *   { action: 'install',  name }          → { ok, result }
 *   { action: 'detail',   name }          → { ok, detail }
 *   { action: 'ping' }                    → { ok, time }
 *
 * The route is same-origin only and lives behind the web GUI's own session
 * auth, so installing from the panel is always an authenticated user action.
 * The market work lives in market.js; this file only wires transport, config
 * and disposal.
 */
import { join } from 'node:path'
import { createMarket, DEFAULT_BASE_URL, DEFAULT_SKILL_ROOT, SkillMarketError } from './market.js'

export const ROUTE = '/dsh-market/api'
const MAX_BODY = 64 * 1024

/** One issue in the Standard Schema config vocabulary. */
const issue = (message, ...path) => ({ message, path: path.length ? path : undefined })

/**
 * Plugin config. Defaults: skillRoot ~/.agents/skills, baseUrl
 * https://skillpie.cn. Both accept a row override in cordis.patch.yml.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-market',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [issue('expected an object')] }
      const issues = []
      const value = {}
      for (const key of ['skillRoot', 'baseUrl']) {
        const raw = input[key]
        if (raw === undefined) continue
        if (typeof raw !== 'string' || !raw.trim()) {
          issues.push(issue(`expected a non-empty string`, key))
          continue
        }
        value[key] = raw.trim()
      }
      if (value.baseUrl !== undefined) {
        try { new URL(value.baseUrl) } catch {
          issues.push(issue('expected an absolute http(s) URL', 'baseUrl'))
          delete value.baseUrl
        }
      }
      return issues.length ? { issues } : { value }
    },
  },
}

/** Read a small JSON request body. */
function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY) {
        req.destroy()
        rejectPromise(new Error('request body too large'))
      }
    })
    req.on('end', () => {
      if (!data.trim()) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(data))
      } catch {
        rejectPromise(new Error('invalid JSON body'))
      }
    })
    req.on('error', rejectPromise)
  })
}

async function dispatch(market, body) {
  const action = typeof body?.action === 'string' ? body.action : ''
  switch (action) {
    case 'search':
      return { ok: true, results: await market.search(body.query, body.limit) }
    case 'installed':
      return { ok: true, skills: await market.installed() }
    case 'install':
      return { ok: true, result: await market.install(body.name) }
    case 'detail':
      return { ok: true, detail: await market.detail(body.name) }
    case 'ping':
      return { ok: true, time: Date.now() }
    default:
      throw new Error(`unknown action: ${action || '(empty)'}`)
  }
}

/** Cordis plugin entry (service-object export form). */
export default {
  name: '@skillpie/dsh-market',
  Config,
  inject: [],
  apply(ctx, config = null) {
    const cfg = config ?? {}
    const market = createMarket({
      skillRoot: cfg.skillRoot ?? DEFAULT_SKILL_ROOT,
      baseUrl: cfg.baseUrl ?? DEFAULT_BASE_URL,
    })

    ctx.effect(() => () => {}, '@skillpie/dsh-market: lifetime')

    // HTTP carrier for the browser panel. Optional: headless assemblies keep
    // the module loadable without the web layer.
    ctx.inject(['webServer'], (child) => {
      child.effect(() => child.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          const send = (status, payload) => {
            res.writeHead(status, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            res.end(JSON.stringify(payload))
          }
          // Same-origin only: a cross-origin fetch with a "simple" content
          // type would skip preflight and could otherwise trigger writes.
          const origin = req.headers?.origin
          if (typeof origin === 'string' && origin !== '') {
            let sameOrigin = false
            try { sameOrigin = new URL(origin).host === req.headers.host } catch { sameOrigin = false }
            if (!sameOrigin) {
              send(403, { ok: false, error: 'cross-origin request refused' })
              return
            }
          }
          if (req.method !== 'POST') {
            send(200, { ok: true, service: 'dsh-market', route: ROUTE })
            return
          }
          try {
            send(200, await dispatch(market, await readBody(req)))
          } catch (error) {
            send(200, { ok: false, error: error?.message ?? String(error) })
          }
        },
      }), '@skillpie/dsh-market: http api')
    })
  },
}

export { createMarket, DEFAULT_BASE_URL, DEFAULT_SKILL_ROOT, SkillMarketError, dispatch }
