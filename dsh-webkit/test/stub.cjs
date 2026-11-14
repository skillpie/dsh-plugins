'use strict'
// Shared DOM stub for the headless tests: a tiny element model plus the
// document/window surface the plugin touches.

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
  const re = /\.([A-Za-z0-9_-]+)|\[([A-Za-z0-9_:-]+)(?:(\*?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g
  let r
  while ((r = re.exec(rest))) {
    if (r[1]) classes.push(r[1])
    else attrs.push({ name: r[2], op: r[3] ?? null, value: r[4] ?? r[5] ?? r[6] ?? null })
  }
  return { tag, classes, attrs }
}

function matchCompound(el, c) {
  if (typeof el.hasAttribute !== 'function') return false
  if (c.tag && (el.tagName || '').toUpperCase() !== c.tag) return false
  for (const cls of c.classes) if (!el.hasClass(cls)) return false
  for (const a of c.attrs) {
    if (!el.hasAttribute(a.name)) return false
    if (a.value === null) continue
    const actual = el.getAttribute(a.name)
    if (a.op === '*=') {
      if (!String(actual).includes(a.value)) return false
    } else if (actual !== a.value) return false
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
  // Text nodes carry no `children`; walking must not assume an element.
  const children = Array.isArray(root.children) ? root.children : []
  for (const child of children) {
    out.push(child)
    descendants(child, out)
  }
  return out
}

class TextNode {
  constructor(value) {
    this.nodeType = 3
    this.nodeValue = String(value)
    this.parentElement = null
  }
  get textContent() { return this.nodeValue }
  set textContent(v) { this.nodeValue = String(v) }
  cloneNode() { return new TextNode(this.nodeValue) }
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
    this._textContent = ''
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
  // Setting textContent replaces the children in a real DOM; code that clears a
  // container this way would silently accumulate rows under a looser stub.
  get textContent() {
    if (this.children.length > 0) return this.children.map((child) => child.textContent).join('')
    return this._textContent
  }
  set textContent(v) {
    this._textContent = String(v)
    for (const child of this.children) child.parentElement = null
    this.children = []
    // A real DOM keeps the string in a text node child, not on the element; the
    // folding code walks those nodes to empty a range, so the stub must too.
    if (this._textContent !== '') {
      const node = new TextNode(this._textContent)
      node.parentElement = this
      this.children.push(node)
    }
  }
  get childNodes() { return this.children }
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
  /** Real DOM `Element.append`; the viewport pill builds its row this way. */
  append(...nodes) {
    for (const node of nodes) this.appendChild(node)
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
  // 真实 DOM 的兄弟定位:位置守卫(previousElementSibling !== anchor)靠它防止
  // 重复插入。stub 早先缺这俩 getter,守卫恒不成立,同一节点会被反复 splice
  // 进父 children,querySelectorAll 计数翻倍且 remove 只摘掉第一份。
  get previousElementSibling() {
    const parent = this.parentElement
    if (!parent) return null
    const i = parent.children.indexOf(this)
    return parent.children[i - 1] ?? null
  }
  get nextElementSibling() {
    const parent = this.parentElement
    if (!parent) return null
    const i = parent.children.indexOf(this)
    return parent.children[i + 1] ?? null
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
  /** Gives this element a real layout box; tests that assert geometry need it. */
  setRect(rect) { this._rect = rect; return this }
  getBoundingClientRect() {
    const r = this._rect
    if (r === undefined) return { x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 40, width: 320, height: 40 }
    return {
      x: r.left,
      y: r.top,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      right: r.left + r.width,
      bottom: r.top + r.height,
    }
  }
  get offsetWidth() { return this._rect === undefined ? 320 : this._rect.width }
  get offsetHeight() { return this._rect === undefined ? 40 : this._rect.height }
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
// localStorage 的内存实现:同进程内可写可读,客户端插件的「记住上次值」
// (例如自由尺寸的记忆键)要靠它验证;跨套件天然隔离(各进程各一份)。
const localStorageStore = new Map()
const localStorage = {
  getItem: (key) => (localStorageStore.has(String(key)) ? localStorageStore.get(String(key)) : null),
  setItem: (key, value) => { localStorageStore.set(String(key), String(value)) },
  removeItem: (key) => { localStorageStore.delete(String(key)) },
}

const window = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  document,
  location: { href: 'http://127.0.0.1:19387/' },
  // window 级监听要可记录(Esc 关条/关下拉走 window keydown),否则该路径测不到。
  listeners: new Map(),
  addEventListener(type, fn) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(fn)
    this.listeners.set(type, set)
  },
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) },
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
  clearTimeout() {},
  setInterval: (fn, ms) => { timers.push({ fn, ms: ms || 0, interval: true }); return timers.length },
  clearInterval() {},
  requestAnimationFrame: (fn) => { timers.push({ fn, ms: 0 }); return timers.length },
  cancelAnimationFrame() {},
  getComputedStyle: () => ({ getPropertyValue: () => '', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', display: 'block', fontFamily: 'sans-serif', fontSize: '16px', fontWeight: '400' }),
  localStorage,
  open() {},
}
const MutationObserver = class {
  constructor() {}
  observe() {}
  disconnect() {}
}

module.exports = { El, matches, descendants, document, window, timers, MutationObserver, head, html, body, localStorage }
