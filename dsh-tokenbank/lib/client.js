/**
 * dsh-tokenbank — Web client half (module-loader bundle).
 *
 * Registers:
 *   - sidebar.panellist icon "dsh-tokenbank" (opens the main view),
 *   - the "TokenBank" main view: account card (balance / earned / spent),
 *     register & login (email code / captcha), key deposits, recharge
 *     (opens the Alipay page.pay form in a new window, polls to settlement),
 *     and auto-adds the free gateway into the model list after register.
 *
 * All state comes from the host half's POST /dsh-tokenbank/api. The model
 * write goes through the same Remote namespaces the Models page uses
 * ('llm-pi-ai' providers table + TOKENBANK_API_KEY credential reference),
 * so nothing here touches configEditor.
 */
window.__ModuleLoader__.load({
  id: 'dsh-tokenbank',
  factory(require) {
    var FRIZON_WOFF = 'd09GRgABAAAAAAikAA8AAAAAC9wAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABHUE9TAAAINAAAAG8AAACeKsEklU9TLzIAAAWUAAAAQwAAAGAwcC7YY21hcAAABdgAAABKAAAAXAEHAcdjdnQgAAAHgAAAABoAAAAaAWMGdGZwZ20AAAYkAAABAgAAAXMGWZw3Z2FzcAAACCwAAAAIAAAACAAAABBnbHlmAAABWAAAA44AAAXgzuTX0GhlYWQAAAUcAAAANgAAADYWICZJaGhlYQAABXQAAAAgAAAAJAgmA5tobXR4AAAFVAAAACAAAAAgFfoBRWxvY2EAAAUIAAAAEgAAABIGOQRKbWF4cAAABOgAAAAgAAAAIAIeAupuYW1lAAAHnAAAAHoAAADICesiAXBvc3QAAAgYAAAAEwAAACD/nwAycHJlcAAABygAAABVAAAAchZBl/l4nH2Uy28TVxTGz7ljz/jRQCa2SSqug4Yb20EB5+FMHKQ2iChAK6qyCApYxSCyKNAFsKKPP6AYsSldQCtV6q4uq7YCtU6USkSCmu6MqraAjEBI0CZigcSmmwx8d8ZRjCrF1s/3+JvxPecen/lIUJFILIsFilCGrteIBggfew7XqGtw8xx1UXSi1BKUFhSFJ0rzFCOTjAFonbjYxM1YO5s8Txa2MQbmqZcMrLvDdB/BMhDl3ZspiuBNsA3sBO+CEjgFPgUXwNfgKpgDv4OOco0MbN/RAIM16kXc0wjWXHNoODMy5o5mBzhlFPxIOTlnpFekkqbVy6nkBqEcmx/l8FqKvcj29WW9fy/x3K7yri09eG1B4O2rOsmk8xHb6S47Xc289V6/mkqn92a2HXg7yzYR+12qoEtxmmnvEemWUFuPolqIBj0KUdjvEaFQRo+iWK2gRzH/ggVB4CRicGiYU07KsZT+tEXFO8OXrj3gL1Z+EAvVUvV0FalRhUIVfyC0aHLdKsJaCOsqguwC2U0kshq8WtbQcMJJKduylRI/vrixgjzeNz+JVOus/yBLjK6um8XQgtEmhLQQaqXVgqkFs02IaCEStIdxK9ldO3U/gohrFMcfzCCOqqMN3U/8CNUTYoYWagarPo2JayHEb2AIEuwWbeWyrez/OL94w7uzKBa82eXrK1OCv/WOrfXvIcLo6/0Tuiqx3kFer9ts9c8oJFROWeoC9x+t37o9/ut4nU/z+ytT9frqzDzxZ+ZsezbWe/H/s60JrU6vpbe0YAXpDVxhv23RVoT/NI5QT1Tcn6ih4YJdsBMFg5VhpYqLz/9+zJGb186hI3e531vyPuD0lxdxYvXymWGJBiVI8WftNbYGaK2kjVrYGJTU3cSTbFG3/86BItgHDoET4GNwHlwBVfALqIOOMvzgLwRPgcBjHUa5ThPiPXJoCfgmEUHQA/rBOHgHHAYnwSegAr4C3wP8nm6DjjKGpw8DIUFfZzAwNOj7j4T/yFX/kfAfCf+R8B8J/5HwHwn/kfAfCf+R8B8J/5HwHwn/kb7/SOwYawYPU1If36QkbQJZMAb2ghnwITgHPgeXwXfgZ/Ab8I//J4InQB8/ht0yenhHJ0TBtyyY1da8KCY3FUYmhDuax1dTuccr0wcrs647Wzk4XTnuLpZmtk/mu7vzk9tnSnxMS223TB85k3b353fsH0ufpVelokR2AAAAAQAAAAgASgAFAD4ABAABAAAAAAAKAAACAAJgAAIAAQAAAAAAkwDWAQkBdgGtAf4C8AAAAAEAAAABAACeDqmmXw889QAbA+gAAAAA2YKodQAAAADZkDnt/7b/HAQoA+gAAAAGAAIAAAAAAAAA+gAAAw0ANwKrADcC9gAjAx4ANwMCACMDCAA3AyoAI3icY2BkYGB+8X8qQyyL8/9t/3exaDAARVAABwCtEwbIeJxjYGHqZJzAwMrAwtTFFMHAwOANoRnjGIyAEBUwInMUgIDhAIMjQwjzi/9TGWJZXBlOwNQwfmHaA1LCwAQA8JgLnQB4nGNgYGBiYGBgBmIRIMkIplkYPIA0DwMHUI6FwYnBlcGbwZ8h5P9/oKgjmOcH4f3f+383kFwP1MfDAAJcYJIVyGdhYAcA3O0MyAAAeJxdkD1OxDAQhcc4LOQGSBaSLSsUK6/oqVI4kVCaQCg8DT/SrkT2DkhpaFxwlqEzXS6GYJKNttjGM+/N6POzE4BrEuRt+BbiC5P4+0zgr38gB/nyvEkgnNZV70m8sjhzbKwNd9LpmmRRPwaLOup4v4261u9vW8qKufJgF/FWE3Sh5/MpGCpRHdsd4h1zsomTzZyITNgvhP1MYMAvL527RpO8acNDoMErKj0qY3RFYxto9Mog8tbqmJTrR3+1ZL7gzKs1N5cHSheoVAQY40FZQ0OMKvI7Fp1gPDEEnBrlYvBPTERZVEkM7TwarFGTYY01nBM93527pgsVJzW4+Qck6mvkAAB4nF2MsQ2AMBDEnAREKhoooECE+hmAAcIwDMFeUZpfjS9ooLN88hUQKo6AF1dpDA3UYGFmpCcCUVBbto9SPJmDnZXhNeGfVVr76qRAOu9ryg+O5wvhAAAAABQApwBRAMAAwQAAABT/lQAAArwAFAK8ABQAAHicdYw7CoNAFEWPXxCCC0jlBhRHJCD2giAKFhZWWogIkoCS/fuYTGETbnPu4d0H+LQ4WG6AxQMM24TSfuxQ8TTs3m48sZNhX/uKnpqRTn72LKx82Zk5GKQdnGx8eBOhSEh1Ssl9V5KJVRTaN7KsiXmJyf9/uQDEqRQFAAB4nGNgZgCD/3MYjBiwAAAqgwHRAAABAAH//wAPeJxjYGRgYOBiUGEwYmBycfMJYeDLSSzJY+BjYAGKM/z/zwCSZ8xOLcpj4ACxwJiFgQnIYwRiJgYDsEobhgAgDWT9T///gAEK/s+C0seB+CyYCdLLyMDMwMrADqQZgSQzVDHIZCaoHDOMDwAlnRCbAA=='
    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement
    var NS = 'dsh-tokenbank'
    var API = '/dsh-tokenbank/api'

    var zh = {
      title: 'TokenBank',
      openPortal: '打开完整门户',
      openSite: '打开官网',
      addFreeModels: '获取免费模型',
      getModels: '获取模型',
      freeModelsTip: '免费使用主流收费模型，点击后自动获取，模型列表 TokenBank 中的模型任意使用。',
      modelLinked: '已接入 {n} 个模型,点输入框上方的模型选择器即可切换使用',
      reload: '刷新',
      recharge: '充值',
      rechargeTip: '全网最低价：￥10 ≈ 3846万 TOKEN，比官方与中转站省 10%~25%；支付宝直付秒到账，余额永不过期。',
      depositManage: '托管',
      depositGuide: '已打开模型设置,点卡片上的「一键托管」即可把 API Key 托管到 TokenBank',
      depositManageTip: '把你的 API Key 托管到 TokenBank，临时额度自动转移为永久额度保留使用。适用于周重置快到了还没用完等情况。',
      checkin: '签到',
      checkinDone: '已签到',
      checkinOk: '签到成功',
      checkinStreak: '已连签 {n} 天',
      checkinGain: '+0.10',
      rechargePay: '去支付',
      rechargeDone: '充值成功,余额已到账',
      gainSuffix: '签到奖励',
      rechargePending: '尚未检测到支付结果,如已完成支付请稍后重试或刷新',
      rechargeWaiting: '等待支付中…',
      rechargeOpenPay: '打开支付页',
      rechargeCancel: '取消',
      composerEntry: 'TokenBank 账户',
      officialSite: 'TokenBank 官网',
      loading: '正在连接 TokenBank…',
      balance: '余额',
      totalEarned: '累计收益',
      totalSpent: '累计消费',
      depositCount: '托管密钥',
      loginTab: '登录',
      registerTab: '注册',
      email: '邮箱',
      password: '密码',
      displayName: '昵称（可选）',
      code: '邮箱验证码',
      sendCode: '发送验证码',
      codeInvalid: '验证码无效或已过期,请重新发送',
      codeSent: '已发送，请查收邮箱',
      captcha: '图形验证码',
      captchaCode: '输入图中字符',
      captchaRefresh: '换一张',
      savePassword: '在本机记住密码（用于静默续登）',
      register: '注册免费领TOKEN',
      freeToken: '免费模型',
      login: '立即登录',
      logout: '退出登录',
      deposits: '密钥托管',
      depositAdd: '托管闲置 Key 换收益',
      depositGroup: '分组',
      depositKeys: 'Key（每行一个）',
      depositSubmit: '托管',
      depositTitle: '托管凭证',
      depositIntro: '把你的 API Key 凭证托管到 TokenBank，临时额度自动转移为永久额度保留使用。适用于：',
      depositIntro1: '1. 周重置快到期还没用完，重置后白白浪费，不如卖给平台换取永久余额（类似银行存款业务）',
      depositIntro2: '2. 跨模型厂商调用，转换为 TokenBank 余额后，更换 TokenBank 提供的模型厂商继续使用',
      depositIntro3: '3. 托管的 API Key 优先被平台调用，被调用后获得托管利息存进余额（类似银行贷款业务）',
      depositIntro4: '4. 自己使用时如果 TokenBank 余额不足会取出自己的 API Key 继续使用',
      depositIntro5: '5. TokenBank 会自动路由，解决用量不足需要频繁切换模型的问题',
      depositGroup: '托管分组',
      depositEmpty: '还没有托管任何 Key',
      depositRemove: '撤销',
      recharge: '充值',
      rechargeAmount: '充值套餐',
      rechargeCreate: '下单并去支付宝付款',
      rechargeWaiting: '等待支付中…（已打开支付宝收银台）',
      rechargePaid: '支付成功，余额已到账',
      payBlocked: '浏览器拦截了新窗口，点这里打开付款页',
      addModel: '添加到模型列表',
      modelAdded: '已添加到模型列表（TokenBank）',
      modelConflict: '模型列表已被他人修改，请到「设置 → 模型」手动确认',
      lowBalance: '检测到余额不足',
      goRecharge: '去充值',
      keyCopied: 'Key 已复制',
      error: '出错了',
      retry: '重试',
      freeModelsEntry: 'TokenBank 免费模型',
      authOverlayTitle: 'TokenBank 账号',
      lowBalanceTitle: '检测到余额不足，可能影响继续对话',
      lowBalanceRecharge: '去充值',
      dismiss: '知道了',
      settingsDeposit: '一键托管',
      depositToTokenbank: '托管到 TokenBank',
      depositCancel: '取消托管',
      depositCancelled: '已取消托管',
      depositPlaceholder: '粘贴要托管的 API Key',
      depositDone: '托管成功',
      notifyOk: '知道了',
      goSwitch: '去切换',
      probeFailed: '该 API Key 无法在上游正常使用',
      probeInconclusive: '上游探活未出结论,已放行托管',
      probeRejected: '{n} 个 Key 探活失败已被剔除',
      keyRequired: '请先粘贴至少一个 Key',
      connectedAs: 'TokenBank 已连接：{email}',
      depositHint: "一键托管：把你的 API Key 凭证托管到 TokenBank,临时额度自动转移为永久额度保留使用。适用于：",
      depositCase1: "1. 周重置快到期了还没用完,重置后白白浪费,不如卖给平台换取永久余额,类似银行的存款业务",
      depositCase2: "2. 跨模型厂商调用,转换为 TokenBank 余额后,更换 TokenBank 提供的模型厂商继续使用",
      depositCase3: "3. 托管的 API Key 优先被平台调用,被调用后获得一定的托管利息存进余额,类似银行的贷款业务",
      depositCase4: "4. 自己使用时如果 TokenBank 余额不足会取出自己的 API Key 继续使用",
      depositCase5: "5. TokenBank 会自动路由,解决您用量不足需要频繁切换模型的问题",
      learnMore: '了解 TokenBank →',
      dismissHint: '不再显示',
      notConnected: 'TokenBank 未登录',
      modelLink: '已有 Key？手动接入',
      modelLinkHint: '粘贴 TokenBank 访问密钥（tb-…）',
      modelLinkAdd: '接入',
      modelListCount: '已接入 {n} 个模型',
    }
    var en = {
      title: 'TokenBank',
      openPortal: 'Open full portal',
      openSite: 'Open website',
      addFreeModels: 'Get free models',
      getModels: 'Get models',
      freeModelsTip: 'Use paid-tier models for free — one click links them, and every TokenBank model in the list is available.',
      rechargeTip: 'Best price anywhere: $1 for ¥6.50 — 10%~25% cheaper than official APIs and relays. Pay with Alipay, credited instantly, credit never expires.',
      modelLinked: '{n} models linked — open the model picker above the input to switch to them',
      reload: 'Reload',
      recharge: 'Recharge',
      depositManage: 'Manage keys',
      depositGuide: 'Model settings opened — click "Manage keys" on a provider card to deposit your key',
      depositManageTip: 'Deposit your API key into TokenBank — remaining temporary quota transfers to permanent credit. Useful when the weekly reset is near.',
      checkin: 'Check in',
      checkinDone: 'Checked in',
      checkinOk: 'Check-in success',
      checkinStreak: '{n}-day streak',
      checkinGain: '+0.10',
      rechargePay: 'Pay',
      rechargeDone: 'Recharge successful',
      rechargePending: 'No payment detected yet; if you already paid, retry or refresh later',
      rechargeWaiting: 'Waiting for payment…',
      rechargeOpenPay: 'Open payment page',
      rechargeCancel: 'Cancel',
      composerEntry: 'TokenBank account',
      officialSite: 'TokenBank website',
      loading: 'Connecting to TokenBank…',
      balance: 'Balance',
      totalEarned: 'Total earned',
      totalSpent: 'Total spent',
      depositCount: 'Deposited keys',
      loginTab: 'Sign in',
      registerTab: 'Register',
      email: 'Email',
      password: 'Password',
      displayName: 'Display name (optional)',
      code: 'Email code',
      sendCode: 'Send code',
      codeInvalid: 'Code invalid or expired — please resend',
      codeSent: 'Sent — check your inbox',
      captcha: 'Captcha',
      captchaCode: 'Type the characters',
      captchaRefresh: 'New captcha',
      savePassword: 'Remember password on this machine (silent re-login)',
      register: 'Sign up for free TOKEN',
      freeToken: 'FREE',
      login: 'Sign in now',
      logout: 'Sign out',
      deposits: 'Key deposits',
      depositAdd: 'Deposit an idle key to earn',
      depositGroup: 'Group',
      depositKeys: 'Keys (one per line)',
      depositSubmit: 'Deposit',
      depositTitle: 'Deposit Credential',
      depositIntro: 'Deposit your API key to TokenBank — remaining temporary quota converts to permanent credit. Use cases:',
      depositIntro1: '1. Weekly-reset quota about to expire? Sell it to the platform for permanent balance (like a bank deposit)',
      depositIntro2: '2. Cross-provider calls: convert to TokenBank balance and switch among TokenBank model providers',
      depositIntro3: '3. Deposited keys are called by the platform first and earn interest into your balance (like a bank loan)',
      depositIntro4: '4. If your TokenBank balance runs out, your own key is withdrawn so you can keep going',
      depositIntro5: '5. TokenBank routes automatically — no more frequent model switching due to quota limits',
      depositGroup: 'Group',
      depositEmpty: 'No deposited keys yet',
      depositRemove: 'Remove',
      recharge: 'Recharge',
      rechargeAmount: 'Package',
      rechargeCreate: 'Order & pay with Alipay',
      rechargeWaiting: 'Waiting for payment… (Alipay opened)',
      rechargePaid: 'Paid — balance updated',
      payBlocked: 'The popup was blocked — click here to open the payment page',
      addModel: 'Add to model list',
      modelAdded: 'Added to the model list (TokenBank)',
      modelConflict: 'The model list changed elsewhere; confirm in Settings → Models',
      lowBalance: 'Low balance detected',
      goRecharge: 'Recharge',
      keyCopied: 'Key copied',
      error: 'Something went wrong',
      retry: 'Retry',
      freeModelsEntry: 'TokenBank free models',
      authOverlayTitle: 'TokenBank account',
      lowBalanceTitle: 'Low balance detected — chat may stop working',
      lowBalanceRecharge: 'Recharge',
      dismiss: 'Got it',
      settingsDeposit: 'One-click deposit',
      depositToTokenbank: 'Deposit to TokenBank',
      depositCancel: 'Cancel deposit',
      depositCancelled: 'Deposit cancelled',
      depositPlaceholder: 'Paste the API key to deposit',
      depositDone: 'Deposited',
      keyRequired: 'Paste at least one key first',
      connectedAs: 'TokenBank connected: {email}',
      depositHint: "One-click deposit: host your API key credentials on TokenBank to convert temporary quota into permanent balance. Useful when:",
      depositCase1: "1. The weekly reset is close and quota remains unused — sell it to the platform for permanent balance (like a bank deposit)",
      depositCase2: "2. Cross-provider calls — convert to TokenBank balance and switch to the model providers TokenBank offers",
      depositCase3: "3. Deposited API keys are called by the platform first, earning deposit interest into your balance (like a bank loan)",
      depositCase4: "4. When your TokenBank balance runs short, your own API key is withdrawn and used directly",
      depositCase5: "5. TokenBank routes automatically, so you no longer need to switch models frequently due to insufficient usage",
      learnMore: 'About TokenBank →',
      dismissHint: "Don't show again",
      notConnected: 'TokenBank not signed in',
      modelLink: 'Have a key? Link manually',
      modelLinkHint: 'Paste your TokenBank access key (tb-…)',
      modelLinkAdd: 'Link',
      modelListCount: '{n} models linked',
    }

    var pageT = function (key) { return key }

    async function api(action, extra) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action }, extra || {})),
      })
      const payload = await response.json()
      if (!payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || 'request failed')
      }
      return payload
    }

    /** nano-USD → "$1.234" (3 decimals is plenty for display). */
    function usd(nano) {
      const value = (Number(nano) || 0) / 1e9
      return '$' + value.toFixed(value >= 100 ? 2 : 3)
    }

    /** TokenBank 品牌图标:照官方 favicon.svg(web/public/favicon.svg)1:1 重绘。 */
    function TokenBankLogo(props) {
      var size = props && props.size ? props.size : 16
      return h('svg', {
        viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      },
        h('rect', { width: 64, height: 64, rx: 16, fill: '#ff4f1f' }),
        h('g', { fill: '#f5f5f2' },
          h('path', { d: 'M13.3 25.8L32 16.4L50.7 25.8V29.3H13.3Z' }),
          h('rect', { x: 13.3, y: 32.9, width: 12.9, height: 18.2, rx: 2.2 }),
          h('rect', { x: 37.8, y: 32.9, width: 12.9, height: 18.2, rx: 2.2 }),
          h('rect', { x: 13.3, y: 47.1, width: 37.3, height: 4, rx: 2 }),
        ),
      )
    }

    function CoinIcon(props) {
      var size = props && props.size ? props.size : 16
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        style: { display: 'block', flex: 'none' },
      },
        h('circle', { cx: 12, cy: 12, r: 9 }),
        h('path', { d: 'M8.5 8.5h7M12 8.5V16M9.5 13.5h5' }),
      )
    }

    var cardStyle = {
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 10,
      background: 'var(--dsw-alias-bg-layer-1)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }
    var inputStyle = {
      height: 30, padding: '0 10px', borderRadius: 7, fontSize: 13,
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
      boxSizing: 'border-box', width: '100%',
    }
    var buttonStyle = {
      height: 30, padding: '0 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
    }
    var primaryButtonStyle = Object.assign({}, buttonStyle, {
      background: '#ff4f1f',
      borderColor: '#ff4f1f',
      color: '#ffffff',
      fontWeight: 600,
    })
    var labelStyle = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }
    var errorStyle = {
      fontSize: 12, color: 'var(--dsw-alias-label-critical, #d03050)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    }

    function Field(props) {
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('span', { style: labelStyle }, props.label),
        props.children,
      )
    }

    /* ── model-list integration ─────────────────────────────────────────── */

    var MODEL_NS = 'llm-pi-ai'
    var MODEL_ROUTE = 'tokenbank'
    var KEY_REF = 'TOKENBANK_API_KEY'

    /* ── 模块②③共享:轻量 store + shell.overlay 弹层 ───────────────────── */

    var runtimeCtx = null // apply() 注入,overlay 里 addProviderToModels 用
    var tbStore = {
      state: { authOpen: false, authMode: 'register', lowBalanceSeq: 0 , notify: null, loggedIn: null},
      listeners: [],
      get: function () { return tbStore.state },
      subscribe: function (fn) {
        tbStore.listeners.push(fn)
        return function () { tbStore.listeners = tbStore.listeners.filter(function (l) { return l !== fn }) }
      },
      set: function (patch) {
        tbStore.state = Object.assign({}, tbStore.state, patch)
        tbStore.listeners.slice().forEach(function (fn) { fn() })
      },
    }

    function useTbStore() {
      var snap = React.useState(tbStore.get)
      React.useEffect(function () {
        return tbStore.subscribe(function () { snap[1](tbStore.get()) })
      }, [])
      return snap[0]
    }

    /** 底部状态栏余额 pill(conversation.composer.dock,登录态显示)。 */
    function BalancePill() {
      var snap = useTbStore()
      var st = React.useState(null)
      // 登录跃迁(false→true)自动同步一次免费模型;初始挂载已登录不触发
      var prevLogin = React.useRef(null)
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (stopped) return
          st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
          var now = Boolean(data.loggedIn)
          if (prevLogin.current === false && now) autoSyncModels()
          prevLogin.current = now
        }).catch(function () {})
        return function () { stopped = true }
      }, [])
      React.useEffect(function () {
        var now = Boolean(snap.loggedIn)
        if (prevLogin.current === false && now) { prevLogin.current = now; autoSyncModels() }
        else if (prevLogin.current !== null) prevLogin.current = now
      }, [snap.loggedIn])
      React.useEffect(function () {
        var stopped = false
        if (!snap.loggedIn) return
        api('status').then(function (data) { if (!stopped) st[1](data) }).catch(function () {})
        return function () { stopped = true }
      }, [snap.loggedIn, snap.authOpen])
      var flash = React.useState(false)
      var prev = React.useRef(false)
      React.useEffect(function () {
        if (!snap.loggedIn) { prev.current = false; return }
        // 仅「从未登录 → 登录」的跃迁触发一次;已标记过(本会话已提示)不再重亮
        if (!prev.current) {
          prev.current = true
          var seen = false
          try { seen = window.sessionStorage.getItem('tb-balance-flash-seen') === '1' } catch (e) {}
          if (!seen) {
            flash[1](true)
            try { window.sessionStorage.setItem('tb-balance-flash-seen', '1') } catch (e) {}
          }
        }
      }, [snap.loggedIn])
      var onClick = function (e) {
        flash[1](false)
        var rect = e && e.currentTarget && e.currentTarget.getBoundingClientRect()
        tbStore.set({
          authOpen: true, authMode: 'login',
          anchor: rect ? { right: rect.right, top: rect.top } : null,
        })
      }
      if (!snap.loggedIn) return null
      var data = st[0]
      var bal = data && data.account && typeof data.account.balance_nano_usd === 'number'
        ? '$ ' + (data.account.balance_nano_usd / 1e9).toFixed(2) : null
      return h('button', {
        type: 'button', id: 'tb-balance-pill', title: pageT('composerEntry'),
        className: (flash[0] ? 'tb-balance-flash ' : '') + (snap.authOpen ? 'tb-balance-open' : ''),
        onClick: onClick,
        style: {
          boxSizing: 'border-box', borderRadius: 6, maxWidth: '100%',
          color: 'var(--dsw-alias-label-tertiary, #a0a3a8)', font: 'inherit',
          fontVariantNumeric: 'tabular-nums', lineHeight: 'inherit', whiteSpace: 'nowrap',
          background: 'transparent', border: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px',
          fontSize: 14, cursor: 'pointer',
        },
      },
        bal || '—',
      )
    }

    /** 输入框工具行、模型选择器左侧的紧凑入口按钮。 */
    function ComposerEntry() {
      var snap = useTbStore()
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (!stopped) tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
        }).catch(function () {})
        return function () { stopped = true }
      }, [])
      var onClick = function (e) {
        var rect = e && e.currentTarget && e.currentTarget.getBoundingClientRect()
        tbStore.set({
          authOpen: true, authMode: 'register',
          anchor: rect ? { right: rect.right, top: rect.top } : null,
        })
      }
      var st = React.useState(null)
      // 登录跃迁(false→true)自动同步一次免费模型;初始挂载已登录不触发
      var prevLogin = React.useRef(null)
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (stopped) return
          st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
          var now = Boolean(data.loggedIn)
          if (prevLogin.current === false && now) autoSyncModels()
          prevLogin.current = now
        }).catch(function () {})
        return function () { stopped = true }
      }, [])
      React.useEffect(function () {
        var now = Boolean(snap.loggedIn)
        if (prevLogin.current === false && now) { prevLogin.current = now; autoSyncModels() }
        else if (prevLogin.current !== null) prevLogin.current = now
      }, [snap.loggedIn])
      // 登录态变化(弹窗登录/退出)时刷新余额展示
      React.useEffect(function () {
        var stopped = false
        if (!snap.loggedIn) return
        api('status').then(function (data) {
          if (!stopped) st[1](data)
        }).catch(function () {})
        return function () { stopped = true }
      }, [snap.loggedIn, snap.authOpen])
      var data = st[0]
      // 登录态入口整个不渲染(余额在底部状态栏 pill),否则会残留一个空胶囊
      if (snap.loggedIn) return null
      return h('button', {
        type: 'button',
        id: 'tb-entry-btn',
        className: snap.authOpen ? 'tb-entry-open' : '',
        title: pageT('composerEntry'), 'aria-label': pageT('composerEntry'),
        onClick: onClick,
        style: snap.loggedIn
          ? {
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              height: 29, padding: '0 8px', borderRadius: 7, boxSizing: 'border-box',
              border: 'none', background: 'transparent',
              cursor: 'pointer', position: 'relative',
            }
          : {
              display: 'inline-flex', alignItems: 'center', cursor: 'pointer', position: 'relative',
              border: 'none', background: 'transparent', padding: 0, boxSizing: 'border-box',
            },
      },
        snap.loggedIn
          ? null
          : h('span', { className: 'tb-free-tag', style: { fontSize: 11, lineHeight: '20px', padding: '0 8px', borderRadius: 999, color: '#fff', background: '#ff4f1f', fontWeight: 600, letterSpacing: 0.3 } }, pageT('freeToken')),
      )
    }

    /** shell.overlay 轻提示:portal 到 document.body,压过设置页抽屉层级。 */
    function NotifyOverlay() {
      var snap = useTbStore()
      // 宿主风格:顶部居中深色胶囊,非阻塞,6s 自动消失,点击关闭
      React.useEffect(function () {
        if (!snap.notify) return
        var timer = window.setTimeout(function () { tbStore.set({ notify: null }) }, 6000)
        return function () { window.clearTimeout(timer) }
      }, [snap.notify && snap.notify.title, snap.notify && snap.notify.seq])
      if (!snap.notify || !ReactDOM || typeof ReactDOM.createPortal !== 'function') return null
      var n = snap.notify
      var ok = n.kind === 'success'
      var close = function () { tbStore.set({ notify: null }) }
      return ReactDOM.createPortal(
        h('div', {
          onClick: close,
          style: {
            position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 3000,
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            maxWidth: '86vw', padding: '9px 16px', borderRadius: 10,
            background: 'rgba(30, 30, 32, 0.96)', color: '#f5f5f5',
            border: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            fontSize: 13, lineHeight: 1.5, pointerEvents: 'auto',
          },
        },
          h('span', { style: { flexShrink: 0, display: 'inline-flex' } },
            ok
              ? h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: '#34c759', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
                  h('circle', { cx: 12, cy: 12, r: 10 }), h('polyline', { points: '8 12.5 11 15.5 16 9.5' }))
              : h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: '#ffd60a', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
                  h('circle', { cx: 12, cy: 12, r: 10 }), h('line', { x1: 12, y1: 7.5, x2: 12, y2: 13 }), h('circle', { cx: 12, cy: 16.5, r: 0.5, fill: '#ffd60a' })),
          ),
          h('span', { style: { fontWeight: 600 } }, n.title),
          n.detail ? h('span', { style: { opacity: 0.75, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, n.detail) : null,
        ),
        document.body,
      )
    }

    /** 打开宿主模型设置页:优先点侧栏设置触发按钮(内容文字「设置/Settings」),兜底模拟 settings.open 快捷键。 */
    function openSettingsPage() {
      // SettingsRoot 渲染在侧栏 foot 的 settingsArea 容器里(CSS modules 哈希保留可读名),点它第一个按钮
      var area = document.querySelector('[class*="settingsArea"]')
      if (area) {
        var b = area.querySelector('button, [role="button"]')
        if (b) {
          b.click()
          // 设置区首按钮弹的是账号菜单,再点「设置」行 → 再点设置侧栏的「模型」分区
          window.setTimeout(function () {
            var items = document.querySelectorAll('[role="menuitem"], [role="menu"] button')
            for (var k = 0; k < items.length; k++) {
              var row = items[k]
              var text = (row.textContent || '').trim()
              if (/^设置/.test(text) || /^Settings/.test(text)) {
                row.click()
                window.setTimeout(function () {
                  var navs = document.querySelectorAll('[class*="settings"] nav button, [class*="section"] button, [role="tab"], [role="menuitem"]')
                  for (var m = 0; m < navs.length; m++) {
                    var tab = navs[m]
                    var tt = (tab.textContent || '').trim()
                    if (/^模型$|^Models$/.test(tt)) { tab.click(); return }
                  }
                }, 80)
                return
              }
            }
          }, 60)
          return true
        }
      }
      try {
        var opts = { code: 'Comma', key: ',', bubbles: true, cancelable: true }
        window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({}, opts, { metaKey: true, altKey: true })))
        window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({}, opts, { ctrlKey: true, altKey: true })))
      } catch (e) { /* ignore */ }
      return false
    }

    var RECHARGE_PACKAGES = [1000, 5000, 10000, 30000, 50000]

    /** 弹窗内嵌充值:选套餐 → 下单 → 新窗口支付宝 → 轮询到账。 */
    /** 千分位整数。 */
    function thousand(n) {
      return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }
    /** 当前档位提示:用户固定的四组文案。 */
    var RECHARGE_HINTS = { 1000: 38460000, 5000: 192300000, 10000: 384600000, 30000: 1154000000 }
    function rechargeHint(fen, creditNano) {
      var tokens = RECHARGE_HINTS[fen]
      var usd = (creditNano ? creditNano / 1e9 : (fen / 100 / 6.5)).toFixed(2)
      var TURNS = { 1000: 214, 5000: 1068, 10000: 2137, 30000: 6410 } // 用户给定口径
      var turns = TURNS[fen] || Math.round(tokens / 180000)
      return '获得 $' + usd + ' ≈ ' + turns.toLocaleString('en-US') + ' 轮对话'
    }

    /** 词元数 → "1.2亿"/"3.4万"/"5000"。 */
    function humanTokens(n) {
      var v = Number(n) || 0
      if (v >= 1e8) return (v / 1e8).toFixed(v >= 1e9 ? 0 : 1) + '亿'
      if (v >= 1e4) return (v / 1e4).toFixed(v >= 1e5 ? 0 : 1) + '万'
      return String(Math.round(v))
    }

    function InlineRecharge(props) {
      var picked = React.useState(10000)
      var busy = React.useState(false)
      var err = React.useState('')
      var packs = React.useState(null) // [{fen, usd, tokens}]
      function pickedCredit(fen) {
        var list = packs && packs[0] || []
        for (var i = 0; i < list.length; i++) {
          if (list[i].fen === fen && typeof list[i].creditNano === 'number') return list[i].creditNano
        }
        return undefined
      }
      React.useEffect(function () {
        var stopped = false
        Promise.all([api('recharge-config').catch(function () { return null }), api('wordcoin-market').catch(function () { return null })])
          .then(function (all) {
            if (stopped) return
            var config = all[0] && all[0].config
            var market = all[1] && all[1].market
            var price = market && Number(market.price_nano_usd_per_wc) // nanoUSD / 词元
            var list = (config && Array.isArray(config.packages) ? config.packages : null)
            if (!list || !list.length || !price || price <= 0) return
            packs[1](list.map(function (pk) {
              var nano = Number(pk.credit_nano_usd || 0) + Number(pk.bonus_nano_usd || 0)
              return { fen: Number(pk.cny_fen), usd: nano / 1e9, tokens: nano / price, creditNano: nano }
            }).filter(function (pk) { return pk.fen !== 50000 }))
          }).catch(function () {})
        return function () { stopped = true }
      }, [])
      // 同页跳转支付回来后,续查未完结订单
      React.useEffect(function () {
        var saved = null
        try { saved = localStorage.getItem('dsh-tokenbank/pending-order') } catch (e5) {}
        if (!saved) return
        busy[1](true)
        var deadline = Date.now() + 180000
        var timer = window.setInterval(async function () {
          var res = await api('recharge-order', { orderNo: saved }).catch(function () { return null })
          var status = res && res.order && (res.order.status || res.order.state)
          if (status === 'paid' || status === 'settled' || status === 'success') {
            window.clearInterval(timer)
            try { localStorage.removeItem('dsh-tokenbank/pending-order') } catch (e6) {}
            busy[1](false)
            props.onPaid()
          } else if (status === 'failed' || status === 'expired' || Date.now() > deadline) {
            window.clearInterval(timer)
            try { localStorage.removeItem('dsh-tokenbank/pending-order') } catch (e7) {}
            busy[1](false)
            err[1](pageT('rechargePending'))
          }
        }, 3000)
        return function () { window.clearInterval(timer) }
      }, [])
      var pay = async function () {
        busy[1](true); err[1]('')
        try {
          var created = await api('recharge-create', { body: { cny_fen: picked[0] } })
          var od = created && (created.order || created)
          var orderNo = created && (created.orderNo || od && (od.order_no || od.orderNo || od.no))
          if (!orderNo) throw new Error('no order no')
          // WebView 拦新窗口也拦 blob 跳转:直接让宿主用系统默认浏览器打开支付宝收银台
          try { localStorage.setItem('dsh-tokenbank/pending-order', orderNo) } catch (e4) {}
          await api('recharge-open-pay', { orderNo: orderNo })
          var deadline = Date.now() + 180000
          var paid = false
          while (Date.now() < deadline) {
            await new Promise(function (r) { setTimeout(r, 3000) })
            var res = await api('recharge-order', { orderNo: orderNo }).catch(function () { return null })
            var status = res && res.order && (res.order.status || res.order.state)
            if (status === 'paid' || status === 'settled' || status === 'success') { paid = true; break }
            if (status === 'failed' || status === 'expired') break
          }
          if (paid) { busy[1](false); props.onPaid(); return }
          err[1](pageT('rechargePending'))
        } catch (e2) { err[1](String(e2.message || e2)) }
        busy[1](false)
      }
      return h('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8, padding: 0 },
      },
        h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          (packs[0] || [
            { fen: 1000 }, { fen: 5000 }, { fen: 10000 }, { fen: 30000 },
          ]).map(function (pk) {
            var label
            if (pk.usd !== undefined) {
              label = '¥' + (pk.fen / 100)
            } else {
              label = '¥' + (pk.fen / 100)
            }
            return h('button', {
              key: pk.fen, type: 'button',
              style: Object.assign({}, buttonStyle, {
                flex: '1 1 calc(50% - 6px)', justifyContent: 'center',
                fontWeight: picked[0] === pk.fen ? 700 : 400,
                borderColor: picked[0] === pk.fen ? '#ff4f1f' : 'var(--dsw-alias-border-l2, #c9ccd1)',
                color: picked[0] === pk.fen ? '#ff4f1f' : undefined,
              }),
              onClick: function () { picked[1](pk.fen) },
            }, label)
          })),
        err[0] && !busy[0] ? h('div', { style: errorStyle }, err[0]) : null,
        busy[0] ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } },
          h('span', null, pageT('rechargeWaiting')),
          err[0] ? h('span', { style: { color: '#d54941' } }, err[0]) : null,
        ) : null,
        h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)', textAlign: 'center' } },
          rechargeHint(picked[0], pickedCredit(picked[0]))),
        h('div', {
          style: {
            padding: 10, borderRadius: 8,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-bg-layer-1, #f7f7f8)',
          },
        },
          h('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 6 } }, '价格对比'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 } },
            (function () {
              // 三家统一按当前所选档位的 CNY 面额折算可买 TOKEN(各家单价不同):
              // TokenBank 用真实 credit(含赠送),OpenAI/Anthropic 与中转站按其 $ 单价换算
              var cny = picked[0] / 100
              // TokenBank 官方口径:¥100 = 3.8亿 TOKEN(RECHARGE_HINTS 锚点,与提示行一致)
              var tbTokens = RECHARGE_HINTS[picked[0]] || Math.round(cny * 3.846e6) // 兜底:¥1≈384.6万 TOKEN
              // 同样的人民币,其他厂商按其 $ 单价折算出美元,再按 TokenBank 单价折 TOKEN:
              // tokens = (cny / price_cny_per_usd) * (tbTokens / usd_of_this_pack)
              var usdOfPack = cny / 6.5
              var vendorTokens = (cny / 7.25) / usdOfPack * tbTokens   // $1=¥7.25
              var relayTokens = (cny / 7.8) / usdOfPack * tbTokens     // 中转站 $1≈¥7.8
              return [
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  h('span', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                    h('span', { style: { fontWeight: 700 } }, 'TokenBank'),
                    h('span', { style: { background: '#ff4f1f', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 11, fontWeight: 700 } }, '最优惠')),
                  h('span', null, humanTokens(tbTokens) + ' TOKEN')),
                h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                  h('span', null, 'OpenAI/Anthropic 等'),
                  h('span', null, humanTokens(vendorTokens) + ' TOKEN')),
                h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                  h('span', null, '国内中转站均价'),
                  h('span', null, humanTokens(relayTokens) + ' TOKEN')),
              ]
            })()),
          ),
        h('button', {
          type: 'button', style: Object.assign({}, primaryButtonStyle, { justifyContent: 'center' }),
          disabled: busy[0], onClick: pay,
        }, busy[0] ? pageT('rechargeWaiting') : pageT('rechargePay')),
        busy[0] ? h('button', {
          type: 'button', style: Object.assign({}, buttonStyle, { justifyContent: 'center' }),
          onClick: function () {
            busy[1](false); err[1]('')
            try { localStorage.removeItem('dsh-tokenbank/pending-order') } catch (e8) {}
          },
        }, pageT('rechargeCancel')) : null,
      )
    }

    /** 侧栏底部长驻块:完整展示 logo/账号/余额/托管充值/获取免费模型,无卡片框。 */
    function SidebarCard() {
      var snap = useTbStore()
      var st = React.useState(null)
      var flash = React.useState(null)
      var sLogoutArm = React.useState(false)
      var sLogoutTimer = { ref: null }
      var freeModelsUsed = React.useState(false)
      // 登录态变化时同步一次性入口标记(退出已清 localStorage,重登后重新出现)
      React.useEffect(function () {
        if (!snap.loggedIn) return
        try {
          freeModelsUsed[1](window.localStorage.getItem('tb-free-models-used') === '1')
        } catch (e) {}
      }, [snap.loggedIn])
      var boxRef = React.useRef(null)
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (!stopped) { st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl }) }
        }).catch(function () {})
        var timer = setInterval(function () {
          api('status').then(function (data) { if (!stopped) st[1](data) }).catch(function () {})
        }, 60000)
        return function () { stopped = true; clearInterval(timer) }
      }, [])
      // 登录态/弹窗开合变化时立即重拉 status,侧栏即时反映登录结果
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (!stopped) { st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl }) }
        }).catch(function () {})
        return function () { stopped = true }
      }, [snap.loggedIn, snap.authOpen])
      var openPanel = function (mode, extra) {
        tbStore.set(Object.assign({ authOpen: true, authMode: mode || snap.authMode || 'login', anchor: null }, extra || {}))
      }
      // 找到宿主模型选择器触发按钮并点开(带重试:刚接入的 provider 需要等一拍渲染)
      var openModelSwitcher = function (tries) {
        var triggers = document.querySelectorAll('button[aria-haspopup="menu"]')
        for (var q = 0; q < triggers.length; q++) {
          var lb = triggers[q].getAttribute('aria-label') || ''
          if (/选择模型|Select model/.test(lb)) { triggers[q].click(); return }
        }
        if (tries > 0) window.setTimeout(function () { openModelSwitcher(tries - 1) }, 120)
      }
      var addModels = async function () {
        var d = data
        try {
          if (!d || !d.loggedIn) d = await api('status')
          if (!d || !d.loggedIn) { openPanel('login'); return }
          var models = await api('gateway-models', { accessKey: d.accessKey })
          var list = (models && models.models) || []
          await addProviderToModels(runtimeCtx, d.baseURL || d.portalUrl || 'https://bank.skillpie.cn', { accessKey: d.accessKey, list: list, protocol: models.protocol })
          flash[1]({ text: pageT('modelLinked').replace('{n}', String(list.length)), models: true })
          window.setTimeout(function () { flash[1](null) }, 3000)
          // 不等用户点「去切换」,直接弹模型菜单
          window.setTimeout(function () { openModelSwitcher(6) }, 120)
        } catch (err) {
          tbStore.set({ notify: { kind: 'error', title: String(err.message || err), detail: '' } })
        }
      }
      var data = st[0]
      var loggedIn = snap.loggedIn
      if (!runtimeCtx) return null
      var smallBtn = Object.assign({}, buttonStyle, { height: 24, padding: '0 8px', fontSize: 12 })
      // 弱化的文字链按钮:无框无底色,次级灰字,悬停才显主色
      var quietLinkStyle = {
        border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 4px',
        fontSize: 12, lineHeight: '20px', borderRadius: 6,
        color: 'var(--dsw-alias-label-secondary, #888)',
      }
      return h('div', {
        ref: boxRef,
        // 整个长驻板块作为可点击区域:点击任意位置打开账户弹窗(托管等子按钮单独 stopPropagation)
        onClick: function () { openPanel('register') },
        style: {
          cursor: 'pointer',
          margin: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 6, width: 'calc(100% - 20px)', boxSizing: 'border-box', alignSelf: 'stretch'
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          h('span', {
            className: 'tb-wordmark',
            style: { fontFamily: "'Frizon','FrizonLocal',sans-serif", fontSize: 14, letterSpacing: 0.5, color: '#111111', position: 'relative', top: -1 },
          }, 'TOKENBANK'),
          loggedIn ? h('span', { style: { flex: 1 } }) : h('button', {
              type: 'button',
              style: { fontSize: 10, lineHeight: 1, padding: '3px 7px', borderRadius: 999, border: 'none', cursor: 'pointer', color: '#fff', background: '#ff4f1f', fontWeight: 600, letterSpacing: 0.3, marginLeft: 'auto' },
              onClick: function () { openPanel('register') },
            }, pageT('freeToken')),
          loggedIn ? h('span', { style: { fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } },
            data && data.account && typeof data.account.balance_nano_usd === 'number'
              ? '$' + (data.account.balance_nano_usd / 1e9).toFixed(2) : '—') : null),
        loggedIn && flash[0]
          ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #888)', textAlign: 'center' } }, flash[0].text)
          : null,
      )
    }

    /** 全局托管弹窗:用户粘贴 API Key 托管(设置页「一键托管」不受影响)。 */
    function DepositOverlay() {
      var snap = useTbStore()
      var keys = React.useState('')
      var busy = React.useState(false)
      var err = React.useState('')
      React.useEffect(function () {
        if (!snap.depositOpen) return
        keys[1](''); err[1](''); busy[1](false)
      }, [snap.depositOpen])
      if (!snap.depositOpen || !runtimeCtx) return null
      var close = function () { tbStore.set({ depositOpen: false }) }
      var submit = async function () {
        var one = keys[0].trim()
        if (!one) { err[1](pageT('keyRequired')); return }
        var list = [one]
        busy[1](true); err[1]('')
        try {
          await api('deposits-add', { keys: list })
          busy[1](false)
          tbStore.set({ depositOpen: false, notify: { kind: 'success', title: pageT('depositDone'), detail: '' } })
        } catch (e) {
          busy[1](false); err[1](String(e.message || e))
        }
      }
      var inputStyle = {
        width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: 13,
        borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1, #f7f7f8)', color: 'inherit',
      }
      return h('div', { style: { position: 'fixed', inset: 0, zIndex: 2100 } },
        h('div', { style: { position: 'fixed', inset: 0, zIndex: -1, background: 'rgba(0,0,0,0.35)' }, onClick: close }),
        h('div', {
          style: {
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 500, maxWidth: 'calc(100vw - 24px)', maxHeight: '80vh', overflow: 'auto',
            background: 'var(--dsw-menu-surface-fill)', backdropFilter: 'var(--dsw-menu-backdrop-filter)',
            WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
            color: 'var(--dsw-alias-label-primary)',
            borderRadius: 'var(--dsw-radius-md, 10px)', padding: 16,
            border: '1px solid var(--dsw-alias-border-l1)',
            boxShadow: 'var(--dsw-elevation-prominent)',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
            h('span', { style: { fontWeight: 700, fontSize: 14 } }, pageT('depositTitle')),
            h('button', { type: 'button', style: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--dsw-alias-label-secondary, #888)', padding: 2 }, onClick: close }, '✕')),
          h('div', { style: { fontSize: 12, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary, #888)', marginBottom: 10 } },
            h('div', null, pageT('depositIntro')),
            h('div', null, pageT('depositIntro1')),
            h('div', null, pageT('depositIntro2')),
            h('div', null, pageT('depositIntro3')),
            h('div', null, pageT('depositIntro4')),
            h('div', { style: { marginBottom: 6 } }, pageT('depositIntro5')),
            h('a', { href: (snap.portalUrl || 'https://bank.skillpie.cn') + '/', target: '_blank', rel: 'noreferrer', style: { color: '#ff4f1f', textDecoration: 'none', fontWeight: 600 } }, pageT('learnMore'))),
          h('input', {
            type: 'text', placeholder: pageT('depositPlaceholder'),
            value: keys[0], onChange: function (e) { keys[1](e.target.value) },
            style: Object.assign({}, inputStyle, { fontFamily: 'monospace' }),
          }),
          err[0] ? h('div', { style: { fontSize: 12, color: '#d54941', marginTop: 6 } }, err[0]) : null,
          h('button', {
            type: 'button', disabled: busy[0],
            style: Object.assign({}, primaryButtonStyle, { justifyContent: 'center', width: '100%', marginTop: 10 }),
            onClick: submit,
          }, busy[0] ? '…' : pageT('depositSubmit')),
        ),
      )
    }

    /** shell.overlay 账户/注册弹窗:登录态展示余额与快捷操作,未登录展示表单。 */
    // 由邮箱地址推断其服务商网页版收件箱入口(发码后自动跳转用)
    function mailHomeUrl(addr) {
      var domain = String(addr || '').split('@')[1] || ''
      domain = domain.toLowerCase()
      var map = {
        'qq.com': 'https://mail.qq.com', 'foxmail.com': 'https://mail.qq.com',
        '163.com': 'https://mail.163.com', '126.com': 'https://mail.126.com',
        'gmail.com': 'https://mail.google.com', 'googlemail.com': 'https://mail.google.com',
        'outlook.com': 'https://outlook.live.com', 'hotmail.com': 'https://outlook.live.com', 'live.com': 'https://outlook.live.com',
        'icloud.com': 'https://www.icloud.com/mail',
        'sina.com': 'https://mail.sina.com.cn', 'sohu.com': 'https://mail.sohu.com',
        'aliyun.com': 'https://mail.aliyun.com', 'yeah.net': 'https://mail.yeah.net',
        '139.com': 'https://mail.10086.cn',
      }
      if (map[domain]) return map[domain]
      return domain ? 'https://mail.' + domain : ''
    }

    function EntryOverlay() {
      var snap = useTbStore()
      var st = React.useState(null)
      var logoutArm = React.useState(false)
      var innerToast = React.useState(null)
      var checkinFlash = React.useState(null) // 签到成功闪现文案(复用获取免费模型按钮样式,2s 回原样)
      var balanceGain = React.useState(null) // { amount } 余额旁 +$x 浮现动画,8s 自动消失
      var checkin = React.useState({ busy: false, done: false })
      React.useEffect(function () {
        if (!snap.authOpen) logoutArm[1](false)
      }, [snap.authOpen])
      React.useEffect(function () {
      }, [snap.authOpen])
      React.useEffect(function () {
        if (!snap.authOpen) return
        var stopped = false
        api('status').then(function (data) {
          if (!stopped) { st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl }) }
        }).catch(function () {})
        var pull = function () {
          api('checkin-status').then(function (res) {
            var ci = res && res.checkin
            if (!stopped && ci && ci.enabled && ci.checked_today) checkin[1]({ busy: false, done: true })
            else if (!stopped && ci && ci.enabled) checkin[1]({ busy: false, done: false })
          }).catch(function () {})
        }
        pull()
        var timer = setInterval(pull, 60000)
        return function () { stopped = true; clearInterval(timer) }
      }, [snap.authOpen])
      // 登录态下每 30 分钟拉一次网关模型目录并刷新进模型列表(仅保留有可用凭证的模型);
      // 退出登录(snap.loggedIn 变 false)即清定时器,不再同步。
      React.useEffect(function () {
        if (!snap.loggedIn) return
        var syncModels = async function () {
          try {
            var d = await api('status')
            if (!d || !d.loggedIn || !runtimeCtx) return
            var models = await api('gateway-models', { accessKey: d.accessKey })
            var list = (models && models.models) || []
            if (!list.length) return
            await addProviderToModels(runtimeCtx, d.baseURL || d.portalUrl || 'https://bank.skillpie.cn', { accessKey: d.accessKey, list: list, protocol: models.protocol })
          } catch (e) { /* 静默:后台同步失败不打扰用户 */ }
        }
        syncModels()
        var t = window.setInterval(syncModels, 30 * 60 * 1000)
        return function () { window.clearInterval(t) }
      }, [snap.loggedIn])
      if (!snap.authOpen || !runtimeCtx) return null
      var close = function () { tbStore.set({ authOpen: false, startRecharge: false }) }
      var data = st[0]
      var portal = (data && data.portalUrl) || 'https://bank.skillpie.cn'
      var anchor = snap.anchor || { right: window.innerWidth - 16, top: window.innerHeight - 80 }
      var panelWidth = 256
      return h('div', { style: { position: 'fixed', inset: 0, zIndex: 1999 } },
        h('div', { style: { position: 'fixed', inset: 0, zIndex: -1 }, onClick: close }),
        h('div', {
          style: {
            position: 'fixed', width: panelWidth, maxWidth: 'calc(100vw - 16px)',
            right: Math.max(8, window.innerWidth - anchor.right),
            bottom: Math.max(8, window.innerHeight - anchor.top + 8),
            maxHeight: 420, overflow: 'auto',
            /* 与模型选择器菜单(MenuSurface)完全一致的材质 */
            background: 'var(--dsw-menu-surface-fill)',
            backdropFilter: 'var(--dsw-menu-backdrop-filter)',
            WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
            color: 'var(--dsw-alias-label-primary)',
            borderRadius: 'var(--dsw-radius-md, 10px)', padding: 14,
            border: 0,
            '--dsw-elevation-stroke-color': 'var(--dsw-alias-border-l1)',
            boxShadow: 'var(--dsw-elevation-prominent)',
            border: '1px solid var(--dsw-alias-border-l1)',
          },
          onClick: function (e) { e.stopPropagation() },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
            h(TokenBankLogo, { size: 16 }),
            h('a', {
              href: portal, target: '_blank', rel: 'noopener noreferrer',
              style: { display: 'inline-flex', alignItems: 'center', cursor: 'pointer', textDecoration: 'none' },
              'aria-label': 'TokenBank',
            }, h('span', { className: 'tb-wordmark', style: { fontFamily: "'Frizon','FrizonLocal',sans-serif", fontSize: 17, fontWeight: 400, letterSpacing: 0.5, lineHeight: 1, color: '#111111', position: 'relative', top: -1, left: -1 } }, 'TOKENBANK')),
            // 标题右侧紧贴的「打开外部」灰色小按钮:新开 TokenBank 官网
            h('a', {
              href: portal, target: '_blank', rel: 'noopener noreferrer',
              title: pageT('openSite'), 'aria-label': pageT('openSite'),
              style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, borderRadius: 5, marginLeft: -4, position: 'relative', top: 1, color: 'var(--dsw-alias-label-secondary, #888)', background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', textDecoration: 'none' },
            },
              h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
                h('polyline', { points: '15 3 21 3 21 9' }),
                h('line', { x1: 10, y1: 14, x2: 21, y2: 3 }))),
            h('span', { style: { flex: 1 } }),
            data && data.loggedIn ? h('button', {
              type: 'button', title: pageT('logout'), 'aria-label': pageT('logout'),
              style: logoutArm[0]
                ? Object.assign({}, buttonStyle, { height: 24, padding: '0 8px', fontSize: 11, color: '#d03050', borderColor: '#d03050', borderWidth: 1, borderStyle: 'solid' })
                : { height: 24, minWidth: 24, padding: 0, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dsw-alias-label-secondary, #999)' },
              onClick: async function () {
                if (!logoutArm[0]) { logoutArm[1](true); return }
                await api('logout').catch(function () {})
                logoutArm[1](false)
                st[1](null)
                try { window.localStorage.removeItem('tb-free-models-used') } catch (e) {}
                tbStore.set({ loggedIn: false })
                if (runtimeCtx) removeProviderFromModels(runtimeCtx)
              },
            },
              h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
                h('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }),
                h('path', { d: 'M16 17l5-5-5-5' }),
                h('path', { d: 'M21 12H9' }),
              )) : null,
          ),
          data && data.loggedIn
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
                h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } },
                  h('span', { style: { fontSize: 13, fontWeight: 600 } },
                    (data.user && (data.user.display_name || data.user.name)) || data.email || ''),
                  h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } }, data.email || ''),
                ),

                                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
                  h('div', { style: { position: 'relative', display: 'inline-block', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } },
                    data.account && typeof data.account.balance_nano_usd === 'number'
                      ? '$' + (data.account.balance_nano_usd / 1e9).toFixed(2) : '—',
                    balanceGain[0] ? h('span', {
                      key: 'gain-' + balanceGain[0].ts,
                      style: {
                        position: 'absolute', left: '100%', top: 0, marginLeft: 6, whiteSpace: 'nowrap',
                        fontSize: 12, fontWeight: 700, color: '#d03050', pointerEvents: 'none',
                        animation: 'tb-balance-gain 1s ease-out both',
                      },
                    }, '+' + balanceGain[0].amount) : null),
                  h('span', { style: { display: 'inline-flex', gap: 6 } },
                                        h('button', {
                      type: 'button', disabled: checkin[0].busy || checkin[0].done,
                      style: Object.assign({}, buttonStyle, { height: 26, padding: '0 12px', fontSize: 12 }),
                      // 充值面板长驻,按钮固定为「签到」;签到后禁用(文案不改)
                      onClick: (!checkin[0].done) ? async function () {
                        if (checkin[0].busy) return
                        checkin[1](Object.assign({}, checkin[0], { busy: true }))
                        try {
                          var res = await api('checkin-do')
                          var ci = res && res.checkin || {}
                          checkin[1]({ busy: false, done: Boolean(ci.checked_today) })
                          if (ci.checked_today) {
                            var before = data.account && typeof data.account.balance_nano_usd === 'number' ? data.account.balance_nano_usd : null
                            var fresh = await api('status').catch(function () { return null })
                            var gain = null
                            if (fresh && fresh.account && typeof fresh.account.balance_nano_usd === 'number') {
                              st[1](fresh); tbStore.set({ loggedIn: Boolean(fresh.loggedIn), portalUrl: fresh.portalUrl })
                              if (before != null && fresh.account.balance_nano_usd > before) gain = ((fresh.account.balance_nano_usd - before) / 1e9).toFixed(2)
                            }
                            balanceGain[1]({ amount: gain || '0.10', ts: Date.now() })
                            window.setTimeout(function () { balanceGain[1](null) }, 8000)
                            var streakText = ci.streak > 1 ? '（' + pageT('checkinStreak').replace('{n}', String(ci.streak)) + '）' : ''
                            tbStore.set({ notify: { kind: 'success', title: pageT('checkinOk') + streakText, detail: '' } })
                          }
                        } catch (e9) {
                          checkin[1](Object.assign({}, checkin[0], { busy: false }))
                          innerToast[1]({ text: String(e9.message || e9), error: true })
                        }
                      } : undefined,
                    }, checkin[0].busy ? pageT('checkin') + '…' : pageT('checkin')),                    data && data.loggedIn ? h('button', {
                      type: 'button', 'aria-label': pageT('depositManageTip'),
                      style: Object.assign({}, buttonStyle, { height: 26, padding: '0 12px', fontSize: 12, borderColor: 'var(--dsw-alias-border-l2, #c9ccd1)', marginLeft: 'auto' }),
                      onClick: function () {
                        tbStore.set({ authOpen: false, depositOpen: true })
                      },
                    }, pageT('depositManage')) : null,

                  ),
                ),
                h(InlineRecharge, {
                  onPaid: async function () {
                    var before = data.account && typeof data.account.balance_nano_usd === 'number' ? data.account.balance_nano_usd : null
                    var fresh = await api('status').catch(function () { return null })
                    var gain = null
                    if (fresh) {
                      st[1](fresh); tbStore.set({ loggedIn: Boolean(fresh.loggedIn), portalUrl: fresh.portalUrl })
                      if (before != null && fresh.account && fresh.account.balance_nano_usd > before) gain = ((fresh.account.balance_nano_usd - before) / 1e9).toFixed(2)
                    }
                    if (gain) {
                      balanceGain[1]({ amount: gain, ts: Date.now() })
                      window.setTimeout(function () { balanceGain[1](null) }, 8000)
                    }
                    tbStore.set({ notify: { kind: 'success', title: pageT('rechargeDone'), detail: '' } })
                  },
                }),
                innerToast[0] ? h('div', {
                  style: {
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1, #f7f7f8)', fontSize: 13,
                  },
                },
                  h('span', { style: { color: innerToast[0].error ? '#d03050' : '#22a04a', fontWeight: 700 } }, innerToast[0].error ? '✕' : '✓'),
                  h('span', { style: { flex: 1 } }, innerToast[0].text),
                  (!innerToast[0].error && innerToast[0].kind === 'models') ? h('button', {
                    type: 'button', style: Object.assign({}, buttonStyle, { height: 24, padding: '0 10px', fontSize: 12 }),
                    onClick: function () {
                      innerToast[1](null)
                      tbStore.set({ authOpen: false })
                      window.setTimeout(function () {
                        var triggers = document.querySelectorAll('button[aria-haspopup="menu"]')
                        for (var q = 0; q < triggers.length; q++) {
                          var lb = triggers[q].getAttribute('aria-label') || ''
                          if (/选择模型|Select model/.test(lb)) { triggers[q].click(); return }
                        }
                      }, 80)
                    },
                  }, pageT('goSwitch')) : null,
                ) : (checkinFlash[0] ? h('button', {
                      type: 'button', tabIndex: -1,
                      style: Object.assign({}, primaryButtonStyle, { justifyContent: 'center', cursor: checkinFlash[0].models ? 'pointer' : 'default', opacity: 0.9 }),
                      onClick: checkinFlash[0].models ? function () {
                        checkinFlash[1](null)
                        tbStore.set({ authOpen: false })
                        window.setTimeout(function () {
                          var triggers = document.querySelectorAll('button[aria-haspopup="menu"]')
                          for (var q = 0; q < triggers.length; q++) {
                            var lb = triggers[q].getAttribute('aria-label') || ''
                            if (/选择模型|Select model/.test(lb)) { triggers[q].click(); return }
                          }
                        }, 80)
                      } : undefined,
                    }, checkinFlash[0].text) : null),
              )
            : h(AuthCard, {
                mode: snap.authMode,
                setMode: function (mode) { tbStore.set({ authMode: mode }) },
                onAuthed: async function () {
                  tbStore.set({ authOpen: false })
                  try {
                    var me = await api('status').catch(function () { return null })
                    if (me) tbStore.set({ loggedIn: Boolean(me.loggedIn), portalUrl: me.portalUrl })
                    if (!runtimeCtx.remote || !runtimeCtx.remote.settings) return
                    var fresh = await api('status')
                    if (fresh && fresh.accessKey) {
                      var models = await api('gateway-models', { accessKey: fresh.accessKey })
                      var list = Array.isArray(models) ? models : (models.models || models.list || [])
                      await addProviderToModels(runtimeCtx, fresh.baseURL || fresh.portalUrl, { accessKey: fresh.accessKey, list: list, protocol: models.protocol, key: fresh.accessKey })
                    }
                  } catch { /* 面板里会提示模型接入状态 */ }
                },
              }),
        ),
      )
    }

    /** 模块③:余额不足引导横幅(shell.overlay,30s 轮询 host watcher)。 */
    function LowBalanceOverlay() {
      var snap = useTbStore()
      var event = React.useState(null)
      var hiddenSeq = React.useState(null)

      React.useEffect(function () {
        var stopped = false
        async function tick() {
          try {
            var data = await api('low-balance')
            if (!stopped && data && data.event) event[1](data.event)
          } catch { /* 面板未登录等情况 */ }
        }
        tick()
        var timer = setInterval(tick, 30000)
        return function () { stopped = true; clearInterval(timer) }
      }, [])

      if (!event[0]) return null
      if (hiddenSeq[0] === event[0].seq) return null
      var portalUrl = (runtimeCtx && tbStore.state.portalUrl) || 'https://bank.skillpie.cn'
      return h('div', {
        style: {
          position: 'fixed', left: '50%', transform: 'translateX(-50%)', top: 12, zIndex: 2000,
          background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
          border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, maxWidth: '86vw',
        },
      },
        h(CoinIcon, { size: 16 }),
        h('span', { style: { fontSize: 13 } }, pageT('lowBalanceTitle')),
        h('a', {
          href: portalUrl, target: '_blank', rel: 'noopener noreferrer',
          style: { fontSize: 13, color: 'var(--dsw-alias-label-link, #2563eb)', textDecoration: 'underline' },
        }, pageT('lowBalanceRecharge')),
        h('button', {
          type: 'button', style: buttonStyle,
          onClick: function () { hiddenSeq[1](event[0].seq) },
        }, pageT('dismiss')),
      )
    }

    /** 模块④:设置→模型页各 provider 卡片内的「托管到 TokenBank」(provider-card keyed 槽)。 */
    function DepositSlot(props) {
      var entry = props.provider || {}
      var isTokenbank = entry.provider === 'tokenbank' || entry.id === 'tokenbank' || entry.settingsNs === MODEL_NS && entry.provider === 'tokenbank'
      if (isTokenbank) return null // TokenBank 自己的卡片不需要自托管入口
      if (!props.configured) return null // 未配置的 provider 没有可托管的 Key
      var snap = useTbStore()
      if (snap.loggedIn === false) return null // 未登录 TokenBank 门户:托管无从谈起,不显示按钮

      var busy = React.useState(false)
      var deposited = React.useState(null) // null=未知,{depositId}

      var anchorRef = React.useRef(null)

      var credentialRef = React.useCallback(function () {
        // DSH 约定引用:大写路由 + _API_KEY(与 ui-settings-models deriveKeyRef 一致)
        return String(entry.provider).toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY'
      }, [])

      React.useEffect(function () {
        var stopped = false
        api('deposit-state', { ref: credentialRef() }).then(function (data) {
          if (!stopped) deposited[1](data.deposited ? { depositId: data.depositId } : null)
        }).catch(function () { if (!stopped) deposited[1](null) })
        return function () { stopped = true }
      }, [])

      var submit = React.useCallback(async function () {
        busy[1](true)
        try {
          // 不带 groupId:服务端逐个分组探活,自动选第一个能通过的分组托管
          var res = await api('deposit-configured', { ref: credentialRef() })
          if (res && res.deposited === false) {
            // 服务端探活失败:Key 打不通上游,拒绝托管
            var detail = res.probe && (res.probe.detail || res.probe.reason)
            tbStore.set({ notify: { kind: 'error', title: pageT('probeFailed'), detail: detail ? String(detail) : '' } })
          } else {
            deposited[1]({ depositId: null })
            var ok = pageT('depositDone')
            if (res.probe && res.probe.outcome === 'inconclusive') ok += '(' + pageT('probeInconclusive') + ')'
            if (res.result && res.result.deposits) ok += '\n' + pageT('modelListCount').replace('{n}', String(res.result.deposits))
            tbStore.set({ notify: { kind: 'success', title: ok, detail: '' } })
          }
        } catch (err) {
          tbStore.set({ notify: { kind: 'error', title: pageT('probeFailed'), detail: String(err.message || err) } })
        }
        busy[1](false)
      }, [])

      var cancel = React.useCallback(async function () {
        busy[1](true)
        try {
          var state = deposited[0]
          if (state && state.depositId != null) {
            await api('deposits-remove', { id: state.depositId })
          } else {
            // 状态未知时按掩码兜底查一次再撤
            var st = await api('deposit-state', { ref: credentialRef() })
            if (st.deposited && st.depositId != null) await api('deposits-remove', { id: st.depositId })
            else throw new Error(pageT('depositDone'))
          }
          deposited[1](null)
          tbStore.set({ notify: { kind: 'success', title: pageT('depositCancelled'), detail: '' } })
        } catch (err) {
          tbStore.set({ notify: { kind: 'error', title: pageT('depositCancel'), detail: String(err.message || err) } })
        }
        busy[1](false)
      }, [])

      // 槽位渲染在卡片正文;按钮以「原生 DOM 节点」搬进行头操作区(编辑/删除左边)。
      // 关键:不能用 React 管理的节点搬运——React 重渲染按旧位置回收会抛
      // NotFoundError 并卸载整个模型区块(设置页整页空白的根因);原生节点
      // 不参与 reconciliation,怎么搬都安全。
      var busyRef = React.useRef(false)
      React.useEffect(function () { busyRef.current = busy[0] }, [busy[0]])

      React.useEffect(function () {
        var anchor = anchorRef.current
        if (!anchor) return undefined
        var host = anchor.closest('li')
        var observer = null
        var btn = document.createElement('button')
        btn.type = 'button'
        btn.addEventListener('click', function () {
          if (depositedRef.current != null) cancel(); else submit()
        })
        var sync = function () {
          btn.disabled = busyRef.current
          btn.textContent = busyRef.current ? '…'
            : (depositedRef.current != null ? pageT('depositCancel') : pageT('settingsDeposit'))
          // 与编辑/删除按钮同款样式:直接复用 CSS Modules 类名
          var actions = btn.parentElement
          if (!actions) return
          var others = Array.prototype.filter.call(actions.querySelectorAll('button'), function (b) { return b !== btn })
          if (!others.length) return
          // 常规态取第一个(编辑),托管中取最后一个(删除,红色危险样式)
          var src = depositedRef.current != null ? others[others.length - 1] : others[0]
          if (src && src.className) { btn.className = src.className; btn.style.cssText = '' }
        }
        var place = function () {
          if (!anchor.isConnected) return
          var actions = host && host.querySelector('[class*="rowActions"]')
          if (!actions) return
          if (btn.parentElement === actions) return
          try {
            actions.insertBefore(btn, actions.firstChild)
            sync()
          } catch (e) { /* DOM 抢占竞态,下一轮 observer 自愈 */ }
        }
        anchor._syncDepositButton = sync
        sync()
        place()
        if (host && typeof MutationObserver === 'function') {
          observer = new MutationObserver(function () {
            // 稳态纯早退:按钮已在目标操作区就什么都不做
            var actions = host.querySelector('[class*="rowActions"]')
            if (!actions || btn.parentElement === actions) return
            place()
          })
          observer.observe(host, { childList: true, subtree: true })
        }
        return function () {
          if (observer) observer.disconnect()
          if (btn.parentElement) btn.parentElement.removeChild(btn)
        }
        // submit/cancel 是 useCallback([]) 稳定引用;depositedRef 定义于下方但 effect 运行时已就绪
      }, [])

      var isDeposited = deposited[0] != null
      var depositedRef = React.useRef(null)
      depositedRef.current = deposited[0]
      React.useEffect(function () {
        if (anchorRef.current && anchorRef.current._syncDepositButton) {
          anchorRef.current._syncDepositButton()
        }
      }, [isDeposited, busy[0]])

      // React 侧只渲染一个隐形锚点(真实按钮由上面的 effect 原生创建搬运)
      return h('span', { ref: anchorRef, style: { display: 'none' } })
    }

    function DepositHint() {
      var snap = useTbStore()
      var portal = (tbStore.get().portalUrl) || 'https://bank.skillpie.cn'
      var hintClosed = React.useState(false)
      // 初始值取当前登录态:挂载时已登录不算「登录跃迁」,避免误清关闭标记
      var prevLogin = React.useRef(Boolean(snap.loggedIn))
      React.useEffect(function () {
        if (!snap.loggedIn) { prevLogin.current = false; return }
        if (!prevLogin.current) {
          // 真正的「未登录 → 登录」跃迁:重新展示提示
          prevLogin.current = true
          try { window.sessionStorage.removeItem('tb-deposit-hint-closed') } catch (e) {}
          hintClosed[1](false)
        }
      }, [snap.loggedIn])
      React.useEffect(function () {
        try { if (window.sessionStorage.getItem('tb-deposit-hint-closed') === '1') hintClosed[1](true) } catch (e) {}
      }, [])
      if (hintClosed[0]) return null
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--dsw-alias-interactive-bg-subtle, transparent)', border: '0.5px solid var(--dsw-alias-border-l3)' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' } },
          h('span', null, pageT('depositHint')),
          h('span', null, pageT('depositCase1')),
          h('span', null, pageT('depositCase2')),
          h('span', null, pageT('depositCase3')),
          h('span', null, pageT('depositCase4')),
          h('span', null, pageT('depositCase5')),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('a', {
            href: portal, target: '_blank', rel: 'noreferrer',
            style: { fontSize: 12, color: 'var(--dsw-alias-label-link, var(--dsw-alias-label-primary))', textDecoration: 'none' },
          }, pageT('learnMore')),
          h('button', {
            type: 'button', title: pageT('dismissHint'), 'aria-label': pageT('dismissHint'),
            style: { border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center', color: 'var(--dsw-alias-label-tertiary, #a0a3a8)' },
            onClick: function () {
              hintClosed[1](true)
              try { window.sessionStorage.setItem('tb-deposit-hint-closed', '1') } catch (e) {}
            },
          },
            h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
              h('path', { d: 'M18 6 6 18' }), h('path', { d: 'm6 6 12 12' })),
          ),
        ),
      )
    }

    function FooterStatus() {
      var status = React.useState(null)

      React.useEffect(function () {
        var stopped = false
        async function tick() {
          try {
            var data = await api('status')
            if (!stopped) {
              status[1](data)
              tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
            }
          } catch { /* host 暂不可达 */ }
        }
        tick()
        var timer = setInterval(tick, 60000)
        return function () { stopped = true; clearInterval(timer) }
      }, [])

      if (!status[0]) return null
      var data = status[0]
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
        h('span', {
          style: {
            width: 8, height: 8, borderRadius: '50%',
            background: data.loggedIn ? 'var(--dsw-alias-label-success, #2e7d32)' : 'var(--dsw-alias-label-warning, #b26a00)',
            display: 'inline-block', flex: 'none',
          },
        }),
        data.loggedIn ? pageT('connectedAs').replace('{email}', String(data.email || '')) : pageT('notConnected'),
      )
    }


    /**
     * Mirror CustomProviderCard: store the credential reference, then set
     * providers.tokenbank fenced on the revision we just read. Returns
     * { ok, conflict? } — the caller renders the outcome.
     */
    async function addProviderToModels(ctx, baseURL, models) {
      if (!models.accessKey) throw new Error('credentials.set: empty access key (gateway-models response lost the key field?)')
      // typed gateway 契约:credentials/set 就是两个位置参数 (ref, value)
      // (packages/api/remotes/lib/client.js zod: parameter_0=ref, parameter_1=value)
      const stored = await ctx.remote.credentials.set(KEY_REF, models.accessKey)
      if (stored && stored.ok === false) throw new Error(stored.error?.message || 'failed to store key')

      const read = async () => {
        const describe = await ctx.remote.settings.describe()
        const view = describe?.namespaces?.[MODEL_NS] ?? null
        return view && typeof view.revision === 'number' ? view : null
      }
      const existing = await read()
      const revision = existing ? existing.revision : undefined
      const entries = (models.list || []).map(function (item) {
        if (typeof item === 'string') return { id: item }
        const entry = { id: item.id }
        // 别名一律留空 = 显示名与模型 id 一致(用户要求;display_name 不再下发)
        if (Array.isArray(item.input) && item.input.length > 0) entry.input = item.input
        // 推理档位:{off:null,low:'low',high:'high',...} → profile 的 reasoningEfforts
        if (item.reasoningEfforts && Object.keys(item.reasoningEfforts).length > 0) entry.reasoningEfforts = item.reasoningEfforts
        if (item.contextWindow) entry.contextWindow = item.contextWindow
        if (item.maxTokens) entry.maxTokens = item.maxTokens
        return entry
      })
      const profile = {
        displayName: 'TokenBank',
        apiKeyEnv: KEY_REF,
        // 分组渠道协议(claude→anthropic-messages);未知仍按 openai-completions
        api: models.protocol === 'anthropic-messages' || models.protocol === 'openai-responses'
          ? models.protocol
          : 'openai-completions',
        baseURL,
        models: entries,
      }
      const response = await ctx.remote.settings.mutate(MODEL_NS,
        [{ op: 'set', path: ['providers', MODEL_ROUTE], value: profile }], revision)
      if (response && response.ok === false) {
        if (response.error?.code === 'settings/conflict') return { ok: false, conflict: true }
        throw new Error(response.error?.message || 'settings write refused')
      }
      return { ok: true }
    }

    /** 登录后自动同步一次免费模型(写 provider,失败静默,不打扰用户)。 */
    async function autoSyncModels() {
      try {
        if (!runtimeCtx || !runtimeCtx.remote || !runtimeCtx.remote.settings) return
        var fresh = await api('status')
        if (!fresh || !fresh.accessKey) return
        var models = await api('gateway-models', { accessKey: fresh.accessKey })
        var list = Array.isArray(models) ? models : (models.models || models.list || [])
        await addProviderToModels(runtimeCtx, fresh.baseURL || fresh.portalUrl, { accessKey: fresh.accessKey, list: list, protocol: models.protocol, key: fresh.accessKey })
        tbStore.set({ notify: { kind: 'success', title: pageT('modelLinked').replace('{n}', String(list.length)), detail: '' } })
      } catch (e) {
        console.warn('[dsh-tokenbank] auto sync models failed:', String(e && e.message || e))
      }
    }

    /** 退出登录:从模型列表移除 TokenBank provider(尽力而为,失败不阻塞登出)。 */
    async function removeProviderFromModels(ctx) {
      try {
        const describe = await ctx.remote.settings.describe()
        const view = describe?.namespaces?.[MODEL_NS] ?? null
        const revision = view && typeof view.revision === 'number' ? view.revision : undefined
        const response = await ctx.remote.settings.mutate(MODEL_NS,
          [{ op: 'unset', path: ['providers', MODEL_ROUTE] }], revision)
        if (response && response.ok === false) {
          // 目标不存在(settings/target-missing 之类)视为已删除
          console.warn('[dsh-tokenbank] remove provider:', response.error?.code || response.error?.message)
        }
      } catch (e) {
        console.warn('[dsh-tokenbank] remove provider failed:', String(e && e.message || e))
      }
    }

    /* ── auth forms ─────────────────────────────────────────────────────── */

    function AuthCard(props) {
      var mode = props.mode
      var setMode = props.setMode
      var onAuthed = props.onAuthed
      var t = pageT

      var email = React.useState('')
      var password = React.useState('')
      var displayName = React.useState('')
      var code = React.useState('')
      var captchaId = React.useState('')
      var captchaImg = React.useState('')
      var captchaCode = React.useState('')
      var savePassword = React.useState(true)
      var busy = React.useState(false)
      var error = React.useState('')
      var sent = React.useState(false)

      var refreshCaptcha = React.useCallback(function () {
        api('captcha').then(function (data) {
          captchaId[1](data.captchaId || '')
          captchaImg[1](data.image || '')
          captchaCode[1]('')
        }).catch(function (err) { error[1](String(err.message || err)) })
      }, [])

      React.useEffect(function () {
        if (mode === 'login') refreshCaptcha()
        sent[1](false)
      }, [mode, refreshCaptcha])

      var submit = React.useCallback(async function () {
        busy[1](true); error[1]('')
        try {
          if (mode === 'register') {
            await api('register', {
              email: email[0], code: code[0], password: password[0],
              displayName: displayName[0], savePassword: savePassword[0],
            })
          } else {
            await api('login', {
              email: email[0], password: password[0],
              captchaId: captchaId[0], captchaCode: captchaCode[0],
              savePassword: savePassword[0],
            })
          }
          await onAuthed()
        } catch (err) {
          var msg = String(err.message || err)
          if (mode === 'register' && /validation/i.test(msg)) msg = t('codeInvalid')
          error[1](msg)
          if (mode === 'login') refreshCaptcha()
        } finally {
          busy[1](false)
        }
      }, [mode, email, password, displayName, code, captchaId, captchaCode, savePassword, onAuthed, refreshCaptcha])

      return h('div', { style: cardStyle },
        h('div', {
          style: {
            display: 'flex', width: '100%', padding: 3, borderRadius: 999, gap: 2,
            background: '#eeeeef',
          },
        },
          h('button', {
            type: 'button',
            style: {
              flex: 1, height: 28, borderRadius: 999, fontSize: 13, cursor: 'pointer',
              border: 'none',
              background: mode === 'register' ? '#ffffff' : 'transparent',
              color: mode === 'register' ? '#1a1a1a' : '#7a7a7a',
              fontWeight: mode === 'register' ? 700 : 400,
              boxShadow: mode === 'register' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            },
            onClick: function () { setMode('register') },
          }, t('registerTab')),
          h('button', {
            type: 'button',
            style: {
              flex: 1, height: 28, borderRadius: 999, fontSize: 13, cursor: 'pointer',
              border: 'none',
              background: mode === 'login' ? '#ffffff' : 'transparent',
              color: mode === 'login' ? '#1a1a1a' : '#7a7a7a',
              fontWeight: mode === 'login' ? 700 : 400,
              boxShadow: mode === 'login' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            },
            onClick: function () { setMode('login') },
          }, t('loginTab')),
        ),
        h(Field, { label: t('email') },
          h('input', { style: inputStyle, type: 'email', value: email[0], onChange: function (e) { email[1](e.target.value) } })),
        h(Field, { label: t('password') },
          h('input', { style: inputStyle, type: 'password', value: password[0], onChange: function (e) { password[1](e.target.value) } })),
        mode === 'register'
          ? h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end' } },
              h('div', { style: { flex: 1 } },
                h(Field, { label: t('code') },
                  h('input', { style: inputStyle, value: code[0], onChange: function (e) { code[1](e.target.value) } }))),
              h('button', {
                type: 'button', style: buttonStyle, disabled: busy[0] || sent[0],
                onClick: async function () {
                  busy[1](true); error[1]('')
                  try {
                    await api('send-code', { email: email[0] })
                    sent[1](true)
                    var mailUrl = mailHomeUrl(email[0])
                    if (mailUrl) api('open-external', { url: mailUrl }).catch(function () {})
                  } catch (err) { error[1](String(err.message || err)) }
                  busy[1](false)
                },
              }, sent[0] ? t('codeSent') : t('sendCode')),
            )
          : h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end' } },
              h('div', { style: { flex: 1 } },
                h(Field, { label: t('captchaCode') },
                  h('input', { style: inputStyle, value: captchaCode[0], onChange: function (e) { captchaCode[1](e.target.value) } }))),
              captchaImg[0]
                ? h('img', {
                    src: captchaImg[0], alt: t('captcha'), title: t('captchaRefresh'),
                    onClick: refreshCaptcha,
                    style: { height: 30, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l1)' },
                  })
                : null,
            ),
        error[0] ? h('div', { style: errorStyle }, error[0]) : null,
        h('button', {
          type: 'button', style: primaryButtonStyle, disabled: busy[0],
          onClick: submit,
        }, busy[0] ? '…' : (mode === 'register' ? t('register') : t('login'))),
      )
    }

    /* ── logged-in cards ────────────────────────────────────────────────── */

    /** 侧栏主视图:完整门户网页内嵌(dsh-skillpie 模式),工具栏带刷新与外链。 */
    function EmbeddedPortal() {
      var loadedState = React.useState(false)
      var loaded = loadedState[0], setLoaded = loadedState[1]
      var tickState = React.useState(0)
      var tick = tickState[0], setTick = tickState[1]
      var portal = tbStore.state.portalUrl || 'https://bank.skillpie.cn'
      var reload = React.useCallback(function () {
        setLoaded(false)
        setTick(function (v) { return v + 1 })
      }, [])
      return h('div', {
        style: {
          height: '100%', minHeight: 0, boxSizing: 'border-box',
          background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
          display: 'flex', flexDirection: 'column',
        },
      },
        h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            borderBottom: '1px solid var(--dsw-alias-border-l1)',
          },
        },
          h(CoinIcon, { size: 16 }),
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, pageT('title')),
          h('span', { style: { flex: 1 } }),
          h('button', {
            type: 'button', onClick: reload, title: pageT('reload'), 'aria-label': pageT('reload'),
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px',
              borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', cursor: 'pointer',
              background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12,
            },
          }, pageT('reload')),
          h('a', {
            href: portal, target: '_blank', rel: 'noopener noreferrer',
            style: {
              display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px',
              borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
              fontSize: 12, textDecoration: 'none',
            },
          }, pageT('openPortal')),
        ),
        h('div', { style: { position: 'relative', flex: 1, minHeight: 0, background: '#ffffff' } },
          !loaded ? h('div', {
            style: {
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--dsw-alias-label-secondary)', fontSize: 13, background: 'var(--dsw-alias-bg-base)',
            },
          }, pageT('loading')) : null,
          h('iframe', {
            key: tick,
            src: portal,
            title: pageT('title'),
            onLoad: function () { setLoaded(true) },
            style: {
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              border: 'none', display: loaded ? 'block' : 'none',
            },
            allow: 'clipboard-write',
          }),
        ),
      )
    }

    /* ── module ─────────────────────────────────────────────────────────── */

    return {
      name: 'dsh-tokenbank',
      // 'remote' 是宿主服务名(remote.settings/remote.credentials 挂在它下面);
      // 只写子路径会报 cannot get property "remote" without inject
      inject: ['slots', 'locale', 'remote', 'remote.settings', 'remote.credentials'],
      apply: function (ctx) {
      // Frizon 子集字体(@font-face);颜色用 currentColor,暗色模式自动反白
      if (typeof document !== 'undefined' && document.head) {
        var wmCss = document.createElement('style')
        wmCss.textContent = "@font-face{font-family:'FrizonLocal';src:url(data:font/woff;base64," + FRIZON_WOFF + ") format('woff')}body[data-ds-dark-theme] .tb-wordmark{color:#ffffff!important}"
        document.head.appendChild(wmCss)
        // 余额 pill 登录闪烁 5s 提示可点击
        var flashCss = document.createElement('style')
        flashCss.textContent = '.tb-balance-flash{color:#ff7a3d!important;box-shadow:inset 0 0 0 1px #ff7a3d}#tb-balance-pill{border-radius:var(--dsw-radius-sm, 8px)}#tb-balance-pill:hover,#tb-balance-pill.tb-balance-open{background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.08))!important;color:var(--dsw-alias-label-secondary, #888)!important}'
        document.head.appendChild(flashCss)
        ctx.effect(function () {
          return function () { if (flashCss.parentNode) flashCss.parentNode.removeChild(flashCss) }
        }, 'dsh-tokenbank: balance flash style')
        // 入口按钮 hover 形态:灰底 + 箭头反转(与模型选择器 hover 一致)
        var entryCss = document.createElement('style')
        entryCss.textContent = '@keyframes tb-balance-gain{0%{opacity:0;transform:translateY(4px)}25%{opacity:1;transform:translateY(0)}75%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}' + '#tb-entry-btn:not(:has(.tb-free-tag)):hover{background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))!important;margin:1px 0;height:27px!important}.tb-entry-open .tb-entry-chevron{transition:transform .15s ease;transform:rotate(180deg)}'
        document.head.appendChild(entryCss)
        ctx.effect(function () {
          return function () { if (entryCss.parentNode) entryCss.parentNode.removeChild(entryCss) }
        }, 'dsh-tokenbank: entry hover style')

      }
      ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, 'dsh-tokenbank: dictionaries')

        pageT = (ctx.locale && typeof ctx.locale.bind === 'function')
          ? ctx.locale.bind(NS)
          : function (key) { return (zh[key] != null ? zh[key] : (en[key] != null ? en[key] : key)) }

        /* ── 模块②③④:选择器入口 + 弹层 + 设置页托管/状态 ── */
        runtimeCtx = ctx

        // 输入框工具行、模型选择器左侧的紧凑入口按钮(弹账户/注册窗)
        ctx.slots.inject('conversation.composer.dock', function () {
          return ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'dsh-tokenbank-balance',
            order: 5,
          }, BalancePill)
        })
        ctx.slots.inject('conversation.input.right', function () {
          return ctx.slots.register({
            name: 'conversation.input.right',
            id: 'dsh-tokenbank-entry',
            order: 0,
            locale: NS,
          }, ComposerEntry)
        })

        // 同一个槽只 inject 一次:多次 inject 会互相覆盖(之前 auth 注册被
        // lowbalance 顶掉,菜单点击后弹窗不渲染)。三个 overlay 一次注册齐。
        ctx.slots.inject('shell.overlay', function () {
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-tokenbank-notify',
            locale: NS,
            inject: function () { return {} },
          }, NotifyOverlay)
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-tokenbank-auth',
            locale: NS,
          }, EntryOverlay)
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-tokenbank-lowbalance',
            locale: NS,
          }, LowBalanceOverlay)
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-tokenbank-deposit',
            locale: NS,
          }, DepositOverlay)
        })

        ctx.slots.inject('settings.models.provider-card', function () {
          return ctx.slots.register({
            name: 'settings.models.provider-card',
            key: MODEL_NS,
            locale: NS,
          }, DepositSlot)
        })

        ctx.slots.inject('settings.models.footer', function () {
          ctx.slots.register({
            name: 'settings.models.footer',
            id: 'dsh-tokenbank-hint',
            order: 89,
            locale: NS,
          }, DepositHint)
        })
      },
    }
  },
})
