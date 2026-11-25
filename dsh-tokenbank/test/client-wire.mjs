// client 引用完整性冒烟:桩 React/ctx 执行 factory+apply,
// 防止「注册块引用了被误删的组件」这类 ReferenceError(语法检查抓不到)。
import fs from 'node:fs'
import assert from 'node:assert'
const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const regs = []
const React = new Proxy({}, { get: (t, k) => {
  if (k === 'createElement') return (type, props, ...ch) => ({ type, props, children: ch })
  if (k === 'useState') return (v) => [typeof v === 'function' ? v() : v, () => {}]
  return typeof k === 'string' && /^use/.test(k) ? (f) => (typeof f === 'function' ? f() : f) : () => {}
} })
const slotNames = []
const ctx = {
  locale: { register: () => {}, bind: () => (k) => k },
  slots: { inject(name, fn) { slotNames.push(name); fn() }, register(desc) { regs.push(desc.name || desc.id) } },
  remote: {}, effect(f) { f() },
}
let out
globalThis.window = { __ModuleLoader__: { load(m) { const r = (n) => ({ react: React, 'react-dom': { createPortal: () => {} } })[n] || {}; out = m.factory(r) } } }
// eslint-disable-next-line no-eval
eval(code)
out.apply(ctx)
for (const want of ['conversation.input.right', 'shell.overlay', 'settings.models.provider-card', 'settings.models.footer'])
  assert(slotNames.includes(want), 'missing inject: ' + want)
assert(regs.filter((n) => n === 'shell.overlay').length === 6, 'shell.overlay 需要 notify/auth/lowbalance/trading/promo/deposit 六个注册')
console.log('dsh-tokenbank client-wire: OK')
