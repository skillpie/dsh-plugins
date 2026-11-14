'use strict'
// 自由尺寸(viewport)套件:固定尺寸条挂在工具栏下面一行(不浮动),触发键即
// 开关,输入回车即生效,无应用/关闭按钮。验证默认预填、localStorage 记忆、
// 越界拒绝、被宿主重渲染摘除后的补挂、换 frame 粘滞与卸载还原。
// 桌面 keepMounted 下隐藏 tab 的 webview 以 offsetWidth === 0 模拟。

const fs = require('fs')
const path = require('path')
const { El, document, window, timers, MutationObserver, body, localStorage } = require('./stub.cjs')

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`)
}

// ── 工具栏 + 浏览器视口,同 webview.cjs 的形态 ──
const root = new El('div')
root.className = 'bZwPEG_root'
const form = new El('form')
form.className = 'bZwPEG_toolbar'
const addressBox = new El('div')
addressBox.className = 'bZwPEG_addressBox'
const address = new El('input')
address.setAttribute('placeholder', '输入 HTTP(S) 地址')
address.setAttribute('aria-label', '输入 HTTP(S) 地址')
const go = new El('button')
go.setAttribute('type', 'submit')
addressBox.appendChild(address)
addressBox.appendChild(go)
form.appendChild(addressBox)
const viewportDiv = new El('div')
root.appendChild(form)
root.appendChild(viewportDiv)
body.appendChild(root)

const webview1 = new El('webview')
webview1.setAttribute('data-sidebar-browser-frame', 'webview')
webview1.setAttribute('src', 'https://example.com/one')
const webview2 = new El('webview')
webview2.setAttribute('data-sidebar-browser-frame', 'webview')
webview2.setAttribute('src', 'https://example.com/two')
viewportDiv.appendChild(webview1)
viewportDiv.appendChild(webview2)

const ctx = {
  locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
  sessions: { scope: () => ({}), list: { getSnapshot: () => ({}) } },
  conversation: { input: { for: () => null } },
  get: () => undefined,
}

const SIZED_392 = 'flex: 0 0 auto; width: 392px; height: 745px; margin: auto;'
const SIZED_800 = 'flex: 0 0 auto; width: 800px; height: 600px; margin: auto;'
const STORAGE_KEY = 'dsh.webkit.viewport'

;(async () => {
  let captured = null
  globalThis.window = window
  globalThis.document = document
  globalThis.MutationObserver = MutationObserver
  globalThis.localStorage = localStorage
  window.__ModuleLoader__ = { load: (spec) => { captured = spec } }

  const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
  const run = () => {
    const fn = new Function('window', 'document', 'MutationObserver', 'localStorage',
      'requestAnimationFrame', 'getComputedStyle', source)
    fn(window, document, MutationObserver, localStorage,
      window.requestAnimationFrame, window.getComputedStyle)
    const mod = captured.factory(() => { throw new Error('no value imports expected') })
    return mod.apply(ctx)
  }
  const dispose = run()

  async function flush() {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
    // interval 标记位:轮询器每个 flush 都要重投递,否则第二次 flush 就没有
    // syncVp 机会了(stub 的 timers 数组是一次性的)。
    for (const entry of timers.splice(0)) {
      try { entry.fn(0) } catch (error) { /* interval bodies */ }
      if (entry.interval) timers.push(entry)
    }
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }
  await flush()

  function fire(element, type, extra) {
    const set = element.listeners.get(type)
    if (!set) return false
    for (const handler of set) handler({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, target: element, ...extra })
    return true
  }

  const vpTrigger = form.querySelector('[data-webkit-vp-trigger]')
  check('viewport trigger mounted beside the picker trigger', vpTrigger !== null
    && vpTrigger.getAttribute('aria-pressed') === 'false')

  fire(vpTrigger, 'click')
  let bar = document.querySelectorAll('[data-webkit-vp]')[0]
  check('bar opens on trigger click and sits right after the toolbar form',
    bar !== undefined && bar.parentElement === root
    && root.children.indexOf(bar) === root.children.indexOf(form) + 1)
  check('no apply button — Enter applies instead', bar.querySelector('[data-vp-apply]') === null)
  check('no close button — the trigger toggles it', bar.querySelector('[data-vp-close]') === null)
  check('critical layout is inline: the bar can never float again on stale CSS',
    /position:\s*static/.test(bar.style.cssText) && /display:\s*flex/.test(bar.style.cssText),
    bar.style.cssText)
  const wInput = bar.querySelector('[data-vp-w]')
  const hInput = bar.querySelector('[data-vp-h]')
  check('inputs prefilled with the factory default 392×745',
    wInput.value === '392' && hInput.value === '745',
    `${wInput.value}×${hInput.value}`)
  check('opening applies the default size at once, no Enter needed',
    webview1.style.cssText === SIZED_392, JSON.stringify(webview1.style.cssText))
  check('a plain open does not overwrite the memory', localStorage.getItem(STORAGE_KEY) === null,
    JSON.stringify(localStorage.getItem(STORAGE_KEY)))

  // ── 设备档下拉:类别切换、选档即应用并记忆、Esc/点外部只收下拉 ──
  const deviceBtn = bar.querySelector('[data-vp-device-btn]')
  const deviceMenu = bar.querySelector('[data-vp-device-menu]')
  const deviceLabel = bar.querySelector('[data-vp-device-label]')
  check('device dropdown built with 4 presets', deviceBtn !== null && deviceMenu !== null
    && deviceMenu.querySelectorAll('[data-vp-device-item]').length === 4)
  check('label prefilled: factory 392×745 hits no preset → custom',
    deviceLabel.textContent === '自定义', deviceLabel.textContent)
  fire(deviceBtn, 'click')
  check('dropdown opens on click', deviceMenu.style.display === 'flex'
    && deviceBtn.getAttribute('aria-expanded') === 'true')
  const tabletItem = deviceMenu.querySelector('[data-vp-device-item="vpDevTablet"]')
  fire(tabletItem, 'click')
  const SIZED_TABLET = 'flex: 0 0 auto; width: 768px; height: 1024px; margin: auto;'
  check('tablet preset applies 768×1024 at once',
    webview1.style.cssText === SIZED_TABLET, webview1.style.cssText)
  check('tablet preset is remembered', localStorage.getItem(STORAGE_KEY) === '{"w":768,"h":1024}',
    JSON.stringify(localStorage.getItem(STORAGE_KEY)))
  check('inputs follow the preset', wInput.value === '768' && hInput.value === '1024')
  check('menu closes and label follows the preset', deviceMenu.style.display === 'none'
    && deviceLabel.textContent === '平板')
  fire(deviceBtn, 'click')
  fire(window, 'keydown', { key: 'Escape' })
  check('Esc closes only the dropdown, bar and size stay',
    deviceMenu.style.display === 'none'
    && document.querySelectorAll('[data-webkit-vp]').length === 1
    && webview1.style.cssText === SIZED_TABLET)
  fire(deviceBtn, 'click')
  fire(document, 'click')
  check('outside click closes the dropdown', deviceMenu.style.display === 'none')

  wInput.value = '392'
  hInput.value = '745'
  fire(wInput, 'keydown', { key: 'Enter' })
  check('Enter re-applies the current inputs as-is',
    webview1.style.cssText === SIZED_392, JSON.stringify(webview1.style.cssText))
  check('applied size is remembered on Enter', localStorage.getItem(STORAGE_KEY) === '{"w":392,"h":745}',
    JSON.stringify(localStorage.getItem(STORAGE_KEY)))

  // ── 适应窗口自动生效:没有按钮,超面板自动等比缩放并显式居中 ──
  check('no fit button — fit is automatic, not a control',
    bar.querySelector('[data-vp-fit]') === null && bar.querySelector('[data-vp-fit-btn]') === null)
  const paneBox = webview1.parentElement
  paneBox.clientWidth = 800
  paneBox.clientHeight = 600
  wInput.value = '1600'
  hInput.value = '1200'
  fire(hInput, 'keydown', { key: 'Enter' })
  check('an oversized viewport scales to the pane and centres via translate (min rule)',
    webview1.style.cssText === 'flex: 0 0 auto; width: 1600px; height: 1200px; margin: 0;'
      + ' transform-origin: 0 0; transform: translate(0px, 0px) scale(0.5);',
    JSON.stringify(webview1.style.cssText))
  check('auto-fit still remembers the entered size on Enter',
    localStorage.getItem(STORAGE_KEY) === '{"w":1600,"h":1200}',
    JSON.stringify(localStorage.getItem(STORAGE_KEY)))
  paneBox.clientHeight = 700
  await flush()
  check('the vertical leftover is centred (dy = half of the slack)',
    webview1.style.cssText === 'flex: 0 0 auto; width: 1600px; height: 1200px; margin: 0;'
      + ' transform-origin: 0 0; transform: translate(0px, 50px) scale(0.5);',
    JSON.stringify(webview1.style.cssText))
  paneBox.clientHeight = 300
  await flush()
  check('auto-fit tracks pane resizes on the next scan',
    webview1.style.cssText === 'flex: 0 0 auto; width: 1600px; height: 1200px; margin: 0;'
      + ' transform-origin: 0 0; transform: translate(200px, 0px) scale(0.25);',
    JSON.stringify(webview1.style.cssText))
  paneBox.clientWidth = undefined
  paneBox.clientHeight = undefined

  wInput.value = '800.4'
  hInput.value = '600'
  fire(hInput, 'keydown', { key: 'Enter' })
  check('Enter on the height input applies a custom size (floats round)',
    webview1.style.cssText === SIZED_800, JSON.stringify(webview1.style.cssText))
  check('the new size overwrites the memory', localStorage.getItem(STORAGE_KEY) === '{"w":800,"h":600}',
    JSON.stringify(localStorage.getItem(STORAGE_KEY)))

  const notice = document.querySelectorAll('[data-webkit-notice]')[0]
  wInput.value = 'abc'
  fire(hInput, 'keydown', { key: 'Enter' })
  check('non-numeric input is rejected with a notice', notice.textContent.includes('240'), JSON.stringify(notice.textContent))
  check('rejected input leaves the size untouched', webview1.style.cssText === SIZED_800)
  wInput.value = '100'
  fire(wInput, 'keydown', { key: 'Enter' })
  check('out-of-range input is rejected', notice.textContent.includes('240') && webview1.style.cssText === SIZED_800)

  // ── 宿主重渲染可能把条摘走(React 不认识它):下一轮 scan 必须补挂回原位 ──
  bar.remove()
  await flush()
  bar = document.querySelectorAll('[data-webkit-vp]')[0]
  check('a detached bar is re-mounted after the toolbar form on the next scan',
    bar !== undefined && root.children.indexOf(bar) === root.children.indexOf(form) + 1)

  // ── 粘滞:第一个 frame 隐藏(切 tab)后,尺寸交给新可见的 frame ──
  webview1.setRect({ left: 0, top: 0, width: 0, height: 0 })
  await flush()
  check('size hands over to the newly visible webview', webview2.style.cssText === SIZED_800, JSON.stringify(webview2.style.cssText))
  check('the hidden webview is restored', webview1.style.cssText === '')

  // ── 触发键即开关:再点一次 = 还原 + 收起 ──
  fire(vpTrigger, 'click')
  check('second trigger click closes the bar', document.querySelectorAll('[data-webkit-vp]').length === 0)
  check('closing restores the sized webview', webview2.style.cssText === '')

  // ── 重新打开:立即按记忆尺寸生效,无需回车 ──
  fire(vpTrigger, 'click')
  bar = document.querySelectorAll('[data-webkit-vp]')[0]
  check('reopen mounts the bar again, prefills and applies the remembered 800×600',
    bar !== undefined && bar.querySelector('[data-vp-w]').value === '800'
    && bar.querySelector('[data-vp-h]').value === '600'
    && webview2.style.cssText === SIZED_800, JSON.stringify(webview2.style.cssText))
  fire(bar.querySelector('[data-vp-h]'), 'keydown', { key: 'Enter' })
  dispose()
  check('dispose restores the sized webview', webview2.style.cssText === '')
  check('dispose removes the bar', document.querySelectorAll('[data-webkit-vp]').length === 0)
  check('dispose removes the viewport trigger', document.querySelectorAll('[data-webkit-vp-trigger]').length === 0)

  // ── 重进插件:记忆仍是 800×600 ──
  const dispose2 = run()
  await flush()
  const vpTrigger2 = form.querySelector('[data-webkit-vp-trigger]')
  fire(vpTrigger2, 'click')
  const bar2 = document.querySelectorAll('[data-webkit-vp]')[0]
  check('reopened bar prefills the remembered 800×600',
    bar2.querySelector('[data-vp-w]').value === '800'
    && bar2.querySelector('[data-vp-h]').value === '600',
    `${bar2.querySelector('[data-vp-w]').value}×${bar2.querySelector('[data-vp-h]').value}`)
  dispose2()
  check('second dispose cleans up again', document.querySelectorAll('[data-webkit-vp-trigger]').length === 0)

  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${failed.length === 0 ? 'VIEWPORT PASSED' : 'VIEWPORT FAILED'} (${results.length - failed.length}/${results.length})`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
