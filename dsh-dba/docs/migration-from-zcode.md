# dsh-dba 可从 ZCode DB 工具迁移的优点(插件侧改造清单)

对比对象:
- ZCode:`ZCodeOnline/apps/zcode-cli/packages/core/src/tool/handlers/db/`(driver / db-query / db-execute / db-schema / db-export / store)+ `packages/shared/src/dataSource.ts`
- 本插件:`lib/drivers.js`、`lib/service.js`、`lib/index.js`

约束:**只改 dsh-dba 插件,不改 DSH 宿主源码**。依赖宿主扩展点的项标注了可行路径或明确放弃。

## P0 — 安全与正确性(低成本高收益)

### 1. UPDATE/DELETE 强制带 WHERE
- ZCode 现状:仅写在 modelInstructions 里(软约束,db-execute.ts:64)。
- 本插件现状:无任何校验,`db_execute` 一条无 WHERE 的 UPDATE 会直接全表生效。
- 迁移:在 `service.js` `execute()` 里硬校验——`stripSqlNoise` 后正则判定
  `^(update|delete)\b` 且不含 `\bwhere\b` 时拒绝,报错引导补 WHERE;
  可留 `allowFullTable: true` 入参显式豁免。约 15 行。

### 2. 连接错误翻译(describeDataSourceConnectError)
- ZCode:`packages/shared/src/dataSource.ts:189`,纯函数,把 ETIMEDOUT /
  ECONNREFUSED / ENOTFOUND / EHOSTUNREACH / 认证失败等翻译成带排查指引的
  中文消息,始终附原始错误。背景:库地址常在 VPN/内网后,裸报错无从下手。
- 本插件现状:drivers.js 直接透传驱动原始错误。
- 迁移:整函数搬进 `drivers.js`,`openMysql`/`openPostgres` 的连接建立阶段
  catch 后套用(SQL 执行阶段错误不套)。纯函数零依赖,直接复制。

### 3. 写操作用户确认门(替代 confirm: true 自证)
- ZCode:DBExecute 声明 `alwaysAsk: true`,任何权限模式(含 yolo)写操作都弹
  用户确认,只读数据源在确认之前就直接拒绝(db-execute.ts:31-56)。
- 本插件现状:`db_execute` 靠模型自设 `confirm: true`,没有任何宿主级拦截。
- 迁移路径(不改 DSH 源码,二选一):
  a. 首选:DSH tools 管线支持 `tools/pre-execute` 事件返回 `{kind:'ask'}`
     (packages/core/tools/src/contracts.ts:361,需用户批准后才执行)与
     `ctx.tools.guard()`;验证插件可注册该监听后,对 `db_execute` 挂 ask 门。
  b. 兜底(纯插件方案):GUI 面板加「允许本次写入」按钮,签发一次性/会话级
     写入票据(存 `credentials` 记录),`db_execute` 校验票据,无票据拒绝。
- 同时保留现状:连接 readOnly / 配置 allowWrite:false 的前置拒绝。

### 4. 多语句批执行 + 单事务整批回滚(executeBatch)
- ZCode:driver.ts `splitSqlStatements`(引号感知的语句拆分器,28-81 行)+
  写语句统一包 BEGIN/COMMIT,任一条失败整批 ROLLBACK,逐条回传结果。
- 本插件现状:query/execute 都强制单语句;多步写(如转账两条 UPDATE)可能
  半程生效,无原子性。
- 迁移:`splitSqlStatements` 搬入 drivers.js;`service.js` `execute()` 支持
  多条语句:有写语句时开事务,失败回滚并在结果里标注失败语句;
  `db_query` 维持单语句只读不变。SQLite 用 `db.exec('BEGIN')` 即可。

## P1 — 体验与效率

### 5. 查询超时
- ZCode:mysql2 query 带 `timeout: 60_000`(driver.ts:154)。
- 本插件现状:只有连接超时 8s 和 ping 6s,SQL 本身可无限跑,占死连接池
  (池上限只有 2)。
- 迁移:mysql2 传 `timeout`;pg 连接后 `SET statement_timeout = '60s'`;
  SQLite node:sqlite 暂无语句超时,可忽略。

### 6. 表/列注释 + 关键词搜索
- ZCode:schema 快照带中文注释,DBSchema 支持 keyword 过滤、精确表名未命中
  自动回退包含匹配帮助模型纠错(db-schema.ts:58-73)。
- 本插件现状:MySQL `SHOW FULL COLUMNS` 已经取回 `Comment` 字段但
  **丢弃了没进返回值**;listTables 也不取注释;无 keyword 参数。
- 迁移:describeTable 带上 column comment、listTables 带上 table comment
  (MySQL:`information_schema.tables.TABLE_COMMENT`;PG:`obj_description`;
  SQLite 无原生注释跳过);`db_describe_schema` 加 `keyword` 参数与包含匹配
  回退。

### 7. 工具描述吸收 ZCode 实测经验
- ZCode modelInstructions(db-query.ts:50-59)有实测调优结论:聚合查询直接
  跑、别先查 information_schema 估行数;预期超默认行数的分组聚合首查就传
  上限。
- 迁移:把这些指引并入本插件 `db_query` 的 description 文本(插件侧无
  modelInstructions 通道,写进 description 同样生效)。

## P2 — 功能补齐

### 8. 导出能力(DBExport:DDL / DML / CSV)
- ZCode:db-export.ts 全套——DDL(SHOW CREATE TABLE + DROP IF EXISTS +
  外键开关)、DML(逐表 INSERT,Buffer/Date/JSON 字面量转义齐全)、CSV
  (RFC 4180 + UTF-8 BOM,Excel 直接开中文不乱码)、where 过滤片段安全校验
  (assertSafeWhereCondition:引号感知,拒分号/注释/INTO OUTFILE/FOR UPDATE)、
  逐表落盘 + 空表跳过报告。仅 MySQL。
- 本插件现状:完全没有导出。
- 迁移(插件内两形态):
  a. GUI:HTTP API 加 `export` action,面板表格视图加 CSV/JSON 下载
     (当前 rows 已可取,客户端即可生成;大表走服务端落盘到工作区)。
  b. agent 工具:新增 `db_export`(对齐 ZCode 语义,默认写 `sql/export/`,
     文件写入属工作区副作用)。
  - `assertSafeWhereCondition`、`toSqlLiteral`、`toCsv` 三个纯函数可直接搬。

### 9. 新连接默认只读
- ZCode:`normalizeDataSourceInput` 新数据源默认 `readOnly: true`,写能力需
  显式开启(dataSource.ts:160-165)。
- 本插件现状:store.js:64 默认 `false`(可写)。
- 迁移:把新建连接默认改为只读。属行为变更:已有连接不受影响(仅 existing
  为空时的缺省值),建议改。

### 10. 查数手册(notes)适配版
- ZCode:每数据源一份人工维护的 markdown 口径/陷阱文档(租户过滤、单号
  规则、统计陷阱),随表清单注入上下文(data-source-schema-reminder.ts)。
- 完整形态依赖宿主注入通道,**不改 DSH 源码做不了**。
- 适配版:连接对象加 `notes` 字段(或 dbaHome 下 notes/<id>.md),
  `db_describe_schema` 列表模式返回时附带;GUI 连接编辑框加手册编辑。
  模型需一次工具调用获取,省不掉往返但知识能带上。

## 不迁移(依赖改 DSH 宿主,按约束放弃)

- **表清单上下文注入(schema reminder)**:绑定数据源时把表清单作为
  system reminder 注入会话流,省首次列表往返。宿主内部机制,插件无注入面。
  替代:见第 6/7 条,把单次列表调用做便宜 + 描述引导。
- **未绑定数据源时对模型隐藏 DB 工具**(conversationDbToolGate):省
  system prompt token。DSH 的 ToolRestriction 是宿主侧按 scope 裁决,插件
  不可达;本插件「调用时报错引导」的形态可接受。

## 已对齐无需迁

- 只读 SQL 防注释伪装:本插件 `isReadOnlySql`(前缀白名单 + 危险词黑名单 +
  PRAGMA 赋值拦截)比 ZCode 的前缀判断更强。
- 密码脱敏:两边都做到浏览器/模型永不拿到明文。
- 会话级连接授权边界:本插件的会话多选 + `assertSessionConnection` 与 ZCode
  的会话绑定同义,且多选能力更强。
- 失败连接自愈:sessionStatus 会丢弃失败适配器下次重连(ZCode 短连接天然
  无此问题)。
