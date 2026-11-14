'use strict'
// Headless smoke harness: run the Client half against a stub DOM that mirrors
// the sidebar browser toolbar, and assert the trigger lands between the address
// box and the "open in system browser" button.
process.on('unhandledRejection', (error) => { console.error('UNHANDLED REJECTION ->', error && error.stack) })
process.on('uncaughtException', (error) => { console.error('UNCAUGHT ->', error && error.stack) })
const fs = require('fs')
const path = require('path')

// ── a small selector engine: descendant chains of tag.class[attr][attr="v"] ──
function parseCompound(text) {
  const m = text.trim().match(/^([a-zA-Z*][a-zA-Z0-9-]*|\*)?(.*)$/)
  const tag = m[1] && m[1] !== '*' ? m[1].toUpperCase() : null
  const rest = m[2] || ''
  const classes = []
  const attrs = []
  const re = /\.([A-Za-z0-9_-]+)|\[([A-Za-z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g
  let r
  while ((r = re.exec(rest))) {
    if (r[1]) classes.push(r[1])
    else attrs.push({ name: r[2], value: r[3] ?? r[4] ?? r[5] ?? null })
  }
  return { tag, classes, attrs }
}

function matchCompound(el, c) {
  if (c.tag && (el.tagName || '').toUpperCase() !== c.tag) return false
  for (const cls of c.classes) if (!el.hasClass(cls)) return false
  for (const a of c.attrs) {
    if (!el.hasAttribute(a.name)) return false
    if (a.value !== null && el.getAttribute(a.name) !== a.value) return false
  }
  return true
}

function matchChain(el, chain) {
  if (!matchCompound(el, chain[chain.length - 1])) return false
  let i = chain.length - 2
  let node = el.parentElement
  while (i >= 0) {
    if (node === null) return false
    if (matchCompound(node, chain[i])) i -= 1
    node = node.parentElement
  }
  return true
}

function matches(el, selector) {
  return selector.split(',').some((part) => {
    const chain = part.trim().split(/\s+/).filter(Boolean).map(parseCompound)
    return matchChain(el, chain)
  })
}

function descendants(root, out = []) {
  for (const child of root.children) {
    out.push(child)
    descendants(child, out)
  }
  return out
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase()
    this.attributes = new Map()
    this.children = []
    this.parentElement = null
    this.listeners = new Map()
    this.dataset = new Proxy({}, {
      get: (t, k) => t[k],
      set: (t, k, v) => { t[k] = String(v); return true },
    })
    this._innerHTML = ''
    this.textContent = ''
    this.id = ''
    this._class = ''
    const self = this
    this.style = new Proxy({ cssText: '', display: '', left: '', top: '', width: '', height: '' }, {
      get: (t, k) => (k in t ? t[k] : ''),
      set: (t, k, v) => { t[k] = v; return true },
    })
    this.classList = {
      add: (...names) => { for (const n of names) self.addClass(n) },
      remove: (...names) => { for (const n of names) self.removeClass(n) },
      contains: (n) => self.hasClass(n),
    }
  }
  get innerHTML() { return this._innerHTML }
  set innerHTML(v) { this._innerHTML = String(v) }
  get className() { return this._class }
  set className(v) { this._class = String(v); this.setAttribute('class', this._class) }
  addClass(n) { const set = new Set(this._class.split(/\s+/).filter(Boolean)); set.add(n); this._class = [...set].join(' ') }
  removeClass(n) { const set = new Set(this._class.split(/\s+/).filter(Boolean)); set.delete(n); this._class = [...set].join(' ') }
  hasClass(n) { return this._class.split(/\s+/).includes(n) }
  setAttribute(k, v) { this.attributes.set(k, String(v)); if (k === 'class') this._class = String(v); if (k === 'id') this.id = String(v) }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null }
  hasAttribute(k) { return this.attributes.has(k) }
  removeAttribute(k) { this.attributes.delete(k) }
  appendChild(child) {
    if (child.parentElement) child.remove()
    child.parentElement = this
    this.children.push(child)
    // A stub iframe behaves like a same-origin frame that has finished loading:
    // the real snapshot overlay waits for `load`, which nothing would ever fire here.
    if (child.tagName === 'IFRAME' && !Object.getOwnPropertyDescriptor(child, 'contentDocument')) {
      Object.defineProperty(child, 'contentDocument', { get: () => document })
      Object.defineProperty(child, 'contentWindow', { get: () => window })
      setTimeout(() => {
        for (const handler of child.listeners.get('load') ?? []) {
          try { handler({}) } catch (error) { console.error('FAIL: load handler threw ->', error && error.stack) }
        }
      }, 0)
    }
    return child
  }
  insertBefore(child, ref) {
    const i = this.children.indexOf(ref)
    child.parentElement = this
    this.children.splice(i < 0 ? this.children.length : i, 0, child)
    return child
  }
  after(node) {
    const parent = this.parentElement
    if (!parent) return
    parent.insertBefore(node, parent.children[parent.children.indexOf(this) + 1] ?? null)
  }
  before(node) {
    const parent = this.parentElement
    if (!parent) return
    parent.insertBefore(node, this)
  }
  remove() {
    const parent = this.parentElement
    if (!parent) return
    const i = parent.children.indexOf(this)
    if (i >= 0) parent.children.splice(i, 1)
    this.parentElement = null
  }
  removeChild(node) { node.remove(); return node }
  addEventListener(type, fn) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(fn)
    this.listeners.set(type, set)
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
  querySelector(sel) { return descendants(this).find((el) => matches(el, sel)) ?? null }
  querySelectorAll(sel) { return descendants(this).filter((el) => matches(el, sel)) }
  closest(sel) {
    let node = this
    while (node) {
      if (matches(node, sel)) return node
      node = node.parentElement
    }
    return null
  }
  matches(sel) { return matches(this, sel) }
  cloneNode() { const copy = new El(this.tagName); copy._class = this._class; for (const [k, v] of this.attributes) copy.attributes.set(k, v); copy.textContent = this.textContent; for (const c of this.children) copy.appendChild(c.cloneNode()); return copy }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 40, width: 320, height: 40 } }
  get offsetWidth() { return 320 }
  get offsetHeight() { return 40 }
  focus() {}
  contains(other) { return descendants(this).includes(other) }
}

// ── the stub document/window ──
const html = new El('html')
const head = new El('head')
const body = new El('body')
html.appendChild(head)
html.appendChild(body)

const document = {
  documentElement: html,
  head,
  body,
  title: 'Stub page',
  createElement: (tag) => new El(tag),
  createTextNode: (text) => ({ nodeType: 3, textContent: text }),
  listeners: new Map(),
  addEventListener(type, fn) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(fn)
    this.listeners.set(type, set)
  },
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) },
  // Picker layers mount on documentElement as siblings of <head>/<body>, so the
  // document-level queries must range over the whole tree.
  querySelector: (sel) => [html, ...descendants(html)].find((el) => matches(el, sel)) ?? null,
  querySelectorAll: (sel) => [html, ...descendants(html)].filter((el) => matches(el, sel)),
  get activeElement() { return null },
}

const timers = []
const window = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  document,
  location: { href: 'http://127.0.0.1:19387/' },
  addEventListener() {},
  removeEventListener() {},
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
  requestAnimationFrame: (fn) => { timers.push({ fn, ms: 0 }); return timers.length },
  cancelAnimationFrame() {},
  getComputedStyle: () => ({ getPropertyValue: () => '', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', display: 'block', fontFamily: 'sans-serif', fontSize: '16px', fontWeight: '400' }),
  localStorage: { getItem: () => null, setItem() {} },
  open() {},
}
const MutationObserver = class {
  constructor() {}
  observe() {}
  disconnect() {}
}

// ── build the host toolbar exactly as the shipped browser renders it ──
const root = new El('div')
root.className = 'bZwPEG_root'
const form = new El('form')
form.className = 'bZwPEG_toolbar'
const back = new El('button'); back.setAttribute('aria-label', '后退'); back.setAttribute('type', 'button')
const reload = new El('button'); reload.setAttribute('aria-label', '重新加载'); reload.setAttribute('type', 'button')
const addressBox = new El('div'); addressBox.className = 'bZwPEG_addressBox'
const address = new El('input')
address.className = 'bZwPEG_address'
address.setAttribute('placeholder', '输入 HTTP(S) 地址')
address.setAttribute('aria-label', '输入 HTTP(S) 地址')
const go = new El('button'); go.setAttribute('type', 'submit'); go.setAttribute('aria-label', '前往'); go.className = 'bZwPEG_tool bZwPEG_addressGo'
addressBox.appendChild(address)
addressBox.appendChild(go)
const external = new El('button'); external.setAttribute('aria-label', '在系统里浏览器打开'); external.setAttribute('type', 'button')
const viewport = new El('div')
const frame = new El('iframe')
frame.setAttribute('data-sidebar-browser-frame', 'iframe')
frame.setAttribute('src', 'https://example.com/')
// Same-origin in the stub: the picker then runs against this document, which is
// exactly the in-place path used for pages the app itself serves.
Object.defineProperty(frame, 'contentDocument', { get: () => document })
Object.defineProperty(frame, 'contentWindow', { get: () => window })
viewport.appendChild(frame)
form.appendChild(back)
form.appendChild(reload)
form.appendChild(addressBox)
form.appendChild(external)
root.appendChild(form)
root.appendChild(viewport)
body.appendChild(root)

// a composer look-alike that must NOT receive a trigger
const composer = new El('div')
composer.setAttribute('data-composer-card', '')
const composerForm = new El('form')
const composerInput = new El('input')
composerInput.setAttribute('placeholder', '发消息')
composerInput.setAttribute('aria-label', '发消息')
composerForm.appendChild(composerInput)
composer.appendChild(composerForm)
body.appendChild(composer)

// ── load the Client half ──
;(async () => {
let captured = null
globalThis.window = window
globalThis.document = document
globalThis.MutationObserver = MutationObserver
globalThis.localStorage = window.localStorage
window.__ModuleLoader__ = { load: (spec) => { captured = spec } }

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
// Run the source exactly as ModuleLoader does: the factory receives only
// `require`, and the module record must be declared inside it. Passing an
// `exports` binding from outside would hide the class of bug that broke boot.
const fn = new Function('window', 'document', 'MutationObserver', 'localStorage',
  'requestAnimationFrame', 'getComputedStyle', source)
try {
  fn(window, document, MutationObserver, window.localStorage,
    window.requestAnimationFrame, window.getComputedStyle)
} catch (error) {
  console.error('FAIL: module body threw ->', error && error.stack)
  process.exit(1)
}

if (!captured) { console.error('FAIL: ModuleLoader.load was never called'); process.exit(1) }
if (captured.id !== 'dsh-webkit') { console.error('FAIL: id mismatch', captured.id); process.exit(1) }

let mod
try {
  mod = captured.factory(() => { throw new Error('no value imports expected') })
} catch (error) {
  console.error('FAIL: factory threw ->', error && error.stack)
  process.exit(1)
}
if (!mod || typeof mod !== 'object') { console.error('FAIL: factory returned no module object'); process.exit(1) }
console.log('exports keys   =', Object.keys(mod).join(',') || '(none)')
console.log('exports.name   =', mod.name)
console.log('exports.inject =', JSON.stringify(mod.inject))
if (mod.name !== 'dsh-webkit') { console.error('FAIL: missing/incorrect exports.name'); process.exit(1) }
if (!Array.isArray(mod.inject) || mod.inject.length === 0) { console.error('FAIL: missing exports.inject'); process.exit(1) }
if (typeof mod.apply !== 'function') { console.error('FAIL: missing exports.apply'); process.exit(1) }

const ctx = {
  locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
  sessions: { scope: () => ({}), list: { getSnapshot: () => ({}) } },
  conversation: { input: { for: () => null } },
  get: () => undefined,
}

let dispose
try {
  dispose = mod.apply(ctx)
} catch (error) {
  console.error('FAIL: apply threw ->', error && error.stack)
  process.exit(1)
}

// flush the queued rAF/timers so the initial scan runs
for (const entry of timers.slice()) {
  try { entry.fn(0) } catch (error) { console.error('FAIL: deferred callback threw ->', error && error.stack); process.exit(1) }
}

const triggers = document.querySelectorAll('[data-webkit-trigger]')
console.log('triggers mounted =', triggers.length)
const style = head.children.find((el) => el.id === 'dsh-webkit-style')
console.log('style injected =', Boolean(style), style ? style.textContent.length + ' chars' : '')

if (triggers.length !== 1) { console.error('FAIL: expected exactly one trigger'); process.exit(1) }
const trigger = triggers[0]
const siblings = form.children
const idx = siblings.indexOf(trigger)
console.log('form children  =', siblings.map((el) => el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : '')).join(' | '))
console.log('trigger index  =', idx, '(addressBox at', siblings.indexOf(addressBox) + ', external at', siblings.indexOf(external) + ')')
if (idx !== siblings.indexOf(addressBox) + 1) { console.error('FAIL: trigger is not immediately after the address box'); process.exit(1) }
// 自由尺寸键插在拾取键与外开按钮之间:地址框 → 拾取 → 自由尺寸 → 外开。
const vpTrigger = form.querySelector('[data-webkit-vp-trigger]')
if (vpTrigger === null) { console.error('FAIL: viewport trigger missing'); process.exit(1) }
if (siblings.indexOf(vpTrigger) !== idx + 1) { console.error('FAIL: viewport trigger is not immediately after the picker trigger'); process.exit(1) }
if (siblings.indexOf(external) !== idx + 2) { console.error('FAIL: external button is not immediately after the viewport trigger'); process.exit(1) }
if (trigger.getAttribute('type') !== 'button') { console.error('FAIL: trigger would submit the toolbar form'); process.exit(1) }
const pressed = trigger.getAttribute('aria-pressed')
if (pressed !== 'false') { console.error('FAIL: initial aria-pressed should be "false", got', pressed); process.exit(1) }
console.log('trigger class  =', JSON.stringify(trigger.className))
console.log('trigger html   =', (trigger.innerHTML ?? '').slice(0, 80) || '(svg built via DOM)')
console.log('trigger title  =', trigger.getAttribute('title'))
console.log('trigger label  =', trigger.getAttribute('aria-label'))

// Click path: with no session the plugin must warn, never throw.
const clickHandlers = trigger.listeners.get('click')
if (!clickHandlers || clickHandlers.size === 0) { console.error('FAIL: trigger has no click handler'); process.exit(1) }
try {
  for (const handler of clickHandlers) {
    handler({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} })
  }
} catch (error) {
  console.error('FAIL: click handler threw ->', error && error.stack)
  process.exit(1)
}
for (let i = 0; i < 12; i += 1) { await Promise.resolve() }
for (const entry of timers.slice()) { try { entry.fn(0) } catch (error) { console.error('FAIL: deferred callback threw after click ->', error && error.stack); process.exit(1) } }
for (let i = 0; i < 12; i += 1) { await Promise.resolve() }
await new Promise((r) => setTimeout(r, 25))
for (let i = 0; i < 12; i += 1) { await Promise.resolve() }
const early = document.querySelectorAll('[data-webkit-notice]')[0]
if (early && early.textContent) console.log('notice (early)     =', JSON.stringify(early.textContent))
console.log('DEBUG pressed      =', trigger.getAttribute('aria-pressed'))
console.log('DEBUG hint layer   =', JSON.stringify(document.querySelector('[data-webkit-hint]')?.textContent ?? null))
console.log('DEBUG notice layer =', JSON.stringify(document.querySelector('[data-webkit-notice]')?.textContent ?? null))
console.log('DEBUG all layers   =', document.querySelectorAll('[data-webkit-overlay],[data-webkit-card],[data-webkit-hint],[data-webkit-notice]').map((el) => el.getAttribute('data-webkit-overlay') !== null ? 'overlay' : el.getAttribute('data-webkit-card') !== null ? 'card' : el.getAttribute('data-webkit-hint') !== null ? 'hint' : 'notice').join(','))
const overlays = document.querySelectorAll('[data-webkit-overlay]')
const cards = document.querySelectorAll('[data-webkit-card]')
console.log('picker overlay     =', overlays.length, ' card =', cards.length)
if (overlays.length !== 1 || cards.length !== 1) {
  console.error('FAIL: picker did not mount its overlay and info card'); process.exit(1)
}
const keyHandlers = document.listeners.get('keydown')
console.log('keydown listeners  =', keyHandlers ? keyHandlers.size : 0)
if (!keyHandlers || keyHandlers.size === 0) { console.error('FAIL: no keydown listener while picking'); process.exit(1) }
let defaultPrevented = false
for (const handler of keyHandlers) {
  handler({ key: 'Escape', preventDefault() { defaultPrevented = true }, stopPropagation() {}, stopImmediatePropagation() {} })
}
await Promise.resolve()
for (let i = 0; i < 16; i += 1) await Promise.resolve()
await new Promise((r) => setTimeout(r, 5))
for (let i = 0; i < 16; i += 1) await Promise.resolve()
for (const entry of timers.slice()) { try { entry.fn(0) } catch (error) { console.error('FAIL: deferred callback threw after escape ->', error && error.stack); process.exit(1) } }
for (let i = 0; i < 16; i += 1) await Promise.resolve()
console.log('escape prevented   =', defaultPrevented)
console.log('overlay after Esc  =', document.querySelectorAll('[data-webkit-overlay]').length,
  ' card after Esc =', document.querySelectorAll('[data-webkit-card]').length)
if (document.querySelectorAll('[data-webkit-overlay]').length !== 0) { console.error('FAIL: overlay survived Escape'); process.exit(1) }
if (trigger.getAttribute('aria-pressed') !== 'false') { console.error('FAIL: trigger not reset after Escape'); process.exit(1) }

const notice = document.querySelectorAll('[data-webkit-notice]')[0]
console.log('notice after click =', JSON.stringify((notice && notice.textContent) || ''))
console.log('trigger pressed    =', trigger.getAttribute('aria-pressed'))

if (typeof dispose === 'function') { dispose(); console.log('dispose() ok, triggers left =', document.querySelectorAll('[data-webkit-trigger]').length) }
console.log('\nSMOKE TEST PASSED')
})().catch((error) => { console.error('FAIL: harness crashed ->', error && error.stack); process.exit(1) })
