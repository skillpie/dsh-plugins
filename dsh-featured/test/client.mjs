// dsh-featured client 半冒烟:桩 __ModuleLoader__ + 桩 ctx,验证
// 模块形态、tab 注册、以及「先注销内联版再注册完整版」的接管链路。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/* ── 1. 模块形态 ── */
assert.ok(source.includes('window.__ModuleLoader__.load('), '应是 module loader 形态')
assert.ok(source.includes("id: 'dsh-featured'"), '模块 id 应为 dsh-featured')
assert.ok(source.includes('factory(require)'), '应有 factory(require)')
assert.ok(source.includes("const React = require('react')"), '应 require react')
assert.ok(source.includes("name: 'dsh-featured'"), 'face.name 应为 dsh-featured')

/* ── 2. 载入并取出 face ── */
let face = null
const sandbox = {
  __ModuleLoader__: {
    load(options) {
      face = options.factory(makeRequire())
    },
  },
}
function makeRequire() {
  return (id) => {
    if (id === 'react') {
      const createElement = (type, props, ...kids) => ({ type, props, kids })
      const stub = {
        createElement,
        useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
        useEffect: () => {},
        useMemo: (fn) => fn(),
        useRef: () => ({ current: null }),
        memo: (c) => c,
      }
      return stub
    }
    throw new Error('unexpected require: ' + id)
  }
}
const win = { __ModuleLoader__: sandbox.__ModuleLoader__ }
const fn = new Function('window', 'require', 'document', 'fetch', source)
fn(win, makeRequire(), { createElement() { return {} }, head: { appendChild() {} } }, async () => { throw new Error('no net') })

assert.ok(face, 'factory 应返回 face')
assert.equal(face.name, 'dsh-featured')
assert.deepEqual(face.inject, ['slots', 'locale'])
assert.equal(typeof face.apply, 'function')

/* ── 3. apply:注册 tab + 先注销内联版 ── */
const calls = []
let disposed = false
const fakeWin = {
  __DSH_FEATURED_ENTRY__: { kind: 'inline', dispose: () => { disposed = true } },
}
const registered = []
const ctx = {
  effect(fn2) { calls.push('effect'); return fn2() || (() => {}) },
  locale: {
    register(ns, dict) { calls.push('locale:' + ns); return () => {} },
    bind(ns) { return (key) => key },
  },
  slots: {
    inject(key, cb) { calls.push('inject:' + key); return cb() },
    register(spec, component) {
      registered.push(spec)
      return () => {}
    },
  },
}

// 用改过的 window 再跑一次 factory 里的 apply
// (apply 闭包引用的是工厂内的 window —— 实际运行时 window 就是全局对象)
const globalBackup = globalThis.window
globalThis.window = fakeWin
face.apply(ctx)
globalThis.window = globalBackup

assert.ok(disposed, '应用启动时应先注销内联版(dispose)')
assert.equal(registered.length, 1, '应注册一个 plugins.tab')
assert.equal(registered[0].id, 'dsh-plugins-plugin', '与内联版共用同一 slot id')
assert.equal(registered[0].name, 'plugins.tab')
assert.equal(registered[0].priority, 0, '完整版 priority 0 优先于内联版')
assert.ok(calls.includes('locale:dsh-featured'), '应注册 locale')

console.log('test/client.mjs PASSED')
