// 附件渲染:纯 JS 生成 PNG 代码截图(零 npm 依赖)。
// 字形来自 assets/font-atlas.json(构建期用 Pillow 从 DejaVuSansMono.ttf 26px 预栅格化,ASCII 32..126);
// 语法高亮与前身 coder-report 技能的截图模板一致:1680×2200 深底 #0b0f10,行高 39,最多 52 行 92 列。
// 注意:内置字形仅 ASCII,代码片段构建时会把非 ASCII 字符剔除(README 已注明该局限)。
import fs from 'node:fs'
import zlib from 'node:zlib'

const W = 1680
const H = 2200
const MARGIN_X = 54
const TOP = 64
const LINE_H = 39
const MAX_ROWS = 52
const COLS = 92
const CELL_W = 16

const COLORS = {
  bg: [0x0b, 0x0f, 0x10],
  text: [0xd4, 0xd4, 0xd4],
  comment: [0x58, 0xa6, 0x6b],
  string: [0xd8, 0xb5, 0x6a],
  keyword: [0x4e, 0xc9, 0xb0],
  func: [0x9c, 0xdc, 0xaa],
  number: [0xb5, 0xce, 0xa8],
  gutter: [0x3c, 0x4a, 0x4d],
}

let ATLAS = null
const glyphCache = new Map()

function loadAtlas() {
  if (ATLAS) return ATLAS
  const url = new URL('../assets/font-atlas.json', import.meta.url)
  ATLAS = JSON.parse(fs.readFileSync(url, 'utf8'))
  return ATLAS
}

function glyphBuffer(code) {
  if (glyphCache.has(code)) return glyphCache.get(code)
  const atlas = loadAtlas()
  const g = atlas.glyphs[String(code)] || null
  let out = null
  if (g && g.data) {
    out = { w: g.w, h: g.h, ox: g.ox, oy: g.oy, bytes: Buffer.from(g.data, 'base64') }
  }
  glyphCache.set(code, out)
  return out
}

// ── PNG 编码(8bit truecolor,filter 0) ────────────────────────────────
let CRC_TABLE = null
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

export function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // color type: truecolor
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const off = y * (stride + 1)
    raw[off] = 0 // filter: none
    rgb.copy(raw, off + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 6 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── 文本绘制 ─────────────────────────────────────────────────────────
function blendGlyph(canvas, x, y, glyph, color) {
  const bg = COLORS.bg
  for (let r = 0; r < glyph.h; r++) {
    const py = y + glyph.oy + r
    if (py < 0 || py >= H) continue
    for (let c = 0; c < glyph.w; c++) {
      const a = glyph.bytes[r * glyph.w + c]
      if (!a) continue
      const px = x + glyph.ox + c
      if (px < 0 || px >= W) continue
      const idx = (py * W + px) * 3
      for (let k = 0; k < 3; k++) {
        canvas[idx + k] = Math.round(bg[k] + (color[k] - bg[k]) * (a / 255))
      }
    }
  }
}

function drawText(canvas, x, y, text, color) {
  let penX = x
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)
    if (code !== 32) {
      const g = code <= 126 ? glyphBuffer(code) : null
      if (g) blendGlyph(canvas, penX, y, g, color)
    }
    penX += CELL_W
  }
  return penX
}

// ── 语法高亮 tokenizer ───────────────────────────────────────────────
const KEYWORDS = new Set(['def', 'return', 'for', 'in', 'if', 'elif', 'else', 'while', 'import', 'from', 'class', 'with', 'as', 'try', 'except', 'finally', 'lambda', 'None', 'True', 'False', 'and', 'or', 'not', 'pass', 'break', 'continue', 'print', 'range', 'len'])
const TOKEN_RE = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(#.*|\/\/.*)|([A-Za-z_]\w*)|(\d+)/g

// 行 → [{text, color}] 分段
export function tokenizeLine(line) {
  const segs = []
  let last = 0
  String(line).replace(/\t/g, '    ')
  TOKEN_RE.lastIndex = 0
  let m
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) segs.push({ text: line.slice(last, m.index), color: COLORS.text })
    let color = COLORS.text
    if (m[1]) color = COLORS.string
    else if (m[2]) color = COLORS.comment
    else if (m[3]) color = KEYWORDS.has(m[3]) ? COLORS.keyword : (line.slice(m.index + m[3].length).match(/^\s*\(/) ? COLORS.func : COLORS.text)
    else if (m[4]) color = COLORS.number
    segs.push({ text: m[0], color })
    last = m.index + m[0].length
  }
  if (last < line.length) segs.push({ text: line.slice(last), color: COLORS.text })
  return segs
}

// lines: string[] → PNG Buffer(1680×2200)
export function renderLinesPng(lines) {
  loadAtlas()
  const canvas = Buffer.alloc(W * H * 3)
  for (let i = 0; i < canvas.length; i += 3) {
    canvas[i] = COLORS.bg[0]; canvas[i + 1] = COLORS.bg[1]; canvas[i + 2] = COLORS.bg[2]
  }
  const rows = []
  for (const line of lines.slice(0, MAX_ROWS)) {
    const clean = String(line).replace(/\r/g, '').replace(/\t/g, '    ')
    for (let i = 0; i < clean.length; i += COLS) rows.push(clean.slice(i, i + COLS))
    if (rows.length >= MAX_ROWS) break
  }
  while (rows.length > MAX_ROWS) rows.pop()
  const shown = rows.slice(0, MAX_ROWS)
  shown.forEach((row, i) => {
    const y = TOP + i * LINE_H
    drawText(canvas, MARGIN_X, y, String(i + 1).padStart(3, ' '), COLORS.gutter)
    const x0 = MARGIN_X + 4 * CELL_W
    let x = x0
    for (const seg of tokenizeLine(row)) {
      x = drawText(canvas, x, y, seg.text, seg.color)
    }
  })
  return encodePng(W, H, canvas)
}

// ── 代码片段构建(ASCII-only) ─────────────────────────────────────────
const CAT_EN = {
  '后端基础设施': 'backend',
  '认证安全': 'auth',
  '网关API': 'gateway',
  '业务模块': 'business',
  '前端页面': 'frontend',
  '测试': 'testing',
  '文档': 'docs',
  'CI/CD': 'cicd',
  '功能开发': 'features',
  '缺陷修复': 'fixes',
  '重构优化': 'refactoring',
  '会话协作': 'sessions',
}

function asciiSafe(s, max = 64) {
  const t = String(s || '')
    .replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '')
    .replace(/["`\\]/g, "'")
    .replace(/[^ -~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1)}…`.replace('…', '..') : t
}

// items: [{category(zh), text, times[]}] → python 风格代码片段行
export function buildSnippet({ date, repoNames, total, items, overtime }) {
  const lines = []
  lines.push(`# project-report :: ${asciiSafe(date, 10)} :: ${asciiSafe((repoNames || []).join(', '), 48)}`)
  lines.push(`# ${total} commits | generated by dsh-project-report`)
  lines.push('')
  lines.push('def daily_report():')
  lines.push('    tasks = [')
  const list = (items || []).slice(0, 8)
  list.forEach((it, i) => {
    const cat = CAT_EN[it.category] || asciiSafe(it.category, 12).toLowerCase() || 'work'
    const desc = asciiSafe(it.text, 56)
    const time = (it.times && it.times[0]) || ''
    const comma = i === list.length - 1 ? '' : ','
    const tail = time ? `  # ${time}` : ''
    lines.push(`        ("${cat}", "${desc}")${comma}${tail}`)
  })
  lines.push('    ]')
  lines.push('    for name, desc in tasks:')
  lines.push('        print("done:", name, "-", desc)')
  if (overtime && overtime.start && overtime.end) {
    lines.push(`    # overtime ${overtime.start} -> ${overtime.end} (${overtime.duration || ''})`)
    lines.push(`    return "${asciiSafe(overtime.duration, 16)} overtime logged"`)
  } else {
    lines.push(`    return "${total} commits done"`)
  }
  return lines
}

// 完整附件:{buffer, filename, mime, size}
export function renderAttachment({ date, repoNames, total, items, overtime }) {
  const lines = buildSnippet({ date, repoNames, total, items, overtime })
  const buffer = renderLinesPng(lines)
  return { buffer, filename: `project-report-${date}.png`, mime: 'image/png', size: buffer.length }
}
