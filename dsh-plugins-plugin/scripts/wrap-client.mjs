// 一次性构建:把 factory 函数体形式的 featured.client.js 包成经典分发脚本。
import { readFileSync, writeFileSync } from 'node:fs'

const raw = readFileSync('embed/featured.client.js', 'utf8')
const lines = raw.split('\n')
let i = 0
while (i < lines.length && (lines[i].startsWith('//') || lines[i].trim() === '')) i++
const core = lines.slice(i).join('\n').trim()

const out = `// dsh-plugins-plugin — 精选插件 client 分发脚本(embed/featured.client.js)。
// 不再由 integrate.sh 拷贝进接入插件,而是由持有路由的宿主插件经
//   GET /dsh-plugins-plugin/featured/client.js
// 以经典 script 分发;接入插件的 client.js 只放一个固定引导器加载本文件。
// 板块判重:引导器用 __DSH_FEATURED_BOOTSTRAP__,本脚本用 __DSH_FEATURED_ACTIVE__。
;(function () {
  if (typeof window === 'undefined' || !window.__ModuleLoader__) return
  if (window.__DSH_FEATURED_ACTIVE__) return
  window.__DSH_FEATURED_ACTIVE__ = true
  window.__ModuleLoader__.load({
    id: 'dsh-plugins-plugin-featured',
    factory(require) {
${core.split('\n').map((l) => '      ' + l).join('\n')}
    },
  })
})()
`
writeFileSync('embed/featured.client.js', out)
console.log('wrapped:', out.split('\n').length, 'lines')
