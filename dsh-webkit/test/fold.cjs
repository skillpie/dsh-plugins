'use strict'
// Sent-message folding test.
//
// The element form has to reach the model verbatim, so it necessarily sits in
// the user's own message text. Once the bubble renders, that form is far too
// tall to leave expanded: the bubble keeps what the user wrote plus a compact
// "元素 ×N" chip, and the form itself is only readable by hovering that chip —
// never by a click-to-expand control.

const fs = require('fs')
const path = require('path')
const { El, document, window, timers, MutationObserver, body } = require('./stub.cjs')

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`)
}

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
root.appendChild(form)
body.appendChild(root)

const BLOCK = [
  '## Element 1',
  '',
  'URL: https://example.com/',
  'Title: Example',
  'Tag: div',
  'Role: ',
  'Accessible name: ',
  'Selector: body > div',
  'XPath: /html/body/div[1]',
  'Attributes:',
  'Color: #000000',
  'Background: #FFFFFF',
  'Font: 16px system-ui',
  'Font weight: 400',
  'Display: block',
  'Rect: x=0, y=0, width=10, height=10',
  'Text:',
  '```',
  'hello',
  '```',
  'Nearby context:',
  '```',
  'hello',
  '```',
  'HTML excerpt:',
  '```html',
  '<div>hello</div>',
  '```',
].join('\n')

const QUESTION = '这段是什么？'

// ── 1. a bubble carrying one element block plus the user's own question ──
const bubble = new El('div')
bubble.className = 'zz_bubble zz_plain'
bubble.textContent = `${BLOCK}\n\n${QUESTION}`
body.appendChild(bubble)

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
  const emptyInput = {
    state: {
      getSnapshot: () => ({ draft: '', draftRev: 1, phase: 'plain', occurrences: [] }),
      subscribe: () => () => {},
    },
    insertReference: () => false,
    insertText: () => true,
  }
  const dispose = mod.apply({
    locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
    sessions: { scope: () => ({}), list: { getSnapshot: () => ({ current: 'session-1' }) } },
    conversation: { input: { for: () => emptyInput } },
    get: () => undefined,
  })

  async function flush() {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
    for (const entry of timers.slice()) {
      try { entry.fn(0) } catch (error) { /* interval bodies are best-effort */ }
    }
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }
  await flush()

  const text = () => bubble.textContent

  // ── 2. the form is gone from the bubble, the user's own words stay ──
  check('the element form no longer renders in the bubble', !text().includes('## Element 1'), JSON.stringify(text().slice(0, 40)))
  check('the attribute block is gone too', !text().includes('HTML excerpt:'), text().includes('HTML excerpt:') ? 'still there' : 'gone')
  check('the user kept their own question', text().includes(QUESTION), text())
  check('no stray fences are left behind', !text().includes('```'), 'clean')

  // ── 3. a compact chip stands in for the form ──
  const chip = bubble.querySelector('[data-webkit-sent]')
  check('a chip marks what the message carried', chip !== null, chip === null ? 'missing' : 'present')
  check('the chip counts the elements', (chip?.textContent ?? '') === '元素 ×1', chip?.textContent)
  check('the chip is part of the message text', text().includes('元素 ×1'), JSON.stringify(text().trim()))
  check('no click-to-expand control exists', bubble.querySelector('[data-webkit-fold-toggle]') === null, 'none')

  // ── 4. hovering the chip is the only way to read it back ──
  const tip = () => document.querySelectorAll('[data-webkit-tip]')[0]
  const fire = (el, type) => { for (const handler of el?.listeners?.get(type) ?? []) handler({ preventDefault() {}, stopPropagation() {} }) }
  fire(chip, 'pointerenter')
  await flush()
  const panel = tip()
  check('hovering the chip opens a panel', panel?.style.display === 'block', panel?.style.display)
  check('the panel names the element count', (panel?.textContent ?? '').includes('网页元素（1 个）'), panel?.textContent)
  check('the panel lists the stored selector', (panel?.textContent ?? '').includes('body > div'), panel?.textContent)
  check('the panel offers no editing actions', (panel?.querySelectorAll('[data-webkit-remove]') ?? []).length === 0, 'read-only')

  fire(chip, 'pointerleave')
  for (const entry of timers.slice()) { try { entry.fn(0) } catch (error) { /* best-effort */ } }
  await flush()
  check('leaving the chip closes the panel', tip()?.style.display === 'none', tip()?.style.display)

  // ── 5. a second pass must not touch an already folded bubble ──
  const before = text()
  await flush()
  check('a second scan does not fold again', bubble.querySelectorAll('[data-webkit-sent]').length === 1, 'single chip')
  check('a second scan leaves the bubble untouched', text() === before, JSON.stringify(text().slice(0, 40)))

  // ── 6. bubbles without an element form are left alone ──
  const plain = new El('div')
  plain.className = 'zz_bubble zz_plain'
  plain.textContent = 'just a normal message'
  body.appendChild(plain)
  await flush()
  check('an ordinary bubble keeps its text', plain.textContent === 'just a normal message', plain.textContent)
  check('an ordinary bubble gets no chip', plain.querySelector('[data-webkit-sent]') === null, 'none')

  // ── 7. two elements in one message are both removed ──
  const two = new El('div')
  two.className = 'zz_bubble zz_plain'
  two.textContent = `${BLOCK}\n\n${BLOCK.replace('## Element 1', '## Element 2')}\n\n${QUESTION}`
  body.appendChild(two)
  await flush()
  check('both forms are hidden from the bubble', !two.textContent.includes('## Element'), 'clean')
  check('the question after them survives', two.textContent.includes(QUESTION), JSON.stringify(two.textContent.trim()))
  const twoChip = two.querySelector('[data-webkit-sent]')
  check('the chip counts both', (twoChip?.textContent ?? '') === '元素 ×2', twoChip?.textContent)
  fire(twoChip, 'pointerenter')
  await flush()
  check('the panel lists both, numbered', (tip()?.textContent ?? '').includes('网页元素（2 个）'), tip()?.textContent)

  dispose()
  const failed = results.filter((entry) => !entry.ok).length
  if (failed > 0) {
    console.log(`\nFOLD FAILED (${failed}/${results.length})`)
    process.exit(1)
  }
  console.log(`\nFOLD PASSED (${results.length}/${results.length})`)
})()
