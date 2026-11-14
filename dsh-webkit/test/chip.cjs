'use strict'
// Pill placement test.
//
// The pill may not cover the annotation pill that shares the composer's
// top-right corner: when a `[data-annotation-chip]` layer already sits on that
// row, this pill has to move beside it (or above it when there is no room),
// and it must fall back to the plain corner anchor when the neighbour is gone.

const fs = require('fs')
const path = require('path')
const { El, document, window, timers, MutationObserver, body } = require('./stub.cjs')

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`)
}

const CARD = { left: 400, top: 600, width: 400, height: 100 }
const PILL = { width: 70, height: 22 }
const NEIGHBOUR = { width: 90, height: 22 }

// ── host toolbar, so the trigger scan finds a toolbar and stays quiet ──
const root = new El('div')
root.className = 'bZwPEG_root'
const form = new El('form')
form.className = 'bZwPEG_toolbar'
const addressBox = new El('div')
addressBox.className = 'bZwPEG_addressBox'
const address = new El('input')
address.setAttribute('placeholder', '输入 HTTP(S) 地址')
address.setAttribute('aria-label', '输入 HTTP(S) 地址')
addressBox.appendChild(address)
const external = new El('button')
external.setAttribute('type', 'button')
external.setAttribute('aria-label', '在系统里浏览器打开')
form.appendChild(addressBox)
form.appendChild(external)
const viewport = new El('div')
const frame = new El('iframe')
frame.setAttribute('data-sidebar-browser-frame', 'iframe')
viewport.appendChild(frame)
root.appendChild(form)
root.appendChild(viewport)
body.appendChild(root)

const composerCard = new El('div')
composerCard.setAttribute('data-composer-card', '')
composerCard.setRect(CARD)
body.appendChild(composerCard)

// ── draft with one reference chip, so the pill has something to show ──
const REFERENCE = '## Element 1\n\nURL: https://example.com/\nSelector: div > p\n\nText:\n```\nhi\n```'
const occurrences = [{
  occurrenceId: 'occ-1',
  source: 'reference',
  ref: REFERENCE,
  label: '元素 p',
  offset: 0,
  length: '元素 p'.length,
  clipboardText: '元素 p',
}]
const listeners = new Set()
const fakeInput = {
  state: {
    getSnapshot: () => ({
      draft: '元素 p ',
      draftRev: 1,
      phase: 'plain',
      occurrences: occurrences.map((occ) => ({ ...occ })),
    }),
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  },
  insertReference: () => false,
  insertText: () => true,
}

const ctx = {
  locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
  sessions: { scope: () => ({}), list: { getSnapshot: () => ({ current: 'session-1' }) } },
  conversation: { input: { for: () => fakeInput } },
  get: (name) => (name === 'conversation' ? ctx.conversation : undefined),
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
    for (const entry of timers.slice()) {
      try { entry.fn(0) } catch (error) { /* interval bodies are best-effort */ }
    }
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }
  await flush()

  const pill = document.querySelectorAll('[data-webkit-chip]')[0]
  if (pill === undefined) {
    console.error('FAIL: the pill was never created')
    process.exit(1)
  }
  // A real pill is ~70×22; the stub would otherwise report 320×40 for everything.
  pill.setRect({ left: 0, top: 0, width: PILL.width, height: PILL.height })

  const position = () => {
    const left = Number.parseFloat(pill.style.left)
    const top = Number.parseFloat(pill.style.top)
    return { left, top, right: left + PILL.width, bottom: top + PILL.height }
  }

  // ── 1. nobody else on the corner: anchor to the card's top-right ──
  await flush()
  const alone = position()
  check('pill is visible with one chip in the draft', pill.style.display === 'flex', pill.style.display)
  check('pill anchors to the composer corner', alone.left === CARD.left + CARD.width - PILL.width - 12, `left=${alone.left}`)
  check('pill sits just above the composer', alone.top === CARD.top - PILL.height - 6, `top=${alone.top}`)

  // ── 2. an annotation pill holds the corner: step to its left ──
  const neighbour = new El('div')
  neighbour.setAttribute('data-annotation-chip', '')
  neighbour.setRect({ left: 690, top: 566, width: NEIGHBOUR.width, height: NEIGHBOUR.height })
  body.appendChild(neighbour)
  await flush()
  const beside = position()
  check('pill moves out from under the annotation pill', beside.left < alone.left, `left=${beside.left} was=${alone.left}`)
  check('pill clears the annotation pill with a gap', beside.right <= 690 - 8, `right=${beside.right} neighbour.left=690`)
  check('pill keeps the same row', beside.top === alone.top, `top=${beside.top}`)

  // ── 3. no room on that row: stack above the annotation pill ──
  neighbour.setRect({ left: 20, top: 566, width: NEIGHBOUR.width, height: NEIGHBOUR.height })
  await flush()
  const stacked = position()
  check('pill stacks above when the row is full', stacked.bottom <= 566 - 6, `bottom=${stacked.bottom}`)
  check('pill stays on screen when stacking', stacked.left >= 8 && stacked.left + PILL.width <= window.innerWidth - 8, `left=${stacked.left}`)

  // ── 4. the neighbour disappears: return to the corner ──
  body.removeChild(neighbour)
  await flush()
  const restored = position()
  check('pill returns to the corner when the neighbour leaves', restored.left === alone.left, `left=${restored.left}`)
  check('pill kept a single layout pass of its own', pill.style.display === 'flex', pill.style.display)

  dispose()
  const leftover = document.querySelectorAll('[data-webkit-chip]').length
  check('pill is removed on dispose', leftover === 0, `left=${leftover}`)

  const failed = results.filter((entry) => !entry.ok).length
  if (failed > 0) {
    console.log(`\nPILL LAYOUT FAILED (${failed}/${results.length})`)
    process.exit(1)
  }
  console.log(`\nPILL LAYOUT PASSED (${results.length}/${results.length})`)
})()
