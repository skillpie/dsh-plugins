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
      promoTag: '分享拿偷啃',
      promoTitle: '分享赚TOKEN',
      promoRule1: '1. 每个账号都有专属推广链接，好友通过链接注册即成功推广',
      promoRule2: '2. 每成功推广 1 位新用户，奖励 $2 直接入账户余额，上不封顶',
      promoRule3: '3. 推广奖励可用于对话消耗抵扣，与余额同规则使用',
      promoLinkLabel: '专属推广链接',
      promoCopy: '复制文案',
      promoCopied: '已复制',
      promoCopyFailed: '复制失败，请手动复制',
      promoLoginHint: '登录 TokenBank 后即可获取你的专属推广链接',
      promoGoLogin: '去登录',
      promoViewRecords: '查看推广记录',
      promoStatReferrals: '累计推广用户',
      promoStatReward: '累计推广奖励',
      promoShareText: '全网疯传的TokenBank，免费TOKEN量大够饱！闲置TOKEN也能托管给AI变现～ 领取免费TOKEN 👉 {link}',
      addFreeModels: '获取免费模型',
      getModels: '获取模型',
      freeModelsTip: '免费使用主流收费模型，点击后自动获取，模型列表 TokenBank 中的模型任意使用。',
      modelLinked: '已接入 {n} 个模型,点输入框上方的模型选择器即可切换使用',
      modelListUpdated: '模型列表已更新:当前 {n} 个可用模型',
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
      rechargePay: '立即获得TOKEN',
      rechargeDone: '充值成功,余额已到账',
      gainSuffix: '签到奖励',
      rechargePending: '尚未检测到支付结果,如已完成支付请稍后重试或刷新',
      orderTooManyPending: '待支付订单过多，请先完成支付或等订单过期后再试',
      orderCreateTooFrequent: '下单太频繁，请稍等一分钟再试',
      rechargeWaiting: '等待支付中…',
      rechargeOpenPay: '打开支付页',
      rechargeCancel: '取消',
      composerEntry: 'TokenBank 账户',
      officialSite: 'TokenBank 官网',
      loading: '正在连接 TokenBank…',
      balance: '余额',
      totalEarned: '累计收益',
      totalSpent: '累计消费',
      pendingUnlock: '注册奖励 {amount} 待解锁：充值任意金额，或托管的 Key 首次调用成功后自动到账',
      depositCount: '托管密钥',
      loginTab: '登录',
      registerTab: '注册',
      email: '邮箱',
      password: '密码',
      displayName: '昵称（可选）',
      code: '邮箱验证码',
      sendCode: '发送验证码',
      codeInvalid: '验证码无效或已过期,请重新发送',
      plusTagBlocked: '暂不支持带 + 别名的邮箱，请使用不含 + 的邮箱注册',
      baseEmailTaken: '该邮箱（含 + 别名变体）已注册，请直接登录',
      registerRateLimited: '当前网络注册过于频繁，请更换网络或稍后再试',
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
      depositIntro: '把你的 API Key 凭证托管到 TokenBank，临时额度自动转移为永久额度保留使用。',
      depositIntro1: '1. 周重置快到期但还没用完太浪费了，不如托管到平台换取永久余额（类似银行存款业务）',
      depositIntro2: '2. 余额充足时优先调用托管到平台的 API Key，加速平台Token池与余额的周转率（类似银行取款业务）',
      depositIntro3: '3. 转换为余额后，更换 TokenBank 自动提供的模型列表使用',
      depositIntro4: '4. TokenBank 余额不足时会取出自己的 API Key 继续使用',
      depositIntro5: '5. TokenBank 会自动路由，解决用量不足需要频繁切换模型的问题',
      depositGroup: '托管分组',
      depositRejected: 'Key 探活失败：无效凭证，或所属厂商不接受托管',
      depositEmpty: '还没有托管任何 Key',
      depositRemove: '撤销',
      depositStatBalance: '账户余额',
      depositStatEarned: '托管收益',
      depositStatKeys: '托管凭证',
      depositStatEarnedHint: '托管的 Key 被消耗，按 消耗金额×(1+托管利率) 返还到账户余额（含利息）',
      depositStatEarnedHintRate: '托管的 Key 被消耗，按 消耗金额×{rate} 返还到账户余额（含利息）',
      depositStatKeysHint: '个人托管数 / 平台托管总数',
      depositSubmitNow: '立即托管',
      recharge: '充值',
      rechargeAmount: '充值套餐',
      rechargeCreate: '下单并去支付宝付款',
      rechargeWaiting: '支付宝支付中…',
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
      quotaExhaustedTip: '{period}额度已用尽，将于 {time} 自动恢复，任意充值成为会员可享5倍额度上限',
      quotaAlertLabel: '额度已用尽',
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
      groupRequired: '请先选择托管分组（分组列表加载失败时请重试）',
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
      trade: '交易',
      buy: '买入',
      tradingTitle: '交易 · 百万词元（MT）',
      tradingIntro: '按美元金额买入、按当前价折算获得词元（MT）；卖出按 MT 数量、以最新快照市价折回美元。',
      priceNow: '当前价格',
      perMillion: 'MT/$',
      nowPrice: '当前价',
      sellLabel: '卖出数量（MT）',
      sellAmountHint: '当前持仓 {max} MT；按卖出时市价折回美元',
      sellPlaceholder: '如 1000',
      colFee: '手续费',
      marketPriceBreakdown: '当前价',
      vsOpen: '较均价',
      todayOpen: '4小时前',
      todayHigh: '4小时高',
      todayLow: '4小时低',
      position: '当前持仓',
      pnl: '盈亏',
      avgBuyPrice: '买入均价',
      totalBought: '累计买入',
      totalSold: '累计卖出',
      realizedPnl: '累计盈亏',
      sell: '卖出',
      tradeRecords: '交易记录',
      marketTitle: '实时行情',
      priceFormula: '价格公示：当前价 ≈ MT/$（1 美元能换到的百万词元数），数值越大 = 词元越便宜；走势图纵轴上小下大，红涨绿跌按词元价值方向。当前价按近一天全部计价请求的加权均价计算（半衰期 24 小时，越近的用量权重越高，单账户样本占比不超过 5%）；Token成本 = 计价请求费用 ÷ Token 总量，每分钟刷新行情，只随新用量变化。',
      k5min: '5 分钟蜡烛',
      ma30m: '30 分钟线',
      ma1h: '小时线',
      ma4h: '4小时线',
      buyAmount: '买入金额（$，按当前价折算词元）',
      sellAmount: '卖出数量（MT）',
      quickMax: '最大',
      maxBuyLots: '本次最多可买入 {n}（余额与单笔上限取小）',
      maxSellLots: '最多可卖 {n} MT',
      sellEstimate: '毛额 {g} · 手续费 {f} · 预计到账 {n}',
      lotLabel: '买入金额（$）',
      avgLine: '均价',
      buyPriceLine: '买入',
      totalAmount: '支付金额',
      gainTokens: '获得词元',
      lotInvalid: '请输入有效的买入金额。',
      buyCap: '超过可买上限 {max}。',
      buyMin: '单笔买入不低于 {min}。',
      quickAll: '全部',
      sellMin: '单笔卖出不低于 0.001 MT。',
      sellMax: '当前最多可卖 {max} MT。',
      buySubmit: '市价买入',
      sellSubmit: '市价卖出',
      buyDone: '买入成功',
      sellDone: '卖出成功',
      buyFail: '买入失败',
      sellFail: '卖出失败',
      sellNoSnapshot: '暂无价格快照，暂不能卖出。',
      sellBandBelow: '当前市价 {quote} MT/$ 已低于卖出价格带 {band}，卖出暂停中，请联系管理员调整。',
      sellBandAbove: '当前市价 {quote} MT/$ 已高于卖出价格带 {band}，卖出暂停中，请联系管理员调整。',
      platformPremiumBreaker: '平台当日卖出溢价额度已达上限，卖出已暂停，请稍后再试。',
      proceedsTooSmall: '卖出金额过小，折算后净额为零。',
      insufficientUsd: '账户余额不足。',
      tradingDisabledDetail: '平台暂未启用百万词元交易，开放后可在此买入与卖出。',
      colTime: '时间',
      colType: '类型',
      colAmount: '交易词元',
      colUsd: '交易金额',
      colPrice: '单价（MT/$）',
      colPnl: '盈亏',
      typeBuy: '买入',
      typeSell: '卖出',
      prevPage: '上一页',
      nextPage: '下一页',
      tradingClosed: '交易未开放',
      tradingCalibrating: '行情校准中，暂不可交易',
      loadFail: '行情加载失败，点此重试',
      balanceRemainder: '持仓不足最低卖出数量，无法卖出',
      editNicknameTitle: '点击修改昵称，回车保存',
      nicknameSaved: '昵称已更新',
    }
    var en = {
      title: 'TokenBank',
      openPortal: 'Open full portal',
      openSite: 'Open website',
      promoTag: 'Share TOKEN',
      promoTitle: 'Share & Earn TOKEN',
      promoRule1: '1. Every account gets a referral link — a friend signing up through it counts as your referral',
      promoRule2: '2. Earn $2 per new user, credited straight to your balance, no cap',
      promoRule3: '3. Referral rewards work like regular balance for AI usage',
      promoLinkLabel: 'Your referral link',
      promoCopy: 'Copy message',
      promoCopied: 'Copied',
      promoCopyFailed: 'Copy failed — please copy manually',
      promoLoginHint: 'Sign in to TokenBank to get your referral link',
      promoGoLogin: 'Sign in',
      promoViewRecords: 'View referral records',
      promoStatReferrals: 'Total referrals',
      promoStatReward: 'Total rewards',
      promoShareText: 'TokenBank is going viral — tons of free TOKEN! Idle TOKEN can even be hosted to earn from AI 👉 {link}',
      addFreeModels: 'Get free models',
      getModels: 'Get models',
      freeModelsTip: 'Use paid-tier models for free — one click links them, and every TokenBank model in the list is available.',
      rechargeTip: 'Best price anywhere: $1 for ¥6.50 — 10%~25% cheaper than official APIs and relays. Pay with Alipay, credited instantly, credit never expires.',
      modelLinked: '{n} models linked — open the model picker above the input to switch to them',
      modelListUpdated: 'Model list updated — {n} models available now',
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
      orderTooManyPending: 'Too many unpaid orders — complete or wait for them to expire before starting another',
      orderCreateTooFrequent: 'Orders are being created too frequently — wait a minute and try again',
      rechargeWaiting: 'Waiting for payment…',
      rechargeOpenPay: 'Open payment page',
      rechargeCancel: 'Cancel',
      composerEntry: 'TokenBank account',
      officialSite: 'TokenBank website',
      loading: 'Connecting to TokenBank…',
      balance: 'Balance',
      totalEarned: 'Total earned',
      totalSpent: 'Total spent',
      pendingUnlock: '{amount} signup bonus locked — unlocks after any recharge, or once a deposited key completes its first successful call',
      depositCount: 'Deposited keys',
      loginTab: 'Sign in',
      registerTab: 'Register',
      email: 'Email',
      password: 'Password',
      displayName: 'Display name (optional)',
      code: 'Email code',
      sendCode: 'Send code',
      codeInvalid: 'Code invalid or expired — please resend',
      plusTagBlocked: 'Plus-addressing (+ aliases) is not supported — use an email without "+"',
      baseEmailTaken: 'This email (including + alias variants) is already registered — please sign in',
      registerRateLimited: 'Too many signups from this network — try a different network or later',
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
      depositRejected: 'Key failed the live probe: invalid credential, or its provider does not accept deposits',
      depositKeys: 'Keys (one per line)',
      depositSubmit: 'Deposit',
      depositTitle: 'Deposit Credential',
      depositIntro: 'Deposit your API key to TokenBank — remaining temporary quota converts to permanent credit.',
      depositIntro1: '1. Weekly-reset quota about to expire and still unused? Escrow it to the platform for permanent balance (like a bank deposit)',
      depositIntro2: '2. When balance is sufficient, escrowed API keys are called first, speeding up the platform token-pool and balance turnover (like a bank withdrawal)',
      depositIntro3: '3. Once converted to balance, switch among the model list TokenBank provides automatically',
      depositIntro4: '4. If your TokenBank balance runs out, your own key is withdrawn so you can keep going',
      depositIntro5: '5. TokenBank routes automatically — no more frequent model switching due to quota limits',
      depositGroup: 'Group',
      depositRejected: 'Key failed the live probe: invalid credential, or its provider does not accept deposits',
      depositEmpty: 'No deposited keys yet',
      depositRemove: 'Remove',
      depositStatBalance: 'Account balance',
      depositStatEarned: 'Escrow earnings',
      depositStatKeys: 'Hosted keys',
      depositStatEarnedHint: 'When your escrowed keys are consumed: amount×(1+escrow rate) is credited to your balance (interest included)',
      depositStatEarnedHintRate: 'When your escrowed keys are consumed: amount×{rate} is credited to your balance (interest included)',
      depositStatKeysHint: 'Yours / platform total',
      depositSubmitNow: 'Deposit now',
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
      quotaExhaustedTip: '{period} quota exhausted, resets at {time}; any recharge upgrades you to a member with 5x quota',
      quotaAlertLabel: 'Quota exhausted',
      dismiss: 'Got it',
      settingsDeposit: 'One-click deposit',
      depositToTokenbank: 'Deposit to TokenBank',
      depositCancel: 'Cancel deposit',
      depositCancelled: 'Deposit cancelled',
      depositPlaceholder: 'Paste the API key to deposit',
      depositDone: 'Deposited',
      keyRequired: 'Paste at least one key first',
      groupRequired: 'Pick a deposit group first (retry if the group list failed to load)',
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
      trade: 'Trade',
      buy: 'Buy',
      tradingTitle: 'Trade · Million-token (MT)',
      tradingIntro: 'Buy with a USD amount credited as tokens (MT) at the current price; sell any MT amount back to USD at the latest snapshot price.',
      priceNow: 'Current price',
      perMillion: 'MT / $',
      nowPrice: 'Current price',
      sellLabel: 'Amount to sell (MT)',
      sellAmountHint: 'Holdings {max} MT; converts to USD at the sell-time price',
      sellPlaceholder: 'e.g. 1000',
      colFee: 'Fee',
      marketPriceBreakdown: 'Current price',
      vsOpen: 'vs. avg',
      todayOpen: '4h ago',
      todayHigh: '4h high',
      todayLow: '4h low',
      position: 'Position',
      pnl: 'P&L',
      avgBuyPrice: 'Avg buy price',
      totalBought: 'Total bought',
      totalSold: 'Total sold',
      realizedPnl: 'Realized P&L',
      sell: 'Sell',
      tradeRecords: 'Records',
      marketTitle: 'Live market',
      priceFormula: 'Price board: current ≈ MT / $ (million tokens per US dollar); higher = tokens cheaper; the chart y-axis runs small-on-top so red still means tokens gaining value. Current derives from the exponentially weighted average token cost of the last day (24-hour half-life, newer usage weighs more, any single account capped at 5% of the sample); token cost = priced request fees ÷ total tokens. Refreshes every minute, moves only with new usage.',
      k5min: '5-min candles',
      ma30m: '30-min MA',
      ma1h: '1-h MA',
      ma4h: '4-h MA',
      buyAmount: 'Amount to buy ($, converted at the current price)',
      sellLots: 'Sell MT amount',
      quickMax: 'Max',
      maxBuyLots: 'Up to {n} per order (balance and per-order cap, whichever is lower)',
      maxSellLots: 'Up to {n} MT',
      sellEstimate: 'Gross {g} · fee {f} · net ≈ {n}',
      lotLabel: 'Amount to buy ($)',
      avgLine: 'Avg',
      buyPriceLine: 'Avg buy',
      totalAmount: 'Amount to pay',
      gainTokens: 'You get',
      lotInvalid: 'Enter a valid buy amount.',
      buyCap: 'Exceeds the {max} buy limit.',
      buyMin: 'Each buy must be at least {min}.',
      quickAll: 'All',
      sellMin: 'Each sell must be at least 0.001 MT.',
      sellMax: 'You can sell up to {max} MT.',
      buySubmit: 'Market buy',
      sellSubmit: 'Market sell',
      buyDone: 'Buy order filled',
      sellDone: 'Sell order filled',
      buyFail: 'Buy failed',
      sellFail: 'Sell failed',
      sellNoSnapshot: 'No price snapshot yet; selling is unavailable.',
      sellBandBelow: 'The market price ({quote} MT / $) is below the sell price band ({band}); selling is paused until the band is adjusted.',
      sellBandAbove: 'The market price ({quote} MT / $) is above the sell price band ({band}); selling is paused until the band is adjusted.',
      platformPremiumBreaker: 'The platform daily sell premium budget is exhausted; selling is paused, please retry later.',
      proceedsTooSmall: 'The amount is too small: net proceeds round to zero.',
      insufficientUsd: 'Insufficient balance.',
      tradingDisabledDetail: 'Million-token trading is not enabled yet. You can trade here once it opens.',
      colTime: 'Time',
      colType: 'Type',
      colAmount: 'Traded tokens',
      colUsd: 'Trade amount',
      colPrice: 'Price (MT / $)',
      colPnl: 'PnL',
      typeBuy: 'Buy',
      typeSell: 'Sell',
      prevPage: 'Prev',
      nextPage: 'Next',
      tradingClosed: 'Trading unavailable',
      tradingCalibrating: 'Calibrating — trading paused',
      loadFail: 'Failed to load market data — click to retry',
      balanceRemainder: 'Position is below the minimum sellable amount',
      editNicknameTitle: 'Click to edit nickname, Enter to save',
      nicknameSaved: 'Nickname updated',
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

    /** TokenBank 品牌图标:照官方 favicon.svg(web/public/favicon.svg)重绘;入口用大圆角实底(app 图标风)。 */
    function TokenBankLogo(props) {
      var size = props && props.size ? props.size : 16
      var round = props && props.round
      return h('svg', {
        viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': true,
        style: Object.assign({ display: 'block', flex: 'none' }, (props && props.style) || {}),
      },
        h('rect', { width: 64, height: 64, rx: round ? 21 : 16, fill: '#ff4f1f' }),
        h('g', { fill: '#f5f5f2', transform: round ? 'translate(0,-3.5)' : undefined },
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
      state: { authOpen: false, authMode: 'register', lowBalanceSeq: 0 , notify: null, loggedIn: null, tradingOpen: false, tradeView: null, promoOpen: false, quotaAlert: null, portalNotif: null},
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

    /** 输入框工具行、模型选择器左侧的紧凑入口按钮(登录态:LOGO+余额;未登录:FREE 标签)。 */
    function ComposerEntry() {
      var snap = useTbStore()
      var st = React.useState(null)
      // 拉取配额状态写进全局 store(常驻挂载点;SidebarCard 未挂载不能放那边)
      var refreshQuotaAlert = React.useCallback(function () {
        api('key-quotas').then(function (res) {
          var quotas = (res && res.quotas) || []
          var hit = null
          for (var i = 0; i < quotas.length; i++) {
            if (quotas[i] && quotas[i].status === 'exhausted') { hit = quotas[i]; break }
          }
          tbStore.set({ quotaAlert: hit })
        }).catch(function () {})
        api('notifications').then(function (res) {
          tbStore.set({ portalNotif: (res && res.notification) || null })
        }).catch(function () {})
      }, [])
      React.useEffect(function () {
        if (snap.loggedIn === false) return
        refreshQuotaAlert()
        var timer = window.setInterval(refreshQuotaAlert, 60000)
        return function () { window.clearInterval(timer) }
      }, [snap.loggedIn, refreshQuotaAlert])
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (stopped) return
          st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
        }).catch(function () {})
        return function () { stopped = true }
      }, [])
      // 登录态变化(弹窗登录/退出)时刷新余额展示
      React.useEffect(function () {
        var stopped = false
        if (!snap.loggedIn) return
        api('status').then(function (data) {
          if (!stopped) st[1](data)
        }).catch(function () {})
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
          authOpen: true, authMode: snap.loggedIn ? 'login' : 'register',
          anchor: rect ? { right: rect.right, top: rect.top } : null,
        })
      }
      var data = st[0]
      var loggedIn = snap.loggedIn
      var bal = data && data.account && typeof data.account.balance_nano_usd === 'number'
        ? '$' + (data.account.balance_nano_usd / 1e9).toFixed(2) : null
      // 限流告警:hover 区域为整个入口按钮(图标+余额);hover 过即「已读」,
      // 本次告警窗口内不再呼吸(sessionStorage 按 window_ends_at_ms 记忆)
      var qSeen = React.useState(function () {
        try { return window.sessionStorage.getItem('tb-quota-alert-seen') || '' } catch (e) { return '' }
      })
      var notif = snap.portalNotif || null
      var alertKey = notif
        ? String(notif.id)
        : (snap.quotaAlert ? String(snap.quotaAlert.window_ends_at_ms || '') : '')
      // 站内信改为点击交互:有未读站内信时点击弹气泡(再点关闭并置已读),
      // 没有站内信时点击打开原账户弹窗;不再使用 hover 展示
      var nOpen = React.useState(false)
      var handleClick = function (e) {
        if (!notif) {
          // 透传事件:账户弹窗定位依赖 e.currentTarget 的按钮矩形(右对齐锚点)
          onClick(e)
          return
        }
        if (!nOpen[0]) {
          nOpen[1](true)
          return
        }
        var nid = notif.id
        try { window.sessionStorage.setItem('tb-quota-alert-seen', alertKey) } catch (e) {}
        qSeen[1](alertKey)
        tbStore.set({ portalNotif: null })
        nOpen[1](false)
        api('notification-read', { id: nid }).catch(function () {})
      }
      return h('button', {
        type: 'button',
        id: 'tb-entry-btn',
        className: (flash[0] ? 'tb-balance-flash ' : '') + (snap.authOpen ? 'tb-entry-open' : ''),
        title: pageT('composerEntry'), 'aria-label': pageT('composerEntry'),
        onClick: handleClick,
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          height: 29, padding: '0 8px', borderRadius: 7, boxSizing: 'border-box',
          border: 'none', background: 'transparent',
          cursor: 'pointer', position: 'relative',
          marginRight: -6, // standardControls 容器 gap 12px,减半为 6px
          color: 'var(--dsw-alias-label-tertiary, #a0a3a8)', font: 'inherit',
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 13,
        },
      },
        loggedIn
          ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
              (snap.quotaAlert || notif)
                ? h(QuotaAlertBadge, { notif: notif, size: 16, open: nOpen[0], breathe: alertKey && qSeen[0] !== alertKey })
                : h(TokenBankLogo, { size: 16, round: true }),
              bal ? h('span', { className: 'tb-entry-bal' }, bal) : null)
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
    /** 首充赠 TOKEN 文案(每档位一次性,与后端 firstRechargeBonusTokens 对齐;¥10 无首充赠)。 */
    var FIRST_BONUS_LABELS = { 5000: '首充赠4,000万TOKEN', 10000: '首充赠1亿TOKEN', 30000: '首充赠4亿TOKEN' }
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
      // 首充营销行:三档统一常驻展示;接口返回该档位 bonus 为 0(已首充)时整行
      // 加删除线(置灰),并把已领状态写入 localStorage,下次打开即时划线不闪现。
      var FIRST_BONUS_CLAIMED_KEY = 'dsh-tokenbank/first-bonus-claimed'
      function firstBonusClaimedFens() {
        try {
          var parsed = JSON.parse(localStorage.getItem(FIRST_BONUS_CLAIMED_KEY) || '[]')
          return Array.isArray(parsed) ? parsed : []
        } catch (e9) { return [] }
      }
      function markFirstBonusClaimed(fen) {
        var fens = firstBonusClaimedFens()
        if (fens.indexOf(fen) === -1) {
          fens.push(fen)
          try { localStorage.setItem(FIRST_BONUS_CLAIMED_KEY, JSON.stringify(fens)) } catch (e10) {}
        }
      }
      // 标签高光扫过质感:白色斜向高光从左到右周期性扫过(keyframes 需样式表,注入一次)
      function ensureTagSheenStyle() {
        if (typeof document === 'undefined' || document.getElementById('tb-tag-sheen-style')) return
        var el = document.createElement('style')
        el.id = 'tb-tag-sheen-style'
        el.textContent = [
          '@keyframes tbSheen{0%{transform:translateX(-130%) skewX(-20deg)}60%,100%{transform:translateX(240%) skewX(-20deg)}}',
          '.tb-sheen-tag{position:relative;overflow:hidden}',
          '.tb-sheen-tag::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);animation:tbSheen 2.2s ease-in-out infinite}',
        ].join('')
        document.head.appendChild(el)
      }
      // 该档位首充是否已领:缓存即时判定;接口加载后以后端 bonus=0 为准并回写缓存
      function isFirstBonusClaimed(fen) {
        var list = packs && packs[0] || []
        for (var i = 0; i < list.length; i++) {
          if (list[i].fen === fen) {
            if (!(list[i].bonusNano > 0)) {
              markFirstBonusClaimed(fen)
              return true
            }
            return false
          }
        }
        return firstBonusClaimedFens().indexOf(fen) !== -1
      }
      function bonusLine(fen) {
        var label = FIRST_BONUS_LABELS[fen]
        if (!label) return null
        var claimed = isFirstBonusClaimed(fen)
        ensureTagSheenStyle()
        var color = claimed ? 'var(--dsw-alias-label-tertiary, #b8bcc2)' : '#ff4f1f'
        // 「首充赠」黑色弱化,突出后面的赠送数量
        var leadIdx = label.indexOf('赠')
        var lead = leadIdx >= 0 ? label.slice(0, leadIdx + 1) : ''
        var rest = leadIdx >= 0 ? label.slice(leadIdx + 1) : label
        return h('div', {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                gap: 4, fontSize: 12, lineHeight: '16px',
              },
            },
              h('span', {
                className: claimed ? undefined : 'tb-sheen-tag',
                style: {
                  background: color, color: '#fff', borderRadius: 4,
                  padding: '1px 5px', fontSize: 11, fontWeight: 700, flexShrink: 0,
                  lineHeight: '16px',
                },
              }, claimed ? '已领取' : '限时特惠'),
              claimed
                ? h('span', { style: { color: color, fontWeight: 600, lineHeight: '16px' } }, label)
                : [
                    h('span', { key: 'lead', style: { color: 'var(--dsw-alias-label-primary, #1a1a1a)', fontWeight: 600, lineHeight: '16px' } }, lead),
                    h('span', { key: 'rest', style: { color: color, fontWeight: 600, lineHeight: '16px' } }, rest),
                  ],
            )
      }
      var loadPacks = function () {
        return Promise.all([api('recharge-config').catch(function () { return null }), api('wordcoin-market').catch(function () { return null })])
          .then(function (all) {
            var config = all[0] && all[0].config
            var market = all[1] && all[1].market
            var price = market && Number(market.price_nano_usd_per_wc) // nanoUSD / 词元
            var list = (config && Array.isArray(config.packages) ? config.packages : null)
            if (!list || !list.length || !price || price <= 0) return
            packs[1](list.map(function (pk) {
              return {
                fen: Number(pk.cny_fen),
                usd: Number(pk.credit_nano_usd || 0) / 1e9,
                tokens: (Number(pk.credit_nano_usd || 0) + Number(pk.bonus_nano_usd || 0)) / price,
                // 提示行口径=基础到账 credit(不含首充赠,与「获得 $15.38」文案一致)
                creditNano: Number(pk.credit_nano_usd || 0),
                bonusNano: Number(pk.bonus_nano_usd || 0),
                firstBonusTokens: Number(pk.first_bonus_tokens || 0),
              }
            }).filter(function (pk) { return pk.fen !== 50000 }))
          })
      }
      React.useEffect(function () {
        loadPacks().catch(function () {})
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
            await loadPacks() // 首充到账后刷新,隐藏对应档位营销行
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
          if (paid) {
            busy[1](false)
            await loadPacks() // 首充到账后刷新,隐藏对应档位营销行
            props.onPaid()
            return
          }
          err[1](pageT('rechargePending'))
        } catch (e2) {
          // 下单限频拒绝原因在 msg 尾部（服务端以 "(reason=xxx)" 形式附带，见 index.js:931），
          // 映射为友好文案，未识别回退服务端原文。
          var msg2 = String(e2.message || e2)
          if (/too_many_pending_orders/.test(msg2)) msg2 = pageT('orderTooManyPending')
          else if (/order_create_too_frequent/.test(msg2)) msg2 = pageT('orderCreateTooFrequent')
          err[1](msg2)
        }
        busy[1](false)
      }
      return h('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8, padding: 0 },
      },
        // 首充营销行:随选中档位单行展示,已领档位置灰
        bonusLine(picked[0]),
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
        }, busy[0] ? pageT('rechargeWaiting') : (function () {
          // 按钮文案带出可获得的词元总量:基础词元用 RECHARGE_HINTS 锚点(固定口径,与提示行/价格对比一致;
          // 接口折算的 pk.tokens 随行情价波动不可靠),叠加首充赠,如「立即获得3.8亿TOKEN」「立即获得16亿TOKEN」
          var base = RECHARGE_HINTS[picked[0]]
          if (base == null) {
            var list0 = packs && packs[0] || []
            for (var j = 0; j < list0.length; j++) {
              if (list0[j].fen === picked[0] && list0[j].tokens > 0) { base = list0[j].tokens; break }
            }
          }
          if (base != null) {
            var fb = 0
            var list = packs && packs[0] || []
            for (var i = 0; i < list.length; i++) {
              if (list[i].fen === picked[0]) {
                // bonusNano=0 表示该档首充已领(营销行置灰口径一致),不再叠加首充赠
                fb = list[i].bonusNano > 0 ? (Number(list[i].firstBonusTokens) || 0) : 0
                break
              }
            }
            return '立即获得' + humanTokens(base + fb) + 'TOKEN'
          }
          return pageT('rechargePay')
        })()),
        busy[0] ? h('button', {
          type: 'button', style: Object.assign({}, buttonStyle, { justifyContent: 'center' }),
          onClick: function () {
            busy[1](false); err[1]('')
            try { localStorage.removeItem('dsh-tokenbank/pending-order') } catch (e8) {}
          },
        }, pageT('rechargeCancel')) : null,
      )
    }

    /**
     * 可编辑昵称:点击文字变输入框,回车(或失焦)保存,Esc 取消。
     * 保存走 profile-update(门户 PUT /me),成功后弹轻提示。
     */
    function EditableNickname(props) {
      var value = React.useState(props.name || '')
      var editing = React.useState(false)
      var busy = React.useState(false)
      var inputRef = React.useRef(null)
      React.useEffect(function () {
        if (editing[0] && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
      }, [editing[0]])
      var cancel = function () { editing[1](false); value[1](props.name || '') }
      var commit = async function () {
        var next = value[0].trim()
        if (!next || next === (props.name || '')) { cancel(); return }
        busy[1](true)
        try {
          await api('profile-update', { displayName: next })
          busy[1](false); editing[1](false)
          tbStore.set({ notify: { kind: 'success', title: pageT('nicknameSaved'), detail: next } })
        } catch (e10) {
          busy[1](false)
          tbStore.set({ notify: { kind: 'error', title: String(e10.message || e10), detail: '' } })
        }
      }
      if (!editing[0]) {
        return h('span', {
          title: pageT('editNicknameTitle'),
          style: {
            fontSize: 13, fontWeight: 600, cursor: 'text', borderRadius: 4,
            borderBottom: '1px dashed var(--dsw-alias-border-l2, #c9ccd1)',
          },
          onClick: function (e) { e.stopPropagation(); value[1](props.name || ''); editing[1](true) },
        }, props.name || props.email || '')
      }
      return h('input', {
        ref: inputRef, value: value[0], maxLength: 64, disabled: busy[0],
        onClick: function (e) { e.stopPropagation() },
        onChange: function (e) { value[1](e.target.value) },
        onKeyDown: function (e) {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') cancel()
        },
        onBlur: function () { if (!busy[0]) commit() },
        style: {
          height: 22, width: 130, fontSize: 13, fontWeight: 600, padding: '0 6px',
          borderRadius: 5, boxSizing: 'border-box', outline: 'none',
          border: '1px solid #ff4f1f', background: 'var(--dsw-alias-bg-base)',
          color: 'var(--dsw-alias-label-primary)',
        },
      })
    }

    /** 侧栏底部长驻块:完整展示 logo/账号/余额/托管充值/获取免费模型,无卡片框。 */
    /** 周期秒数 → 展示标签:1800→30分钟/30-minute,18000→5小时/5-hour。语言随 ctx.locale(pageT)。 */
    function quotaPeriodLabel(seconds) {
      var s = Number(seconds) || 0
      var isEn = pageT('quotaAlertLabel') === 'Quota exhausted'
      if (s > 0 && s % 3600 === 0) {
        var hrs = s / 3600
        return isEn ? hrs + '-hour' : hrs + '小时'
      }
      var mins = Math.max(1, Math.round(s / 60))
      return isEn ? mins + '-minute' : mins + '分钟'
    }

    /** 站内信正文渲染:只放行 <a href="...">文本</a> 一种标签为可点击链接,
     * 其余内容全部按纯文本转义(React 默认转义),不拆行、保持一段文本。 */
    function renderNotificationBody(body) {
      var text = String(body || '')
      var pattern = /<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
      var children = []
      var last = 0
      var m
      var key = 0
      while ((m = pattern.exec(text)) !== null) {
        if (m.index > last) children.push(text.slice(last, m.index))
        children.push(h('a', {
          href: m[1],
          target: '_blank', rel: 'noreferrer noopener',
          style: { color: '#ff4f1f', textDecoration: 'none', fontWeight: 600 },
          onClick: function (event) { event.stopPropagation() },
        }, m[2]))
        last = m.index + m[0].length
        key++
      }
      if (last < text.length) children.push(text.slice(last))
      return children.length ? children : text
    }

    /** 余额旁配额告警:红色感叹号 + hover 气泡(周期额度用尽与恢复时间)。 */
    function QuotaAlertBadge(props) {
      var snap = useTbStore()
      var hover = React.useState(false)
      var alert = snap.quotaAlert
      var notif = props && props.notif
      if (!alert && !notif) return null
      // quotaAlert 与 portalNotif 互相独立:只有配额告警在场才组装兜底文案,
      // 防止 alert 为 null 时抛错把整个入口按钮炸掉
      var endsText = ''
      var tip = ''
      if (alert) {
        if (alert.window_ends_at_ms) {
          var d = new Date(Number(alert.window_ends_at_ms))
          endsText = ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + ' ' +
            ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)
        }
        tip = pageT('quotaExhaustedTip')
          .replace('{period}', quotaPeriodLabel(alert.period_seconds))
          .replace('{time}', endsText)
      }
      // 站内信正文:仅放行 <a href="...">文本</a> 渲染成可点击链接,其余原样转义
      var bubbleChildren = tip
      if (notif) {
        bubbleChildren = renderNotificationBody(notif.body)
      }
      var size = Number(props && props.size) || 14
      // 气泡显隐由外层点击状态(props.open)控制,不再跟随 hover
      var open = Boolean(props && props.open)
      return h('span', {
        style: {
          // 挂到整个入口按钮(button 已 position:relative),气泡 right:0 与按钮右缘对齐
          position: 'static',
          display: 'inline-flex', alignItems: 'center',
        },
      },
        // 复用品牌 Logo:限流时呼吸动画,hover 过(已读)或 hover 中归位,不再用感叹号圆点
        h(TokenBankLogo, {
          size: size,
          round: true,
          'aria-label': pageT('quotaAlertLabel'),
          style: (props && props.breathe) ? { animation: 'tb-logo-breathe 1.6s ease-in-out infinite' } : null,
        }),
        open ? h('div', {
          style: {
            position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, zIndex: 2300,
            width: 235, padding: '8px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.6,
            background: 'var(--dsw-menu-surface-fill, #fff)', color: 'var(--dsw-alias-label-primary, #111)',
            border: '1px solid var(--dsw-alias-border-l1, #ddd)',
            boxShadow: 'var(--dsw-elevation-prominent, 0 8px 30px rgba(0,0,0,0.18))',
            whiteSpace: 'pre-line', textAlign: 'center',
            // 站内信正文含可点击 <a>,气泡必须可交互;纯提示文案无链接也不受影响
            pointerEvents: 'auto',
          },
        }, bubbleChildren) : null,
      )
    }

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
      // 拉一次配额状态,写进全局 store 供余额旁告警图标使用
      var refreshQuotaAlert = function () {
        api('key-quotas').then(function (res) {
          var quotas = (res && res.quotas) || []
          var hit = quotas.find(function (q) { return q && q.status === 'exhausted' }) || null
          tbStore.set({ quotaAlert: hit })
        }).catch(function () {})
      }
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (!stopped) { st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl }) }
        }).catch(function () {})
        if (snap.loggedIn !== false) refreshQuotaAlert()
        var timer = setInterval(function () {
          api('status').then(function (data) { if (!stopped) st[1](data) }).catch(function () {})
          if (!stopped && tbStore.get().loggedIn !== false) refreshQuotaAlert()
        }, 60000)
        return function () { stopped = true; clearInterval(timer) }
      }, [])
      // 登录态/弹窗开合变化时立即重拉 status,侧栏即时反映登录结果
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (!stopped) { st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl }) }
        }).catch(function () {})
        if (snap.loggedIn) refreshQuotaAlert()
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
              ? '$' + (data.account.balance_nano_usd / 1e9).toFixed(2) : '—') : null,
          loggedIn ? h(QuotaAlertBadge) : null),
        loggedIn && flash[0]
          ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #888)', textAlign: 'center' } }, flash[0].text)
          : null,
      )
    }

    /** 托管分组选项:portal-models 目录按 group_id 去重只取分组;目录为空降级 /groups。 */
    function fetchGroupOptions() {
      return api('portal-models').then(function (res) {
        var catalog = (res && res.models) || []
        var seen = {}
        var list = []
        catalog.forEach(function (g) {
          if (!g || g.group_id == null || seen[g.group_id]) return
          seen[g.group_id] = true
          list.push({ id: g.group_id, label: String(g.group_name || ('分组 #' + g.group_id)) })
        })
        if (!list.length) throw new Error('empty catalog')
        return list
      }).catch(function () {
        return api('groups').then(function (res) {
          return ((res && res.groups) || []).map(function (g) {
            return { id: g.id, label: String(g.name || ('分组 #' + g.id)) }
          })
        })
      })
    }

    /** 原生分组选择菜单:锚点按钮下方弹出(设置页一键托管用,按钮是原生 DOM 不能走 React 状态)。 */
    function openGroupPicker(anchor, onPick) {
      if (anchor._tbGroupMenu && anchor._tbGroupMenu.parentElement) return
      var menu = document.createElement('div')
      menu.style.cssText = 'position:fixed;z-index:2200;min-width:150px;max-height:260px;overflow:auto;' +
        'background:var(--dsw-menu-surface-fill,#fff);color:var(--dsw-alias-label-primary,#111);' +
        'border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:8px;padding:4px;font-size:13px;' +
        'box-shadow:var(--dsw-elevation-prominent,0 8px 30px rgba(0,0,0,0.18));'
      var close = function () {
        anchor._tbGroupMenu = null
        if (menu.parentElement) menu.parentElement.removeChild(menu)
        document.removeEventListener('mousedown', onDoc, true)
        document.removeEventListener('keydown', onKey, true)
      }
      var onDoc = function (e) { if (!menu.contains(e.target) && e.target !== anchor) close() }
      var onKey = function (e) { if (e.key === 'Escape') close() }
      var add = function (label, id) {
        var b = document.createElement('button')
        b.type = 'button'
        b.textContent = label
        b.style.cssText = 'display:block;width:100%;text-align:left;border:none;background:transparent;cursor:pointer;padding:6px 10px;border-radius:6px;color:inherit;font-size:13px;white-space:nowrap;'
        b.addEventListener('mouseenter', function () { b.style.background = 'var(--dsw-alias-interactive-bg-subtle,#f0f0f0)' })
        b.addEventListener('mouseleave', function () { b.style.background = 'transparent' })
        b.addEventListener('click', function () { close(); if (id != null) onPick(id) })
        menu.appendChild(b)
      }
      var r = anchor.getBoundingClientRect()
      menu.style.left = Math.max(4, Math.round(r.left)) + 'px'
      menu.style.top = Math.round(r.bottom + 4) + 'px'
      anchor._tbGroupMenu = menu
      document.body.appendChild(menu)
      document.addEventListener('mousedown', onDoc, true)
      document.addEventListener('keydown', onKey, true)
      add('…', null) // 占位,列表到位后重建
      fetchGroupOptions().then(function (list) {
        if (!menu.parentElement) return
        while (menu.firstChild) menu.removeChild(menu.firstChild)
        if (!list.length) { add(pageT('depositGroup') + ': -', null); return }
        list.forEach(function (o) { add(o.label, o.id) })
      }).catch(function () {
        if (!menu.parentElement) return
        while (menu.firstChild) menu.removeChild(menu.firstChild)
        add(pageT('depositGroup') + ': -', null)
      })
    }

    /** 数量缩写:≥1亿→N亿(不足10保留1位小数),≥1万→N万,其余千分位(口径与门户总览页一致)。 */
    function tbCountText(n) {
      n = Number(n) || 0
      if (n >= 1e8) {
        var yi = n / 1e8
        return (yi >= 10 ? Math.round(yi) : Math.round(yi * 10) / 10) + '亿'
      }
      if (n >= 1e4) return Math.round(n / 1e4) + '万'
      return n.toLocaleString('en-US')
    }

    /** 全局托管弹窗:用户粘贴 API Key 托管(设置页「一键托管」不受影响)。 */
    function DepositOverlay() {
      var snap = useTbStore()
      var options = React.useState([]) // [{id, label}] 分组选择项(group_id 去重)
      var groupId = React.useState('')
      var keys = React.useState('')
      var busy = React.useState(false)
      var err = React.useState('')
      var stats = React.useState(null) // 顶部三卡片 {balanceNano, earnedNano, depositCount, platformCount, tokenText}
      React.useEffect(function () {
        if (!snap.depositOpen) return
        keys[1](''); err[1](''); busy[1](false)
        fetchGroupOptions().then(function (list) {
          options[1](list)
          if (list.length) groupId[1](String(list[0].id))
        }).catch(function () {})
        // 三卡片数据源:status(余额/托管收益/个人+平台托管数)+ wordcoin-market(≈Token 换算价)
        api('status').then(function (s) {
          if (!s || !s.loggedIn) return
          var acc = s.account || {}
          var next = {
            balanceNano: Number(acc.balance_nano_usd) || 0,
            earnedNano: Number(acc.total_earned_nano_usd) || 0,
            depositCount: Number(s.depositCount) || 0,
            platformCount: Number(s.platformCredentialCount) || 0,
            rateMicros: Number(s.depositRateMicros) || 0,
            tokenText: '',
          }
          stats[1](next)
          api('wordcoin-market').then(function (m) {
            var market = m && m.market
            if (!market) return
            // 门户口径:优先公式均价,退回现价;$/MT ÷1e3 → nanoUSD/token
            var nanoPerToken = Number(market.price_formula_avg_nano_usd) > 0
              ? Number(market.price_formula_avg_nano_usd)
              : Number(market.price_nano_usd_per_wc) / 1e3
            if (!(nanoPerToken > 0)) return
            stats[1](Object.assign({}, next, { tokenText: tbCountText(Math.round(next.balanceNano / nanoPerToken)) }))
          }).catch(function () {})
        }).catch(function () {})
      }, [snap.depositOpen])
      if (!snap.depositOpen || !runtimeCtx) return null
      var close = function () { tbStore.set({ depositOpen: false }) }
      var submit = async function () {
        var one = keys[0].trim()
        if (!one) { err[1](pageT('keyRequired')); return }
        if (!groupId[0]) { err[1](pageT('groupRequired')); return }
        var list = [one]
        busy[1](true); err[1]('')
        try {
          await api('deposits-add', { groupId: Number(groupId[0]), keys: list })
          busy[1](false)
          tbStore.set({ depositOpen: false, notify: { kind: 'success', title: pageT('depositDone'), detail: '' } })
        } catch (e) {
          busy[1](false)
          var msg = String(e.message || e)
          err[1](/validation|no_group_matched/i.test(msg) ? pageT('depositRejected') : msg)
        }
      }
      var inputStyle = {
        width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: 13,
        borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1, #f7f7f8)', color: 'inherit',
      }
      // 顶部三卡片(照门户总览页,无按钮):账户余额 / 托管收益 / 托管凭证
      var statCard = function (label, value, hint) {
        return h('div', {
          key: label, style: {
            minWidth: 0, border: '1px solid var(--dsw-alias-border-l1)',
            borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)', padding: '10px 12px',
          },
        },
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } }, label),
          h('div', { style: { fontSize: 16, fontWeight: 700, marginTop: 4, lineHeight: 1.3, whiteSpace: 'nowrap' } }, value),
          hint ? h('div', { style: { fontSize: 11, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary, #888)', marginTop: 4 } }, hint) : null)
      }
      var st = stats[0]
      // (1+托管利率)乘数:deposit_rate_micros 按门户口径 −1e6 为利率百分点(1050590→5.059%→×1.05059)
      var earnedHint = st && st.rateMicros > 1e6
        ? pageT('depositStatEarnedHintRate').replace('{rate}', (st.rateMicros / 1e6).toFixed(5).replace(/\.?0+$/, ''))
        : pageT('depositStatEarnedHint')
      return h('div', { style: { position: 'fixed', inset: 0, zIndex: 2100 } },
        h('div', { style: { position: 'fixed', inset: 0, zIndex: -1, background: 'rgba(0,0,0,0.35)' }, onClick: close }),
        h('div', {
          style: {
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 640, maxWidth: 'calc(100vw - 24px)', maxHeight: '80vh', overflow: 'auto',
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
          st ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 } },
            statCard(pageT('depositStatBalance'), '$' + (st.balanceNano / 1e9).toFixed(6),
              st.tokenText ? '≈ ' + st.tokenText + ' Token' : ''),
            statCard(pageT('depositStatEarned'), '$' + (st.earnedNano / 1e9).toFixed(6), earnedHint),
            statCard(pageT('depositStatKeys'), st.depositCount + ' / ' + st.platformCount, pageT('depositStatKeysHint')),
          ) : null,
          // 表单行与三卡片同网格:select 占第 1 列(与账户余额卡等宽),input 占 2–3 列
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } },
            h('select', {
              value: groupId[0], onChange: function (e) { groupId[1](e.target.value) },
              'aria-label': pageT('depositGroup'),
              style: Object.assign({}, inputStyle, { gridColumn: '1 / 2', minWidth: 0, paddingRight: 4 }),
            },
              options[0].map(function (o, i) { return h('option', { value: String(o.id), key: o.label + '#' + i }, o.label) })),
            h('input', {
              type: 'text', placeholder: pageT('depositPlaceholder'),
              value: keys[0], onChange: function (e) { keys[1](e.target.value) },
              style: Object.assign({}, inputStyle, { gridColumn: '2 / 4', minWidth: 0, fontFamily: 'monospace' }),
            })),
          err[0] ? h('div', { style: { fontSize: 12, color: '#d54941', marginTop: 6 } }, err[0]) : null,
          h('button', {
            type: 'button', disabled: busy[0],
            style: Object.assign({}, primaryButtonStyle, { justifyContent: 'center', width: '100%', marginTop: 10 }),
            onClick: submit,
          }, busy[0] ? '…' : pageT('depositSubmitNow')),
          h('div', { style: { fontSize: 12, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary, #888)', marginTop: 10 } },
            h('div', null, pageT('depositIntro')),
            h('div', null, pageT('depositIntro1')),
            h('div', null, pageT('depositIntro2')),
            h('div', null, pageT('depositIntro3')),
            h('div', null, pageT('depositIntro4')),
            h('div', { style: { marginBottom: 6 } }, pageT('depositIntro5')),
            h('div', { style: { textAlign: 'right' } },
              h('a', { href: (snap.portalUrl || 'https://bank.skillpie.cn') + '/', target: '_blank', rel: 'noreferrer', style: { color: '#ff4f1f', textDecoration: 'none', fontWeight: 600 } }, pageT('learnMore')))),
        ),
      )
    }

    /* ── 推广赚$弹窗(材质与 DepositOverlay 一致):推广规则/链接/复制文案 ── */

    function PromoOverlay() {
      var snap = useTbStore()
      var summary = React.useState(null) // {ref_code, reward_nano_usd, total_referrals, total_reward_nano_usd}
      var needLogin = React.useState(false)
      var err = React.useState('')
      var copied = React.useState(false)
      React.useEffect(function () {
        if (!snap.promoOpen) return
        summary[1](null); err[1](''); copied[1](false); needLogin[1](false)
        api('promo-summary').then(function (res) {
          summary[1](res && res.summary)
        }).catch(function (e) {
          // 未登录(requireLive 抛 'not logged in')/其他错误:未登录给登录引导
          var msg = String((e && e.message) || e)
          if (/not logged|login|auth|unauthorized|identity/i.test(msg)) needLogin[1](true)
          else err[1](msg)
        })
      }, [snap.promoOpen])
      if (!snap.promoOpen || !runtimeCtx) return null
      var close = function () { tbStore.set({ promoOpen: false }) }
      var portal = (snap.portalUrl || 'https://bank.skillpie.cn').replace(/\/+$/, '')
      var data = summary[0]
      var link = data && data.ref_code ? portal + '/i/' + data.ref_code : ''
      var shareText = link ? pageT('promoShareText').replace('{link}', link) : ''
      var copy = async function () {
        try {
          await navigator.clipboard.writeText(shareText)
          copied[1](true)
          setTimeout(function () { copied[1](false) }, 2000)
        } catch (e) {
          // 剪贴板不可用时兜底:选中文本让用户手动复制
          var input = document.getElementById('tb-promo-link-input')
          if (input && input.select) input.select()
        }
      }
      var ruleStyle = { fontSize: 12, lineHeight: 1.8, color: 'var(--dsw-alias-label-secondary, #888)' }
      return h('div', { style: { position: 'fixed', inset: 0, zIndex: 2100 } },
        h('div', { style: { position: 'fixed', inset: 0, zIndex: -1, background: 'rgba(0,0,0,0.35)' }, onClick: close }),
        h('div', {
          style: {
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 420, maxWidth: 'calc(100vw - 24px)', maxHeight: '80vh', overflow: 'auto',
            background: 'var(--dsw-menu-surface-fill)', backdropFilter: 'var(--dsw-menu-backdrop-filter)',
            WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
            color: 'var(--dsw-alias-label-primary)',
            borderRadius: 'var(--dsw-radius-md, 10px)', padding: 16,
            border: '1px solid var(--dsw-alias-border-l1)',
            boxShadow: 'var(--dsw-elevation-prominent)',
          },
          onClick: function (e) { e.stopPropagation() },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
            h('span', { style: { fontWeight: 700, fontSize: 14 } }, pageT('promoTitle')),
            h('button', { type: 'button', style: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--dsw-alias-label-secondary, #888)', padding: 2 }, onClick: close }, '✕')),
          // 推广规则
          h('div', { style: { marginBottom: 12 } },
            h('div', { style: ruleStyle }, pageT('promoRule1')),
            h('div', { style: ruleStyle }, pageT('promoRule2')),
            h('div', { style: ruleStyle }, pageT('promoRule3'))),
          err[0] ? h('div', { style: { fontSize: 12, color: '#d54941', marginBottom: 8 } }, err[0]) : null,
          needLogin[0] ? h('div', { style: { marginBottom: 10 } },
            h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)', marginBottom: 8 } }, pageT('promoLoginHint')),
            h('button', {
              type: 'button',
              style: Object.assign({}, primaryButtonStyle, { justifyContent: 'center', width: '100%' }),
              onClick: function () { tbStore.set({ promoOpen: false, authOpen: true, authMode: 'login' }) },
            }, pageT('promoGoLogin'))) : null,
          // 推广链接 + 复制文案(未登录/加载中占位)
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)', marginBottom: 4 } }, pageT('promoLinkLabel')),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'stretch' } },
            h('input', {
              id: 'tb-promo-link-input', type: 'text', readOnly: true,
              value: link || '…',
              style: { flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', fontSize: 12, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1, #f7f7f8)', color: 'inherit', fontFamily: 'monospace' },
            }),
            h('button', {
              type: 'button', disabled: !link,
              style: Object.assign({}, primaryButtonStyle, { flex: 'none', height: 'auto', minHeight: 30, opacity: link ? 1 : 0.5 }),
              onClick: copy,
            }, copied[0] ? pageT('promoCopied') : pageT('promoCopy'))),
          // 登录态补充数据 + 门户推广记录入口
          data && link ? h('div', { style: { display: 'flex', gap: 8, marginTop: 10 } },
            h('div', { style: { flex: 1, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)', padding: '8px 10px' } },
              h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #888)' } }, pageT('promoStatReferrals')),
              h('div', { style: { fontSize: 15, fontWeight: 700, marginTop: 2 } }, String(data.total_referrals || 0))),
            h('div', { style: { flex: 1, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)', padding: '8px 10px' } },
              h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #888)' } }, pageT('promoStatReward')),
              h('div', { style: { fontSize: 15, fontWeight: 700, marginTop: 2, color: '#ff4f1f' } }, '$' + ((Number(data.total_reward_nano_usd) || 0) / 1e9).toFixed(2))),
          ) : null,
          data && link ? h('a', {
            href: portal + '/promo', target: '_blank', rel: 'noreferrer',
            style: { display: 'block', textAlign: 'right', marginTop: 10, fontSize: 12, color: '#ff4f1f', textDecoration: 'none', fontWeight: 600 },
          }, pageT('promoViewRecords')) : null,
        ),
      )
    }

    /* ── 百万词元(TM)交易弹窗(参考 token-bank PortalWordCoinView) ────────── */

    // 美元金额体系（与官网 PortalWordCoinView 同口径）：买入按 $ 金额，
    // 金额 × 当前价 = 获得 MT；卖出按 MT 数量、扣后端实收费率。
    var TRADE_SELL_FEE_MICROS = 20000  // 卖出手续费兜底估算（2%），实际以后端 fee_micros 为准
    var TRADE_UNIT = 'MT'              // 展示单位（百万词元）
    var MIN_SELL_NANO_WC = 1e6         // 后端 MinSellNanoWC
    // 展示换算常数:1 MT = tradeWcPerMt 个 WC(后端 /wordcoin/market 的 wc_per_mt,默认 40 =
    // 开盘校准基准 $0.04/MT ÷ $0.001/WC)。对外统一 MT/$ = quote ÷ (wcPerMt×1e6),数值越大词元越便宜;
    // MT 数量 = nanoWC ÷ (wcPerMt×1e9)。内部价格空间仍是「词元价值」v = 1e12 ÷ quote(与官网走势图同口径)。
    var tradeWcPerMt = 40
    var TRADE_PRICE_UNIT = 'MT/$'
    var TRADE_CHART_CANDLES = 48       // K线固定最近 4 小时 = 48 根 5 分钟蜡烛(240 根 1 分钟桶)
    // 活性抖动:让报价看起来"有人在做市"。锚定最后一根蜡烛收盘价,
    // 每 1~10s 在 ±1.5% 内均匀随机移动,并夹进最近 5 根蜡烛的 hi/lo 区间;
    // 真实行情(60s 轮询)到达后归零回锚。仅作用于展示价,成交仍用真实 quote。
    var TRADE_JITTER_MIN_DELAY_MS = 1000
    var TRADE_JITTER_MAX_DELAY_MS = 10000
    var TRADE_JITTER_MAX_BAND = 0.015
    // 定点口径:1 MT = 1e9 nanoWC、1 USD = 1e9 nanoUSD;quote_micros = 词元/美元 ×1e6,
    // 内部价 v = 1e12 ÷ quote_micros(正值,数值越大=词元越值钱;展示时经 fmtMtPerUsd 换算为 MT/$)。
    function tradeFmt(n, d) { return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) }
    function tradeMt(nanoWc) { return tradeFmt((Number(nanoWc) || 0) / (tradeWcPerMt * 1e9), 2) }
    /** 词元价值空间 v(1e12÷quote) → MT/$ 数值。 */
    function tradeMtPerUsd(v) { return v > 0 ? 1e6 / (v * tradeWcPerMt) : 0 }
    /** 词元价值空间 v → MT/$ 文本(2 位小数)。 */
    function fmtMtPerUsd(v) { return v != null && v > 0 ? tradeFmt(tradeMtPerUsd(v), 2) : '—' }
    function tradeUsd(nanoUsd, d) { return '$' + tradeFmt((Number(nanoUsd) || 0) / 1e9, d == null ? 2 : d) }
    /** nanoUSD → 6 位小数美元（手续费/盈亏列用，与官网 formatNanoUSD6 一致）。 */
    function tradeUsd6(nanoUsd) {
      var v = (Number(nanoUsd) || 0) / 1e9
      var sign = v < 0 ? '-' : ''
      return sign + '$' + tradeFmt(Math.abs(v), 6)
    }
    /** 报价定点 → 内部「词元价值」数值（1e12 ÷ quote_micros），quote<=0 返回 null。 */
    function tradePx(quoteMicros) {
      var q = Number(quoteMicros) || 0
      return q > 0 ? 1e12 / q : null
    }
    /** nanoUSD/WC 定点 → 内部「词元价值」数值（÷1e3）。 */
    function tradeAvgPx(nanoUsdPerWc) {
      var v = Number(nanoUsdPerWc) || 0
      return v > 0 ? v / 1e3 : null
    }
    function tradeHhmm(ms) { var dt = new Date(Number(ms) || 0); return ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2) }

    /** 1 分钟快照 → 5 分钟蜡烛 + 6/12/48 根一组均线(close 均值,画组内中位序号)。 */
    function buildTradeChart(market) {
      var hist = (market && Array.isArray(market.history) ? market.history : []).filter(function (p) { return p && Number(p.quote_micros) > 0 })
      if (!hist.length) return null
      var groups = {}
      for (var i = 0; i < hist.length; i++) {
        var p = hist[i]
        var key = Math.floor(p.bucket_start_ms / 300000)
        var price = 1e12 / Number(p.quote_micros)
        var g = groups[key]
        if (!g) groups[key] = { t: p.bucket_start_ms, o: price, c: price, minQ: Number(p.quote_micros), maxQ: Number(p.quote_micros) }
        else {
          g.c = price
          if (Number(p.quote_micros) < g.minQ) g.minQ = Number(p.quote_micros)
          if (Number(p.quote_micros) > g.maxQ) g.maxQ = Number(p.quote_micros)
        }
      }
      var candles = Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b) }).map(function (k) {
        var g = groups[k]
        return { t: g.t, o: g.o, c: g.c, hi: 1e12 / g.minQ, lo: 1e12 / g.maxQ }
      })
      var vis = candles.slice(-TRADE_CHART_CANDLES)
      function maPoints(win) {
        var pts = []
        for (var s = 0; s + win <= vis.length; s += win) {
          var sum = 0
          for (var j = 0; j < win; j++) sum += vis[s + j].c
          pts.push({ x: s + Math.floor((win - 1) / 2), v: sum / win })
        }
        // 首尾预测性延长:沿端点两侧线段的斜率外推到窗口两端(非平延)
        if (pts.length >= 2) {
          var head = pts[0], head2 = pts[1]
          var slopeL = (head.v - head2.v) / (head.x - head2.x)
          var tail = pts[pts.length - 1], tail2 = pts[pts.length - 2]
          var slopeR = (tail.v - tail2.v) / (tail.x - tail2.x)
          pts = [{ x: 0, v: head.v + slopeL * (0 - head.x) }].concat(
            pts,
            [{ x: vis.length - 1, v: tail.v + slopeR * (vis.length - 1 - tail.x) }])
        }
        return pts
      }
      return {
        candles: vis,
        mas: [
          { pts: maPoints(6), color: '#3b82f6' },
          { pts: maPoints(12), color: '#a855f7' },
        ],
      }
    }

    /** SVG K线:红涨绿跌 + 均线 + 当前价虚线(右端标签)。 */
    function TradeChart(props) {
      var chart = props.chart
      var cur = props.cur
      var avgBuy = props.avgBuy
      if (!chart || !chart.candles.length) return null
      var candles = chart.candles
      var W = 1000, H = 250, padL = 70, padR = 84, padT = 12, padB = 28
      var lo = Infinity, hi = -Infinity
      for (var i = 0; i < candles.length; i++) {
        if (candles[i].lo < lo) lo = candles[i].lo
        if (candles[i].hi > hi) hi = candles[i].hi
      }
      if (cur != null && cur > 0) { if (cur < lo) lo = cur; if (cur > hi) hi = cur }
      if (avgBuy != null && avgBuy > 0) { if (avgBuy < lo) lo = avgBuy; if (avgBuy > hi) hi = avgBuy }
      // 4 小时窗口均价(收盘均值)灰线
      var avg = 0
      for (var ai = 0; ai < candles.length; ai++) avg += candles[ai].c
      avg = candles.length ? avg / candles.length : 0
      if (avg > 0) { if (avg < lo) lo = avg; if (avg > hi) hi = avg }
      if (!(hi > lo)) { hi = lo + 1; lo = lo - 1 }
      var span = (hi - lo) * 0.08
      lo -= span; hi += span
      var plotW = W - padL - padR, plotH = H - padT - padB
      var y = function (v) { return padT + (hi - v) / (hi - lo) * plotH }
      var step = plotW / candles.length
      var x = function (i) { return padL + (i + 0.5) * step }
      var bodyW = Math.max(2, step * 0.55)
      var parts = []
      // y 轴刻度(4 条)
      var ticks = 4
      for (var ti = 0; ti <= ticks; ti++) {
        var v = lo + (hi - lo) * ti / ticks
        var ty = y(v)
        parts.push(h('line', { key: 'gl' + ti, x1: padL, x2: W - padR, y1: ty, y2: ty, stroke: 'var(--dsw-alias-border-l1, #e5e7eb)', 'stroke-width': 1 }))
        parts.push(h('text', { key: 'yl' + ti, x: padL - 6, y: ty + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--dsw-alias-label-secondary, #888)' }, fmtMtPerUsd(v)))
      }
      // 蜡烛:红涨绿跌
      for (var ci = 0; ci < candles.length; ci++) {
        var cd = candles[ci]
        // 与官网口径统一:close 相对上一根收盘涨红跌绿,平盘灰(首根按自身 open 比)
        var prevC = ci > 0 ? candles[ci - 1].c : cd.o
        var up = cd.c > prevC
        var color = cd.c === prevC ? '#9ca3af' : up ? '#d03050' : '#22a04a'
        var cx = x(ci)
        parts.push(h('line', { key: 'wl' + ci, x1: cx, x2: cx, y1: y(cd.hi), y2: y(cd.lo), stroke: color, 'stroke-width': 1.2 }))
        var yTop = y(Math.max(cd.o, cd.c)), yBot = y(Math.min(cd.o, cd.c))
        parts.push(h('rect', {
          key: 'cb' + ci, x: cx - bodyW / 2, y: yTop, width: bodyW,
          height: Math.max(1.5, yBot - yTop), fill: color,
        }))
      }
      // 均线折线
      chart.mas.forEach(function (ma, mi) {
        if (!ma.pts.length) return
        var px = ma.pts.map(function (pt) { return x(pt.x) })
        var py = ma.pts.map(function (pt) { return y(pt.v) })
        var d = 'M' + px[0].toFixed(1) + ' ' + py[0].toFixed(1)
        for (var si = 0; si < px.length - 1; si++) {
          var p0 = si > 0 ? si - 1 : 0, p3 = si + 2 < px.length ? si + 2 : si + 1
          var c1x = px[si] + (px[p3] - px[p0]) / 6, c1y = py[si] + (py[p3] - py[p0]) / 6
          var c2x = px[si + 1] - (px[p3] - px[p0]) / 6, c2y = py[si + 1] - (py[p3] - py[p0]) / 6
          d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + px[si + 1].toFixed(1) + ' ' + py[si + 1].toFixed(1)
        }
        parts.push(h('path', { key: 'ma' + mi, d: d, fill: 'none', stroke: ma.color, 'stroke-width': 1.6 }))
      })
      // 当前价横线 + 右端标签
      if (cur != null && cur > 0) {
        var cy = y(cur)
        parts.push(h('line', { key: 'curl', x1: padL, x2: W - padR + 4, y1: cy, y2: cy, stroke: '#ff4f1f', 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }))
        parts.push(h('text', { key: 'curt', x: W - padR + 8, y: cy + 4, 'font-size': 12, fill: '#ff4f1f' }, tradeFmt(cur, 2)))
      }
      // 买入价线(蓝)
      if (avgBuy != null && avgBuy > 0) {
        var by = y(avgBuy)
        parts.push(h('line', { key: 'buyline', x1: padL, x2: W - padR, y1: by, y2: by, stroke: '#3b82f6', 'stroke-width': 1, 'stroke-dasharray': '6 4' }))
        parts.push(h('text', { key: 'buylinet', x: padL + 4, y: by + 14, 'font-size': 11, fill: '#3b82f6' }, pageT('buyPriceLine') + ' ' + fmtMtPerUsd(avgBuy)))
      }
      // 均价中线(灰)
      if (avg > 0) {
        var ay = y(avg)
        parts.push(h('line', { key: 'avgl', x1: padL, x2: W - padR, y1: ay, y2: ay, stroke: 'var(--dsw-alias-label-secondary, #9ca3af)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }))
        parts.push(h('text', { key: 'avgt', x: padL + 4, y: ay - 4, 'font-size': 11, fill: 'var(--dsw-alias-label-secondary, #9ca3af)' }, pageT('avgLine') + ' ' + fmtMtPerUsd(avg)))
      }
      // x 轴整点刻度(每小时一根,参考官网;刻度自轴线向上突出)
      var seenHours = {}
      parts.push(h('line', { key: 'xaxis', x1: padL, x2: W - padR, y1: H - padB, y2: H - padB, stroke: 'var(--dsw-alias-border-l1, #d1d5db)', 'stroke-width': 1 }))
      for (var xi = 0; xi < candles.length; xi++) {
        var dt = new Date(candles[xi].t)
        if (dt.getMinutes() >= 5) continue
        var hh = ('0' + dt.getHours()).slice(-2) + ':00'
        if (seenHours[hh]) continue
        seenHours[hh] = true
        parts.push(h('line', { key: 'xt' + xi, x1: x(xi), x2: x(xi), y1: H - padB, y2: H - padB - 7, stroke: 'var(--dsw-alias-border-l2, #9ca3af)', 'stroke-width': 1.5 }))
        parts.push(h('text', { key: 'xl' + xi, x: x(xi), y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--dsw-alias-label-secondary, #888)' }, hh))
      }
      return h('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', style: { display: 'block' } }, parts)
    }

    /** 交易弹窗内的子弹窗(买入/卖出/交易记录共用外壳)。 */
    function TradeSubModal(props) {
      return h('div', { style: { position: 'fixed', inset: 0, zIndex: 2210 } },
        h('div', { style: { position: 'fixed', inset: 0, zIndex: -1, background: 'rgba(0,0,0,0.35)' }, onClick: props.onClose }),
        h('div', {
          className: 'tb-trade-sheet',
          style: {
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: props.width || 360, maxWidth: 'calc(100vw - 24px)', maxHeight: '78vh', overflow: 'auto',
            background: 'var(--dsw-menu-surface-fill)', backdropFilter: 'var(--dsw-menu-backdrop-filter)',
            WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
            color: 'var(--dsw-alias-label-primary)',
            borderRadius: 'var(--dsw-radius-md, 10px)', padding: 16,
            border: '1px solid var(--dsw-alias-border-l1)',
            boxShadow: 'var(--dsw-elevation-prominent)',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
            h('span', { style: { fontWeight: 700, fontSize: 14 } }, props.title),
            h('button', { type: 'button', style: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--dsw-alias-label-secondary, #888)', padding: 2 }, onClick: props.onClose }, '✕')),
          props.children,
        ),
      )
    }

    /** 交易拒绝原因映射:门户 403 返回 `data.reason`,直接取 e.message 只会得到
     *  "Access is forbidden"。按 reason 翻译成具体原因,未识别回退服务端原文。 */
    function tradeErrorMessage(e) {
      var data = e && e.data || {}
      var reason = typeof data.reason === 'string' ? data.reason : ''
      var quoteMicros = Number(data.quote_micros) || 0
      var minQ = Number(data.min_quote_micros) || 0
      var maxQ = Number(data.max_quote_micros) || 0
      var fmtPx = function (q) { return q > 0 ? tradeFmt(q / (tradeWcPerMt * 1e6), 2) : '—' }
      switch (reason) {
        case 'price_band_breaker': {
          // micros 侧 [minQ, maxQ] 在 MT/$ 侧是 [minQ/(wcPerMt×1e6), maxQ/(wcPerMt×1e6)]。
          var band = fmtPx(minQ) + '–' + fmtPx(maxQ) + ' ' + TRADE_PRICE_UNIT
          var quote = fmtPx(quoteMicros)
          // quote 高于上界 ⇒ 词元比允许的最便宜还便宜 ⇒ MT/$ 冲破上沿。
          if (quoteMicros > maxQ) return pageT('sellBandBelow').replace('{quote}', quote).replace('{band}', band)
          if (quoteMicros < minQ) return pageT('sellBandAbove').replace('{quote}', quote).replace('{band}', band)
          return String(e && e.message || e)
        }
        case 'platform_premium_breaker': return pageT('platformPremiumBreaker')
        case 'no_market_snapshot': return pageT('sellNoSnapshot')
        case 'proceeds_round_to_zero': return pageT('proceedsTooSmall')
        case 'insufficient_wc_balance': return pageT('sellMax').replace('{max}', tradeMt(Number(data.balance_nano_wc) || 0))
        case 'insufficient_usd_balance': return pageT('insufficientUsd')
        case 'trading_disabled': return pageT('tradingDisabledDetail')
        case 'calibrating': return pageT('tradingCalibrating')
        default: return String(e && e.message || e)
      }
    }

    /** 买入:按美元金额市价买入,获得词元 = 金额 × 当前价(MT)。支持 25%/50%/75%/最大 快捷。 */
    function TradeBuyPanel(props) {
      var market = props.market, account = props.account
      var amountText = React.useState('')
      var busy = React.useState(false)
      var err = React.useState('')
      var quote = market ? Number(market.quote_micros) || 0 : 0
      var price = tradePx(quote) // 内部词元价值空间
      var usdBalance = Number(props.usdBalance) || 0
      var maxBuy = account && account.limits && Number(account.limits.max_buy_nano_usd) || Infinity
      var MIN_BUY = 1e7 // $0.01，与后端 MinBuyNanoUSD 一致
      var budget = Math.min(isFinite(maxBuy) ? maxBuy : Infinity, usdBalance > 0 ? usdBalance : Infinity)
      if (!isFinite(budget)) budget = 0
      var amountNano = Math.round((Number(amountText[0]) || 0) * 1e9)
      var gainMt = amountNano > 0 && quote > 0 ? Math.floor((amountNano * quote * 1000) / 1e9) : null
      var buyErr = ''
      if (amountText[0].trim() !== '') {
        if (!(amountNano > 0)) buyErr = pageT('lotInvalid')
        else if (amountNano > budget) buyErr = pageT('buyCap').replace('{max}', tradeUsd(budget))
        else if (amountNano < MIN_BUY) buyErr = pageT('buyMin').replace('{min}', tradeUsd(MIN_BUY))
      }
      var setPct = function (pct) {
        var step = 1e7 // 取整到分
        var b = Math.floor(budget / step) * step
        var v = Math.floor((b * pct) / 100 / step) * step
        if (v >= MIN_BUY) amountText[1]((v / 1e9).toFixed(2))
      }
      var submit = async function () {
        if (!(amountNano >= MIN_BUY) || buyErr !== '') { err[1](buyErr || pageT('lotInvalid')); return }
        busy[1](true); err[1]('')
        try {
          await api('wordcoin-buy', { amount_nano_usd: amountNano })
          busy[1](false)
          tbStore.set({ notify: { kind: 'success', title: pageT('buyDone'), detail: '' } })
          props.onDone()
        } catch (e) {
          busy[1](false)
          tbStore.set({ notify: { kind: 'error', title: pageT('buyFail'), detail: tradeErrorMessage(e) } })
        }
      }
      return h(TradeSubModal, { title: pageT('trade') + ' · ' + pageT('buySubmit'), onClose: props.onClose },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h('div', { style: { fontSize: 13 } }, price != null ? pageT('nowPrice') + ' ' + fmtMtPerUsd(price) + ' ' + TRADE_PRICE_UNIT : '—'),
          budget >= MIN_BUY ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } }, pageT('maxBuyLots').replace('{n}', tradeUsd(budget))) : null,
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, pageT('lotLabel')),
          h('input', {
            type: 'number', min: 0.01, step: 0.01, value: amountText[0],
            onChange: function (e) { amountText[1](e.target.value) },
            style: inputStyle,
          }),
          h('div', { style: { display: 'flex', gap: 6 } },
            [25, 50, 75].map(function (n) {
              return h('button', {
                key: n, type: 'button', style: Object.assign({}, buttonStyle, { flex: 1, justifyContent: 'center', fontSize: 12, height: 26 }),
                onClick: function () { setPct(n) },
              }, n + '%')
            }),
            h('button', {
              type: 'button', disabled: !(budget >= MIN_BUY),
              style: Object.assign({}, buttonStyle, { flex: 1, justifyContent: 'center', fontSize: 12, height: 26, opacity: budget >= MIN_BUY ? 1 : 0.5 }),
              onClick: function () { setPct(100) },
            }, pageT('quickMax')),
          ),
          amountNano > 0 ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
              h('span', null, pageT('totalAmount')), h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, tradeUsd(amountNano))),
            h('div', { style: { display: 'flex', justifyContent: 'space-between', color: 'var(--dsw-alias-label-primary, #333)', fontWeight: 700 } },
              h('span', null, pageT('gainTokens')), h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, gainMt != null ? tradeMt(gainMt) + ' ' + TRADE_UNIT : '—'))) : null,
          (buyErr !== '' || err[0]) ? h('div', { style: errorStyle }, buyErr !== '' ? buyErr : err[0]) : null,
          h('button', {
            type: 'button', disabled: busy[0] || !(amountNano >= MIN_BUY) || buyErr !== '',
            style: Object.assign({}, primaryButtonStyle, { justifyContent: 'center', width: '100%' }),
            onClick: submit,
          }, busy[0] ? '…' : pageT('buySubmit')),
        ),
      )
    }

    /** 卖出:按 MT 数量市价卖出,手续费率取后端 fee_micros(无则兜底 2%)。 */
    function TradeSellPanel(props) {
      var market = props.market, account = props.account
      var amountText = React.useState('')
      var busy = React.useState(false)
      var err = React.useState('')
      var quote = market ? Number(market.quote_micros) || 0 : 0
      var price = account && Number(account.price_nano_usd_per_wc) > 0
        ? Number(account.price_nano_usd_per_wc)
        : (quote > 0 ? Math.floor(1e15 / quote) : 0)
      var priceText = tradePx(quote)
      var feeMicros = account && account.limits && Number(account.limits.sell_fee_micros) > 0
        ? Number(account.limits.sell_fee_micros) : TRADE_SELL_FEE_MICROS
      var balanceWc = account ? Number(account.balance_nano_wc) || 0 : 0
      var amount = Math.round((Number(String(amountText[0]).trim()) || 0) * tradeWcPerMt * 1e9)
      // 提示按 2 位小数展示，容差 0.01 MT(= 0.01 × wcPerMt × 1e9 nanoWC)；成交时钳到真实余额。
      // 余额 17.3755 MT 展示为 17.38，用户照着输入不能被判超卖。
      var over = amount - balanceWc
      var sellError = amount > 0 && amount < MIN_SELL_NANO_WC ? pageT('sellMin')
        : over > 0.01 * tradeWcPerMt * 1e9 ? pageT('sellMax').replace('{max}', tradeMt(balanceWc))
        : ''
      var sellAmount = Math.min(amount, balanceWc)
      var gross = sellAmount > 0 && price > 0 ? Math.floor(sellAmount * price / 1e9) : 0
      var fee = gross > 0 ? Math.floor(gross * feeMicros / 1e6) : 0
      var net = gross - fee
      var submit = async function () {
        if (sellError) { err[1](sellError); return }
        if (!(sellAmount >= MIN_SELL_NANO_WC)) { err[1](pageT('sellMin')); return }
        busy[1](true); err[1]('')
        try {
          await api('wordcoin-sell', { amountNanoWC: sellAmount })
          busy[1](false)
          tbStore.set({ notify: { kind: 'success', title: pageT('sellDone'), detail: '' } })
          props.onDone()
        } catch (e) {
          busy[1](false)
          tbStore.set({ notify: { kind: 'error', title: pageT('sellFail'), detail: tradeErrorMessage(e) } })
        }
      }
      var fill = function (percent) {
        var v = percent >= 100 ? balanceWc / (tradeWcPerMt * 1e9) : balanceWc / (tradeWcPerMt * 1e9) * percent / 100
        amountText[1](v.toFixed(2))
      }
      return h(TradeSubModal, { title: pageT('trade') + ' · ' + pageT('sellSubmit'), onClose: props.onClose },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h('div', { style: { fontSize: 13 } }, priceText != null ? pageT('nowPrice') + ' ' + fmtMtPerUsd(priceText) + ' ' + TRADE_PRICE_UNIT : '—'),
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } },
            pageT('sellAmountHint').replace('{max}', tradeMt(balanceWc))),
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, pageT('sellLabel')),
          h('input', {
            type: 'text', inputMode: 'decimal', placeholder: pageT('sellPlaceholder'),
            value: amountText[0],
            onChange: function (e) { amountText[1](e.target.value) },
            style: inputStyle,
          }),
          h('div', { style: { display: 'flex', gap: 6 } },
            [25, 50, 75].map(function (pct) {
              return h('button', {
                key: pct, type: 'button', style: Object.assign({}, buttonStyle, { flex: 1, justifyContent: 'center', fontSize: 12, height: 26 }),
                onClick: function () { fill(pct) },
              }, pct + '%')
            }),
            h('button', {
              type: 'button', disabled: !(balanceWc > 0),
              style: Object.assign({}, buttonStyle, { flex: 1, justifyContent: 'center', fontSize: 12, height: 26, opacity: balanceWc > 0 ? 1 : 0.5 }),
              onClick: function () { fill(100) },
            }, pageT('quickAll')),
          ),
          gross > 0 ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } },
            pageT('sellEstimate').replace('{g}', tradeUsd(gross)).replace('{f}', tradeUsd(fee)).replace('{n}', tradeUsd(net))) : null,
          sellError ? h('div', { style: errorStyle }, sellError) : (err[0] ? h('div', { style: errorStyle }, err[0]) : null),
          h('button', {
            type: 'button', disabled: busy[0] || !!sellError || !(sellAmount >= MIN_SELL_NANO_WC),
            style: Object.assign({}, primaryButtonStyle, { justifyContent: 'center', width: '100%' }),
            onClick: submit,
          }, busy[0] ? '…' : pageT('sellSubmit')),
        ),
      )
    }

    /** 交易记录:wc_buy/wc_sell 流水,20 条/页,可翻页。 */
    function TradeLedgerPanel(props) {
      var page = React.useState(1)
      var ledger = React.useState(null) // WordCoinLedgerPage
      var err = React.useState('')
      React.useEffect(function () {
        var stopped = false
        api('wordcoin-ledger', { page: page[0], pageSize: 10 }).then(function (res) {
          if (!stopped) ledger[1](res && res.ledger)
        }).catch(function (e) { if (!stopped) err[1](String(e.message || e)) })
        return function () { stopped = true }
      }, [page[0]])
      var entries = (ledger[0] && ledger[0].entries) || []
      var total = ledger[0] && Number(ledger[0].total) || 0
      var pages = Math.max(1, Math.ceil(total / 10))
      var cellStyle = { fontSize: 12, padding: '6px 8px', borderBottom: '1px solid var(--dsw-alias-border-l1)', whiteSpace: 'nowrap' }
      return h(TradeSubModal, { title: pageT('tradeRecords'), width: 640, onClose: props.onClose },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          err[0] ? h('div', { style: errorStyle }, err[0]) : null,
          h('div', { className: 'tb-trade-scroll', style: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 560 } },
            h('thead', null, h('tr', null,
              [pageT('colTime'), pageT('colType'), pageT('colAmount'), pageT('colUsd'), pageT('colFee'), pageT('colPrice'), pageT('colPnl')].map(function (label) {
                return h('th', { key: label, style: Object.assign({}, cellStyle, { textAlign: 'left', color: 'var(--dsw-alias-label-secondary, #888)', fontWeight: 600 }) }, label)
              }))),
            h('tbody', null, entries.length ? entries.map(function (en) {
              var buy = en.kind === 'wc_buy'
              var amount = Number(en.amount_nano_wc) || 0
              var price = tradePx(en.quote_micros)
              // 盈亏由后端回放移动加权均价得出（净得美元 − 成本），清仓后历史行依然有效。
              var pnl = !buy && Number(en.realized_pnl_nano_usd) ? Number(en.realized_pnl_nano_usd) : null
              var fee = Number(en.fee_nano_usd) || 0
              return h('tr', { key: en.id },
                h('td', { style: cellStyle }, tradeHhmm(en.created_at_ms)),
                h('td', { style: cellStyle }, buy ? pageT('typeBuy') : pageT('typeSell')),
                // 颜色与符号跟类型走:买入红+、卖出绿−(不依赖服务端金额符号)
                h('td', { style: Object.assign({}, cellStyle, { color: buy ? '#d03050' : '#22a04a', fontWeight: 600 }) },
                  (buy ? '+' : '−') + tradeMt(Math.abs(amount)) + ' ' + TRADE_UNIT),
                h('td', { style: cellStyle }, en.usd_leg_nano_usd ? tradeUsd6(Math.abs(Number(en.usd_leg_nano_usd))) : '—'),
                h('td', { style: cellStyle }, fee > 0 ? tradeUsd6(fee) : '—'),
                h('td', { style: cellStyle }, price != null ? fmtMtPerUsd(price) + ' ' + TRADE_PRICE_UNIT : '—'),
                h('td', { style: Object.assign({}, cellStyle, pnl != null ? { color: pnl > 0 ? '#d03050' : pnl < 0 ? '#22a04a' : 'inherit', fontWeight: 600 } : null) },
                  pnl != null ? (pnl > 0 ? '+' : pnl < 0 ? '−' : '') + tradeUsd6(Math.abs(pnl)) : '—'),
              )
            }) : h('tr', null, h('td', { style: Object.assign({}, cellStyle, { textAlign: 'center' }), colSpan: 7 }, '—'))),
          ),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 } },
            h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } }, page[0] + ' / ' + pages),
            h('button', {
              type: 'button', disabled: page[0] <= 1,
              style: Object.assign({}, buttonStyle, { height: 26, fontSize: 12, opacity: page[0] <= 1 ? 0.5 : 1 }),
              onClick: function () { page[1](page[0] - 1) },
            }, pageT('prevPage')),
            h('button', {
              type: 'button', disabled: page[0] >= pages,
              style: Object.assign({}, buttonStyle, { height: 26, fontSize: 12, opacity: page[0] >= pages ? 0.5 : 1 }),
              onClick: function () { page[1](page[0] + 1) },
            }, pageT('nextPage')),
          ),
        ),
      )
    }

    /** 交易弹窗主体:打开时挂载,拉行情/持仓/余额,60s 轮询行情。 */
    function TradePanel() {
      var snap = useTbStore()
      var data = React.useState(null) // {market, account, status}
      var loadErr = React.useState(false)
      var jitterPrice = React.useState(null) // 展示层抖动价(1e12 报价格式),null=用真实价
      var view = snap.tradeView || null
      var load = React.useCallback(async function () {
        try {
          var results = await Promise.all([
            api('wordcoin-market', { buckets: TRADE_CHART_CANDLES * 5 }),
            api('wordcoin-account'),
            api('status'),
          ])
          var mk = results[0] && results[0].market
          if (mk && Number(mk.wc_per_mt) > 0) tradeWcPerMt = Number(mk.wc_per_mt)
          data[1]({ market: mk, account: results[1] && results[1].account, status: results[2] })
          loadErr[1](false)
        } catch (e) {
          loadErr[1](true)
        }
      }, [])
      React.useEffect(function () {
        var stopped = false
        load()
        var timer = window.setInterval(function () { if (!stopped) load() }, 60000)
        return function () { stopped = true; window.clearInterval(timer) }
      }, [load])
      // 活性抖动:行情每次刷新(成功或失败)重排一次定时器;真实数据到达即归零回锚。
      React.useEffect(function () {
        var chart = data[0] ? buildTradeChart(data[0].market) : null
        if (!chart || !chart.candles.length) return undefined
        var vis = chart.candles.slice(-5)
        var anchor = vis[vis.length - 1].c
        var lo = vis[0].lo, hi = vis[0].hi
        for (var i = 1; i < vis.length; i++) {
          if (vis[i].lo > lo) lo = vis[i].lo
          if (vis[i].hi < hi) hi = vis[i].hi
        }
        if (!(lo <= hi)) { lo = anchor * 0.997; hi = anchor * 1.003 }
        jitterPrice[1](null)
        var timer = null
        var arm = function () {
          timer = window.setTimeout(tick, TRADE_JITTER_MIN_DELAY_MS + Math.floor(Math.random() * (TRADE_JITTER_MAX_DELAY_MS - TRADE_JITTER_MIN_DELAY_MS)))
        }
        var tick = function () {
          if (document.visibilityState !== 'hidden') {
            var p = anchor + anchor * TRADE_JITTER_MAX_BAND * (Math.random() * 2 - 1)
            if (p < lo) p = lo
            if (p > hi) p = hi
            jitterPrice[1](p)
          }
          arm()
        }
        arm()
        return function () { window.clearTimeout(timer) }
      }, [data[0]])
      var close = function () { tbStore.set({ tradingOpen: false, tradeView: null }) }
      if (!snap.tradingOpen) return null
      var market = data[0] && data[0].market
      var account = data[0] && data[0].account
      var quote = market ? Number(market.quote_micros) : 0
      var curPrice = tradePx(quote)
      if (curPrice != null && jitterPrice[0] != null) curPrice = jitterPrice[0]
      // 较4小时前:取 4 小时窗口内最早蜡烛的开盘价
      var chartC = buildTradeChart(market)
      var openPrice = chartC && chartC.candles.length ? chartC.candles[0].o : null
      // 较均价基准:窗口收盘均价(与灰虚线同值)
      var avgBase = null
      if (chartC && chartC.candles.length) {
        var cSum = 0
        for (var ai = 0; ai < chartC.candles.length; ai++) cSum += chartC.candles[ai].c
        avgBase = cSum / chartC.candles.length
      }
      // 4 小时窗口内极值
      var hiPrice = null, loPrice = null
      if (chartC) for (var ci = 0; ci < chartC.candles.length; ci++) {
        if (hiPrice == null || chartC.candles[ci].hi > hiPrice) hiPrice = chartC.candles[ci].hi
        if (loPrice == null || chartC.candles[ci].lo < loPrice) loPrice = chartC.candles[ci].lo
      }
      var chg = curPrice != null && avgBase ? (curPrice - avgBase) / avgBase * 100 : null
      var up = chg != null && chg >= 0
      var tradingEnabled = !!(market && market.trading && market.trading.enabled)
      var tradingOpen = !!(account && account.limits && account.limits.trading_open) || (market && market.trading && market.trading.sample_gate_pass)
      var usdBalance = data[0] && data[0].status && data[0].status.account && Number(data[0].status.account.balance_nano_usd) || 0
      var balanceWc = account ? Number(account.balance_nano_wc) || 0 : 0
      // 盈亏按美元口径展示：市值 − 成本（与官网一致），正红负绿。
      var pnlUsd = account ? Number(account.pnl_nano_usd) || 0 : 0
      var pnlPct = account ? Number(account.pnl_percent_micros) / 1e4 : null
      var avgBuy = account ? tradeAvgPx(account.avg_buy_price_nano_usd_per_wc) : null
      var realized = account ? Number(account.realized_pnl_nano_usd) || 0 : null
      var pnlColor = pnlUsd > 0 ? '#d03050' : pnlUsd < 0 ? '#22a04a' : 'var(--dsw-alias-label-secondary, #888)'
      var realizedColor = realized > 0 ? '#d03050' : realized < 0 ? '#22a04a' : 'var(--dsw-alias-label-secondary, #888)'
      var statRow = function (label, value, valueStyle) {
        return h('div', { key: label, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 } },
          h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } }, label),
          h('span', { style: Object.assign({ fontSize: 13, fontVariantNumeric: 'tabular-nums' }, valueStyle || null) }, value))
      }
      var tradeCard = {
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10,
        background: 'var(--dsw-alias-bg-layer-1)', padding: '12px 16px',
      }
      return h('div', { style: { position: 'fixed', inset: 0, zIndex: 2200 } },
        h('div', { style: { position: 'fixed', inset: 0, zIndex: -1, background: 'rgba(0,0,0,0.35)' }, onClick: close }),
        h('div', {
          className: 'tb-trade-sheet',
          style: {
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 860, maxWidth: 'calc(100vw - 24px)', maxHeight: '88vh', overflow: 'auto',
            background: 'var(--dsw-menu-surface-fill)', backdropFilter: 'var(--dsw-menu-backdrop-filter)',
            WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
            color: 'var(--dsw-alias-label-primary)',
            borderRadius: 'var(--dsw-radius-md, 10px)', padding: 18,
            border: '1px solid var(--dsw-alias-border-l1)',
            boxShadow: 'var(--dsw-elevation-prominent)',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 } },
            h('span', { style: { fontWeight: 700, fontSize: 15 } }, pageT('tradingTitle')),
            h('button', { type: 'button', style: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--dsw-alias-label-secondary, #888)', padding: 2 }, onClick: close }, '✕')),
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)', marginBottom: 12 } }, pageT('tradingIntro')),
          !tradingEnabled ? h('div', { style: { marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: 'rgba(208,48,80,0.08)', color: '#d03050' } }, pageT('tradingClosed'))
            : !tradingOpen ? h('div', { style: { marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: 'rgba(178,106,0,0.08)', color: '#b26a00' } }, pageT('tradingCalibrating'))
            : null,
          // 价格卡 + 持仓卡
          h('div', { className: 'tb-trade-cols', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            h('div', { style: tradeCard },
              h('div', { style: { fontSize: 13, fontWeight: 700, marginBottom: 10 } }, pageT('priceNow')),
              h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
                h('span', { style: { fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }, curPrice != null ? fmtMtPerUsd(curPrice) : '—'),
                h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } }, TRADE_PRICE_UNIT)),
              h('div', { style: { fontSize: 13, marginTop: 4, color: chg == null ? 'var(--dsw-alias-label-secondary, #888)' : (up ? '#d03050' : '#22a04a'), fontWeight: 600 } },
                chg != null ? pageT('vsOpen') + ' ' + (up ? '+' : '') + tradeFmt(chg, 2) + '%' : '—'),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 } },
                // MT/$ 口径:数值越大词元越便宜,「高」= 词元价值空间的最小值(loPrice),与纵轴上小下大一致。
                [ [pageT('todayOpen'), openPrice], [pageT('todayHigh'), loPrice], [pageT('todayLow'), hiPrice] ].map(function (pair) {
                  return h('div', { key: pair[0] },
                    h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #888)', marginBottom: 2 } }, pair[0]),
                    h('div', { style: { fontSize: 13, fontVariantNumeric: 'tabular-nums' } }, pair[1] != null ? fmtMtPerUsd(pair[1]) + ' ' + TRADE_PRICE_UNIT : '—'))
                })),
            ),
            h('div', { style: tradeCard },
              h('div', { style: { fontSize: 13, fontWeight: 700, marginBottom: 10 } }, pageT('position')),
              h('div', { className: 'tb-trade-actions', style: { display: 'flex', gap: 16 } },
                h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 } },
                  h('div', { style: { fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } },
                    tradeMt(balanceWc), h('span', { style: { fontSize: 13, fontWeight: 400, marginLeft: 4, color: 'var(--dsw-alias-label-secondary, #888)' } }, TRADE_UNIT)),
                  // 与官网一致：始终带符号（零值显示 +$0.00），美元走 6 位小数避免小额盈亏被截断。
                  h('div', { style: { fontSize: 13, color: pnlColor, fontWeight: 600 } },
                    pageT('pnl') + ' ' + (pnlUsd < 0 ? '-' : '+') + tradeUsd6(Math.abs(pnlUsd)),
                    pnlPct != null ? ' (' + (pnlPct < 0 ? '-' : '+') + tradeFmt(Math.abs(pnlPct), 2) + '%)' : ''),
                  h('div', { className: 'tb-trade-actions', style: { display: 'flex', gap: 8 } },
                    h('button', {
                      type: 'button', disabled: !tradingEnabled,
                      style: Object.assign({}, primaryButtonStyle, { height: 30, padding: '0 18px', whiteSpace: 'nowrap', flex: 'none', opacity: tradingEnabled ? 1 : 0.5 }),
                      onClick: function () { tbStore.set({ tradeView: 'buy' }) },
                    }, pageT('buy')),
                    h('button', {
                      type: 'button', disabled: !tradingEnabled,
                      style: Object.assign({}, buttonStyle, { height: 30, padding: '0 18px', whiteSpace: 'nowrap', flex: 'none', opacity: tradingEnabled ? 1 : 0.5 }),
                      onClick: function () { tbStore.set({ tradeView: 'sell' }) },
                    }, pageT('sell')),
                    h('button', {
                      type: 'button', style: Object.assign({}, buttonStyle, { height: 30, padding: '0 14px', whiteSpace: 'nowrap', flex: 'none' }),
                      onClick: function () { tbStore.set({ tradeView: 'ledger' }) },
                    }, pageT('tradeRecords')))),
                h('div', { className: 'tb-trade-stats', style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 } },
                  statRow(pageT('avgBuyPrice'), fmtMtPerUsd(avgBuy) + ' ' + TRADE_PRICE_UNIT),
                  // 累计买卖直接用后端汇总的美元腿（同一笔买入/卖出实付实收，含手续费）
                  statRow(pageT('totalBought'), tradeUsd(account ? Number(account.total_bought_nano_usd) || 0 : 0)),
                  statRow(pageT('totalSold'), tradeUsd(account ? Number(account.total_sold_nano_usd) || 0 : 0)),
                  statRow(pageT('realizedPnl'), realized != null ? (realized > 0 ? '+' : realized < 0 ? '−' : '') + tradeUsd(Math.abs(realized)) : '—', { color: realizedColor })),
              ),
            ),
          ),
          // 实时行情卡
          h('div', { style: Object.assign({}, tradeCard, { marginTop: 12 }) },
            h('div', { style: { fontSize: 13, fontWeight: 700, marginBottom: 6 } }, pageT('marketTitle')),
            h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)', lineHeight: 1.6, marginBottom: 8 } }, pageT('priceFormula')),
            loadErr[0] ? h('button', { type: 'button', style: Object.assign({}, buttonStyle, { height: 26, fontSize: 12 }), onClick: load }, pageT('loadFail')) : null,
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 8px' } },
              h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)' } }, pageT('marketPriceBreakdown') + ' ' + TRADE_PRICE_UNIT),
              h('span', { style: { fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }, curPrice != null ? fmtMtPerUsd(curPrice) : '—'),
              h('span', { style: { flex: 1 } }),
              [[pageT('k5min'), '#6b7280'], [pageT('ma30m'), '#3b82f6'], [pageT('ma1h'), '#a855f7']].map(function (item) {
                return h('span', { key: item[0], style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)', marginLeft: 10 } },
                  h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: item[1], display: 'inline-block' } }), item[0])
              })),
            h(TradeChart, { chart: buildTradeChart(market), cur: curPrice, avgBuy: avgBuy }),
          ),
          view === 'buy' && market ? h(TradeBuyPanel, {
            market: market, account: account, usdBalance: usdBalance,
            onClose: function () { tbStore.set({ tradeView: null }) },
            onDone: function () { tbStore.set({ tradeView: null }); load() },
          }) : null,
          view === 'sell' && market ? h(TradeSellPanel, {
            market: market, account: account,
            onClose: function () { tbStore.set({ tradeView: null }) },
            onDone: function () { tbStore.set({ tradeView: null }); load() },
          }) : null,
          view === 'ledger' ? h(TradeLedgerPanel, {
            account: account,
            onClose: function () { tbStore.set({ tradeView: null }) },
          }) : null,
        ),
      )
    }

    /** 全局交易弹窗入口:只在 tradingOpen 时挂载 TradePanel(数据随开关重置)。 */
    function TradingOverlay() {
      var snap = useTbStore()
      if (!snap.tradingOpen || !runtimeCtx) return null
      return h(TradePanel, {})
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
      // 模型目录不再后台轮询:点击宿主模型选择器时按需同步(见 apply 里的 onModelTriggerClick)
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
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 } },
            h(TokenBankLogo, { size: 16, style: { position: 'relative', top: -1 } }),
            h('a', {
              href: portal, target: '_blank', rel: 'noopener noreferrer',
              style: { display: 'inline-flex', alignItems: 'center', cursor: 'pointer', textDecoration: 'none' },
              'aria-label': 'TokenBank',
            }, h('span', { className: 'tb-wordmark', style: { fontFamily: "'Frizon','FrizonLocal',sans-serif", fontSize: 17, fontWeight: 400, letterSpacing: 0.5, lineHeight: 1, color: '#111111', position: 'relative', top: -1, left: -1 } }, 'TOKENBANK')),
            // 标题右侧「推广赚$」小标签:打开推广弹窗(替代原外链按钮)
            h('button', {
              type: 'button',
              title: pageT('promoTitle'), 'aria-label': pageT('promoTitle'),
              style: { display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 5px', marginLeft: 0, position: 'relative', top: 0, borderRadius: 5, border: 'none', cursor: 'pointer', background: 'rgba(255,79,31,0.10)', color: '#ff4f1f', fontSize: 10, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' },
              onClick: function () { tbStore.set({ authOpen: false, promoOpen: true }) },
            }, pageT('promoTag')),
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
                  h(EditableNickname, {
                    name: (data.user && (data.user.display_name || data.user.name)) || '',
                    email: data.email || '',
                  }),
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
                                        // 签到完成后按钮原位变成「交易」:点击打开全局交易弹窗(百万词元)
                    data && data.loggedIn ? h('button', {
                      type: 'button', 'aria-label': pageT('depositManageTip'),
                      style: Object.assign({}, buttonStyle, { height: 26, padding: '0 12px', fontSize: 12, borderColor: 'var(--dsw-alias-border-l2, #c9ccd1)', marginLeft: 'auto' }),
                      onClick: function () {
                        tbStore.set({ authOpen: false, depositOpen: true })
                      },
                    }, pageT('depositManage')) : null,
                    checkin[0].done
                      ? h('button', {
                          type: 'button',
                          style: Object.assign({}, primaryButtonStyle, { height: 26, padding: '0 12px', fontSize: 12, justifyContent: 'center' }),
                          onClick: function () { tbStore.set({ authOpen: false, tradingOpen: true, tradeView: null }) },
                        }, pageT('trade'))
                      : h('button', {
                      type: 'button', disabled: checkin[0].busy,
                      style: Object.assign({}, primaryButtonStyle, { height: 26, padding: '0 12px', fontSize: 12, justifyContent: 'center', marginLeft: 'auto' }),
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
                    }, checkin[0].busy ? pageT('checkin') + '…' : pageT('checkin')),

                  ),
                ),
                // 注册解锁奖励提示：$2 待解锁，点击打开托管面板（充值，或托管 Key 首次调用成功即可解锁）
                data.account && Number(data.account.pending_unlock_nano_usd) > 0
                  ? h('button', {
                      type: 'button',
                      style: {
                        display: 'block', width: '100%', textAlign: 'left', margin: 0,
                        padding: '7px 9px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
                        color: '#b8860b', background: 'rgba(255,193,7,0.12)',
                        border: 'none', cursor: 'pointer',
                      },
                      onClick: function () { tbStore.set({ authOpen: false, depositOpen: true }) },
                    }, pageT('pendingUnlock').replace('{amount}', '$' + (Number(data.account.pending_unlock_nano_usd) / 1e9).toFixed(2)))
                  : null,
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
                    // 登录后仅此一处同步模型(原先 BalancePill/ComposerEntry 的登录跃迁同步已合并到这里);
                    // 成功后记录已同步,点击选择器的节流窗口从此刻起算
                    var res = await syncModelsFromGateway()
                    if (res) {
                      modelSyncState.lastAt = Date.now(); modelSyncState.lastCount = res.count
                      tbStore.set({ notify: { kind: 'success', title: pageT('modelLinked').replace('{n}', String(res.count)), detail: '' } })
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

      var submit = React.useCallback(async function (groupId) {
        busy[1](true)
        try {
          var body = { ref: credentialRef() }
          if (groupId != null) body.groupId = Number(groupId) // 不带时服务端逐分组探活自动选
          var res = await api('deposit-configured', body)
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
          if (depositedRef.current != null) cancel(); else openGroupPicker(btn, function (gid) { submit(gid) })
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
     * 读 llm-pi-ai 命名空间的当前视图。settings.describe().namespaces 运行时是
     * **数组**(每项 { ns, value, revision, … };官方 ui-settings-models 用 Map 按 ns 取),
     * 之前按字符串下标取恒为 undefined → revision 一直是 undefined(等于无条件写)。
     */
    async function readModelNamespaceView(ctx) {
      const describe = await ctx.remote.settings.describe()
      const list = Array.isArray(describe?.namespaces) ? describe.namespaces : []
      const view = list.find(function (v) { return v && v.ns === MODEL_NS })
      return view && typeof view.revision === 'number' ? view : null
    }

    /** 只比较我们自己写入的字段(value 是「解析后」的值,可能带 schema 默认字段,不能整体 JSON 比)。 */
    function sameProviderProfile(a, b) {
      if (!a || !b) return false
      return a.displayName === b.displayName
        && a.apiKeyEnv === b.apiKeyEnv
        && a.api === b.api
        && a.baseURL === b.baseURL
        && JSON.stringify(a.models || []) === JSON.stringify(b.models || [])
    }

    /**
     * Mirror CustomProviderCard: store the credential reference, then set
     * providers.tokenbank fenced on the revision we just read. 与已存 profile
     * 完全一致时跳过 settings 写入(避免每次点击选择器都 bump revision 并触发
     * 一次宿主模型目录刷新)。Returns { ok, changed, count, conflict? }.
     */
    async function addProviderToModels(ctx, baseURL, models) {
      if (!models.accessKey) throw new Error('credentials.set: empty access key (gateway-models response lost the key field?)')
      // typed gateway 契约:credentials/set 就是两个位置参数 (ref, value)
      // (packages/api/remotes/lib/client.js zod: parameter_0=ref, parameter_1=value)
      // 每次都写:credentials 读路径不回传明文,无法 diff;一次写只触发一次目录刷新,代价可接受,
      // 且能自愈被用户在设置页删掉的引用。
      const stored = await ctx.remote.credentials.set(KEY_REF, models.accessKey)
      if (stored && stored.ok === false) throw new Error(stored.error?.message || 'failed to store key')

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
      const existing = await readModelNamespaceView(ctx)
      const current = existing ? existing.value?.providers?.[MODEL_ROUTE] : undefined
      if (sameProviderProfile(current, profile)) return { ok: true, changed: false, count: entries.length }
      const response = await ctx.remote.settings.mutate(MODEL_NS,
        [{ op: 'set', path: ['providers', MODEL_ROUTE], value: profile }], existing ? existing.revision : undefined)
      if (response && response.ok === false) {
        if (response.error?.code === 'settings/conflict') return { ok: false, conflict: true }
        throw new Error(response.error?.message || 'settings write refused')
      }
      return { ok: true, changed: true, count: entries.length }
    }

    /**
     * 拉一次网关模型目录并写入 provider(status → gateway-models → addProviderToModels)。
     * 未登录(status 无 accessKey)返回 null。返回 { count, changed, conflict }。
     * 登录流程、手动「获取模型」、点击选择器三条路径共用。
     */
    async function syncModelsFromGateway() {
      if (!runtimeCtx || !runtimeCtx.remote || !runtimeCtx.remote.settings) return null
      const fresh = await api('status')
      if (!fresh || !fresh.accessKey) return null
      const models = await api('gateway-models', { accessKey: fresh.accessKey })
      const list = Array.isArray(models) ? models : (models?.models || models?.list || [])
      const res = await addProviderToModels(runtimeCtx, fresh.baseURL || fresh.portalUrl || 'https://bank.skillpie.cn',
        { accessKey: fresh.accessKey, list: list, protocol: models && models.protocol })
      return { count: list.length, changed: Boolean(res && res.changed), conflict: Boolean(res && res.conflict) }
    }

    /* ── 点击宿主模型选择器 → 节流同步一次 ─────────────────────────────────
     * 宿主 ModelDirectoryResolver 订阅 settings/document-updated 等事件后会
     * catalog.refresh(),菜单打开期间列表会原地补齐,所以点击时拉最新即可取代
     * 后台 30 分钟轮询。节流 5 分钟,避免反复开关选择器时每次都打网关。 */
    var MODEL_TRIGGER_RE = /选择模型|Select model|加载模型|Loading models/
    var MODEL_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000
    var modelSyncState = { lastAt: 0, lastCount: null, inflight: false }

    function onModelTriggerClick(ev) {
      try {
        var target = ev && ev.target
        var el = target && typeof target.closest === 'function' ? target.closest('button[aria-haspopup="menu"]') : null
        if (!el || !MODEL_TRIGGER_RE.test(el.getAttribute('aria-label') || '')) return
        // 未登录态点击:一个请求都不发(本地登录态由各组件挂载/登录流程写入 tbStore)
        var snap = tbStore.get()
        if (!snap || !snap.loggedIn) return
        var now = Date.now()
        if (modelSyncState.inflight || (modelSyncState.lastAt && now - modelSyncState.lastAt < MODEL_SYNC_MIN_INTERVAL_MS)) return
        modelSyncState.inflight = true
        syncModelsFromGateway().then(function (res) {
          modelSyncState.inflight = false
          if (!res) return // 未登录:不记时间,登录后首次点击照常同步
          modelSyncState.lastAt = Date.now()
          var prev = modelSyncState.lastCount
          modelSyncState.lastCount = res.count
          // 静默刷新;仅模型数量变化时提示(首次由登录流程提示,这里 prev 为 null 不弹)
          if (prev != null && prev !== res.count) {
            tbStore.set({ notify: { kind: 'success', title: pageT('modelListUpdated').replace('{n}', String(res.count)), detail: '' } })
          }
        }).catch(function (e) {
          modelSyncState.inflight = false
          console.warn('[dsh-tokenbank] click sync models failed:', String(e && e.message || e))
        })
      } catch (e) { /* document 监听器内异常不能冒泡到宿主 */ }
    }

    /** 退出登录:从模型列表移除 TokenBank provider(尽力而为,失败不阻塞登出)。 */
    async function removeProviderFromModels(ctx) {
      try {
        const existing = await readModelNamespaceView(ctx)
        const revision = existing ? existing.revision : undefined
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
      // 注册模式：账号 + 固定域名下拉（与官网注册框一致，后端白名单强制校验）
      var registerEmailDomains = ['qq.com', '163.com', 'gmail.com', 'outlook.com', '126.com']
      var emailLocal = React.useState('')
      var emailDomain = React.useState(registerEmailDomains[0])
      var fullEmail = mode === 'register' ? (emailLocal[0].trim() + '@' + emailDomain[0]) : email[0]
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
              email: fullEmail, code: code[0], password: password[0],
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
          // 注册风控拒绝原因在 msg 尾部（服务端以 "(reason=xxx)" 形式附带），
          // 优先映射为友好文案，其余 validation 错误才回退为验证码无效。
          if (/plus_tag_blocked/.test(msg)) msg = t('plusTagBlocked')
          else if (/base_email_taken/.test(msg)) msg = t('baseEmailTaken')
          else if (/rate_limited|rate limit/i.test(msg)) msg = t('registerRateLimited')
          else if (mode === 'register' && /validation/i.test(msg)) msg = t('codeInvalid')
          error[1](msg)
          if (mode === 'login') refreshCaptcha()
        } finally {
          busy[1](false)
        }
      }, [mode, email, emailLocal, emailDomain, password, displayName, code, captchaId, captchaCode, savePassword, onAuthed, refreshCaptcha])

      return h('div', { style: cardStyle },
        h('div', {
          style: {
            display: 'flex', width: '100%', padding: 3, borderRadius: 999, gap: 2, boxSizing: 'border-box',
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
          mode === 'register'
            ? h('div', { style: { display: 'flex', alignItems: 'center', height: 30, padding: '0 10px', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 7, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', boxSizing: 'border-box', width: '100%' } },
                h('input', { style: { flex: '1 1 60%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, padding: 0 }, type: 'text', placeholder: '账号', value: emailLocal[0], onChange: function (e) { emailLocal[1](e.target.value) } }),
                h('span', { style: { alignSelf: 'stretch', width: 1, margin: '0 8px', background: 'var(--dsw-alias-border-l1)' } }),
                h('select', { style: { flex: '0 0 auto', border: 'none', outline: 'none', background: 'transparent', fontSize: 13, cursor: 'pointer', padding: 0, margin: 0, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }, value: emailDomain[0], onChange: function (e) { emailDomain[1](e.target.value) } },
                  registerEmailDomains.map(function (domain) {
                    return h('option', { key: domain, value: domain }, '@' + domain)
                  })))
            : h('input', { style: inputStyle, type: 'email', value: email[0], onChange: function (e) { email[1](e.target.value) } })),
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
                    await api('send-code', { email: fullEmail })
                    sent[1](true)
                    var mailUrl = mailHomeUrl(fullEmail)
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

    // ======================================================================
    // 注入在 factory(require) 内,可用 factory 的 require 取 react;
    // apply 末尾通过 window.__DSH_FEATURED_INIT__(ctx) 注册 tab。
    // ======================================================================
// >>> dsh-featured inline (auto-inserted, do not remove markers)
// 精选插件 client 内联模块(由 dsh-featured 的 integrate.sh 自动插入)。
// 这是一段"函数体片段",由 integrate.sh 注入到接入插件 lib/client.js 的
// factory(require) 内部(MARK 之间的内容),因此可以直接用 factory 的 require
// 拿 react,并暴露 window.__DSH_FEATURED_INIT__(ctx) 供 apply 末尾调用。
//
// 为什么不用 DSH 的 require.async 包本地 chunk:chunk URL 必须与 bundle 的
// ?rev= 精确匹配,一旦接入包自己的 bundle 加载失败(如 dsh-app:// 404),
// chunk 永远到不了;内联后 tab 跟随接入插件自己的 bundle,零额外请求。
// 注意:本片段绝不能放到 factory 之外 —— 那样 require 会落到 Node 全局。
//
// 本片段只做「极简入口」:注册精选插件 tab,点开自动安装完整版 dsh-featured,
// 装完由它接管完整功能。卡片/详情/搜索/筛选/申请收录等重逻辑都不在此,
// 全部交给 dsh-featured,这样接入插件只需背上极小的一段代码。
;(function () {
  window.__FEATURED_FACTORY_RAN__ = true
  try {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-plugins-plugin'
    const FULL_PKG = 'dsh-featured'

    const zh = {
      tabLabel: '精选插件',
      welcome: '精选插件完整版(dsh-featured)未安装。',
      installFull: '安装完整版',
      installing: '正在安装完整版…',
      installed: '已安装,刷新后即可使用完整功能。',
      installedShort: '已安装',
      desc: '一个入口逛完社区精选的好插件:搜索、标签筛选、一键安装、README 详情。',
    }
    const en = {
      tabLabel: 'Featured',
      welcome: 'The full Featured plugin (dsh-featured) is not installed.',
      installFull: 'Install full version',
      installing: 'Installing…',
      installed: 'Installed — refresh to use the full experience.',
      installedShort: 'Installed',
      desc: 'One tab for community-featured plugins: search, filter, one-click install, README details.',
    }

    const S = {
      wrap: { padding: '24px 16px', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 },
      title: { fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--dsw-alias-label-primary)' },
      desc: { fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--dsw-alias-label-secondary)' },
      note: { fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--dsw-alias-label-primary)' },
      btn: {
        alignSelf: 'flex-start', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 500,
        padding: '7px 16px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-brand-primary)', color: '#fff',
      },
      btnOff: { opacity: 0.6, cursor: 'default' },
    }

    function FeaturedSection(props) {
      const install = props.install
      const t = props.t || ((k) => zh[k])
      // 已安装判定:宿主路由返回的 installed 表里有 FULL_PKG
      const pair = React.useState('idle') // idle | running | installed
      const st = pair[0], setSt = pair[1]

      React.useEffect(() => {
        if (st !== 'idle') return
        if (typeof install !== 'function') { setSt('installed'); return }
        setSt('running')
        try {
          install({ spec: FULL_PKG, title: t('tabLabel'), version: '' })
          setSt('installed')
        } catch {
          setSt('installed')
        }
      }, [st, install])

      const label = st === 'running' ? t('installing')
        : (st === 'installed' ? t('installedShort') : t('installFull'))

      return h('div', { style: S.wrap },
        h('p', { style: S.desc }, t('desc')),
        st === 'idle' ? h('p', { style: S.note }, t('welcome')) : null,
        h('button', {
          type: 'button',
          style: Object.assign({}, S.btn, st === 'installed' ? S.btnOff : {}),
          disabled: st === 'installed',
          onClick: () => {
            if (st !== 'idle' || typeof install !== 'function') return
            setSt('running')
            try { install({ spec: FULL_PKG, title: t('tabLabel'), version: '' }); setSt('installed') }
            catch { setSt('installed') }
          },
        }, label))
    }

    function initFeatured(ctx) {
      if (typeof window !== 'undefined') window.__FEATURED_INIT_CALLED__ = true
      if (typeof window !== 'undefined' && window.__DSH_FEATURED_APPLIED__) return
      if (typeof window !== 'undefined') window.__DSH_FEATURED_APPLIED__ = true
      if (typeof window !== 'undefined' && window.__DSH_FEATURED_FULL__) {
        // 全量版(dsh-featured 插件)已加载:让位,不注册内联板块,避免双 tab 竞态
        return
      }
      try {
        const localeDisposable = ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugins-plugin: locale')
        const t = ctx.locale.bind(NS)
        let tabDisposable = null
        ctx.slots.inject('plugins.tab', () => {
          tabDisposable = ctx.slots.register({
            name: 'plugins.tab',
            id: 'dsh-plugins-plugin',
            label: () => t('tabLabel'),
            locale: NS,
            priority: 100,
          }, FeaturedSection)
          return tabDisposable
        }, 'dsh-plugins-plugin: featured tab')

        if (typeof window !== 'undefined') {
          window.__DSH_FEATURED_ENTRY__ = {
            kind: 'inline',
            dispose() {
              try { if (typeof tabDisposable === 'function') tabDisposable() } catch { /* 已注销 */ }
              try { if (typeof localeDisposable === 'function') localeDisposable() } catch { /* 已注销 */ }
              window.__DSH_FEATURED_APPLIED__ = false
              window.__DSH_FEATURED_ENTRY__ = null
            },
          }
          window.__FEATURED_OK__ = true
        }
      } catch (e) {
        if (typeof window !== 'undefined') window.__FEATURED_ERR__ = String(e && (e.stack || e.message || e))
      }
    }

    window.__DSH_FEATURED_INIT__ = initFeatured
  } catch (error) {
    console.error('[精选插件] 模块初始化失败', error)
    window.__FEATURED_ERR__ = String((error && (error.stack || error.message)) || error)
  }
})()
// <<< dsh-featured inline
    return {
      name: 'dsh-tokenbank',
      // 'remote' 是宿主服务名(remote.settings/remote.credentials 挂在它下面);
      // 只写子路径会报 cannot get property "remote" without inject
      inject: ['slots', 'locale', 'remote', 'remote.settings', 'remote.credentials'],
      apply: function (ctx) {
      // Frizon 子集字体(@font-face);颜色用 currentColor,暗色模式自动反白
      if (typeof document !== 'undefined' && document.head) {
        var wmCss = document.createElement('style')
        wmCss.textContent = "@font-face{font-family:'FrizonLocal';src:url(data:font/woff;base64," + FRIZON_WOFF + ") format('woff')}body[data-ds-dark-theme] .tb-wordmark{color:#ffffff!important}.tb-wordmark{transition:color .15s ease}a:hover .tb-wordmark{color:#2f6bff!important}"
        document.head.appendChild(wmCss)
        // 余额 pill 登录闪烁 5s 提示可点击
        var flashCss = document.createElement('style')
        flashCss.textContent = '.tb-balance-flash{color:#ff7a3d!important;box-shadow:inset 0 0 0 1px #ff7a3d}#tb-entry-btn{border-radius:var(--dsw-radius-sm, 8px)}#tb-entry-btn:hover,#tb-entry-btn.tb-balance-open{background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.08))!important;color:var(--dsw-alias-label-secondary, #888)!important}@keyframes tb-logo-breathe{0%,100%{opacity:1}50%{opacity:.55}}'
        document.head.appendChild(flashCss)
        ctx.effect(function () {
          return function () { if (flashCss.parentNode) flashCss.parentNode.removeChild(flashCss) }
        }, 'dsh-tokenbank: balance flash style')
        // 入口按钮 hover 形态:灰底 + 箭头反转(与模型选择器 hover 一致)
        var entryCss = document.createElement('style')
        entryCss.textContent = '@keyframes tb-balance-gain{0%{opacity:0;transform:translateY(4px)}25%{opacity:1;transform:translateY(0)}75%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}' + '.tb-entry-open .tb-entry-chevron{transition:transform .15s ease;transform:rotate(180deg)}' + '@media (max-width:600px){.tb-entry-bal{display:none!important}}' + '@media (max-width:640px){.tb-trade-cols{grid-template-columns:1fr!important}.tb-trade-actions{flex-wrap:wrap}.tb-trade-stats{min-width:0!important}.tb-trade-sheet{max-width:calc(100vw - 16px)!important;padding:14px!important}.tb-trade-scroll{margin:0 -14px;padding:0 14px}}'
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

        // 点击宿主模型选择器(捕获阶段,先于 React 的 show())→ 节流同步一次最新模型目录;
        // 宿主订阅 settings/document-updated 后会原地刷新已打开的菜单。dispose 时移除监听。
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('click', onModelTriggerClick, true)
          ctx.effect(function () {
            return function () {
              modelSyncState.inflight = false
              document.removeEventListener('click', onModelTriggerClick, true)
            }
          }, 'dsh-tokenbank: model picker click sync')
        }

        // 输入框工具行、模型选择器左侧的紧凑入口按钮(弹账户/注册窗;登录态展示 LOGO+余额)
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
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-tokenbank-trading',
            locale: NS,
          }, TradingOverlay)
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-tokenbank-promo',
            locale: NS,
          }, PromoOverlay)
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
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // 精选插件
        // 调试句柄:无头验证/排障用,直接驱动全局状态(弹窗等)
        if (typeof window !== 'undefined') window.__TB__ = { openDeposit: function () { tbStore.set({ depositOpen: true }) }, store: tbStore }
      },
    }
  },
})
