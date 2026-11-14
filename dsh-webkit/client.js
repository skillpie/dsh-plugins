// dsh-webkit — Client half.
//
// Hand-written CJS in the ModuleLoader wrapper (no build step, no value import
// from @deepseek-ai/*): the whole surface is DOM work plus the four Cordis
// services named in `exports.inject`.
//
// Why DOM injection at all: the right-Sidebar browser tab publishes only
// `sidebar.right.pane.tab` (keyed by tab id, owned by the shipped browser) and
// its `.title`; there is no address-bar action seat to register into, so the
// trigger is placed beside the host's own toolbar controls. Two host facts make
// that placement stable rather than cosmetic:
//   1. the address input carries `placeholder` and `aria-label` set to the SAME
//      localized string (unique in the app, and localization-independent);
//   2. the toolbar `↗` button is a sibling of the address box inside the same
//      `form`, so `addressBox.after(trigger)` lands exactly between the address
//      box and that button.
// The trigger copies the hashed `class` of a neighbouring toolbar button instead
// of hard-coding a CSS-module name, so spacing, size and hover states follow the
// host build rather than a snapshot of it.
//
// Cross-origin pages never expose `contentDocument` (the frame is sandboxed with
// `allow-same-origin` but loads the target origin), so the picker cannot run
// inside them at all. The Host half re-serves the page from the application
// origin with scripts stripped; this half mounts that snapshot in an overlay
// iframe positioned exactly over the live one and runs the same picker against
// its document. Same-origin pages (for example this app's own preview routes)
// are picked in place, with no snapshot.
window.__ModuleLoader__.load({
  id: 'dsh-webkit',
  factory: (require) => {
    'use strict'

    // ModuleLoader hands the factory only `require`; the module record has to be
    // declared here or every `exports.*` assignment below is a ReferenceError
    // that aborts the whole web boot, not just this plugin.
    var module = { exports: {} }
    var exports = module.exports

    // ────────────────────────────── text ──────────────────────────────
    // Two languages, chosen from the Client locale service; anything other than
    // a zh locale reads English (never a silent fallback to Chinese).
    const TEXT = {
      zh: {
        start: '选择网页元素加入聊天',
        cancel: '取消网页元素选择',
        failed: '网页元素选择失败：{message}',
        noPage: '当前没有可拾取的页面',
        noSession: '当前没有打开的会话',
        pickHint: '点击页面上的元素拾取 · Esc 取消',
        snapshotBadge: '快照模式',
        liveBadge: '实时页面',
        snapshotFailed: '无法读取该页面：{message}',
        chipUnit: '个元素',
        panelCountTitle: '网页元素（{n} 个）',
        rowRemove: '删除',
        sentChip: '元素 ×{n}',
        sentChipHint: '本消息携带的网页元素',
        tooMany: '一次最多拾取 12 个元素',
        vpToggle: '自由尺寸视口',
        vpInvalid: '尺寸需为 240–8192 的整数',
        vpNoPage: '当前没有可见的页面',
        vpDevPhone: '手机',
        vpDevTablet: '平板',
        vpDevDesktop: '桌面',
        vpDevSlide: '幻灯片',
        vpDevCustom: '自定义',
      },
      en: {
        start: 'Select page element for chat',
        cancel: 'Cancel page element selection',
        failed: 'Page element selection failed: {message}',
        noPage: 'No page to pick from',
        noSession: 'No session is open',
        pickHint: 'Click an element on the page · Esc to cancel',
        snapshotBadge: 'Snapshot',
        liveBadge: 'Live page',
        snapshotFailed: 'This page cannot be read: {message}',
        chipUnit: ' element(s)',
        panelCountTitle: 'Page elements ({n})',
        rowRemove: 'Delete',
        sentChip: 'element ×{n}',
        sentChipHint: 'Web elements this message carried',
        tooMany: 'At most 12 elements per pick',
        vpToggle: 'Free-size viewport',
        vpInvalid: 'Size must be an integer between 240 and 8192',
        vpNoPage: 'No visible page',
        vpDevPhone: 'Phone',
        vpDevTablet: 'Tablet',
        vpDevDesktop: 'Desktop',
        vpDevSlide: 'Slides',
        vpDevCustom: 'Custom',
      },
    }

    const MAX_ITEMS = 12

    // Extraction limits. They mirror the reference implementation's caps so the
    // prompt stays inside a predictable budget per element.
    const LIMITS = {
      text: 4_000,
      html: 6_000,
      attribute: 500,
      nearby: 4_000,
      name: 160,
      fontFamily: 96,
      selectorDepth: 8,
      xpathDepth: 12,
    }

    // ────────────────────────── viewport sizes ──────────────────────────
    // 自由尺寸:不设预设排,浮动条只有宽高输入。出厂默认 392×745;用户应用过
    // 的尺寸记在 localStorage,下次打开预填上次的值,之后由用户自由调整。
    const DEFAULT_VIEWPORT = { w: 392, h: 745 }
    const VIEWPORT_MIN = 240
    const VIEWPORT_MAX = 8192
    const VIEWPORT_STORAGE_KEY = 'dsh.webkit.viewport'
    // 设备类别档(主流分辨率,参考通用响应式规范):选档即应用并写入记忆;
    // 不在档上的尺寸(手动输入)在下拉里归为「自定义」。
    const VIEWPORT_DEVICES = [
      { key: 'vpDevPhone', w: 390, h: 844 },
      { key: 'vpDevTablet', w: 768, h: 1024 },
      { key: 'vpDevDesktop', w: 1440, h: 900 },
      { key: 'vpDevSlide', w: 1920, h: 1080 },
    ]
    // 预览缩放:不设百分比切换(用户反馈用处不大)。「适应窗口」作为唯一
    // 视觉模式默认生效——尺寸比面板大时自动缩到整框可见,小则 1:1。

    /**
     * Parses a user-supplied size into a `{ w, h }` pair.
     * Floats round; anything non-numeric or outside `[240, 8192]` is `null`.
     */
    function viewportSizeOf(raw) {
      const w = Math.round(Number(raw && raw.w))
      const h = Math.round(Number(raw && raw.h))
      if (!Number.isFinite(w) || !Number.isFinite(h)) return null
      if (w < VIEWPORT_MIN || w > VIEWPORT_MAX || h < VIEWPORT_MIN || h > VIEWPORT_MAX) return null
      return { w, h }
    }

    /** 读取记忆的尺寸;键缺失、JSON 坏、数值越界都回出厂默认。 */
    function loadViewportSize() {
      try {
        const raw = window.localStorage.getItem(VIEWPORT_STORAGE_KEY)
        if (raw === null) return { ...DEFAULT_VIEWPORT }
        return viewportSizeOf(JSON.parse(raw)) ?? { ...DEFAULT_VIEWPORT }
      } catch (error) {
        return { ...DEFAULT_VIEWPORT }
      }
    }

    /** 应用成功时记住尺寸;写不进(隐私模式)只影响下次预填,不报错。 */
    function saveViewportSize(size) {
      try {
        window.localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(size))
      } catch (error) {
        // localStorage 不可写,忽略。
      }
    }

    /**
     * The whole inline `style.cssText` a sized frame carries.
     *
     * Why cssText wholesale instead of per-property writes: the host sizes the
     * frame exclusively through its CSS class (`.webview { flex: 1 1 auto;
     * width: 100%; height: 100% }`), so an element carries no inline styles on
     * its own — replacing cssText is one write, and restoring the captured
     * previous cssText (usually the empty string) is exactly reversible, even
     * if another extension ever did set inline styles.
     */
    function viewportCssText(size, fit) {
      // 布局盒永远是真实视口 W×H(guest 才按这个尺寸排版)。fit===null
      // (面板量得到、尺寸完全放得下)时 margin:auto 借 flex 双轴居中;
      // 需要缩放时绝不能依赖 margin:auto+origin center——面板放不下时
      // auto margin 失效为 0、盒贴左上,再绕盒心缩放就会偏出面板(上一
      // 版「不居中」的根因)。改为 origin 左上 + translate 显式摆到面板
      // 正中:dx=(可用宽-W*z)/2, dy 同理,恒 ≥0,双轴都稳。绝不包一层
      // div——挪动 webview 在 DOM 里的位置会让它整页重载。
      if (fit === null || fit === undefined) {
        return `flex: 0 0 auto; width: ${size.w}px; height: ${size.h}px; margin: auto;`
      }
      return `flex: 0 0 auto; width: ${size.w}px; height: ${size.h}px; margin: 0;`
        + ` transform-origin: 0 0; transform: translate(${fmtCssNum(fit.dx)}px, ${fmtCssNum(fit.dy)}px) scale(${fmtCssNum(fit.z)});`
    }

    /** CSS 数字:去掉多余的尾零(50 → "50",0.5 → "0.5",0.8105 → "0.8105")。 */
    function fmtCssNum(n) {
      return String(Math.round(n * 10000) / 10000)
    }

    // ───────────────────────────── style ──────────────────────────────
    const STYLE_ID = 'dsh-webkit-style'

    /**
     * Pill geometry, verbatim token set shared with the annotation pill. It sits
     * one layer below that pill (1150): if the two ever land on the same spot
     * for the fraction of a second before the next layout pass, the neighbour
     * stays readable and this one steps aside.
     */
    const CHIP_CSS = 'position:fixed;z-index:1149;display:none;align-items:center;gap:4px;height:22px;'
      + 'padding:0 10px;border-radius:11px;border:1px solid var(--dsw-alias-border-inverted);'
      + 'background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #2c2c2e));'
      + 'box-shadow:var(--dsw-shadow-lv3);font-family:var(--dsw-font-family,system-ui);'
      + 'font-size:11px;color:var(--dsw-alias-label-primary);cursor:default;'
      + 'animation:dsh-webkit-pop .12s var(--ds-ease-in-out, ease);'

    const STYLE_TEXT = `
@keyframes dsh-webkit-pop { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
@keyframes dsh-webkit-fade { from { opacity: 0; } to { opacity: 1; } }
/* The trigger repeats the host's own toolbar button metrics, so it looks native
   whether or not a neighbouring hashed class could be copied. Same tokens, same
   box (28x28), same hover and disabled treatment. The viewport trigger shares
   every rule through the second selector. */
[data-webkit-trigger], [data-webkit-vp-trigger] {
  width: 28px; height: 28px; flex: none; padding: 0; border: 0; background: 0 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--dsw-radius-sm); cursor: pointer;
  color: var(--dsw-alias-label-secondary);
}
[data-webkit-trigger]:hover:not(:disabled), [data-webkit-vp-trigger]:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-webkit-trigger]:disabled { color: var(--dsw-alias-label-quaternary); cursor: default; }
[data-webkit-trigger][aria-pressed="true"], [data-webkit-vp-trigger][aria-pressed="true"] {
  color: var(--dsw-alias-text-accent, #4c9aff);
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-webkit-trigger] > svg, [data-webkit-vp-trigger] > svg { display: block; width: 16px; height: 16px; pointer-events: none; }
[data-webkit-chip] { -webkit-user-select: none; user-select: none; }
[data-webkit-chip] > b { color: var(--dsw-alias-text-accent, #4c9aff); font-weight: 700; }
.dsh-webkit-sent {
  display: inline-flex; align-items: center; height: 20px; padding: 0 8px;
  margin: 0 2px; border-radius: 10px; cursor: default; vertical-align: middle;
  border: 1px solid var(--dsw-alias-border-inverted);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #2c2c2e));
  font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.dsh-webkit-sent:hover { color: var(--dsw-alias-label-primary); }
[data-webkit-tip] {
  position: fixed; z-index: 1160; box-sizing: border-box; width: 300px;
  max-width: calc(100vw - 16px); max-height: 340px; overflow: auto;
  padding: 10px 12px; border-radius: 12px; display: none;
  border: 1px solid var(--dsw-alias-border-inverted);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #2c2c2e));
  box-shadow: var(--dsw-shadow-lv3); font-family: var(--dsw-font-family, system-ui);
  font-size: 12px; color: var(--dsw-alias-label-primary);
  animation: dsh-webkit-pop .12s var(--ds-ease-in-out, ease);
}
[data-webkit-tip] .dsh-webkit-tip-head { font-weight: 600; margin-bottom: 6px; }
[data-webkit-tip] .dsh-webkit-row {
  padding: 6px 0; border-top: 1px solid var(--dsw-alias-border-strong, #444);
}
[data-webkit-tip] .dsh-webkit-row-num {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; margin-right: 6px; border-radius: 8px;
  background: var(--dsw-alias-text-accent, #4c9aff); color: #fff;
  font-size: 10px; font-weight: 700;
}
[data-webkit-tip] .dsh-webkit-row-sel {
  font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-tertiary);
  word-break: break-word;
}
[data-webkit-tip] .dsh-webkit-row button {
  appearance: none; margin: 0 0 0 8px; cursor: pointer; font: inherit;
  background: transparent; border: 1px solid rgba(255, 107, 107, .4);
  color: #ff8a8a; border-radius: 6px; font-size: 10px; padding: 1px 6px;
}
[data-webkit-tip] .dsh-webkit-row button:hover {
  color: #ffb3b3; border-color: rgba(255, 107, 107, .7);
}
[data-webkit-hint] {
  position: fixed; z-index: 2147483001; display: none; align-items: center; gap: 8px;
  height: 24px; padding: 0 10px; border-radius: 12px; pointer-events: none;
  border: 1px solid var(--dsw-alias-border-inverted);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #2c2c2e));
  box-shadow: var(--dsw-shadow-lv3); font-family: var(--dsw-font-family, system-ui);
  font-size: 11px; color: var(--dsw-alias-label-primary);
  animation: dsh-webkit-fade .1s var(--ds-ease-in-out, ease);
}
[data-webkit-hint] > span[data-badge] {
  padding: 1px 6px; border-radius: 8px; font-size: 10px;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary);
}
[data-webkit-notice] {
  position: fixed; z-index: 2147483002; display: none; max-width: 420px;
  padding: 7px 12px; border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-inverted);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #2c2c2e));
  box-shadow: var(--dsw-shadow-lv3); font-family: var(--dsw-font-family, system-ui);
  font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-primary);
  animation: dsh-webkit-pop .12s var(--ds-ease-in-out, ease);
}
/* 自由尺寸条:固定挂在工具栏之下、视口区之上的一行(不用浮层),开即挂、
   关即摘,由触发键切换。行透明背景 + 下缘细分割线,输入沿用主题 token。 */
[data-webkit-vp] {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 6px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, .25));
  font-family: var(--dsw-font-family, system-ui);
  font-size: 12px; color: var(--dsw-alias-label-secondary);
}
[data-webkit-vp] button {
  appearance: none; cursor: pointer;
  height: 28px; padding: 0 10px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1, transparent);
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, .18));
  border-radius: var(--dsw-radius-sm, 6px);
}
[data-webkit-vp] button:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-webkit-vp] button:disabled {
  color: var(--dsw-alias-label-quaternary);
  cursor: default; background: transparent;
}
[data-webkit-vp] input {
  width: 52px; height: 28px; box-sizing: border-box;
  text-align: center; padding: 0 4px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1, transparent);
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, .18));
  border-radius: var(--dsw-radius-sm, 6px); outline: none;
}
[data-webkit-vp] [data-vp-x] { color: var(--dsw-alias-label-tertiary); }
[data-vp-device] { position: relative; display: flex; }
[data-webkit-vp] [data-vp-device-btn] {
  display: inline-flex; align-items: center; gap: 4px; padding: 0 8px;
}
/* svg 默认按 inline 基线排,12px 小箭头会骑在文字基线上显得偏上;
 * 转成 block 让 span 高度收缩到 svg 本体,随 flex align-items:center 真居中。 */
[data-webkit-vp] [data-vp-device-chevron] svg { display: block; }
[data-vp-device-menu] {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 2147483000;
  display: none; flex-direction: column; min-width: 108px; padding: 4px;
  background: var(--dsw-alias-bg-base, #fff);
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, .18));
  border-radius: 10px;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 16px rgba(15, 23, 42, .14));
}
[data-webkit-vp] [data-vp-device-item] {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; height: auto; padding: 6px 12px; border: 0; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-primary); text-align: left;
}
[data-webkit-vp] [data-vp-device-item]:hover {
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary);
}
[data-vp-device-check] { visibility: hidden; }
[data-vp-device-item][aria-checked="true"] [data-vp-device-check] { visibility: visible; }
`

    // The trigger artwork is the same element-picker glyph the reference
    // sidebar browser uses: the Lucide `mouse-pointer-click` icon node,
    // rendered the way the host renders its toolbar icons (16px box, 2px round
    // stroke, currentColor).
    const TRIGGER_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
      + 'aria-hidden="true">'
      + '<path d="M14 4.1 12 6"/>'
      + '<path d="m5.1 8-2.9-.8"/>'
      + '<path d="m6 12-1.9 2"/>'
      + '<path d="M7.2 2.2 8 5.1"/>'
      + '<path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>'
      + '</svg>'

    // 自由尺寸触发键用 Lucide 的 monitor-smartphone 图形:显示器+手机组合,
    // 呼应条内的手机/平板/桌面/幻灯片多档位(单个手机图标以偏概全),与宿主
    // 工具栏其余图标同规格(16px、2px 圆角描边)。
    const VP_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
      + 'aria-hidden="true">'
      + '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"/>'
      + '<path d="M10 19v-3.96 3.15"/>'
      + '<path d="M7 19h5"/>'
      + '<rect width="6" height="10" x="16" y="12" rx="2"/>'
      + '</svg>'

    // 设备下拉触发键右侧的小箭头(Lucide chevron-down 的宿主画法)。
    const CHEVRON_DOWN = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
      + 'aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'

    // ──────────────────────────── helpers ────────────────────────────
    const passive = { capture: true, passive: true }

    /** Collapses whitespace the way a text projection should. */
    function collapse(value) {
      return String(value ?? '').replace(/\s+/g, ' ').trim()
    }

    /** Truncates with a visible ellipsis (display strings). */
    function short(value, max) {
      const text = collapse(value)
      return text.length > max ? `${text.slice(0, max)}...` : text
    }

    /** Truncates a prompt block and says so. */
    function block(value, max) {
      const text = String(value ?? '')
      return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text
    }

    /** `#RRGGBB` for an opaque colour, `transparent` for an invisible one. */
    function normalizeColor(value) {
      const text = String(value ?? '').trim()
      const match = /^rgba?\(([^)]+)\)$/i.exec(text)
      if (match === null) return text
      const parts = match[1].split(',').map((piece) => Number.parseFloat(piece))
      if (parts.length < 3 || parts.some((piece) => !Number.isFinite(piece))) return text
      const alpha = parts.length >= 4 ? parts[3] : 1
      if (alpha <= 0) return 'transparent'
      const hex = parts.slice(0, 3)
        .map((piece) => Math.max(0, Math.min(255, Math.round(piece))).toString(16).padStart(2, '0'))
        .join('')
      return `#${hex.toUpperCase()}`
    }

    /** A CSS identifier safe to paste into a selector. */
    function safeIdent(value) {
      return /^-?[_a-zA-Z][\w-]*$/.test(value) ? value : undefined
    }

    // The element field set is the behavioural contract: page identity, tag,
    // role, accessible name, selector, XPath, text, nearby text, HTML excerpt,
    // attributes, geometry, and the style properties a model can reason about.
    // `installPicker` produces it, because that function has to be able to run
    // inside the page it inspects.

    /** Renders one described element as the model-facing prompt block. */
    function serializeElement(element, index) {
      const lines = []
      lines.push(`## Element ${index}`)
      lines.push(`URL: ${element.pageUrl}`)
      lines.push(`Title: ${element.pageTitle === '' ? '(untitled)' : element.pageTitle}`)
      lines.push(`Tag: ${element.tagName}`)
      if (element.role !== '') lines.push(`Role: ${element.role}`)
      if (element.accessibleName !== '') lines.push(`Accessible name: ${element.accessibleName}`)
      lines.push(`Selector: ${element.selector}`)
      lines.push(`XPath: ${element.xpath}`)
      const attributeKeys = Object.keys(element.attributes)
      if (attributeKeys.length > 0) {
        lines.push('Attributes:')
        for (const key of attributeKeys) lines.push(`  ${key}=${JSON.stringify(element.attributes[key])}`)
      }
      if (element.style.color !== '') lines.push(`Color: ${element.style.color}`)
      if (element.style.backgroundColor !== undefined) lines.push(`Background: ${element.style.backgroundColor}`)
      const font = collapse(`${element.style.fontSize} ${element.style.fontFamily}`)
      if (font !== '') lines.push(`Font: ${font}`)
      if (element.style.fontWeight !== '') lines.push(`Font weight: ${element.style.fontWeight}`)
      if (element.style.display !== '') lines.push(`Display: ${element.style.display}`)
      const { x, y, width, height } = element.rect
      lines.push(`Rect: x=${x}, y=${y}, width=${width}, height=${height}`)
      lines.push('Text:')
      lines.push('```')
      lines.push(element.text)
      lines.push('```')
      lines.push('Nearby context:')
      lines.push('```')
      lines.push(element.nearbyText)
      lines.push('```')
      lines.push('HTML excerpt:')
      lines.push('```html')
      lines.push(element.htmlExcerpt)
      lines.push('```')
      return lines.join('\n')
    }

    /**
     * The element picker.
     *
     * Deliberately self-contained: this exact function is serialized with
     * `Function.prototype.toString` and evaluated inside the page shown by the
     * sidebar browser, so it may not close over anything in this module. The
     * same body also runs in this realm against a same-origin child document and
     * against a snapshot document, which is why the window and document are
     * parameters with defaults.
     *
     * @param config - `{ limits, labels }`; every cap and label is injected.
     * @param page - `{ url, title }` identity to fall back on.
     * @param hostWin - window to drive; defaults to this realm's window.
     * @param hostDoc - document to pick in; defaults to this realm's document.
     * @returns a promise settling once with `{ status: 'selected', element }`
     *   or `{ status: 'cancelled' }`. `window.__dshWebkit.cancel()`
     *   aborts the session from outside.
     */
    function installPicker(config, page, hostWin, hostDoc) {
      const win = hostWin || window
      const doc = hostDoc || document
      const limits = (config && config.limits) || {}
      const labels = (config && config.labels) || {}
      const identity = page || {}
      const maxText = limits.text || 4000
      const maxHtml = limits.html || 6000
      const maxAttr = limits.attribute || 500
      const maxNearby = limits.nearby || 4000
      const maxName = limits.name || 160
      const maxFont = limits.fontFamily || 96
      const selectorDepth = limits.selectorDepth || 8
      const xpathDepth = limits.xpathDepth || 12
      const labelBackground = labels.background || 'Background'
      const labelColor = labels.color || 'Color'
      const labelFont = labels.font || 'Font'

      function collapse(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
      }

      function short(value, max) {
        const text = collapse(value)
        return text.length > max ? text.slice(0, max - 1) + '\u2026' : text
      }

      function block(value, max) {
        const text = String(value == null ? '' : value).trim()
        return text.length > max ? text.slice(0, max) + '\n[truncated]' : text
      }

      function normalizeColor(value) {
        const text = collapse(value)
        if (text === '') return ''
        const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(text)
        if (match === null) return text
        const alpha = match[4] === undefined ? 1 : Number(match[4])
        if (alpha <= 0) return 'transparent'
        const hex = (part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0')
        return ('#' + hex(match[1]) + hex(match[2]) + hex(match[3])).toUpperCase()
      }

      function safeIdent(value) {
        return /^-?[_a-zA-Z][\w-]*$/.test(value) ? value : undefined
      }

      function roleOf(el) {
        const explicit = collapse(el.getAttribute('role'))
        if (explicit !== '') return explicit
        const tag = String(el.tagName || '').toLowerCase()
        if (tag === 'button') return 'button'
        if (tag === 'a') return collapse(el.getAttribute('href')) !== '' ? 'link' : ''
        if (tag === 'img') return 'img'
        if (tag === 'textarea') return 'textbox'
        if (tag === 'select') return 'combobox'
        if (tag === 'nav') return 'navigation'
        if (tag === 'main') return 'main'
        if (tag === 'form') return 'form'
        if (/^h[1-6]$/.test(tag)) return 'heading'
        if (tag === 'input') {
          const type = collapse(el.getAttribute('type') || 'text').toLowerCase()
          if (type === 'checkbox' || type === 'radio' || type === 'range') return 'slider'
          if (type === 'button' || type === 'submit' || type === 'reset') return 'button'
          return 'textbox'
        }
        return ''
      }

      function accessibleNameOf(el) {
        const labelledBy = collapse(el.getAttribute('aria-labelledby'))
        if (labelledBy !== '') {
          const parts = []
          for (const id of labelledBy.split(' ')) {
            if (id === '') continue
            const target = doc.getElementById(id)
            if (target !== null) parts.push(collapse(target.textContent))
          }
          const joined = collapse(parts.join(' '))
          if (joined !== '') return short(joined, maxName)
        }
        const sources = ['aria-label', 'alt', 'title', 'placeholder']
        for (const name of sources) {
          const value = collapse(el.getAttribute(name))
          if (value !== '') return short(value, maxName)
        }
        return short(el.textContent, maxName)
      }

      function cssPathOf(el) {
        const own = collapse(el.getAttribute('id'))
        if (own !== '' && safeIdent(own) !== undefined) return '#' + own
        const parts = []
        let node = el
        let depth = 0
        while (node !== null && node !== undefined && node.nodeType === 1 && depth < selectorDepth) {
          const tag = String(node.tagName || '').toLowerCase()
          if (tag === '') break
          const id = collapse(node.getAttribute('id'))
          if (depth === 0 && id !== '' && safeIdent(id) !== undefined) {
            parts.unshift('#' + id)
            break
          }
          let part = tag
          const classes = String(node.getAttribute('class') || '').split(/\s+/).filter((name) => safeIdent(name) !== undefined)
          if (classes.length > 0) part += '.' + classes.slice(0, 2).join('.')
          const parent = node.parentElement
          if (parent !== null && parent !== undefined) {
            const sameTag = []
            for (const sibling of parent.children) {
              if (String(sibling.tagName || '').toLowerCase() === tag) sameTag.push(sibling)
            }
            if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')'
          }
          parts.unshift(part)
          node = node.parentElement
          depth += 1
        }
        return parts.join(' > ')
      }

      function xPathOf(el) {
        const parts = []
        let node = el
        let depth = 0
        while (node !== null && node !== undefined && node.nodeType === 1 && depth < xpathDepth) {
          const tag = String(node.tagName || '').toLowerCase()
          if (tag === '') break
          const parent = node.parentElement
          if (parent === null || parent === undefined) {
            parts.unshift(tag)
            break
          }
          let index = 1
          for (const sibling of parent.children) {
            if (sibling === node) break
            if (String(sibling.tagName || '').toLowerCase() === tag) index += 1
          }
          parts.unshift(tag + '[' + index + ']')
          node = parent
          depth += 1
        }
        return '/' + parts.join('/')
      }

      function attributesOf(el) {
        const kept = {}
        const names = ['id', 'class', 'href', 'src', 'alt', 'title', 'name', 'type', 'placeholder', 'role']
        for (const name of names) {
          const value = collapse(el.getAttribute(name))
          if (value !== '') kept[name] = short(value, maxAttr)
        }
        let index = 0
        while (index < el.attributes.length) {
          const attribute = el.attributes[index]
          index += 1
          const name = String(attribute.name || '')
          if (!name.startsWith('aria-')) continue
          if (kept[name] !== undefined) continue
          kept[name] = short(attribute.value, maxAttr)
        }
        return kept
      }

      function htmlExcerptOf(el) {
        const clone = el.cloneNode(true)
        const drop = ['script', 'style', 'noscript', 'template']
        for (const tag of drop) {
          const found = clone.querySelectorAll(tag)
          let index = 0
          while (index < found.length) {
            const node = found[index]
            index += 1
            if (node.parentElement !== null && node.parentElement !== undefined) node.parentElement.removeChild(node)
          }
        }
        const inputs = clone.querySelectorAll('input')
        let inputIndex = 0
        while (inputIndex < inputs.length) {
          const input = inputs[inputIndex]
          inputIndex += 1
          input.removeAttribute('value')
          const type = collapse(input.getAttribute('type')).toLowerCase()
          if (type === 'password') input.setAttribute('type', 'password')
        }
        const areas = clone.querySelectorAll('textarea')
        let areaIndex = 0
        while (areaIndex < areas.length) {
          const area = areas[areaIndex]
          areaIndex += 1
          while (area.firstChild !== null && area.firstChild !== undefined) area.removeChild(area.firstChild)
        }
        return block(clone.outerHTML || '', maxHtml)
      }

      function textOf(el) {
        const tag = String(el.tagName || '').toLowerCase()
        if (tag === 'input') {
          const type = collapse(el.getAttribute('type') || 'text').toLowerCase()
          if (type === 'password') return '[masked password input]'
          const label = collapse(el.getAttribute('aria-label')) || collapse(el.getAttribute('placeholder'))
            || collapse(el.getAttribute('name')) || type || 'input'
          const value = collapse(el.value)
          return block(value === '' ? label : label + ' = ' + value, maxText)
        }
        if (tag === 'textarea') {
          const label = collapse(el.getAttribute('aria-label')) || collapse(el.getAttribute('placeholder'))
            || collapse(el.getAttribute('name')) || 'textarea'
          const value = collapse(el.value)
          return block(value === '' ? label : label + ' = ' + value, maxText)
        }
        const text = el.innerText !== undefined && el.innerText !== null ? el.innerText : el.textContent
        return block(text || '', maxText)
      }

      function nearbyTextOf(el) {
        const region = el.closest('article, section, main, form, li, tr, dialog') || el.parentElement || el
        const text = region !== null && region !== undefined
          ? (region.innerText !== undefined && region.innerText !== null ? region.innerText : region.textContent)
          : ''
        return block(text || '', maxNearby)
      }

      function describe(el) {
        const style = win.getComputedStyle ? win.getComputedStyle(el) : null
        const rect = el.getBoundingClientRect()
        const described = {
          pageUrl: collapse(identity.url) !== '' ? collapse(identity.url) : (function () {
            try { return String(doc.location.href) } catch (error) { return '' }
          })(),
          pageTitle: collapse(doc.title) !== '' ? collapse(doc.title) : collapse(identity.title),
          tagName: String(el.tagName || '').toLowerCase(),
          role: roleOf(el),
          accessibleName: accessibleNameOf(el),
          selector: cssPathOf(el),
          xpath: xPathOf(el),
          text: textOf(el),
          nearbyText: nearbyTextOf(el),
          htmlExcerpt: htmlExcerptOf(el),
          attributes: attributesOf(el),
          rect: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          style: {
            color: normalizeColor(style ? style.color : ''),
            display: collapse(style ? style.display : ''),
            fontFamily: short(style ? style.fontFamily : '', maxFont),
            fontSize: collapse(style ? style.fontSize : ''),
            fontWeight: collapse(style ? style.fontWeight : ''),
          },
          capturedAt: Date.now(),
        }
        const background = normalizeColor(style ? style.backgroundColor : '')
        if (background !== '' && background !== 'transparent') described.style.backgroundColor = background
        return described
      }

      // ── injected layers ──
      const overlay = doc.createElement('div')
      overlay.setAttribute('data-webkit-overlay', '')
      overlay.style.cssText = 'position:fixed;display:none;box-sizing:border-box;pointer-events:none;'
        + 'z-index:2147483646;border:2px solid #2563eb;border-radius:4px;'
        + 'background:rgba(37,99,235,.12);box-shadow:0 0 0 9999px rgba(15,23,42,.10);'
      const card = doc.createElement('div')
      card.setAttribute('data-webkit-card', '')
      card.style.cssText = 'position:fixed;display:none;box-sizing:border-box;pointer-events:none;'
        + 'z-index:2147483647;min-width:214px;width:min(320px,calc(100vw - 16px));'
        + 'padding:12px 18px 14px;border-radius:18px;border:1px solid rgba(255,255,255,.14);'
        + 'background:rgba(17,24,39,.92);backdrop-filter:blur(10px);'
        + 'box-shadow:0 18px 38px rgba(15,23,42,.28);color:#f9fafb;'
        + 'font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'

      const docElement = doc.documentElement
      const previousCursor = docElement !== null && docElement !== undefined ? docElement.style.cursor : ''
      if (docElement !== null && docElement !== undefined) {
        docElement.appendChild(overlay)
        docElement.appendChild(card)
        docElement.style.cursor = 'crosshair'
      }

      let hovered = null
      let done = false
      let settle = null
      const promise = new Promise((resolve) => { settle = resolve })

      function hideLayers() {
        overlay.style.display = 'none'
        card.style.display = 'none'
        hovered = null
      }

      function placeCard(rect) {
        const gap = 12
        const margin = 8
        const width = card.offsetWidth || 240
        const height = card.offsetHeight || 90
        const vw = win.innerWidth || 0
        const vh = win.innerHeight || 0
        const clampX = (x) => Math.max(margin, Math.min(x, Math.max(margin, vw - width - margin)))
        const clampY = (y) => Math.max(margin, Math.min(y, Math.max(margin, vh - height - margin)))
        const overlaps = (x, y) => !(x + width <= rect.left || x >= rect.right || y + height <= rect.top || y >= rect.bottom)
        const candidates = [
          [rect.left, rect.bottom + gap],
          [rect.left, rect.top - height - gap],
          [rect.right + gap, rect.top],
          [rect.left - width - gap, rect.top],
        ]
        let chosen = null
        for (const candidate of candidates) {
          const x = clampX(candidate[0])
          const y = clampY(candidate[1])
          if (!overlaps(x, y)) { chosen = [x, y]; break }
        }
        if (chosen === null) chosen = [clampX(candidates[0][0]), clampY(candidates[0][1])]
        card.style.left = chosen[0] + 'px'
        card.style.top = chosen[1] + 'px'
      }

      function row(label, value, mono) {
        const line = doc.createElement('div')
        line.style.cssText = 'display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:baseline;'
        const key = doc.createElement('span')
        key.textContent = label
        key.style.cssText = 'font-size:15px;font-weight:600;color:rgba(255,255,255,.62);white-space:nowrap;'
        const val = doc.createElement('span')
        val.textContent = value
        val.style.cssText = 'font-size:15px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
          + (mono ? 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;' : '')
        line.appendChild(key)
        line.appendChild(val)
        return line
      }

      function renderCard(el, rect) {
        const style = win.getComputedStyle ? win.getComputedStyle(el) : null
        while (card.firstChild !== null && card.firstChild !== undefined) card.removeChild(card.firstChild)
        const head = doc.createElement('div')
        head.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:baseline;'
        const name = doc.createElement('span')
        name.textContent = String(el.tagName || '').toLowerCase()
        name.style.cssText = 'font-size:16px;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
        const size = doc.createElement('span')
        size.textContent = Math.round(rect.width) + '\u00d7' + Math.round(rect.height)
        size.style.cssText = 'font-size:15px;font-weight:800;color:#fff;white-space:nowrap;'
          + 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;'
        head.appendChild(name)
        head.appendChild(size)
        card.appendChild(head)

        const color = normalizeColor(style ? style.color : '')
        if (color !== '') card.appendChild(row(labelColor, color, true))
        const background = normalizeColor(style ? style.backgroundColor : '')
        if (background !== '' && background !== 'transparent') card.appendChild(row(labelBackground, background, true))
        const font = collapse((style ? style.fontSize : '') + ' ' + (style ? style.fontFamily : ''))
        if (font !== '') card.appendChild(row(labelFont, short(font, maxFont), false))

        card.style.display = 'block'
        placeCard(rect)
      }

      function acceptable(el) {
        if (el === null || el === undefined) return false
        if (el === overlay || el === card) return false
        if (el.closest && el.closest('[data-webkit-overlay],[data-webkit-card]') !== null) return false
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }

      function onMove(event) {
        const el = event.target
        if (!acceptable(el)) { hideLayers(); return }
        const rect = el.getBoundingClientRect()
        hovered = el
        overlay.style.display = 'block'
        overlay.style.left = rect.left + 'px'
        overlay.style.top = rect.top + 'px'
        overlay.style.width = rect.width + 'px'
        overlay.style.height = rect.height + 'px'
        renderCard(el, rect)
      }

      function cleanup() {
        doc.removeEventListener('mousemove', onMove, true)
        doc.removeEventListener('click', onClick, true)
        doc.removeEventListener('keydown', onKeyDown, true)
        win.removeEventListener('keydown', onKeyDown, true)
        win.removeEventListener('pagehide', onPageGone)
        win.removeEventListener('beforeunload', onPageGone)
        overlay.parentElement && overlay.parentElement.removeChild(overlay)
        card.parentElement && card.parentElement.removeChild(card)
        if (docElement !== null && docElement !== undefined) {
          try { docElement.style.cursor = previousCursor } catch (error) { /* document may be gone */ }
        }
        try { delete win.__dshWebkit } catch (error) { win.__dshWebkit = undefined }
      }

      function finish(result) {
        if (done) return
        done = true
        cleanup()
        settle(result)
      }

      function onClick(event) {
        event.preventDefault()
        event.stopPropagation()
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
        if (hovered === null) { finish({ status: 'cancelled' }); return }
        finish({ status: 'selected', element: describe(hovered) })
      }

      function onKeyDown(event) {
        if (event.key !== 'Escape') return
        event.preventDefault()
        finish({ status: 'cancelled' })
      }

      function onPageGone() {
        finish({ status: 'cancelled' })
      }

      win.__dshWebkit = { cancel: () => finish({ status: 'cancelled' }) }

      doc.addEventListener('mousemove', onMove, { capture: true, passive: true })
      doc.addEventListener('click', onClick, true)
      doc.addEventListener('keydown', onKeyDown, true)
      win.addEventListener('keydown', onKeyDown, true)
      win.addEventListener('pagehide', onPageGone)
      win.addEventListener('beforeunload', onPageGone)

      return promise
    }

    // ────────────────────────── snapshot frame ────────────────────────
    /**
     * Mounts the Host-rendered snapshot over the live frame.
     * @param liveFrame - the sidebar browser iframe being replaced visually.
     * @param url - the address the live frame currently shows.
     * @returns `{ frame, win, doc }` on success, or `{ error }`.
     */
    function openSnapshot(liveFrame, url) {
      return new Promise((settle) => {
        const frame = document.createElement('iframe')
        frame.setAttribute('data-webkit-snapshot', '')
        frame.setAttribute('referrerpolicy', 'no-referrer')
        frame.style.cssText = 'position:fixed;z-index:2147483000;border:0;margin:0;padding:0;'
          + 'background:var(--dsw-alias-bg-base, #fff);display:block;'
        document.body.appendChild(frame)

        let settled = false
        /** Keeps the overlay glued to the live frame while the sidebar moves. */
        const sync = () => {
          if (!frame.isConnected) return
          const rect = liveFrame.getBoundingClientRect()
          frame.style.left = `${Math.round(rect.left)}px`
          frame.style.top = `${Math.round(rect.top)}px`
          frame.style.width = `${Math.round(rect.width)}px`
          frame.style.height = `${Math.round(rect.height)}px`
        }
        sync()
        let raf = 0
        const tick = () => {
          if (!frame.isConnected) return
          sync()
          raf = window.requestAnimationFrame(tick)
        }
        raf = window.requestAnimationFrame(tick)

        /** Detaches the overlay and stops following the live frame. */
        const close = () => {
          if (raf !== 0) window.cancelAnimationFrame(raf)
          raf = 0
          frame.remove()
        }

        const done = (value) => {
          if (settled) return
          settled = true
          if (value.error !== undefined) {
            close()
            settle(value)
            return
          }
          settle({ ...value, close })
        }

        frame.addEventListener('load', () => {
          let doc = null
          try {
            doc = frame.contentDocument
          } catch {
            doc = null
          }
          if (doc === null) {
            done({ error: 'the snapshot document is not reachable' })
            return
          }
          const failure = doc.body?.getAttribute('data-webkit-error')
          if (failure !== null && failure !== undefined) {
            done({ error: failure })
            return
          }
          done({ frame, win: frame.contentWindow, doc })
        })

        frame.addEventListener('error', () => { done({ error: 'the snapshot failed to load' }) })
        frame.src = `/webkit/snapshot?url=${encodeURIComponent(url)}`
      })
    }

    /** The live frame's document, when the page is same-origin. */
    function liveDocumentOf(iframe) {
      if (iframe === null) return null
      let doc = null
      try {
        doc = iframe.contentDocument
      } catch {
        return null
      }
      if (!doc || !doc.documentElement) return null
      try {
        if (doc.location?.href === 'about:blank') return null
      } catch {
        return null
      }
      return { win: iframe.contentWindow, doc }
    }

    // ─────────────────────────── draft write ──────────────────────────
    // The composer is a Lexical document: `setDraft` rebuilds it from a string
    // and flattens every existing chip, so a chipped draft is only ever written
    // through the host's span channel.

    /** One separating space, unless the draft already ends in whitespace. */
    function leadFor(draft) {
      if (draft.trim() === '') return ''
      return /\s$/.test(draft) ? '' : ' '
    }

    /**
     * The document-end offset in the host's detect projection, where each chip
     * collapses to one character and a command claim to one more.
     */
    function detectEndOffset(snapshot) {
      const draft = typeof snapshot.draft === 'string' ? snapshot.draft : ''
      const occurrences = Array.isArray(snapshot.occurrences) ? snapshot.occurrences : []
      const claim = snapshot.phase === 'claimed' ? snapshot.claim : undefined
      const token = claim !== undefined && typeof claim.token === 'string' && draft.startsWith(claim.token)
        ? claim.token
        : ''
      if (token === '') {
        let shrink = 0
        for (const occurrence of occurrences) {
          if (occurrence.offset + occurrence.length <= draft.length) shrink += occurrence.length - 1
        }
        return draft.length - shrink
      }
      let innerShrink = 0
      for (const occurrence of occurrences) {
        if (occurrence.offset >= token.length) innerShrink += occurrence.length - 1
      }
      return 1 + (draft.length - token.length - innerShrink)
    }

    /**
     * The detect-projection span of one chip occurrence.
     *
     * The two views disagree: a chip is `clipboardText.length` characters in the
     * draft text but a single placeholder in the detect text, and a command
     * token is one more. Span edits address the detect view, so the conversion
     * has to happen here.
     */
    function chipSpan(snapshot, occurrence) {
      const draft = typeof snapshot.draft === 'string' ? snapshot.draft : ''
      const occurrences = Array.isArray(snapshot.occurrences) ? snapshot.occurrences : []
      const claim = snapshot.phase === 'claimed' ? snapshot.claim : undefined
      const token = claim !== undefined && typeof claim.token === 'string' && draft.startsWith(claim.token)
        ? claim.token
        : ''
      let shrink = 0
      for (const other of occurrences) {
        if (other === occurrence) break
        if (other.offset + other.length <= occurrence.offset) shrink += other.length - 1
      }
      const base = token === ''
        ? occurrence.offset
        : 1 + Math.max(0, occurrence.offset - token.length)
      return { start: base - shrink, end: base - shrink + 1 }
    }

    /** The selector line out of a serialized element block. */
    function selectorFromReference(reference) {
      const line = /^Selector: (.*)$/m.exec(reference)
      return line === null ? '' : line[1]
    }

    /** The stable id one occurrence is addressed by. */
    function occurrenceIdOf(occurrence) {
      const reference = typeof occurrence.ref === 'string' ? occurrence.ref : ''
      return String(occurrence.occurrenceId ?? reference)
    }

    /**
     * The span of one chip, measured against the snapshot handed in.
     *
     * Callers must pass a *fresh* snapshot: the offsets move as the draft
     * changes, so a span derived from an older snapshot would still satisfy the
     * revision guard (once that guard is read from the new revision) and edit
     * the wrong characters.
     */
    function spanOfChip(snapshot, id) {
      const occurrences = Array.isArray(snapshot.occurrences) ? snapshot.occurrences : []
      const occurrence = occurrences.find((candidate) => occurrenceIdOf(candidate) === id)
      if (occurrence === undefined) return null
      const span = chipSpan(snapshot, occurrence)
      return { draftRev: snapshot.draftRev, start: span.start, end: span.end }
    }

    /**
     * The picked elements as the draft currently holds them.
     *
     * This is a projection, never a list of our own: the draft is the only
     * authority, so a chip removed in the composer disappears from the pill and
     * a send can never carry an element that is not visibly attached.
     */
    function draftItems(ctx) {
      const sessionId = currentSessionId(ctx)
      if (sessionId === undefined) return []
      const found = inputFor(ctx, sessionId)
      if (found === null) return []
      let snapshot
      try {
        snapshot = found.input.state.getSnapshot()
      } catch (error) {
        return []
      }
      const occurrences = Array.isArray(snapshot.occurrences) ? snapshot.occurrences : []
      const items = []
      for (const occurrence of occurrences) {
        if (occurrence.source !== 'reference') continue
        const reference = typeof occurrence.ref === 'string' ? occurrence.ref : ''
        if (!reference.startsWith('## Element ')) continue
        const label = typeof occurrence.label === 'string' ? occurrence.label : ''
        // No span and no revision are cached here on purpose: both go stale the
        // moment the draft changes, and a cached span is what lets a delete land
        // on the wrong characters. Deletion re-measures from a fresh snapshot.
        items.push({
          id: occurrenceIdOf(occurrence),
          label,
          tag: label.replace(/^\[[^\]]*\]\s*/, '') || 'element',
          selector: selectorFromReference(reference),
          reference,
        })
      }
      return items
    }

    /** Whether the draft currently accepts an edit. */
    function draftWritable(snapshot) {
      return snapshot.phase !== 'adjudicating' && snapshot.phase !== 'submitting'
    }

    /** Deletes one reference chip from the draft. */
    function removeFromDraft(ctx, item) {
      const sessionId = currentSessionId(ctx)
      if (sessionId === undefined) return false
      const found = inputFor(ctx, sessionId)
      if (found === null) return false
      const { actx, input } = found
      try {
        const snapshot = input.state.getSnapshot()
        if (!draftWritable(snapshot)) return false
        // Offsets shift whenever the draft changes, so the span is recomputed
        // against this fresh snapshot instead of trusting the one captured when
        // the panel was last drawn. A stale span plus a fresh revision would pass
        // the revision check and delete the wrong characters.
        const span = spanOfChip(snapshot, item.id)
        if (span === null) return false
        if (typeof input.insertText === 'function') return input.insertText('', span) !== false
        actx.emit('slash/input-insert-text', { text: '', span })
        return true
      } catch (error) {
        console.warn('[dsh-webkit] could not remove that reference', error)
        return false
      }
    }

    /** Resolves the conversation input facade for one session. */
    function inputFor(ctx, sessionId) {
      const actx = ctx.sessions.scope(sessionId)
      if (actx === undefined) return null
      const conversation = ctx.get('conversation')
      if (conversation === undefined || conversation === null) return null
      const input = conversation.input.for(actx)
      if (input === undefined || input === null) return null
      return { actx, input }
    }

    /**
     * Appends one structured reference to the session's draft.
     * @returns whether the host accepted the write.
     */
    function appendReference(ctx, sessionId, reference) {
      try {
        const found = inputFor(ctx, sessionId)
        if (found === null) return false
        const { actx, input } = found
        const snapshot = input.state.getSnapshot()
        if (snapshot.phase === 'adjudicating' || snapshot.phase === 'submitting') return false
        const occurrences = Array.isArray(snapshot.occurrences) ? snapshot.occurrences : []
        if (typeof input.insertReference === 'function' && snapshot.draftRev !== undefined) {
          let at = detectEndOffset(snapshot)
          let revision = snapshot.draftRev
          const lead = leadFor(snapshot.draft)
          if (lead !== '') {
            // `insertReference` adds a space after a chip but never before it.
            actx.emit('slash/input-insert-text', { text: lead, span: { draftRev: revision, start: at, end: at } })
            const after = input.state.getSnapshot()
            if (after.draftRev === revision) return false
            revision = after.draftRev ?? revision
            at += lead.length
          }
          input.insertReference(reference, { draftRev: revision, start: at, end: at })
          return true
        }
        // No chip channel: a chipless draft can take the plain-string write.
        if (occurrences.length === 0 && snapshot.phase !== 'claimed' && typeof input.setDraft === 'function') {
          input.setDraft(`${snapshot.draft}${leadFor(snapshot.draft)}${reference.ref}`)
          return true
        }
        if (snapshot.draftRev === undefined) return false
        const at = detectEndOffset(snapshot)
        actx.emit('slash/input-insert-text', {
          text: `${leadFor(snapshot.draft)}${reference.ref}`,
          span: { draftRev: snapshot.draftRev, start: at, end: at },
        })
        return input.state.getSnapshot().draftRev !== snapshot.draftRev
      } catch (error) {
        console.warn('[dsh-webkit] draft insert failed:', error)
        return false
      }
    }

    /**
     * Builds the chip payload for one picked element.
     *
     * `clipboardText` is what the draft shows when the chip is projected to a
     * plain string — and that string is what a submitted message carries. It
     * therefore holds the whole element description, not the short label: any
     * plain-text rewrite of the draft (a sibling plugin composing its block with
     * `setDraft`, for one) must not be able to drop what the element was.
     */
    function referenceFor(ref, label) {
      const text = typeof label === 'string' && label !== '' ? label : '[element]'
      return { source: 'reference', ref, label: text, clipboardText: ref }
    }

    /** The session whose composer the pick should land in. */
    function currentSessionId(ctx) {
      try {
        const face = ctx.get('uiSession')
        const source = face?.adapter?.current
        if (source !== undefined && source !== null && typeof source.getSnapshot === 'function') {
          const key = source.getSnapshot()?.key
          if (typeof key === 'string' && key !== '') return key
        }
      } catch { /* older kernels have no uiSession */ }
      try {
        const raw = window.localStorage.getItem('dsh.sessions.current')
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (typeof parsed?.sessionId === 'string' && parsed.sessionId !== '') return parsed.sessionId
        }
      } catch { /* no persisted selection */ }
      try {
        const snapshot = ctx.sessions.list.getSnapshot()
        if (typeof snapshot?.current === 'string' && snapshot.current !== '') return snapshot.current
        const byId = snapshot?.byId
        if (byId !== null && typeof byId === 'object') {
          const ids = Array.isArray(snapshot.ids) ? snapshot.ids : Object.keys(byId)
          for (const id of ids) {
            const retained = byId[id]?.retainedBy
            if (retained !== null && typeof retained === 'object' && Number(retained.mainView) > 0) return id
          }
        }
      } catch { /* session list not ready */ }
      return undefined
    }

    // ──────────────────────────── apply ───────────────────────────────
    exports.inject = ['sessions', 'conversation', 'locale', 'uiSession']

    /** The real Client entry; guarded by `exports.apply` below. */
    function run(ctx) {
      const state = {
        items: [],
        picking: false,
        cancelPick: null,
        hintFrame: null,
      }

      /** The active language, from the Client locale service. */
      let language = 'zh'
      const t = (key, values) => {
        const table = TEXT[language] ?? TEXT.zh
        const template = table[key] ?? TEXT.zh[key] ?? key
        if (values === undefined) return template
        return template.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))
      }

      /** Re-reads the locale; unknown languages read English. */
      function readLanguage() {
        let active
        try {
          const snapshot = ctx.locale?.getSnapshot()
          active = snapshot?.active ?? snapshot?.locale ?? snapshot?.language
        } catch {
          active = undefined
        }
        language = typeof active === 'string' && active.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      }
      readLanguage()

      // ── styles and layers ──
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = STYLE_TEXT
      document.head.appendChild(style)

      const chipLayer = document.createElement('div')
      chipLayer.setAttribute('data-webkit-chip', '')
      chipLayer.style.cssText = CHIP_CSS
      document.body.appendChild(chipLayer)

      const tipLayer = document.createElement('div')
      tipLayer.setAttribute('data-webkit-tip', '')
      document.body.appendChild(tipLayer)

      const hintLayer = document.createElement('div')
      hintLayer.setAttribute('data-webkit-hint', '')
      document.body.appendChild(hintLayer)

      const noticeLayer = document.createElement('div')
      noticeLayer.setAttribute('data-webkit-notice', '')
      document.body.appendChild(noticeLayer)

      // ── 自由尺寸:状态与固定尺寸条 ──
      // 只对「当前可见的那一个 frame」生效(桌面 keepMounted 下隐藏 tab 的
      // webview offsetWidth 为 0)。尺寸以整段 style.cssText 落盘,退出时还原
      // 进入前捕获的 cssText —— 宿主的 webview 平时没有内联样式,还原即回到类默认。
      // 尺寸条不常驻 DOM:开着时插到工具栏 form 之后(地址栏下面一行),关了即摘。
      const vpBar = document.createElement('div')
      vpBar.setAttribute('data-webkit-vp', '')
      // 关键布局写内联:即使页面残留旧版浮动 CSS(中途刷新/按版本键的缓存),
      // 条也被钉死在流内,绝不可能再浮成盖住工具栏的卡片。
      vpBar.style.cssText = 'position:static;display:flex;align-items:center;justify-content:center;gap:8px;'
        + 'flex:0 0 auto;width:100%;box-sizing:border-box;padding:6px 12px;'
        + 'background:transparent;border:0;'
        + 'border-bottom:0.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.25));'
        + 'border-radius:0;box-shadow:none;'

      const vp = {
        open: false, // 尺寸条是否展开;关闭必然同时还原尺寸
        size: null, // 当前生效的 {w,h}
        frame: null, // 承载内联样式的 frame 元素
        prevCss: '', // 进入前捕获的 cssText,用于还原
        form: null, // 打开时所在的工具栏 form;尺寸条挂在它后面
        fit: null, // 当前缩放 {z,dx,dy};null=1:1 不缩放(margin:auto 居中)
      }

      /** 当前可见的浏览器 frame(桌面 keepMounted 的隐藏 tab 会被几何过滤掉)。 */
      function visibleFrames() {
        return [...document.querySelectorAll('[data-sidebar-browser-frame]')]
          .filter((frame) => frame.offsetWidth > 0 && frame.offsetHeight > 0)
      }

      /**
       * 适应窗口:整框塞进面板可视区(参考实现同款 min(1,…),只缩不放)。
       * 返回 {z, dx, dy}——z 是缩放比,dx/dy 把缩放后的视觉框摆到面板正中;
       * 量不到面板尺寸(隔离环境/异常)或尺寸完全放得下时返回 null,即 1:1。
       */
      function fitFor(frame, size) {
        try {
          const box = frame.parentElement
          const availW = box !== null && box !== undefined ? box.clientWidth : undefined
          const availH = box !== null && box !== undefined ? box.clientHeight : undefined
          if (!Number.isFinite(availW) || !Number.isFinite(availH) || availW <= 0 || availH <= 0) return null
          const z = Math.min(1, availW / size.w, availH / size.h)
          if (z >= 1) return null
          return { z, dx: (availW - size.w * z) / 2, dy: (availH - size.h * z) / 2 }
        } catch {
          return null
        }
      }

      /**
       * 可见 frame 所属面板的工具栏 form:从 frame 向上走,第一个装有工具栏
       * form 的祖先就是面板根。找不到返回 null(条退回打开时记录的 form)。
       */
      function toolbarFormFor(frame) {
        let node = frame.parentElement
        for (let depth = 0; node !== null && depth < 8; depth += 1) {
          const forms = typeof node.querySelectorAll === 'function' ? node.querySelectorAll('form') : []
          const form = [...forms].find(isToolbarForm)
          if (form !== undefined) return form
          node = node.parentElement
        }
        return null
      }

      /** 解析尺寸并落到当前可见的 frame;没有可见页面时提示。 */
      function applyVp(size) {
        const frame = visibleFrames()[0]
        if (frame === undefined) {
          notify(t('vpNoPage'))
          return
        }
        applyVpTo(frame, size)
      }

      /** 把尺寸落到 frame 上;换 frame 时先还原旧的再捕获新的原始 cssText。
       *  缩放在这里算(frame/size 都已确定):fit=按面板实时算,zoom=选定档。
       *  千万别在外部先算再传入——那时 vp.size 还是旧值,fit 会按旧尺寸算错。 */
      function applyVpTo(frame, size) {
        if (vp.frame !== null && vp.frame !== frame) {
          try {
            vp.frame.style.cssText = vp.prevCss
          } catch (error) {
            // 旧 frame 已随 tab 关闭销毁,无需还原。
          }
          vp.prevCss = ''
        }
        if (vp.frame !== frame) {
          vp.prevCss = frame.style.cssText ?? ''
          vp.frame = frame
        }
        vp.size = size
        vp.fit = fitFor(frame, size)
        frame.style.cssText = viewportCssText(size, vp.fit)
        syncVpUi()
      }

      /** 适应窗口:清掉我们写入的 cssText,回到宿主类默认的 100%/100%。 */
      function restoreVp() {
        if (vp.frame !== null) {
          try {
            vp.frame.style.cssText = vp.prevCss
          } catch (error) {
            // frame 已销毁。
          }
          vp.frame = null
        }
        vp.size = null
        vp.fit = null
        syncVpUi()
      }

      function openVp(form) {
        vp.open = true
        if (form !== undefined && form !== null) vp.form = form
        buildVpBar() // 每次展开都重建内容:预填最新记忆尺寸,清掉上次的输入残留
        // 打开即生效:直接把记忆/默认尺寸套到可见 frame,不等回车;
        // 输入框仍可微调(回车重新应用),记忆只在用户显式回车时更新。
        // 适应窗口是唯一视觉模式,应用尺寸时自动按面板缩放。
        applyVp(loadViewportSize())
        syncVp()
      }

      /** 关闭尺寸条;语义上等于退出自由尺寸,不留「关着但还在生效」的状态。 */
      function closeVp() {
        vp.open = false
        restoreVp()
        vpBar.remove()
        syncVpUi()
      }

      /**
       * 尺寸条的挂载位:可见 frame 所属面板的工具栏之后(地址栏下面一行)。
       * React 重渲染可能把条摘走,每轮 scan 都会补挂;没开着就不在 DOM 里。
       */
      function syncVpBar() {
        if (!vp.open) {
          vpBar.remove()
          return
        }
        const frame = visibleFrames()[0]
        const form = (frame !== undefined ? toolbarFormFor(frame) : null) ?? vp.form
        if (form === null) return
        if (vpBar.parentElement !== form.parentElement || vpBar.previousElementSibling !== form) {
          form.after(vpBar)
        }
        // 排障诊断写在 hover title 里(零视觉噪音):真实落位、同 id style 标签数、
        // 计算定位。条若仍浮起,悬停即可读到 DOM 事实。
        try {
          const tag = (el) => el === null || el === undefined ? 'null'
            : `<${el.tagName.toLowerCase()}${el.className ? ` ${String(el.className).slice(0, 40)}` : ''}>`
          const styles = document.querySelectorAll(`style[id="${STYLE_ID}"]`).length
          let pos = '?'
          try { pos = getComputedStyle(vpBar).position } catch { /* 隔离环境无此 API */ }
          vpBar.title = `webkit diag: parent=${tag(form.parentElement)} form=${tag(form)}`
            + ` styles=${styles} pos=${pos}`
        } catch {
          // 诊断失败不影响功能。
        }
      }

      /** 同步尺寸条挂载与按钮态;触发键的开合态以 aria-pressed 反映。 */
      function syncVpUi() {
        syncVpBar()
        for (const trigger of document.querySelectorAll('[data-webkit-vp-trigger]')) {
          trigger.setAttribute('aria-pressed', vp.open ? 'true' : 'false')
        }
      }

      /** 生成尺寸条内容;预填记忆尺寸,语言切换时整体重建,态由 syncVpUi 恢复。 */
      function buildVpBar() {
        vpBar.textContent = ''
        // 设备档下拉:左侧「手机▾」类别切换,选档即应用主流尺寸并写入记忆;
        // 与当前尺寸不符的手动输入在下拉里归为「自定义」。
        const deviceWrap = document.createElement('div')
        deviceWrap.setAttribute('data-vp-device', '')
        const deviceBtn = document.createElement('button')
        deviceBtn.setAttribute('type', 'button')
        deviceBtn.setAttribute('data-vp-device-btn', '')
        deviceBtn.setAttribute('aria-haspopup', 'menu')
        deviceBtn.setAttribute('aria-expanded', 'false')
        const deviceLabel = document.createElement('span')
        deviceLabel.setAttribute('data-vp-device-label', '')
        const chevron = document.createElement('span')
        chevron.setAttribute('data-vp-device-chevron', '')
        chevron.setAttribute('aria-hidden', 'true')
        chevron.innerHTML = CHEVRON_DOWN
        deviceBtn.append(deviceLabel, chevron)
        const menu = document.createElement('div')
        menu.setAttribute('data-vp-device-menu', '')
        menu.setAttribute('role', 'menu')
        const syncDeviceUi = () => {
          const current = vp.size ?? loadViewportSize()
          const hit = VIEWPORT_DEVICES.find((d) => d.w === current.w && d.h === current.h)
          deviceLabel.textContent = t(hit ? hit.key : 'vpDevCustom')
          for (const item of menu.querySelectorAll('[data-vp-device-item]')) {
            const active = item.getAttribute('data-vp-device-item') === (hit !== undefined ? hit.key : '')
            item.setAttribute('aria-checked', active ? 'true' : 'false')
          }
          deviceBtn.setAttribute('aria-expanded', menu.style.display === 'flex' ? 'true' : 'false')
        }
        for (const device of VIEWPORT_DEVICES) {
          const item = document.createElement('button')
          item.setAttribute('type', 'button')
          item.setAttribute('role', 'menuitem')
          item.setAttribute('data-vp-device-item', device.key)
          const label = document.createElement('span')
          label.textContent = t(device.key)
          const mark = document.createElement('span')
          mark.setAttribute('data-vp-device-check', '')
          mark.textContent = '✓'
          item.append(label, mark)
          item.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            const size = viewportSizeOf({ w: device.w, h: device.h })
            if (size === null) return
            saveViewportSize(size)
            applyVp(size)
            widthInput.value = String(device.w)
            heightInput.value = String(device.h)
            menu.style.display = 'none'
            syncDeviceUi()
          })
          menu.append(item)
        }
        deviceBtn.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex'
          syncDeviceUi()
        })
        deviceWrap.append(deviceBtn, menu)
        syncDeviceUi() // 预填标签:按记忆尺寸命中设备档,否则显示「自定义」
        const widthInput = document.createElement('input')
        widthInput.setAttribute('data-vp-w', '')
        widthInput.setAttribute('inputmode', 'numeric')
        widthInput.setAttribute('aria-label', t('vpToggle'))
        const xSpan = document.createElement('span')
        xSpan.setAttribute('data-vp-x', '')
        xSpan.textContent = '×'
        const heightInput = document.createElement('input')
        heightInput.setAttribute('data-vp-h', '')
        heightInput.setAttribute('inputmode', 'numeric')
        const remembered = loadViewportSize()
        widthInput.value = String(remembered.w)
        heightInput.value = String(remembered.h)
        // 不设应用按钮:任一输入框回车即生效,并写入记忆尺寸。
        const onEnter = (event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const size = viewportSizeOf({ w: widthInput.value, h: heightInput.value })
          if (size === null) {
            notify(t('vpInvalid'))
            return
          }
          saveViewportSize(size)
          applyVp(size)
          syncDeviceUi() // 手动输入后标签跟随:命中设备档显示档名,否则「自定义」
        }
        widthInput.addEventListener('keydown', onEnter)
        heightInput.addEventListener('keydown', onEnter)
        // 「适应窗口」不设独立按钮:整框塞进面板作为唯一视觉模式自动生效,
        // 应用任何尺寸(打开/回车/选档)时都会按面板缩放,面板变化跟手重算。
        vpBar.append(deviceWrap, widthInput, xSpan, heightInput)
        syncVpUi()
      }

      /**
       * 尺寸粘滞:生效中的 frame 被切走(换 tab/重建)时,把同一尺寸交给
       * 新可见的 frame;没有任何可见 frame(面板整个被切走)时挂起等待。
       * 同时负责尺寸条的补挂/摘除(经 syncVpUi → syncVpBar)。
       */
      function syncVp() {
        if (vp.size !== null) {
          const usable = vp.frame !== null
            && vp.frame.isConnected !== false
            && visibleFrames().includes(vp.frame)
          if (!usable) {
            const next = visibleFrames()[0]
            if (next !== undefined) applyVpTo(next, vp.size)
          } else {
            // 适应窗口跟手:面板尺寸变化(拖窗口/切布局)时下一轮扫描重算,
            // 缩放比或居中偏移变了才重写,避免每 700ms 都碰一次 webview。
            const next = fitFor(vp.frame, vp.size)
            const changed = next === null
              ? vp.fit !== null
              : vp.fit === null
                || Math.abs(next.z - vp.fit.z) > 0.001
                || Math.abs(next.dx - vp.fit.dx) > 0.5
                || Math.abs(next.dy - vp.fit.dy) > 0.5
            if (changed) applyVpTo(vp.frame, vp.size)
          }
        }
        syncVpUi()
      }

      let noticeTimer = 0
      /** Shows a transient notice above the composer (or bottom-centre). */
      function notify(message) {
        noticeLayer.textContent = message
        noticeLayer.style.display = 'block'
        const chip = chipLayer.getBoundingClientRect()
        const left = chip.width > 0 ? chip.left : Math.round((window.innerWidth - noticeLayer.offsetWidth) / 2)
        const top = chip.width > 0 ? chip.top - noticeLayer.offsetHeight - 6 : Math.round(window.innerHeight - 96)
        noticeLayer.style.left = `${Math.max(8, Math.round(left))}px`
        noticeLayer.style.top = `${Math.max(8, Math.round(top))}px`
        if (noticeTimer !== 0) window.clearTimeout(noticeTimer)
        noticeTimer = window.setTimeout(() => {
          noticeLayer.style.display = 'none'
          noticeTimer = 0
        }, 4_200)
      }

      // ── the pill: one counter above the composer's right edge ──
      let tipOwner = null
      let tipGrace = 0
      let liveX = null
      let liveY = null

      function onPointerMove(event) {
        liveX = event.clientX
        liveY = event.clientY
      }
      document.addEventListener('pointermove', onPointerMove, passive)

      /** Whether the live pointer is inside a rect, with a small tolerance. */
      function pointerInRect(rect, tolerance) {
        if (rect === undefined || rect === null) return false
        if (liveX === null || liveY === null) return false
        return liveX >= rect.left - tolerance && liveX <= rect.right + tolerance
          && liveY >= rect.top - tolerance && liveY <= rect.bottom + tolerance
      }

      function hideTip() {
        tipLayer.style.display = 'none'
        tipLayer.textContent = ''
        tipOwner = null
      }

      // ─────────────────── sent-message folding ───────────────────
      // The model form has to reach the model verbatim, so it has to sit in the
      // draft as text. Once sent, the transcript re-renders that text inside the
      // user's own bubble — a full element form is far too tall for that. Blank
      // it out there and leave nothing behind: the bubble shows what the user
      // actually wrote, and the picked elements remain readable from the pill's
      // hover panel like any other reference list.
      const ELEMENT_BLOCK = /## Element \d+\r?\n[\s\S]*?HTML excerpt:\r?\n```(?:html)?\r?\n[\s\S]*?\r?\n```/g

      /** Empties one character range of a bubble's concatenated text nodes. */
      function blankRange(nodes, start, end) {
        let cursor = 0
        for (const node of nodes) {
          const text = node.nodeValue ?? ''
          const from = cursor
          const to = cursor + text.length
          cursor = to
          if (to <= start || from >= end) continue
          const head = text.slice(0, Math.max(0, start - from))
          const tail = text.slice(Math.max(0, Math.min(text.length, end - from)))
          node.nodeValue = head + tail
        }
      }

      /** Collects a container's text nodes in document order. */
      function textNodesOf(root, out = []) {
        const children = root.childNodes ?? root.children ?? []
        for (const child of children) {
          if (child.nodeType === 3 || typeof child.nodeValue === 'string') out.push(child)
          else textNodesOf(child, out)
        }
        return out
      }

      /** Hides every element block a sent message carries, once per bubble. */
      function foldBubbles() {
        for (const bubble of document.querySelectorAll('[class*="bubble"]')) {
          if (bubble.querySelector('[data-webkit-fold]') !== null) continue
          const nodes = textNodesOf(bubble)
          const full = nodes.map((node) => node.nodeValue ?? '').join('')
          if (!full.includes('## Element ')) continue
          const spans = [...full.matchAll(ELEMENT_BLOCK)]
          if (spans.length === 0) continue

          // Back to front: blanking shifts nothing before the range, but going
          // backwards keeps every recorded index valid as we go.
          for (let i = spans.length - 1; i >= 0; i -= 1) {
            const start = spans[i].index
            blankRange(nodes, start, start + spans[i][0].length)
          }

          const blocks = spans.map((match) => match[0])
          const chip = document.createElement('span')
          chip.setAttribute('data-webkit-fold', '')
          chip.setAttribute('data-webkit-sent', '')
          chip.className = 'dsh-webkit-sent'
          chip.textContent = t('sentChip', { n: blocks.length })
          chip.title = t('sentChipHint')
          chip.addEventListener('pointerenter', () => {
            if (tipGrace !== 0) {
              window.clearTimeout(tipGrace)
              tipGrace = 0
            }
            renderSentTip(chip, blocks)
          })
          chip.addEventListener('pointerleave', () => {
            if (tipGrace !== 0) window.clearTimeout(tipGrace)
            tipGrace = window.setTimeout(() => {
              tipGrace = 0
              if (pointerInRect(chip.getBoundingClientRect(), 10)) return
              if (tipLayer.style.display === 'block' && pointerInRect(tipLayer.getBoundingClientRect(), 10)) return
              if (tipOwner === chip) hideTip()
            }, 260)
          })
          bubble.appendChild(chip)
        }
      }

      /** Read-only panel for a sent message: what it carried, nothing to edit. */
      function renderSentTip(chip, blocks) {
        tipLayer.textContent = ''
        const head = document.createElement('div')
        head.className = 'dsh-webkit-tip-head'
        head.textContent = t('panelCountTitle', { n: blocks.length })
        tipLayer.appendChild(head)

        blocks.forEach((block, index) => {
          const row = document.createElement('div')
          row.className = 'dsh-webkit-row'
          const num = document.createElement('span')
          num.className = 'dsh-webkit-row-num'
          num.textContent = String(index + 1)
          const selector = document.createElement('span')
          selector.className = 'dsh-webkit-row-sel'
          const matched = /^Selector: (.*)$/m.exec(block)
          const text = matched === null ? '' : matched[1]
          selector.textContent = text.length > 100 ? `${text.slice(0, 100)}…` : text
          selector.title = text
          row.appendChild(num)
          row.appendChild(selector)
          tipLayer.appendChild(row)
        })

        tipLayer.style.display = 'block'
        const chipRect = chip.getBoundingClientRect()
        const width = tipLayer.offsetWidth || 300
        const height = tipLayer.offsetHeight || 160
        const below = chipRect.bottom + 8
        const top = below + height > window.innerHeight - 8 ? chipRect.top - height - 8 : below
        tipLayer.style.left = `${Math.max(8, Math.min(chipRect.left, window.innerWidth - width - 8))}px`
        tipLayer.style.top = `${Math.max(8, top)}px`
        tipOwner = chip
      }

      /** The composer card, or the seat that may also hold docked controls. */
      function composerAnchor() {
        const card = document.querySelector('[data-composer-card]')
        if (card === null) return null
        const seat = card.closest('[data-composer-seat]') ?? card
        return { card, seat }
      }

      /**
       * Another plugin can already own the composer's top-right corner. The
       * annotation pill is a fixed layer carrying `data-annotation-chip`, so
       * measure it and sit beside it rather than on top of it.
       */
      function neighbourPill(top, bottom) {
        for (const pill of document.querySelectorAll('[data-annotation-chip]')) {
          if (pill === chipLayer) continue
          const rect = pill.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue
          if (rect.bottom <= top || rect.top >= bottom) continue
          return rect
        }
        return null
      }

      /** Keeps the pill on the composer's top-right corner. */
      function updateChip() {
        if (state.items.length === 0) {
          chipLayer.style.display = 'none'
          if (tipOwner === chipLayer) hideTip()
          return
        }
        chipLayer.textContent = ''
        const count = document.createElement('b')
        count.textContent = String(state.items.length)
        chipLayer.appendChild(count)
        chipLayer.appendChild(document.createTextNode(t('chipUnit')))

        const anchor = composerAnchor()
        if (anchor === null) {
          chipLayer.style.display = 'none'
          return
        }
        const cardRect = anchor.card.getBoundingClientRect()
        if (cardRect.width === 0 || cardRect.height === 0 || cardRect.right <= 0 || cardRect.bottom <= 0
          || cardRect.left >= window.innerWidth || cardRect.top >= window.innerHeight) {
          chipLayer.style.display = 'none'
          return
        }
        // Measure while visible: `offsetWidth` is 0 under `display:none`.
        chipLayer.style.display = 'flex'
        const width = chipLayer.offsetWidth || 80
        const height = chipLayer.offsetHeight || 24
        const seatTop = anchor.seat.getBoundingClientRect().top
        let top = Math.min(cardRect.top, seatTop) - height - 6
        if (top < 8) {
          // Never clamp back inside the seat: that would cover the queue controls.
          chipLayer.style.display = 'none'
          return
        }
        let left = Math.max(8, Math.min(cardRect.right - width - 12, window.innerWidth - width - 8))
        const neighbour = neighbourPill(top, top + height)
        if (neighbour !== null) {
          const beside = neighbour.left - width - 8
          if (beside >= 8) {
            left = beside
          } else {
            // No room on that row: stack above the neighbour instead.
            const stacked = neighbour.top - height - 6
            if (stacked >= 8) {
              top = stacked
              left = Math.max(8, Math.min(neighbour.right - width, window.innerWidth - width - 8))
            }
          }
        }
        chipLayer.style.left = `${left}px`
        chipLayer.style.top = `${top}px`
      }

      /** Re-reads the draft and repaints the pill; the pill holds no state of its own. */
      /**
       * Reads the live draft snapshot for the current session, or null when no
       * session/input is reachable.
       */
      function draftSnapshot(ctx) {
        const sessionId = currentSessionId(ctx)
        if (sessionId === undefined) return null
        const found = inputFor(ctx, sessionId)
        if (found === null) return null
        try {
          return { sessionId, snapshot: found.input.state.getSnapshot() }
        } catch (error) {
          return null
        }
      }

      // A sibling plugin that composes its own block into the draft does so with
      // `setDraft`, which rewrites plain text and therefore flattens every chip
      // already in the draft. Detect that one transition — the block's opening
      // sentence appearing where it was not a moment ago — and re-insert the
      // chips it swallowed, so a message carrying both keeps both.
      const ANNOTATION_LEAD = /我批注了以下|I annotated the following|Я аннотировал следующие/

      function looksAnnotated(draft) {
        return ANNOTATION_LEAD.test(draft)
      }

      let chipCache = []
      let lastDraftText = ''
      let restorePending = false

      /**
       * Puts the chips a sibling's plain-text rewrite swallowed back where they
       * were.
       *
       * The rewrite leaves each chip's payload behind as ordinary text, so this
       * looks up that payload and swaps the text run for a fresh chip instead of
       * appending one. Appending would leave the payload twice: once as the text
       * the rewrite produced and once inside the new chip.
       */
      function restoreFlattenedChips() {
        if (restorePending || chipCache.length === 0) return
        const cached = chipCache.slice()
        restorePending = true
        // Off the notification callback: editing from inside a store
        // notification would re-enter the same store.
        window.setTimeout(() => {
          restorePending = false
          const found = draftSnapshot(ctx)
          if (found === null) return
          const sessionId = found.sessionId
          const handle = inputFor(ctx, sessionId)
          if (handle === null) return
          const { input } = handle
          let snapshot = found.snapshot
          if (!draftWritable(snapshot)) return
          let changed = false
          // The rewrite dropped every chip, so the draft is plain text and its
          // character offsets are the same in both projections. Later entries go
          // first so an earlier run keeps its offsets valid.
          for (let index = cached.length - 1; index >= 0; index -= 1) {
            const entry = cached[index]
            const text = String(snapshot.draft ?? '')
            const at = text.lastIndexOf(entry.ref)
            if (at < 0) continue
            input.insertText('', { draftRev: snapshot.draftRev, start: at, end: at + entry.ref.length })
            snapshot = input.state.getSnapshot()
            const spot = Math.min(at, String(snapshot.draft ?? '').length)
            input.insertReference(referenceFor(entry.ref, entry.label), {
              draftRev: snapshot.draftRev,
              start: spot,
              end: spot,
            })
            snapshot = input.state.getSnapshot()
            changed = true
          }
          if (changed) refreshItems()
        }, 0)
      }

      function refreshItems() {
        const items = draftItems(ctx)
        const same = items.length === state.items.length
          && items.every((item, index) => state.items[index] !== undefined && state.items[index].id === item.id)
        const previousCount = state.items.length
        state.items = items
        if (!same && tipOwner === chipLayer) renderTip()
        updateChip()

        const found = draftSnapshot(ctx)
        const draft = found === null ? '' : String(found.snapshot.draft ?? '')
        const attached = !looksAnnotated(lastDraftText) && looksAnnotated(draft)
        lastDraftText = draft

        if (items.length > 0) {
          chipCache = items.map((item) => ({ ref: item.reference, label: item.label }))
          return
        }
        if (attached && previousCount > 0) restoreFlattenedChips()
      }

      /**
       * Keeps one live subscription to the draft store, so a chip deleted in the
       * composer clears the pill immediately instead of on the next poll.
       */
      let subscribedSession = null
      let draftSubscription = null
      function syncDraftSubscription() {
        const sessionId = currentSessionId(ctx)
        if (sessionId === subscribedSession) return
        if (draftSubscription !== null) {
          try {
            draftSubscription()
          } catch (error) {
            // The store went away with its session.
          }
          draftSubscription = null
        }
        subscribedSession = sessionId ?? null
        if (sessionId === undefined) return
        const found = inputFor(ctx, sessionId)
        if (found === null) return
        const store = found.input.state
        if (store === null || store === undefined || typeof store.subscribe !== 'function') return
        try {
          const stop = store.subscribe(() => refreshItems())
          draftSubscription = typeof stop === 'function' ? stop : null
        } catch (error) {
          draftSubscription = null
        }
      }

      /** Renders the hover panel listing every picked element. */
      function renderTip() {
        tipLayer.textContent = ''
        const head = document.createElement('div')
        head.className = 'dsh-webkit-tip-head'
        head.textContent = t('panelCountTitle', { n: state.items.length })
        tipLayer.appendChild(head)

        state.items.forEach((item, index) => {
          const row = document.createElement('div')
          row.className = 'dsh-webkit-row'
          const num = document.createElement('span')
          num.className = 'dsh-webkit-row-num'
          num.textContent = String(index + 1)
          const selector = document.createElement('span')
          selector.className = 'dsh-webkit-row-sel'
          selector.textContent = item.selector.length > 100 ? `${item.selector.slice(0, 100)}…` : item.selector
          selector.title = item.selector
          row.appendChild(num)
          row.appendChild(selector)

          const remove = document.createElement('button')
          remove.setAttribute('type', 'button')
          remove.setAttribute('data-webkit-remove', '')
          remove.textContent = t('rowRemove')
          remove.title = t('rowRemove')
          remove.setAttribute('aria-label', t('rowRemove'))
          remove.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            // Delete the chip itself, then let the projection catch up: the pill
            // can only ever show what the draft still carries.
            if (!removeFromDraft(ctx, item)) notify(t('failed', { message: 'draft is not writable' }))
            refreshItems()
            if (state.items.length === 0) hideTip()
          })
          row.appendChild(remove)
          tipLayer.appendChild(row)
        })

        tipLayer.style.display = 'block'
        const chipRect = chipLayer.getBoundingClientRect()
        const width = tipLayer.offsetWidth || 300
        const height = tipLayer.offsetHeight || 160
        let top = chipRect.top - height - 8
        if (top < 8) top = chipRect.bottom + 8
        tipLayer.style.left = `${Math.max(8, Math.min(chipRect.right - width, window.innerWidth - width - 8))}px`
        tipLayer.style.top = `${Math.max(8, top)}px`
        tipOwner = chipLayer
      }


      chipLayer.addEventListener('pointerenter', () => {
        if (tipGrace !== 0) {
          window.clearTimeout(tipGrace)
          tipGrace = 0
        }
        renderTip()
      })
      chipLayer.addEventListener('pointerleave', () => {
        // Deterministic grace: on expiry the *live* pointer decides, so crossing
        // the 6px gap to the panel cannot close it.
        if (tipGrace !== 0) window.clearTimeout(tipGrace)
        tipGrace = window.setTimeout(() => {
          tipGrace = 0
          if (pointerInRect(chipLayer.getBoundingClientRect(), 10)) return
          if (tipLayer.style.display === 'block' && pointerInRect(tipLayer.getBoundingClientRect(), 10)) return
          hideTip()
        }, 260)
      })
      tipLayer.addEventListener('pointerenter', () => {
        if (tipGrace !== 0) {
          window.clearTimeout(tipGrace)
          tipGrace = 0
        }
      })
      tipLayer.addEventListener('pointerleave', () => {
        if (tipGrace !== 0) window.clearTimeout(tipGrace)
        tipGrace = window.setTimeout(() => {
          tipGrace = 0
          if (pointerInRect(tipLayer.getBoundingClientRect(), 10)) return
          if (pointerInRect(chipLayer.getBoundingClientRect(), 10)) return
          hideTip()
        }, 260)
      })

      // ── picker session ──
      /** Shows the in-page hint bar over the picked frame. */
      function showHint(frame, badge) {
        hintLayer.textContent = ''
        const text = document.createElement('span')
        text.textContent = t('pickHint')
        const tag = document.createElement('span')
        tag.dataset.badge = ''
        tag.textContent = badge
        hintLayer.appendChild(text)
        hintLayer.appendChild(tag)
        hintLayer.style.display = 'flex'
        const rect = frame.getBoundingClientRect()
        hintLayer.style.left = `${Math.round(rect.left + 10)}px`
        hintLayer.style.top = `${Math.round(rect.top + 10)}px`
        state.hintFrame = frame
      }
      function hideHint() {
        hintLayer.style.display = 'none'
        hintLayer.textContent = ''
        state.hintFrame = null
      }

      /** Ends any running pick session. */
      function cancelActivePick() {
        const cancel = state.cancelPick
        state.cancelPick = null
        if (typeof cancel === 'function') cancel()
        hideHint()
      }

      /** Writes one picked element into the draft, then repaints from it. */
      function acceptElement(element) {
        const sessionId = currentSessionId(ctx)
        if (sessionId === undefined) {
          notify(t('noSession'))
          return
        }
        const standing = draftItems(ctx)
        if (standing.length >= MAX_ITEMS) {
          notify(t('tooMany'))
          return
        }
        const label = `[${language === 'zh' ? '元素' : 'element'}] ${element.tagName}`
        const reference = referenceFor(serializeElement(element, standing.length + 1), label)
        if (!appendReference(ctx, sessionId, reference)) notify(t('failed', { message: 'draft is not writable' }))
        refreshItems()
      }

      /**
       * Picks one element out of the toolbar's frame.
       * @param trigger - the toolbar button, for its pressed state.
       * @param form - the toolbar form the trigger belongs to.
       */
      /** Click entry. Never rejects: a failure becomes a notice, not a broken tab. */
      async function pickWith(trigger, form) {
        try {
          await runPick(trigger, form)
        } catch (error) {
          state.picking = false
          state.cancelPick = null
          trigger.setAttribute('aria-pressed', 'false')
          trigger.setAttribute('title', t('start'))
          trigger.setAttribute('aria-label', t('start'))
          hideHint()
          console.error('[dsh-webkit] element pick failed', error)
          notify(t('failed', { message: error && error.message ? error.message : String(error) }))
        }
      }

      /**
       * The pick itself; ownership of the failure contract sits in `pickWith`.
       * @param trigger - the toolbar button, for its pressed state.
       * @param form - the toolbar form the trigger belongs to.
       */
      async function runPick(trigger, form) {
        if (state.picking) {
          cancelActivePick()
          return
        }
        const frame = findFrameFor(form)
        const url = currentAddressOf(form, frame)
        if (frame === null || url === null) {
          notify(t('noPage'))
          return
        }

        state.picking = true
        setTriggerState(trigger, true)

        const session = await startSession(frame, url)
        if (session.error !== undefined) {
          state.picking = false
          setTriggerState(trigger, false)
          hideHint()
          notify(t('snapshotFailed', { message: session.error }))
          return
        }
        state.cancelPick = session.cancel
        showHint(frame, session.badge)

        const onParentKey = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          session.cancel()
        }
        const onParentScroll = () => {
          if (hintLayer.style.display === 'flex' && state.hintFrame !== null) {
            const rect = state.hintFrame.getBoundingClientRect()
            hintLayer.style.left = `${Math.round(rect.left + 10)}px`
            hintLayer.style.top = `${Math.round(rect.top + 10)}px`
          }
        }
        document.addEventListener('keydown', onParentKey, true)
        window.addEventListener('scroll', onParentScroll, true)
        window.addEventListener('resize', onParentScroll)

        let result
        try {
          result = await session.promise
        } finally {
          state.cancelPick = null
          state.picking = false
          hideHint()
          document.removeEventListener('keydown', onParentKey, true)
          window.removeEventListener('scroll', onParentScroll, true)
          window.removeEventListener('resize', onParentScroll)
          if (session.overlay !== undefined && session.overlay !== null) session.overlay.close()
          setTriggerState(trigger, false)
        }
        if (result.status === 'selected') acceptElement(result.element)
      }

      /** Flips the trigger between "start picking" and "cancel" without drifting. */
      function setTriggerState(trigger, active) {
        trigger.setAttribute('aria-pressed', active ? 'true' : 'false')
        trigger.setAttribute('title', t(active ? 'cancel' : 'start'))
        trigger.setAttribute('aria-label', t(active ? 'cancel' : 'start'))
      }

      /** `{ limits, labels }` handed to the picker, in this process or in the page. */
      function pickerConfig() {
        return {
          limits: LIMITS,
          labels: { background: 'Background', color: 'Color', font: 'Font' },
        }
      }

      /**
       * Source text of one pick session, for the guest-JavaScript channel.
       * `installPicker` closes over nothing, which is what makes this legal.
       */
      function pickerSource(config, page) {
        return `(${installPicker.toString()})(${JSON.stringify(config)}, ${JSON.stringify(page)})`
      }

      /** Aborts a session running inside the page. */
      const CANCEL_SOURCE = 'window.__dshWebkit'
        + ' && window.__dshWebkit.cancel'
        + ' && window.__dshWebkit.cancel(), true'

      /** Narrows anything the page sends back to the two shapes we handle. */
      function normalizePicked(value) {
        if (value !== null && typeof value === 'object' && value.status === 'selected' && value.element) {
          return { status: 'selected', element: value.element }
        }
        return { status: 'cancelled' }
      }

      /** Page identity recorded on every picked element. */
      function pageIdentity(doc, url) {
        let identityUrl = url
        try {
          identityUrl = doc.baseURI || url
        } catch (error) {
          identityUrl = url
        }
        let title = ''
        try {
          title = collapse(doc.title)
        } catch (error) {
          title = ''
        }
        return { url: identityUrl, title }
      }

      /** Which host provider rendered this frame. */
      function frameKindOf(frame) {
        const declared = frame.getAttribute('data-sidebar-browser-frame')
        if (declared === 'webview' || declared === 'iframe') return declared
        return typeof frame.executeJavaScript === 'function' ? 'webview' : 'iframe'
      }

      /**
       * Starts a pick session on whichever host the sidebar browser mounted.
       *
       * Three channels, best fidelity first. The Electron guest is driven with
       * `executeJavaScript`, the same way the reference sidebar browser does it:
       * the picker runs inside the page, so its own event listeners see the
       * real targets and no proxy has to stand in for the document. A
       * same-origin iframe is driven from this realm. A cross-origin iframe
       * cannot be reached at all, so the Host-rendered snapshot overlay stands
       * in for it.
       */
      async function startSession(frame, url) {
        const config = pickerConfig()
        if (frameKindOf(frame) === 'webview') {
          const started = frame.executeJavaScript(pickerSource(config, {}))
          return {
            badge: t('liveBadge'),
            promise: Promise.resolve(started).then(normalizePicked, () => ({ status: 'cancelled' })),
            cancel: () => {
              try {
                frame.executeJavaScript(CANCEL_SOURCE)
              } catch (error) {
                // The guest went away with the tab; nothing left to cancel.
              }
            },
          }
        }

        const live = liveDocumentOf(frame)
        if (live !== null) {
          const page = pageIdentity(live.doc, url)
          return {
            badge: t('liveBadge'),
            promise: installPicker(config, page, live.win, live.doc)
              .then(normalizePicked, () => ({ status: 'cancelled' })),
            cancel: () => {
              try {
                live.win.__dshWebkit?.cancel?.()
              } catch (error) {
                // Frame navigated away mid-pick.
              }
            },
          }
        }

        showHint(frame, t('snapshotBadge'))
        const snapshot = await openSnapshot(frame, url)
        if (snapshot.error !== undefined) return { error: snapshot.error }
        const page = pageIdentity(snapshot.doc, url)
        return {
          badge: t('snapshotBadge'),
          overlay: snapshot,
          promise: installPicker(config, page, snapshot.win, snapshot.doc)
            .then(normalizePicked, () => ({ status: 'cancelled' })),
          cancel: () => {
            try {
              snapshot.win.__dshWebkit?.cancel?.()
            } catch (error) {
              // Snapshot document torn down.
            }
          },
        }
      }

      // ── toolbar placement ──
      /** The browser body that owns one toolbar form. */
      function paneOf(form) {
        let node = form.parentElement
        for (let depth = 0; node !== null && depth < 6; depth += 1) {
          if (node.querySelector('[data-sidebar-browser-frame]') !== null) return node
          node = node.parentElement
        }
        return form.parentElement ?? document.body
      }

      /**
       * Whether a form is the sidebar browser's toolbar.
       *
       * Two independent host facts identify it, so the scan cannot mistake the
       * composer for a toolbar: the CSS-module local name `_toolbar`, and the
       * stable `data-sidebar-browser-frame` hook on the frame it drives.
       */
      function isToolbarForm(form) {
        if (/(^|\s)\S*_toolbar(\s|$)/.test(form.getAttribute('class') ?? '')) return true
        const pane = paneOf(form)
        return pane !== null && pane.querySelector('[data-sidebar-browser-frame]') !== null
      }

      /**
       * The page frame this toolbar drives.
       *
       * The sidebar browser mounts an Electron `<webview>` in the desktop app
       * and an `<iframe>` in the web app; both carry `data-sidebar-browser-frame`.
       */
      function findFrameFor(form) {
        const pane = paneOf(form)
        const direct = pane?.querySelector('[data-sidebar-browser-frame]')
        if (direct !== undefined && direct !== null) return direct
        // The toolbar and the page it drives are not always in one subtree: a
        // split or responsive layout can render the frame beside the toolbar
        // rather than inside it.
        return document.querySelector('[data-sidebar-browser-frame]')
      }

      /** The address the frame currently shows. */
      function currentAddressOf(form, frame) {
        if (frame !== null) {
          if (frameKindOf(frame) === 'webview' && typeof frame.getURL === 'function') {
            const live = collapse(frame.getURL() ?? '')
            if (live !== '') return live
          }
          const src = collapse(frame.getAttribute('src') ?? '')
          // A guest parked on its lease is not showing a page yet.
          if (src !== '' && !src.startsWith('about:blank')) return src
        }
        const value = collapse(form.querySelector('input')?.value ?? '')
        return value === '' ? null : value
      }

      /** Creates the trigger and places it after the address box. */
      function mountTrigger(form, input) {
        const box = input.parentElement
        if (box === null) return
        const existing = form.querySelector('[data-webkit-trigger]')
        if (existing !== null) {
          if (existing.previousElementSibling !== box) box.after(existing)
          return
        }
        const trigger = document.createElement('button')
        // Explicit attributes, not IDL properties: `type` must be button or the
        // click submits the toolbar form and reloads the page.
        trigger.setAttribute('type', 'button')
        trigger.setAttribute('data-webkit-trigger', '')
        trigger.setAttribute('aria-pressed', 'false')
        trigger.setAttribute('aria-label', t('start'))
        trigger.setAttribute('title', t('start'))
        trigger.innerHTML = TRIGGER_ICON
        // Follow the host build: copy the hashed class of a neighbouring toolbar
        // button so the trigger inherits its box, spacing and hover treatment.
        const neighbour = form.querySelector('button[type="button"]')
        if (neighbour !== null && neighbour.className !== '') trigger.className = neighbour.className
        trigger.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          void pickWith(trigger, form)
        })
        box.after(trigger)
      }

      /**
       * Creates the viewport trigger and places it after the picker trigger.
       *
       * 顺序固定:地址框 → 拾取键 → 自由尺寸键;触发键即尺寸条开关(开合
       * 以 aria-pressed 反映),开着时条固定在工具栏下面一行。
       */
      function mountVpTrigger(form, input) {
        const box = input.parentElement
        if (box === null) return
        const existing = form.querySelector('[data-webkit-vp-trigger]')
        // 锚点取拾取键;它尚未挂上时退到地址框后面,下一轮 scan 会再对齐。
        const anchor = form.querySelector('[data-webkit-trigger]') ?? box
        if (existing !== null) {
          if (existing.previousElementSibling !== anchor) anchor.after(existing)
          return
        }
        const trigger = document.createElement('button')
        trigger.setAttribute('type', 'button')
        trigger.setAttribute('data-webkit-vp-trigger', '')
        trigger.setAttribute('aria-pressed', 'false')
        trigger.setAttribute('aria-label', t('vpToggle'))
        trigger.setAttribute('title', t('vpToggle'))
        trigger.innerHTML = VP_ICON
        const neighbour = form.querySelector('button[type="button"]')
        if (neighbour !== null && neighbour.className !== '') trigger.className = neighbour.className
        trigger.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          // 再点一次即关闭:关闭语义内含还原,不留「关着但还在生效」。
          if (vp.open) closeVp()
          else openVp(form)
        })
        anchor.after(trigger)
      }

      /** Finds every browser toolbar and makes sure it carries a trigger. */
      function ensureTriggers() {
        const inputs = document.querySelectorAll('form input[placeholder][aria-label]')
        for (const input of inputs) {
          if (input.getAttribute('placeholder') !== input.getAttribute('aria-label')) continue
          const form = input.closest('form')
          if (form === null) continue
          if (form.querySelector('button[type="submit"]') === null) continue
          mountTrigger(form, input)
          mountVpTrigger(form, input)
        }
      }

      // ── lifecycle ──
      let scheduled = false
      /** Coalesces DOM churn into one scan per frame. */
      function scheduleScan() {
        if (scheduled) return
        scheduled = true
        window.requestAnimationFrame(() => {
          scheduled = false
          if (!style.isConnected) return
          ensureTriggers()
          foldBubbles()
          syncVp()
          if (chipLayer.isConnected && state.items.length > 0) updateChip()
        })
      }

      const observer = new MutationObserver(scheduleScan)
      observer.observe(document.body, { childList: true, subtree: true })

      const onResize = () => {
        updateChip()
        if (hintLayer.style.display === 'flex' && state.hintFrame !== null) {
          const rect = state.hintFrame.getBoundingClientRect()
          hintLayer.style.left = `${Math.round(rect.left + 10)}px`
          hintLayer.style.top = `${Math.round(rect.top + 10)}px`
        }
      }
      window.addEventListener('resize', onResize)
      window.addEventListener('scroll', onResize, true)

      // Esc 退出自由尺寸(尺寸条开着时);拾取的 Esc 在 guest 页内自行处理,互不干扰。
      const onVpKey = (event) => {
        if (event.key !== 'Escape' || !vp.open) return
        // 两层 Esc:先收设备下拉,再关尺寸条。
        const menu = vpBar.querySelector('[data-vp-device-menu]')
        if (menu !== null && menu.style.display === 'flex') {
          menu.style.display = 'none'
          const btn = vpBar.querySelector('[data-vp-device-btn]')
          if (btn !== null) btn.setAttribute('aria-expanded', 'false')
          return
        }
        closeVp()
      }
      window.addEventListener('keydown', onVpKey)
      // 点外部收下拉:气泡阶段注册,下拉内部的点击都 stopPropagation,不会自吞。
      const onDocClick = () => {
        if (!vp.open) return
        const menu = vpBar.querySelector('[data-vp-device-menu]')
        if (menu !== null && menu.style.display === 'flex') {
          menu.style.display = 'none'
          const btn = vpBar.querySelector('[data-vp-device-btn]')
          if (btn !== null) btn.setAttribute('aria-expanded', 'false')
        }
      }
      document.addEventListener('click', onDocClick)

      // The composer can move without any DOM mutation we observe (queue growth,
      // panel resize); a slow poll keeps the pill glued, and doubles as the
      // safety net that re-reads the draft when no signal is available.
      const poller = window.setInterval(() => {
        syncDraftSubscription()
        refreshItems()
        foldBubbles()
        syncVp()
      }, 700)

      let localeUnsubscribe = null
      try {
        if (typeof ctx.locale?.subscribe === 'function') {
          localeUnsubscribe = ctx.locale.subscribe(() => {
            readLanguage()
            updateChip()
            buildVpBar()
            ensureTriggers()
          })
        }
      } catch {
        localeUnsubscribe = null
      }

      ensureTriggers()
      buildVpBar()
      updateChip()

      return () => {
        observer.disconnect()
        window.clearInterval(poller)
        if (noticeTimer !== 0) window.clearTimeout(noticeTimer)
        if (tipGrace !== 0) window.clearTimeout(tipGrace)
        if (typeof localeUnsubscribe === 'function') {
          try {
            localeUnsubscribe()
          } catch { /* already released */ }
        }
        if (draftSubscription !== null) {
          try {
            draftSubscription()
          } catch { /* store already gone */ }
          draftSubscription = null
        }
        subscribedSession = null
        cancelActivePick()
        closeVp()
        window.removeEventListener('resize', onResize)
        window.removeEventListener('scroll', onResize, true)
        window.removeEventListener('keydown', onVpKey)
        document.removeEventListener('click', onDocClick)
        document.removeEventListener('pointermove', onPointerMove, passive)
        for (const trigger of document.querySelectorAll('[data-webkit-trigger]')) trigger.remove()
        for (const trigger of document.querySelectorAll('[data-webkit-vp-trigger]')) trigger.remove()
        for (const node of [chipLayer, tipLayer, hintLayer, noticeLayer, vpBar, style]) node.remove()
      }
    }

    /**
     * Cordis entry.
     *
     * A throw here is reported as "did not activate" and, at web boot, takes the
     * whole application down with it. Wiring this decoration is best-effort: if
     * any host detail has moved, log it and leave the sidebar untouched instead
     * of breaking the session the user is already in.
     */
    exports.apply = (ctx) => {
      try {
        return run(ctx)
      } catch (error) {
        console.error('[dsh-webkit] could not start; sidebar left untouched', error)
        return () => {}
      }
    }

    exports.name = 'dsh-webkit'
    return module.exports
  },
})
