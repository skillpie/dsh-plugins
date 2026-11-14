'use strict'
// Draft/pill agreement test: the pill must be a projection of the composer
// draft, so that deleting on either side is visible on the other.
//
// Two directions are asserted:
//   1. delete in the pill  -> one edit is applied to the draft (the chip goes).
//   2. delete in the draft -> the pill empties, with no edit of its own.

const fs = require('fs')
const path = require('path')
const { El, document, window, timers, MutationObserver, head, body } = require('./stub.cjs')

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

// the composer, so the pill has an anchor above the input box
const composerCard = new El('div')
composerCard.setAttribute('data-composer-card', '')
composerCard.getBoundingClientRect = () => ({ x: 400, y: 600, top: 600, left: 400, right: 800, bottom: 700, width: 400, height: 100 })
body.appendChild(composerCard)

// ── a fake draft store that behaves like the real one ──
// A chip is `label.length` characters here, which is the clipboard projection;
// the detect projection collapses it to one, and that is what a removal must
// address.
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
    // The host projects a chip to its `clipboardText`, so that — not the short
    // label — is what occupies space in the draft string.
    const label = reference.clipboardText === undefined ? reference.label : reference.clipboardText
    // Spans are detect coordinates here too: the real editor resolves them
    // against its detect projection, which is why a chip counts as one character.
    const clipSpot = detectToClipboard(span.start)
    const offset = clipSpot >= draftState.text.length ? draftState.text.length : clipSpot
    occurrences.push({
      occurrenceId: 'occ-' + (occurrences.length + 1),
      source: reference.source,
      ref: reference.ref,
      label,
      offset,
      length: label.length,
      clipboardText: label,
    })
    draftState.text = draftState.text.slice(0, offset) + label + ' ' + draftState.text.slice(offset)
    draftState.rev += 1
    edits.push(['insertReference', label])
    for (const fn of listeners) fn()
    return true
  },
  insertText(text, span) {
    edits.push(['insertText', text, span.start, span.end, span.draftRev])
    if (text !== '') {
      for (const fn of listeners) fn()
      return true
    }
    // `span` addresses the detect projection, where every chip is one character.
    const clipStart = detectToClipboard(span.start)
    const index = occurrences.findIndex((occ) => occ.offset === clipStart)
    if (index >= 0) {
      const occ = occurrences[index]
      draftState.text = draftState.text.slice(0, occ.offset) + draftState.text.slice(occ.offset + occ.length)
      occurrences.splice(index, 1)
      for (const occ2 of occurrences) if (occ2.offset > occ.offset) occ2.offset -= occ.length
      draftState.rev += 1
    }
    for (const fn of listeners) fn()
    return true
  },
}

/**
 * Map a detect-projection index onto the clipboard text.
 *
 * A chip occupies `length` characters in the clipboard text but a single
 * placeholder in the detect text, so the two index spaces drift apart by one
 * character per preceding chip.
 */
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

/**
 * Where one occurrence sits in the detect projection (one character per chip).
 *
 * Returns -1 for an occurrence that is no longer in the draft.
 */
function detectStartOf(occurrence) {
  const sorted = [...occurrences].sort((a, b) => a.offset - b.offset)
  let clip = 0
  let detect = 0
  for (const occ of sorted) {
    const gap = occ.offset - clip
    if (occ === occurrence) return detect + gap
    detect += gap + 1
    clip = occ.offset + occ.length
  }
  return -1
}

const ctx = {
  locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
  sessions: { scope: () => ({}), list: { getSnapshot: () => ({ current: 'session-1' }) } },
  conversation: { input: { for: () => fakeInput } },
  get: (name) => (name === 'conversation' ? ctx.conversation : undefined),
}

// ── load the Client half the way ModuleLoader does ──
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

  // a page element to pick
  const target = new El('textarea')
  target.setAttribute('id', 'chat-textarea')
  target.setAttribute('placeholder', '发消息')
  target.getBoundingClientRect = () => ({ x: 10, y: 20, top: 20, left: 10, right: 130, bottom: 60, width: 120, height: 40 })
  body.appendChild(target)

  // ── pick one element ──
  fire(trigger, 'click')
  await flush()
  fire(document, 'mousemove', { target })
  fire(document, 'click', { target })
  await flush()

  check('chip inserted into the draft', occurrences.length === 1, `occurrences=${occurrences.length}`)
  check('pill is shown while the draft holds one element', chip.style.display === 'flex', JSON.stringify(chip.style.display))
  check('pill reports the count', chip.children[0] !== undefined && chip.children[0].textContent === '1',
    JSON.stringify(chip.children[0] && chip.children[0].textContent))

  // ── direction 1: delete from the pill ──
  fire(chip, 'pointerenter')
  await flush()
  const removeButtons = document.querySelectorAll('[data-webkit-remove]')
  check('pill row offers a remove button', removeButtons.length === 1, `found=${removeButtons.length}`)
  const editsBefore = edits.length
  fire(removeButtons[0], 'click')
  await flush()
  const removalEdit = edits.slice(editsBefore).find((entry) => entry[0] === 'insertText')
  check('pill delete edits the draft', removalEdit !== undefined && removalEdit[1] === '',
    JSON.stringify(removalEdit))
  check('pill delete addresses the one-character chip span',
    removalEdit !== undefined && removalEdit[3] - removalEdit[2] === 1,
    removalEdit === undefined ? '' : `start=${removalEdit[2]} end=${removalEdit[3]}`)
  check('pill hidden after its own delete', chip.style.display === 'none', JSON.stringify(chip.style.display))

  // ── direction 2: delete in the composer ──
  fire(trigger, 'click')
  await flush()
  fire(document, 'mousemove', { target })
  fire(document, 'click', { target })
  await flush()
  check('second pick reaches the draft', occurrences.length === 1, `occurrences=${occurrences.length}`)
  check('pill returns for the second pick', chip.style.display === 'flex', JSON.stringify(chip.style.display))

  // The user deletes the chip in the input box: the store changes, nothing else.
  const dropped = occurrences.pop()
  draftState.text = draftState.text.replace(dropped.label, '')
  draftState.rev += 1
  for (const fn of listeners) fn()
  await flush()
  check('pill empties when the draft loses the chip', chip.style.display === 'none', JSON.stringify(chip.style.display))
  const lateEdits = edits.filter((entry) => entry[0] === 'insertText')
  check('pill wrote nothing on its own', lateEdits.length === 1, `insertText calls=${lateEdits.length}`)

  // ── direction 3: the draft moves after the pill was drawn ──
  // The pill redraws on the draft subscription, but the offsets it holds are
  // still the older ones until that redraw lands. Deleting in that window must
  // re-measure the chip instead of trusting the stale span — a stale span plus
  // a freshly-read revision would sail past the revision guard and cut the
  // wrong characters out of the draft.
  fire(trigger, 'click')
  await flush()
  fire(document, 'mousemove', { target })
  fire(document, 'click', { target })
  await flush()
  const secondChip = occurrences[occurrences.length - 1]
  const shift = 'hello '.length
  draftState.text = 'hello ' + draftState.text
  draftState.rev += 1
  for (const occ of occurrences) occ.offset += shift
  const staleButtons = document.querySelectorAll('[data-webkit-remove]')
  const beforeStale = edits.length
  // Measured before the click: afterwards the chip is gone from the draft.
  const expectedStale = detectStartOf(secondChip)
  // Rows are rendered on hover; re-enter so the panel reflects this draft.
  fire(chip, 'pointerenter')
  await flush()
  const staleButtons2 = document.querySelectorAll('[data-webkit-remove]')
  fire(staleButtons2[staleButtons2.length - 1], 'click')
  await flush()
  const staleEdit = edits.slice(beforeStale).find((entry) => entry[0] === 'insertText')
  check('delete re-measures a chip that moved since the panel was drawn',
    staleEdit !== undefined && staleEdit[2] === expectedStale && staleEdit[3] - staleEdit[2] === 1,
    staleEdit === undefined
      ? 'no edit'
      : `start=${staleEdit[2]} expected=${expectedStale} width=${staleEdit[3] - staleEdit[2]}`)

  // ── direction 4: more than one chip ──
  // With two chips the detect index and the clipboard offset differ by one per
  // preceding chip, so this is where the conversion has to be right. The second
  // chip sits at detect index 2 ("chip, space, chip"), not at its clipboard
  // offset.
  // Start from a clean draft so this case stands on its own.
  occurrences.length = 0
  draftState.text = ''
  draftState.rev += 1
  for (const fn of listeners) fn()
  await flush()
  fire(trigger, 'click')
  await flush()
  fire(document, 'mousemove', { target })
  fire(document, 'click', { target })
  await flush()
  fire(trigger, 'click')
  await flush()
  fire(document, 'mousemove', { target })
  fire(document, 'click', { target })
  await flush()
  check('two chips reach the draft', occurrences.length === 2, `occurrences=${occurrences.length}`)
  // Where each chip sits in the detect projection: one character per chip, so
  // every preceding chip pulls the next one one character to the left.
  const detectStarts = new Map()
  {
    const sorted = [...occurrences].sort((a, b) => a.offset - b.offset)
    let clip = 0
    let detect = 0
    for (const occ of sorted) {
      detectStarts.set(occ.occurrenceId, detect + (occ.offset - clip))
      detect += (occ.offset - clip) + 1
      clip = occ.offset + occ.length
    }
  }
  const idsBeforeDelete = occurrences.map((occ) => occ.occurrenceId)
  // The panel renders its rows on hover, so re-enter it after the picks or the
  // DOM still holds the rows built for an earlier draft.
  fire(chip, 'pointerenter')
  await flush()
  const multiButtons = document.querySelectorAll('[data-webkit-remove]')
  check('both chips have a row', multiButtons.length === 2, `rows=${multiButtons.length}`)
  const beforeMulti = edits.length
  // Addressed by id rather than by row position: which row the panel lists first
  // is a rendering detail, and the point here is the span arithmetic.
  const targetId = idsBeforeDelete[idsBeforeDelete.length - 1]
  const targetButton = multiButtons.find((button) => button.__pickerId === targetId) ?? multiButtons[multiButtons.length - 1]
  fire(targetButton, 'click')
  await flush()
  const multiEdit = edits.slice(beforeMulti).find((entry) => entry[0] === 'insertText')
  const removedId = idsBeforeDelete.find((id) => !occurrences.some((occ) => occ.occurrenceId === id))
  const expectedStart = detectStarts.get(removedId)
  check('deleting the second of two chips targets the one-character detect span',
    multiEdit !== undefined && multiEdit[2] === expectedStart && multiEdit[3] - multiEdit[2] === 1,
    multiEdit === undefined
      ? 'no edit'
      : `start=${multiEdit[2]} width=${multiEdit[3] - multiEdit[2]} expected start=${expectedStart}`)
  check('only the addressed chip leaves the draft',
    occurrences.length === 1 && occurrences[0] !== undefined && occurrences[0].occurrenceId !== removedId,
    `left=${occurrences.length} removed=${removedId} kept=${occurrences[0] && occurrences[0].occurrenceId}`)

  dispose()
  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${failed.length === 0 ? 'DRAFT SYNC PASSED' : 'DRAFT SYNC FAILED'} (${results.length - failed.length}/${results.length})`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
