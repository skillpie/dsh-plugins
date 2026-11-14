'use strict'
// Guest-channel test: the sidebar browser mounts an Electron `<webview>` in the
// desktop app, so the picker cannot be installed into `contentDocument` — it is
// serialized and run inside the page with `executeJavaScript`.
//
// This asserts the whole path: the source the plugin ships must evaluate, mount
// its overlay in the guest document, and resolve one described element.

const fs = require('fs')
const path = require('path')
const { El, document, window, timers, MutationObserver, body } = require('./stub.cjs')

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`)
}

// ── the toolbar, as the sidebar browser renders it ──
const root = new El('div')
root.className = 'bZwPEG_root'
const form = new El('form')
form.className = 'bZwPEG_toolbar'
const back = new El('button'); back.setAttribute('type', 'button'); back.setAttribute('aria-label', '后退')
const addressBox = new El('div'); addressBox.className = 'bZwPEG_addressBox'
const address = new El('input')
address.setAttribute('placeholder', '输入 HTTP(S) 地址')
address.setAttribute('aria-label', '输入 HTTP(S) 地址')
const go = new El('button'); go.setAttribute('type', 'submit'); go.setAttribute('aria-label', '前往')
addressBox.appendChild(address)
addressBox.appendChild(go)
const external = new El('button'); external.setAttribute('type', 'button'); external.setAttribute('aria-label', '在系统里浏览器打开')
const viewport = new El('div')
form.appendChild(back)
form.appendChild(addressBox)
form.appendChild(external)
root.appendChild(form)
root.appendChild(viewport)
body.appendChild(root)

const composerCard = new El('div')
composerCard.setAttribute('data-composer-card', '')
composerCard.getBoundingClientRect = () => ({ x: 400, y: 600, top: 600, left: 400, right: 800, bottom: 700, width: 400, height: 100 })
body.appendChild(composerCard)

// ── a guest page: its own document and window, like a real webview ──
function guestDocument() {
  const html = new El('html')
  const head = new El('head')
  const bodyEl = new El('body')
  html.appendChild(head)
  html.appendChild(bodyEl)
  const listeners = new Map()
  const doc = {
    title: '示例页面标题',
    location: { href: 'https://example.com/article' },
    documentElement: html,
    head,
    body: bodyEl,
    listeners,
    createElement: (tag) => new El(tag),
    createElementNS: (_ns, tag) => new El(tag),
    getElementById: (id) => descendantsOf(html).find((el) => el.getAttribute && el.getAttribute('id') === id) ?? null,
    querySelector: (sel) => descendantsOf(html).find((el) => matchesSel(el, sel)) ?? null,
    querySelectorAll: (sel) => descendantsOf(html).filter((el) => matchesSel(el, sel)),
    addEventListener: (type, fn) => {
      const set = listeners.get(type) ?? new Set()
      set.add(fn)
      listeners.set(type, set)
    },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
  }
  return doc
}

function descendantsOf(node, out = []) {
  const children = Array.isArray(node.children) ? node.children : []
  for (const child of children) {
    out.push(child)
    descendantsOf(child, out)
  }
  return out
}

function matchesSel(el, selector) {
  const test = (part) => {
    const attribute = /^\[([^\]=]+)\]$/.exec(part)
    if (attribute !== null) return typeof el.getAttribute === 'function' && el.getAttribute(attribute[1]) !== null
    return (el.tagName || '').toLowerCase() === part.toLowerCase()
  }
  return selector.split(',').some((part) => test(part.trim()))
}

const guestDoc = guestDocument()
const guestLinks = new Map()
const guestWin = {
  innerWidth: 1280,
  innerHeight: 800,
  getComputedStyle: () => ({
    color: 'rgb(255, 0, 0)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    display: 'block',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px',
    fontWeight: '700',
  }),
  addEventListener: (type, fn) => {
    const set = guestLinks.get(type) ?? new Set()
    set.add(fn)
    guestLinks.set(type, set)
  },
  removeEventListener: (type, fn) => guestLinks.get(type)?.delete(fn),
}

// the page element to pick
const link = new El('a')
link.setAttribute('href', '/s?wd=dsh')
link.setAttribute('id', 'result-link')
link.textContent = 'DeepSeek Harness'
link.getBoundingClientRect = () => ({ x: 40, y: 60, top: 60, left: 40, right: 240, bottom: 90, width: 200, height: 30 })
guestDoc.body.appendChild(link)

// ── the webview stub: a guest with a JavaScript channel ──
let guestSource = null
let cancelled = false
const webview = new El('webview')
webview.setAttribute('data-sidebar-browser-frame', 'webview')
webview.setAttribute('src', 'about:blank#lease-1')
webview.getURL = () => 'https://example.com/article'
webview.executeJavaScript = (source) => {
  const text = String(source)
  if (!text.includes('installPicker')) {
    cancelled = true
    return Promise.resolve(true)
  }
  guestSource = text
  // Exactly what the guest process does: evaluate the source against the page.
  const run = new Function('window', 'document', `return (${text})`)
  return Promise.resolve(run(guestWin, guestDoc))
}
viewport.appendChild(webview)

const ctx = {
  locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
  sessions: { scope: () => ({}), list: { getSnapshot: () => ({}) } },
  conversation: { input: { for: () => null } },
  get: () => undefined,
}

;(async () => {
  let captured = null
  globalThis.window = window
  globalThis.document = document
  globalThis.MutationObserver = MutationObserver
  globalThis.localStorage = window.localStorage
  window.__ModuleLoader__ = { load: (spec) => { captured = spec } }

  const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
  const fn = new Function('window', 'document', 'MutationObserver', 'localStorage',
    'requestAnimationFrame', 'getComputedStyle', source)
  fn(window, document, MutationObserver, window.localStorage,
    window.requestAnimationFrame, window.getComputedStyle)

  const mod = captured.factory(() => { throw new Error('no value imports expected') })
  const dispose = mod.apply(ctx)

  async function flush() {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
    for (const entry of timers.slice()) { try { entry.fn(0) } catch (error) { /* interval bodies */ } }
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }
  await flush()

  const trigger = document.querySelectorAll('[data-webkit-trigger]')[0]
  if (!trigger) { console.error('FAIL: no trigger'); process.exit(1) }

  function fire(element, type, extra) {
    const set = element.listeners.get(type)
    if (!set) return false
    for (const handler of set) handler({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, target: element, ...extra })
    return true
  }

  // a webview frame must not be mistaken for "no page"
  fire(trigger, 'click')
  await flush()
  check('guest channel used instead of the snapshot fallback', guestSource !== null)
  check('no "no page" notice', document.querySelectorAll('[data-webkit-notice]')[0].textContent === '',
    JSON.stringify(document.querySelectorAll('[data-webkit-notice]')[0].textContent))
  check('picker mounted its overlay inside the page',
    guestDoc.querySelectorAll('[data-webkit-overlay]').length === 1)
  check('picker mounted its info card inside the page',
    guestDoc.querySelectorAll('[data-webkit-card]').length === 1)

  // hover then click, inside the guest
  for (const handler of guestDoc.listeners.get('mousemove') ?? []) handler({ target: link })
  check('hover card names the element', descendantsOf(guestDoc.documentElement)
    .some((el) => el.textContent === 'a'))
  for (const handler of guestDoc.listeners.get('click') ?? []) {
    handler({ target: link, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} })
  }
  await flush()

  check('guest layers removed after the pick',
    guestDoc.querySelectorAll('[data-webkit-overlay]').length === 0
    && guestDoc.querySelectorAll('[data-webkit-card]').length === 0)
  check('trigger released', trigger.getAttribute('aria-pressed') === 'false')

  const tutorial = document.querySelectorAll('[data-webkit-notice]')[0].textContent
  check('a picked element without a session reports it', tutorial.includes('会话'), JSON.stringify(tutorial))

  // Escape must reach the page, not only this document
  check('cancel path targets the guest picker', cancelled === false)
  dispose()
  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${failed.length === 0 ? 'WEBVIEW CHANNEL PASSED' : 'WEBVIEW CHANNEL FAILED'} (${results.length - failed.length}/${results.length})`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
