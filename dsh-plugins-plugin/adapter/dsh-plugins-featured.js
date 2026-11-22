// dsh-plugins-plugin — 接入适配器(由 integrate.sh 拷贝进目标插件的 lib/)。
//
// 目标插件只须在 lib/index.js 里:
//   import { integrateFeaturedPlugins } from './dsh-plugins-featured.js'
//   const FEATURED_SOURCE = { id: '<本插件包名>', title: '<推荐来源显示名>',
//     entries: [ { package: 'dsh-xxx', title: 'xxx', description: '…',
//                  version: '1.2.3', tags: ['效率'] }, … ] }
// 并在默认导出的 apply(ctx) 开头调用:
//   integrateFeaturedPlugins(ctx, FEATURED_SOURCE)
//
// 行为:向 dsh-plugins-plugin 提供的 cordis 服务 `featured-plugins` 注入子
// 上下文并登记推荐源;dsh-plugins-plugin 未安装时注入永远 pending(无害),
// 本插件停用时经 child.effect 自动注销。
//
// source.id 必填(建议即本插件包名,重复登记以最后一次为准);
// entry.package/title 必填,description/version/icon/homepage/tags 可选。
export function integrateFeaturedPlugins(ctx, source) {
  ctx.inject(['featured-plugins'], (child) => {
    const service = child['featured-plugins']
    if (!service || typeof service.register !== 'function') return
    child.effect(() => service.register(source), 'featured-plugins source: ' + String(source?.id || 'unknown'))
  }, 'integrateFeaturedPlugins')
}

export default { integrateFeaturedPlugins }
