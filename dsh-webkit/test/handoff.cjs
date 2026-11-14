'use strict'
// Hand-off test: another plugin composes its own block into the draft.
//
// The sibling plugin builds plain text and writes it with `setDraft`, which
// rewrites the draft from a string and therefore flattens any chip that was
// already there. Picking an element first and adding an annotation second would
// silently drop the element: the message would carry the flattened label text
// and none of the reference payload.
//
// What is asserted here:
//   1. the flatten really happens in the fixture (so the test is not vacuous),
//   2. the plugin notices it and puts the chip back, payload intact,
//   3. the sibling plugin's own block survives untouched,
//   4. it does not keep re-inserting on later unrelated writes,
//   5. the sent message still folds into a 元素 ×N chip.

const fs = require('fs')
const path = require('path')
const { El, document, window, timers, MutationObserver, body } = require('./stub.cjs')

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`)
}

// ── the host toolbar, exactly as the sidebar browser renders it ──
const root = new El('div')
root.className = 'bZwPEG_root'
const form = new El('form')
form.className = 'bZwPEG_toolbar'
const back = new El('button'); back.setAttribute('type', 'button'); back.setAttribute('aria-label', '后退')
const addressBox = new El('div'); addressBox.className = 'bZwPEG_addressBox'
const address = new El('input')
address.setAttribute('placeholder', '输入 HTTP(S) 地址')
address.setAttribute('aria-label', '输入 HTTP(S) 地址')
addressBox.appendChild(address)
const go = new El('button')
go.setAttribute('type', 'submit')
go.setAttribute('aria-label', '前往')
go.className = 'bZwPEG_tool bZwPEG_addressGo'
addressBox.appendChild(go)
const external = new El('button'); external.setAttribute('type', 'button'); external.setAttribute('aria-label', '在系统里浏览器打开')
const viewport = new El('div')
const frame = new El('iframe')
frame.setAttribute('data-sidebar-browser-frame', 'iframe')
frame.setAttribute('src', 'https://example.com/')
Object.defineProperty(frame, 'contentDocument', { get: () => document })
Object.defineProperty(frame, 'contentWindow', { get: () => window })
viewport.appendChild(frame)
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

// ── fake draft store ──
const occurrences = []
const edits = []
const draftState = { text: '', rev: 1 }
const listeners = new Set()

const fakeInput = {
  state: {
    getSnapshot: () => ({
      draft: draftState.text,
      draftRev: draftState.rev,
      phase: 'plain',
      occurrences: occurrences.map((occ) => ({ ...occ })),
    }),
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  },
  insertReference(reference, span) {
    // The host projects a chip to its `clipboardText` in the draft string.
    const text = reference.clipboardText === undefined ? reference.label : reference.clipboardText
    // Spans arrive in detect coordinates; this fixture keeps offsets in the
    // clipboard projection, so convert before recording.
    const clipSpot = detectToClipboard(span.start)
    const offset = clipSpot >= draftState.text.length ? draftState.text.length : clipSpot
    occurrences.push({
      occurrenceId: 'occ-' + (occurrences.length + 1),
      source: reference.source,
      ref: reference.ref,
      label: reference.label,
      offset,
      length: text.length,
      clipboardText: text,
    })
    draftState.text = draftState.text.slice(0, offset) + text + ' ' + draftState.text.slice(offset)
    draftState.rev += 1
    edits.push(['insertReference', reference.label])
    for (const fn of listeners) fn()
    return true
  },
  insertText(text, span) {
    edits.push(['insertText', text, span.start, span.end, span.draftRev])
    // `span` addresses the detect projection, where every chip is one character.
    const clipStart = detectToClipboard(span.start)
    if (text === '') {
      const index = occurrences.findIndex((occ) => occ.offset === clipStart)
      if (index >= 0) {
        const occ = occurrences[index]
        draftState.text = draftState.text.slice(0, occ.offset) + draftState.text.slice(occ.offset + occ.length)
        occurrences.splice(index, 1)
        for (const rest of occurrences) if (rest.offset > occ.offset) rest.offset -= occ.length
      } else {
        // Plain text: the span covers the run to drop, one character to one.
        const width = Math.max(0, span.end - span.start)
        const from = Math.min(clipStart, draftState.text.length)
        const to = Math.min(from + width, draftState.text.length)
        draftState.text = draftState.text.slice(0, from) + draftState.text.slice(to)
        for (const occ of occurrences) if (occ.offset >= to) occ.offset -= to - from
      }
    } else {
      const at = clipStart >= draftState.text.length ? draftState.text.length : clipStart
      draftState.text = draftState.text.slice(0, at) + text + draftState.text.slice(at)
      for (const occ of occurrences) if (occ.offset >= at) occ.offset += text.length
    }
    draftState.rev += 1
    for (const fn of listeners) fn()
    return true
  },
  /**
   * What the sibling plugin does: hand the store a whole new string. Chips do
   * not survive it — they become their clipboard text.
   */
  setDraft(next) {
    edits.push(['setDraft', next.length])
    draftState.text = next
    occurrences.length = 0
    draftState.rev += 1
    for (const fn of listeners) fn()
    return true
  },
}

function detectToClipboard(pos) {
  const sorted = [...occurrences].sort((a, b) => a.offset - b.offset)
  let clip = 0
  let detect = 0
  for (const occ of sorted) {
    const gap = occ.offset - clip
    if (pos <= detect + gap) return clip + (pos - detect)
    detect += gap + 1
    clip = occ.offset + occ.length
  }
  return clip + (pos - detect)
}

const ctx = {
  locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
  sessions: {
    scope: () => ({
      // The real scope carries an event bus; the plugin uses it for the plain
      // text insert (the leading space before a chip) on a non-empty draft.
      emit: (name, payload) => {
        if (name !== 'slash/input-insert-text') return
        fakeInput.insertText(payload.text, payload.span)
      },
    }),
    list: { getSnapshot: () => ({ current: 'session-1' }) },
  },
  conversation: { input: { for: () => fakeInput } },
  get: (name) => (name === 'conversation' ? ctx.conversation : undefined),
}

/** The opening sentence the sibling plugin writes, exactly as it ships. */
const ANNOTATION_HEAD = '我批注了以下 1 处内容（编号与原文对应），请针对它们回答我的问题：'
const ANNOTATION_BODY = ANNOTATION_HEAD
  + '\n\n1. 原文：这里的按钮\n   格式：button'
  + '\n提问：这个按钮能点吗？'

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
      try { entry.fn(0) } catch (error) { /* best-effort, like the real loop */ }
    }
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }
  await flush()

  const trigger = document.querySelectorAll('[data-webkit-trigger]')[0]
  const chip = document.querySelectorAll('[data-webkit-chip]')[0]
  if (!trigger || !chip) { console.error('FAIL: toolbar pieces missing'); process.exit(1) }

  function fire(element, type, extra) {
    if (!element || !element.listeners) return false
    const set = element.listeners.get(type)
    if (!set) return false
    for (const handler of set) {
      handler({ target: element, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...extra })
    }
    return true
  }

  const target = new El('button')
  target.setAttribute('id', 'ok-button')
  target.setAttribute('placeholder', '确定')
  target.getBoundingClientRect = () => ({ x: 10, y: 20, top: 20, left: 10, right: 130, bottom: 60, width: 120, height: 40 })
  body.appendChild(target)

  // ── pick one element ──
  fire(trigger, 'click')
  await flush()
  fire(document, 'mousemove', { target })
  fire(document, 'click', { target })
  await flush()

  const picked = occurrences[0]
  check('the element reaches the draft as a chip', occurrences.length === 1, `occurrences=${occurrences.length}`)
  check('the chip carries the element payload', picked !== undefined && picked.ref.startsWith('## Element '),
    picked === undefined ? '' : JSON.stringify(picked.ref.slice(0, 14)))
  // The payload — not the short label — is what the draft shows when the chip is
  // projected to a string, so a plain-text rewrite of the draft cannot drop it.
  check('the chip is projected to its payload, not to its label',
    picked !== undefined && picked.clipboardText === picked.ref && picked.clipboardText !== picked.label,
    picked === undefined ? '' : `clipboard=${JSON.stringify(picked.clipboardText.slice(0, 14))} label=${JSON.stringify(picked.label)}`)

  // ── the sibling plugin writes its block with setDraft ──
  // This is the destructive step: a string rewrite of the whole draft.
  fakeInput.setDraft(picked.clipboardText + ANNOTATION_BODY)
  await flush()

  check('setDraft is what the fixture uses', edits.some((entry) => entry[0] === 'setDraft'),
    JSON.stringify(edits.filter((entry) => entry[0] === 'setDraft').length))
  check('the chip is back after the sibling flattened it', occurrences.length === 1, `occurrences=${occurrences.length}`)
  check('the restored chip still carries the element payload',
    occurrences[0] !== undefined && occurrences[0].ref.startsWith('## Element '),
    occurrences[0] === undefined ? '' : JSON.stringify(occurrences[0].ref.slice(0, 14)))
  {
    // Swapped in place, not appended: exactly one copy of the payload remains.
    const needle = occurrences[0] === undefined ? '' : occurrences[0].ref
    let count = 0
    for (let at = draftState.text.indexOf(needle); needle !== '' && at >= 0; at = draftState.text.indexOf(needle, at + 1)) count += 1
    check('the payload is in the draft once, not twice', count === 1, `copies=${count}`)
  }
  check('the sibling block is still in the draft', draftState.text.includes(ANNOTATION_HEAD) && draftState.text.includes('这个按钮能点吗？'),
    JSON.stringify(draftState.text.length))
  check('the pill shows the element again', chip.style.display === 'flex', JSON.stringify(chip.style.display))
  check('the pill counts one element', chip.children[0] !== undefined && chip.children[0].textContent === '1',
    JSON.stringify(chip.children[0] && chip.children[0].textContent))

  // ── it must not keep repairing ──
  // The lead sentence is already in the draft, so writing again is not a new
  // sibling attach and must not duplicate the chip.
  const beforeRepeat = occurrences.length
  fakeInput.setDraft(draftState.text + '再补一句')
  await flush()
  check('a later write does not duplicate the chip', occurrences.length === beforeRepeat,
    `before=${beforeRepeat} after=${occurrences.length}`)

  // ── the sent message still folds ──
  // The submitted text is the draft projected to a string: a chip contributes its
  // clipboardText, so the bubble receives the payload plus the sibling's block.
  const bubble = new El('div')
  bubble.className = 'zz_bubble zz_plain'
  const payload = occurrences[0] === undefined ? '' : occurrences[0].clipboardText
  bubble.textContent = `${payload}\n\n${ANNOTATION_BODY}`
  body.appendChild(bubble)
  await flush()

  const sent = document.querySelectorAll('[data-webkit-sent]')
  check('the sent message shows its fold chip', sent.length === 1, `chips=${sent.length}`)
  check('the fold chip counts the element', sent[0] !== undefined && sent[0].textContent === '元素 ×1',
    JSON.stringify(sent[0] && sent[0].textContent))
  check('the element form is gone from the bubble', !bubble.textContent.includes('## Element '),
    JSON.stringify(bubble.textContent.slice(0, 30)))
  check('the annotation text stays in the bubble', bubble.textContent.includes(ANNOTATION_HEAD),
    JSON.stringify(bubble.textContent.slice(0, 30)))

  dispose()
  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${failed.length === 0 ? 'HANDOFF PASSED' : 'HANDOFF FAILED'} (${results.length - failed.length}/${results.length})`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
