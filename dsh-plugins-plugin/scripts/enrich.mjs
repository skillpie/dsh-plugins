#!/usr/bin/env node
// 精选插件目录富化脚本 — 机制复用自 awesome-dsh-plugin 官方目录:
// 官方用构建管道(probe-npm/probe-downloads/probe-stars/probe-screenshots)把每个插件的
// stars、月下载量、截图、双语简介、icon 等预计算进静态 plugins.json(GitHub Pages +
// npm 包 dsh-plugin-catalog 双源发布),市场端运行时零外部 API 依赖。
// 本脚本在「构建期」按包名 join 官方目录,把富字段合并进我们的 plugins.json;
// 未收录的条目退化为直连 npm registry / npm downloads API 探测。
//
// 用法:
//   node scripts/enrich.mjs                 # 在线富化(默认源见 CATALOG_SOURCES)
//   node scripts/enrich.mjs --catalog /path/to/plugins.json   # 用本地目录快照
//   node scripts/enrich.mjs --dry-run       # 只打印不写回
//
// 我们策展字段(title/description/tags)永远优先;脚本只补缺失或外部的数据。

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(PKG_ROOT, '..')
const PLUGINS_JSON = path.join(PKG_ROOT, 'plugins.json')

// 目录源,按序尝试。jsdelivr 走 npm 镜像(国内可达),官方 Pages 兜底。
const CATALOG_SOURCES = [
  { name: 'jsdelivr npm dsh-plugin-catalog', url: 'https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/plugins.json' },
  { name: 'awesome-dsh-plugin.com', url: 'https://awesome-dsh-plugin.com/plugins.json' },
]

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const catalogFlagIdx = args.indexOf('--catalog')
const catalogPath = catalogFlagIdx >= 0 ? args[catalogFlagIdx + 1] : null

async function fetchJson(url, timeoutMs = 30_000) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function loadCatalog() {
  if (catalogPath) {
    const data = JSON.parse(await readFile(catalogPath, 'utf8'))
    console.log(`catalog ← 本地快照 ${catalogPath}(${data.plugins?.length ?? 0} 条)`)
    return data
  }
  const errors = []
  for (const source of CATALOG_SOURCES) {
    try {
      const data = await fetchJson(source.url, 60_000)
      if (Array.isArray(data.plugins) && data.plugins.length) {
        console.log(`catalog ← ${source.name}(${data.plugins.length} 条,官方 updated ${data.updated})`)
        return data
      }
      errors.push(`${source.name}: 目录为空`)
    } catch (err) {
      errors.push(`${source.name}: ${err.message}`)
    }
  }
  throw new Error(`所有目录源都不可用:\n  ${errors.join('\n  ')}`)
}

// 目录索引:按插件名(目录的 name)与 npm 名(npm 字段)双键。
function indexCatalog(catalog) {
  const index = new Map()
  for (const plugin of catalog.plugins) {
    if (typeof plugin?.name === 'string' && plugin.name) index.set(plugin.name, plugin)
    if (typeof plugin?.npm === 'string' && plugin.npm && !index.has(plugin.npm)) index.set(plugin.npm, plugin)
  }
  return index
}

// 从相邻工作区插件的 package.json 取 repository → GitHub owner/repo。
function repoFromSibling(pkgName) {
  try {
    const manifest = JSON.parse(readFileSyncLocal(path.join(REPO_ROOT, pkgName, 'package.json')))
    const url = typeof manifest.repository === 'object' ? manifest.repository.url : manifest.repository
    const match = typeof url === 'string' ? url.match(/github\.com[/:]([^/]+)\/([^/#.?]+)/) : null
    if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, ''), url: `https://github.com/${match[1]}/${match[2].replace(/\.git$/, '')}` }
  } catch { /* 相邻目录不存在或无 repository,跳过 */ }
  return null
}

// readFileSyncLocal:readFileSync 的同步版包装(enrich 是一次性脚本,同步可读性优先)。
import { readFileSync } from 'node:fs'
function readFileSyncLocal(p) { return readFileSync(p, 'utf8') }

// 版本探测:镜像与官方源都查,取更新的那个。只看镜像会写出旧版本(镜像同步有
// 几十分钟到几小时的延迟);只看官方源国内偶尔连不上。两者取最大版本号最稳。
function cmpVersion(a, b) {
  const pa = String(a).split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x))
  const pb = String(b).split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x))
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1
    return String(x) > String(y) ? 1 : -1
  }
  return 0
}

async function probeNpmVersion(pkg) {
  const enc = encodeURIComponent(pkg)
  const seen = []
  for (const base of ['https://registry.npmmirror.com', 'https://registry.npmjs.org']) {
    try {
      const data = await fetchJson(`${base}/${enc}/latest`, 15_000)
      if (typeof data?.version === 'string' && data.version) seen.push(data.version)
    } catch { /* 换下一个源 */ }
  }
  if (seen.length === 0) return null
  return seen.reduce((a, b) => (cmpVersion(a, b) >= 0 ? a : b))
}

async function probeDownloads(pkg) {
  try {
    const data = await fetchJson(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`, 15_000)
    return typeof data?.downloads === 'number' ? { downloads: data.downloads, window: { start: data.start, end: data.end } } : null
  } catch { return null }
}

async function probeStars(ownerRepo) {
  if (!ownerRepo) return null
  try {
    const data = await fetchJson(`https://api.github.com/repos/${ownerRepo.owner}/${ownerRepo.repo}`, 15_000)
    return typeof data?.stargazers_count === 'number' ? { stars: data.stargazers_count } : null
  } catch { return null }
}

const today = new Date().toISOString().slice(0, 10)

function main() {
  return loadCatalog().then(async (catalog) => {
    const index = indexCatalog(catalog)
    const doc = JSON.parse(await readFile(PLUGINS_JSON, 'utf8'))
    const entries = Array.isArray(doc.entries) ? doc.entries : []

    let hit = 0
    for (const entry of entries) {
      const pkg = String(entry.package || '').trim()
      if (!pkg) continue
      const cat = index.get(pkg)
      const before = JSON.stringify(entry)

      if (cat) {
        hit++
        // 官方目录富字段:name/owner/url/category/description{en,zh}/npm/tarball/version/
        // stars(+CheckedAt)/downloads(+窗口)/icon/screenshots[]/install/added
        if (!entry.author && typeof cat.owner === 'string') entry.author = cat.owner
        if (!entry.homepage && typeof cat.url === 'string') entry.homepage = cat.url
        if (!entry.category && typeof cat.category === 'string') entry.category = cat.category
        if (!entry.icon && typeof cat.icon === 'string') entry.icon = cat.icon
        if (Array.isArray(cat.screenshots) && cat.screenshots.length) {
          entry.screenshots = cat.screenshots.map(String).filter(Boolean).slice(0, 4)
        }
        const desc = cat.description || {}
        if (!entry.description && typeof desc.zh === 'string') entry.description = desc.zh
        if (typeof desc.en === 'string' && desc.en) entry.descriptionEn = desc.en
        if (typeof cat.stars === 'number') entry.stars = cat.stars
        if (typeof cat.downloads === 'number') {
          entry.downloads = cat.downloads
          if (cat.downloadsStart) entry.downloadsWindow = { start: cat.downloadsStart, end: cat.downloadsEnd }
        }
        // 版本号一律以 npm 为准(官方目录是构建期快照,常落后于刚发布的版本),
        // 目录里的 version 只在 npm 探测失败时兜底,见下方 probeNpmVersion。
        entry.enrichSource = 'awesome-dsh-plugin'
      } else {
        // 未收录:直连 npm / GitHub 探测(尽力而为,失败不阻塞)。
        const ownerRepo = repoFromSibling(pkg)
        const [version, downloads, stars] = await Promise.all([
          probeNpmVersion(pkg),
          probeDownloads(pkg),
          probeStars(ownerRepo),
        ])
        if (downloads) {
          entry.downloads = downloads.downloads
          entry.downloadsWindow = downloads.window
        }
        if (stars) entry.stars = stars.stars
        if (ownerRepo) {
          if (!entry.author) entry.author = ownerRepo.owner
          if (!entry.homepage) entry.homepage = ownerRepo.url
        }
        entry.enrichSource = 'npm-probe'
      }
      // 版本号统一对齐 npm latest:官方目录快照常滞后于刚发布的版本,
      // 而精选卡片上的「安装」按钮直接拿这个版本号拼 spec,写旧了会装回旧包。
      // npm 探测失败时才退回官方目录里的 version。
      if (!dryRun) {
        const latest = await probeNpmVersion(pkg)
        if (latest) {
          if (entry.version !== latest) {
            console.log(`version: ${pkg} ${entry.version ?? '-'} → ${latest}`)
            entry.version = latest
          }
        } else if (cat && typeof cat.version === 'string' && cat.version) {
          entry.version = cat.version
        }
      }
      entry.enrichedAt = today
      if (!entry.icon && !dryRun) {
        // icon 兜底:npm 发布的插件按约定带 icon.svg(files 白名单/exports ./icon),
        // jsdelivr 可按包直接取;HEAD 探测 200 才写入(dsh-datasource 等无 icon 包不造假)。
        const url = `https://cdn.jsdelivr.net/npm/${encodeURIComponent(pkg).replace('%2F', '/')}/icon.svg`
        try {
          const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
          if (head.ok) {
            entry.icon = url
            console.log(`icon: ${pkg} ← npm 包 icon.svg`)
          }
        } catch { /* 探测失败不写 icon */ }
      }
      if (!dryRun && JSON.stringify(entry) !== before) {
        console.log(`enriched: ${pkg}(source=${entry.enrichSource}, stars=${entry.stars ?? '-'}, downloads=${entry.downloads ?? '-'}, screenshots=${entry.screenshots?.length ?? 0})`)
      }
    }

    console.log(`完成: ${entries.length} 条,官方目录命中 ${hit},退化探测 ${entries.length - hit}${dryRun ? '(dry-run,未写回)' : ''}`)
    if (!dryRun) {
      doc.entries = entries
      doc.updated = today
      await writeFile(PLUGINS_JSON, JSON.stringify(doc, null, 2) + '\n')
    }
  })
}

main().catch((err) => { console.error(err.message); process.exit(1) })
