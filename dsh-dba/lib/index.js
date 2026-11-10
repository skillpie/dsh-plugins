/**
 * dsh-dba — Cordis entry (host half).
 *
 * Exposes two independent surfaces, both optional so a headless or non-HTTP
 * assembly still gets the other:
 *
 *   - `POST /dsh-dba/api` for the browser panel (overview, CRUD, rows,
 *     SQL).
 *   - model-facing tools `db_list_connections`, `db_describe_schema`,
 *     `db_query`, `db_execute`.
 *
 * The database work lives in `service.js`; this file only wires transports,
 * config and disposal. Host packages (`@deepseek-ai/dsh-tools`, `webServer`)
 * are probed through `optionalHostImport`, the same pattern dsh-bill uses, so
 * a `link:`ed checkout resolves them from the harness entry point.
 *
 * @module dsh-dba
 */

import { createDba, DEFAULT_CONFIG } from './service.js'

const ROUTE = '/dsh-dba/api'
const MAX_BODY = 4 * 1024 * 1024

/** One issue in the Standard Schema config vocabulary. */
const issue = (message, ...path) => ({ message, path: path.length ? path : undefined })

/**
 * Plugin config as a Standard Schema.
 *
 * Defaults are materialized here, before the fiber starts, so `apply` always
 * receives a complete object and a typo is refused with its path named.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-dba',
    validate(input) {
      if (input === undefined || input === null) return { value: { ...DEFAULT_CONFIG } }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [issue('expected an object')] }
      const issues = []
      const value = {}
      const booleans = ['demo', 'allowWrite', 'agentTools', 'agentWriteApproval']
      for (const key of booleans) {
        const raw = input[key]
        if (raw === undefined) value[key] = DEFAULT_CONFIG[key]
        else if (typeof raw !== 'boolean') issues.push(issue('expected a boolean', key))
        else value[key] = raw
      }
      const maxRows = input.maxRows
      if (maxRows === undefined) value.maxRows = DEFAULT_CONFIG.maxRows
      else if (typeof maxRows !== 'number' || !Number.isInteger(maxRows) || maxRows <= 0) issues.push(issue('expected a positive integer', 'maxRows'))
      else value.maxRows = maxRows
      const { dshHome } = input
      if (dshHome !== undefined) {
        if (typeof dshHome !== 'string' || !dshHome.trim()) issues.push(issue('expected a non-empty path', 'dshHome'))
        else value.dshHome = dshHome
      }
      return issues.length ? { issues } : { value }
    },
  },
}

/** Import a package that exists only inside the harness graph. */
async function optionalHostImport(specifier) {
  try {
    return await import(specifier)
  } catch {
    const entry = process.argv[1]
    if (typeof entry !== 'string' || entry === '') return null
    try {
      const { createRequire } = await import('node:module')
      const { pathToFileURL } = await import('node:url')
      const resolved = createRequire(entry).resolve(specifier)
      return await import(pathToFileURL(resolved).href)
    } catch {
      return null
    }
  }
}

/** Read a small JSON body. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY) {
        req.destroy()
        reject(new Error('请求体过大 / request body too large'))
      }
    })
    req.on('end', () => {
      if (!data.trim()) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new Error('请求体不是合法 JSON / invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/** Format a cell for a markdown table. */
function cell(value) {
  if (value === null || value === undefined) return 'NULL'
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (text === '') return ' '
  text = text.replaceAll('|', '\\|').replaceAll('\n', ' ')
  return text.length > 120 ? text.slice(0, 117) + '...' : text
}

/** Render columns/rows as a markdown table, capped for the transcript. */
function markdownTable(columns, rows, maxRows = 20) {
  const cols = Array.isArray(columns) && columns.length ? columns : Object.keys(rows?.[0] ?? {})
  if (cols.length === 0 || !rows?.length) return ''
  const head = `| ${cols.map((name) => String(name).replaceAll('|', '\\|')).join(' | ')} |`
  const sep = `| ${cols.map(() => '---').join(' | ')} |`
  const body = rows.slice(0, maxRows).map((row) => `| ${cols.map((name) => cell(row?.[name])).join(' | ')} |`)
  const more = rows.length > maxRows ? `\n_… 还有 ${rows.length - maxRows} 行未显示_` : ''
  return [head, sep, ...body].join('\n') + more
}

/** The calling Session, when a tool was invoked from an agent turn. */
function sessionOf(exec) {
  const session = exec?.agent?.session
  return session === undefined ? null : { id: session.id, cwd: session.header?.cwd }
}

/**
 * Resolve a connection id for a tool call.
 *
 * The conversation's selection is the authorization boundary: a Session with
 * no databases selected is refused outright, and an explicit connectionId
 * outside the selection is refused too. Only the IDE-side panel (no Session)
 * sees every connection.
 */
async function resolveConnectionId(dba, requested, session) {
  const overview = await dba.listConnections()
  const rows = overview.connections
  const find = (id) => rows.find((row) => row.id === id)
  if (!session) {
    if (requested) {
      const found = find(requested)
      if (!found) throw new Error(`找不到连接 "${requested}"。可用连接：${rows.map((row) => `${row.id} (${row.name})`).join(', ') || '无'}`)
      return found.id
    }
    if (rows.length === 1) return rows[0].id
    if (rows.length === 0) throw new Error('还没有配置数据库连接。请让用户在「数据库」侧边栏面板新建连接后再试。')
    throw new Error(`有多个数据库连接，请用 connectionId 指定：${rows.map((row) => `${row.id} (${row.name})`).join(', ')}`)
  }
  const state = await dba.sessionState(session.id, session.cwd)
  const selected = state.selectedIds
  if (selected.length === 0) {
    throw new Error('当前会话还没有选择数据库。请让用户在输入框旁的多选下拉里选择数据库后再试。')
  }
  if (requested) {
    const found = find(requested)
    if (!found) throw new Error(`找不到连接 "${requested}"。当前会话可选：${selected.map((id) => `${id} (${find(id)?.name ?? id})`).join(', ')}`)
    if (!selected.includes(requested)) {
      throw new Error(`数据库 "${requested}" 不在当前会话的选择范围内。当前已选：${selected.map((id) => `${id} (${find(id)?.name ?? id})`).join(', ')}`)
    }
    return found.id
  }
  if (selected.length === 1) return selected[0]
  throw new Error(`当前会话选中了多个数据库，请用 connectionId 指定：${selected.map((id) => `${id} (${find(id)?.name ?? id})`).join(', ')}`)
}

/** Build the model-facing tools. Every execute toggles the activity counter
 * so the composer status pill can blink while a database tool is running. */
function buildToolDefinitions(dba) {
  const definitions = [
    {
      name: 'db_list_connections',
      description: 'List the database connections configured in DSH DBA, with their ids, kinds and targets, and mark which ones are selected for this conversation. '
        + 'The result also carries each selected connection\'s query handbook (查数手册: human-maintained domain rules like tenant filters and known pitfalls) — read it before writing SQL. '
        + 'Call this first when the user asks about data but you do not know which connection to use. Only selected connections may be queried. Passwords are never returned.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            connections: { type: 'array', items: { type: 'object', additionalProperties: true } },
            drivers: { type: 'object', additionalProperties: true },
          },
          additionalProperties: true,
        },
        render: (_args, value) => [{ type: 'text', text: value?.summary ?? 'No connections.' }],
      },
      async execute(_args, exec) {
        const session = sessionOf(exec)
        const overview = await dba.listConnections()
        const rows = overview.connections
        let selectedIds = rows.map((row) => row.id)
        if (session) {
          const state = await dba.sessionState(session.id, session.cwd)
          selectedIds = state.selectedIds
        }
        const marked = rows.map((row) => ({ ...row, selected: selectedIds.includes(row.id) }))
        const selectedRows = marked.filter((row) => row.selected)
        let summary = rows.length === 0
          ? '还没有配置数据库连接。'
          : (selectedRows.length === 0
              ? '当前会话还没有选择数据库。请让用户先在输入框旁的数据库多选下拉里选择。\n'
              : `当前会话已选择 ${selectedRows.length} 个数据库：\n` + selectedRows.map((row) => `- \`${row.id}\` · ${row.name} · ${row.kind}${row.demo ? '（示例）' : ''}`).join('\n') + '\n\n')
            + `全部 ${rows.length} 个连接：\n` + marked.map((row) => `- \`${row.id}\` · ${row.name} · ${row.kind}${row.selected ? ' ✓ 已选' : ''}`).join('\n')
        // 手册随首次列表调用带给模型（插件侧最接近注入的通道；总量已在 notesBulk 截断）。
        const notesById = await dba.notesBulk(selectedIds)
        const notesBlocks = selectedRows
          .filter((row) => notesById[row.id]?.notes)
          .map((row) => `「${row.name}」查数手册（人工口径/陷阱，写 SQL 前先读）：\n${notesById[row.id].notes}${notesById[row.id].truncated ? '\n(手册过长已截断)' : ''}`)
        if (notesBlocks.length) summary += '\n\n' + notesBlocks.join('\n\n')
        return { summary, connections: marked, selectedIds, drivers: overview.drivers }
      },
    },
    {
      name: 'db_describe_schema',
      description: 'Inspect a database schema. Without `table`, lists every table and view with their comments, plus the connection\'s query handbook (查数手册: human-maintained domain rules like tenant filters and known pitfalls). '
        + 'With `table`, returns that table\'s columns (type, nullability, default, primary key, comment) and row count. '
        + 'Use it before writing SQL so column names and types are correct. `keyword` narrows the listing by table name or comment.',
      parameters: {
        connectionId: { type: 'string', description: 'Connection id from db_list_connections. Optional when the conversation has exactly one selected database; only selected databases are allowed.' },
        table: { type: 'string', description: "Table name, optionally schema-qualified (e.g. 'users' or 'public.users'). Omit to list tables. A missed exact name falls back to substring matching." },
        keyword: { type: 'string', description: 'Narrow the table listing: substring match against table names and comments. Ignored when `table` is given.' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            tables: { type: 'array', items: { type: 'object', additionalProperties: true } },
            table: { type: 'string' },
            columns: { type: 'array', items: { type: 'object', additionalProperties: true } },
            primaryKey: { type: 'array', items: { type: 'string' } },
            rowCount: { type: 'number' },
          },
          additionalProperties: true,
        },
        render: (_args, value) => [{ type: 'text', text: value?.summary ?? '' }],
      },
      async execute(args, exec) {
        const session = sessionOf(exec)
        const id = await resolveConnectionId(dba, args?.connectionId, session)
        const schema = await dba.schema(id, args?.table, session ? { sessionId: session.id, cwd: session.cwd } : {})
        if (schema.tables) {
          const keyword = typeof args?.keyword === 'string' ? args.keyword.trim().toLowerCase() : ''
          const tables = keyword
            ? schema.tables.filter((row) => {
                const full = row.schema ? `${row.schema}.${row.name}` : row.name
                return full.toLowerCase().includes(keyword) || String(row.comment ?? '').toLowerCase().includes(keyword)
              })
            : schema.tables
          const list = tables.map((row) => {
            const label = `- ${row.schema ? `${row.schema}.` : ''}${row.name} (${row.type})`
            return row.comment ? `${label} — ${row.comment}` : label
          })
          const notesBlock = schema.notes
            ? `\n\n查数手册（人工维护的口径/陷阱，写 SQL 前先读）：\n${schema.notes}`
            : ''
          return {
            summary: `连接 \`${id}\` 中共有 ${tables.length} 张表/视图${keyword ? `（按关键词 “${args.keyword.trim()}” 过滤）` : ''}：\n${list.join('\n') || '（空）'}${notesBlock}`,
            tables,
            notes: schema.notes || undefined,
            keyword: keyword || undefined,
          }
        }
        const lines = schema.columns.map((column) => {
          const flags = [column.primaryKey ? 'PK' : '', column.notNull ? 'NOT NULL' : ''].filter(Boolean).join(' ')
          const comment = column.comment ? ` — ${column.comment}` : ''
          return `- ${column.name} ${column.type}${flags ? ` ${flags}` : ''}${comment}${column.defaultValue != null ? ` default ${column.defaultValue}` : ''}`
        })
        const notesBlock = schema.notes ? `\n\n查数手册（人工维护的口径/陷阱）：\n${schema.notes}` : ''
        return {
          summary: `表 \`${schema.table}\`（${schema.rowCount} 行）的字段：\n${lines.join('\n')}${notesBlock}`,
          table: schema.table,
          columns: schema.columns,
          primaryKey: schema.primaryKey,
          rowCount: schema.rowCount,
          notes: schema.notes || undefined,
        }
      },
    },
    {
      name: 'db_query',
      description: 'Run a READ-ONLY SQL query (SELECT / WITH / EXPLAIN / SHOW / PRAGMA) against a database selected for this conversation and return columns and rows. '
        + 'Only the conversation\'s selected databases are allowed. Writes are rejected; use db_execute for INSERT/UPDATE/DELETE/DDL. '
        + 'Aggregations (GROUP BY / counts) are safe to run directly — skip row-count pre-checks; when a grouping may exceed the default limit (per-day / per-category breakdowns), pass a higher limit on the first call instead of re-querying after truncation. '
        + 'Use the exact table and column names returned by db_describe_schema, and respect its query handbook (查数手册) notes.',
      parameters: {
        connectionId: { type: 'string', description: 'Connection id from db_list_connections. Optional when the conversation has exactly one selected database; only selected databases are allowed.' },
        sql: { type: 'string', required: true, description: 'One read-only SQL statement.' },
        limit: { type: 'number', description: 'Maximum rows to return (default 200, capped by plugin config).' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            columns: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'object', additionalProperties: true } },
            rowCount: { type: 'number' },
            truncated: { type: 'boolean' },
            elapsedMs: { type: 'number' },
          },
          additionalProperties: true,
        },
        render: (_args, value) => [{ type: 'text', text: value?.summary ?? '' }],
      },
      async execute(args, exec) {
        const session = sessionOf(exec)
        const id = await resolveConnectionId(dba, args?.connectionId, session)
        const result = await dba.query(id, args?.sql, { limit: args?.limit, source: 'agent', ...(session ? { sessionId: session.id, cwd: session.cwd } : {}) })
        const rows = result.rows ?? []
        const summaryParts = [`查询成功，返回 ${rows.length} 行${result.truncated ? '（已截断）' : ''}，耗时 ${result.elapsedMs} ms。`]
        const table = markdownTable(result.columns, rows, 25)
        if (table) summaryParts.push(table)
        else summaryParts.push('（没有数据行）')
        return {
          summary: summaryParts.join('\n'),
          columns: result.columns,
          rows,
          rowCount: rows.length,
          truncated: result.truncated === true,
          elapsedMs: result.elapsedMs,
        }
      },
    },
    {
      name: 'db_execute',
      description: 'Run write SQL (INSERT / UPDATE / DELETE / CREATE / ALTER / DROP) against a database selected for this conversation. '
        + 'UPDATE / DELETE must carry a WHERE clause — whole-table changes additionally need `allowFullTable: true`. '
        + 'Multiple statements run as one batch in a single transaction: any failure rolls back the whole batch. '
        + 'Every call requires explicit user approval through the host permission prompt (and `confirm: true`); only proceed after the user has clearly asked for the change. '
        + 'Rejected when the connection is read-only or the plugin config disables writes.',
      parameters: {
        connectionId: { type: 'string', description: 'Connection id from db_list_connections. Optional when the conversation has exactly one selected database; only selected databases are allowed.' },
        sql: { type: 'string', required: true, description: 'One write statement, or several statements separated by semicolons (they run as one transaction).' },
        confirm: { type: 'boolean', required: true, description: 'Explicitly confirm the write. Set true only when the user asked for this change.' },
        allowFullTable: { type: 'boolean', description: 'Required to run an UPDATE / DELETE without a WHERE clause. Set true only when the user explicitly confirmed a whole-table change.' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            changes: { type: 'number' },
            lastInsertRowid: { type: 'string' },
            elapsedMs: { type: 'number' },
          },
          additionalProperties: true,
        },
        render: (_args, value) => [{ type: 'text', text: value?.summary ?? '' }],
      },
      async execute(args, exec) {
        if (args?.confirm !== true) throw new Error('写操作需要显式确认：请先在对话中得到用户同意，再以 confirm: true 重试。')
        const session = sessionOf(exec)
        const id = await resolveConnectionId(dba, args?.connectionId, session)
        const result = await dba.execute(id, args?.sql, { source: 'agent', allowFullTable: args?.allowFullTable === true, ...(session ? { sessionId: session.id, cwd: session.cwd } : {}) })
        const affected = result.changes ?? 0
        const lines = [`执行成功：影响 ${affected} 行${result.wrapped ? '（事务已提交）' : ''}${result.lastInsertRowid != null ? `，最后插入 id = ${result.lastInsertRowid}` : ''}，耗时 ${result.elapsedMs ?? 0} ms。`]
        if (Array.isArray(result.results)) {
          for (const row of result.results) {
            lines.push(row.ok ? `- ✓ ${row.sql.slice(0, 200)} → ${row.changes} 行 (${row.ms}ms)` : `- ✗ ${row.sql.slice(0, 200)} → ${row.error}`)
          }
        }
        return {
          summary: lines.join('\n'),
          changes: affected,
          lastInsertRowid: result.lastInsertRowid == null ? '' : String(result.lastInsertRowid),
          elapsedMs: result.elapsedMs ?? 0,
          results: result.results,
        }
      },
    },
    {
      name: 'db_export',
      description: 'Export tables from a selected database into .sql / .csv files under the workspace. '
        + 'scope=csv writes RFC 4180 CSV with a header row (UTF-8 BOM, Excel-friendly); scope=dml writes INSERT statements, one file per table; '
        + 'scope=ddl writes CREATE TABLE statements into a single file (MySQL / SQLite only; PostgreSQL suggests pg_dump). '
        + 'Read-only against the database; requires user approval because files land in the workspace. csv/dml need an explicit `tables` list; `where` (csv/dml only) filters rows with a plain SQL condition without the WHERE keyword.',
      parameters: {
        connectionId: { type: 'string', description: 'Connection id from db_list_connections. Optional when the conversation has exactly one selected database; only selected databases are allowed.' },
        scope: { type: 'string', required: true, description: "One of 'csv', 'dml' or 'ddl'." },
        tables: { type: 'string', description: "Comma-separated table names (e.g. 'users,orders'). Required for csv and dml; ddl exports every base table when omitted." },
        where: { type: 'string', description: 'Row filter for csv/dml: a plain SQL condition without the WHERE keyword (e.g. "status = \'paid\'"). Semicolons and comments are rejected.' },
        maxRowsPerTable: { type: 'number', description: 'Row ceiling per table, default 50000.' },
        outputDir: { type: 'string', description: 'Output directory, relative to the conversation workspace (default sql/export) or absolute.' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            files: { type: 'array', items: { type: 'object', additionalProperties: true } },
            skipped: { type: 'array', items: { type: 'object', additionalProperties: true } },
            outputDir: { type: 'string' },
            durationMs: { type: 'number' },
          },
          additionalProperties: true,
        },
        render: (_args, value) => [{ type: 'text', text: value?.summary ?? '' }],
      },
      async execute(args, exec) {
        const session = sessionOf(exec)
        const id = await resolveConnectionId(dba, args?.connectionId, session)
        const tables = typeof args?.tables === 'string' && args.tables.trim()
          ? args.tables.split(',').map((token) => token.trim()).filter(Boolean)
          : undefined
        const result = await dba.exportData(id, {
          scope: args?.scope,
          tables,
          where: typeof args?.where === 'string' ? args.where : undefined,
          maxRowsPerTable: args?.maxRowsPerTable,
          outputDir: typeof args?.outputDir === 'string' ? args.outputDir : undefined,
          ...(session ? { sessionId: session.id, cwd: session.cwd } : {}),
        })
        const lines = [`已导出 ${result.files.length} 个文件到 ${result.outputDir}（${result.durationMs} ms）。`]
        for (const file of result.files) {
          lines.push(`- ${file.path} — ${file.table}${file.rows > 0 ? ` · ${file.rows} 行${file.truncated ? '（已截断）' : ''}` : ''}`)
        }
        for (const item of result.skipped) {
          lines.push(`- 跳过 ${item.table}：${item.reason}`)
        }
        return {
          summary: lines.join('\n'),
          files: result.files,
          skipped: result.skipped,
          outputDir: result.outputDir,
          durationMs: result.durationMs,
        }
      },
    },
  ]
  // 每个工具执行期间标记活动状态（支持并发），状态条据此闪烁。
  for (const definition of definitions) {
    const original = definition.execute
    definition.execute = async function (args, exec) {
      dba.markActivity(1)
      try {
        return await original.call(this, args, exec)
      } finally {
        dba.markActivity(-1)
      }
    }
  }
  return definitions
}

/** Dispatch one HTTP request body. */
async function dispatch(dba, body, options = {}) {
  const action = body?.action
  if (!action) throw new Error('缺少 action / missing action')
  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : undefined
  const cwd = sessionId ? (body.cwd ?? options.cwdOf?.(sessionId)) : undefined
  const scoped = sessionId ? { sessionId, cwd } : {}
  switch (action) {
    case 'overview':
    case 'list':
      return { ok: true, ...(await dba.listConnections()) }
    case 'session-state':
      return { ok: true, ...(await dba.sessionState(sessionId, cwd)) }
    case 'session-set':
      return { ok: true, ...(await dba.setSessionSelection(sessionId, body.ids, cwd)) }
    case 'session-status':
      return { ok: true, ...(await dba.sessionStatus(sessionId, cwd)) }
    case 'tables':
      return { ok: true, ...(await dba.schema(body.id, undefined, scoped)) }
    case 'describe':
      return { ok: true, ...(await dba.schema(body.id, body.table, scoped)) }
    case 'rows':
      return { ok: true, ...(await dba.rows(body.id, body.table, { limit: body.limit, offset: body.offset, ...scoped })) }
    case 'query':
      return { ok: true, ...(await dba.query(body.id, body.sql, { limit: body.limit, source: 'ui', ...scoped })) }
    case 'execute':
      return { ok: true, ...(await dba.execute(body.id, body.sql, { source: 'ui', ...scoped })) }
    case 'history-list':
      return { ok: true, ...(await dba.sqlHistory(sessionId)) }
    case 'history-all':
      return { ok: true, ...(await dba.allSqlHistory()) }
    case 'history-clear':
      return { ok: true, ...(await dba.clearSqlHistory(sessionId)) }
    case 'notes-get':
      return { ok: true, ...(await dba.notes(body.id, scoped)) }
    case 'notes-set':
      return { ok: true, ...(await dba.setNotes(body.id, typeof body.notes === 'string' ? body.notes : '', scoped)) }
    case 'export':
      return { ok: true, ...(await dba.exportData(body.id, {
        scope: body.scope,
        tables: Array.isArray(body.tables) ? body.tables : undefined,
        where: typeof body.where === 'string' ? body.where : undefined,
        maxRowsPerTable: body.maxRowsPerTable,
        outputDir: typeof body.outputDir === 'string' ? body.outputDir : undefined,
        ...scoped,
      })) }
    case 'test':
      return { ok: true, ...(await dba.testConnection(body.connection ?? body)) }
    case 'add':
      return { ok: true, connection: await dba.addConnection(body.connection ?? body) }
    case 'update':
      return { ok: true, connection: await dba.updateConnection(body.id, body.patch ?? {}) }
    case 'remove':
      return { ok: true, removed: await dba.removeConnection(body.id) }
    case 'seed-demo':
      return { ok: true, ...(await dba.seedDemo()) }
    case 'ping':
      return { ok: true, time: Date.now() }
    case 'activity':
      return { ok: true, busy: dba.activityBusy() }
    default:
      throw new Error(`未知操作 / unknown action: ${action}`)
  }
}

/** Cordis plugin entry. */
export default {
  name: 'dsh-dba',
  Config,
  inject: [],
  apply(ctx, config = null) {
    const cfg = config ?? { ...DEFAULT_CONFIG }
    const dba = createDba({ dshHome: cfg.dshHome, config: cfg })

    // Kick the load/demo seed off now; individual requests await the same
    // promise, so the first request after boot cannot race it.
    dba.ready().catch((error) => {
      console.warn('dsh-dba: initialization failed —', error?.message ?? error)
    })

    ctx.effect(() => () => dba.dispose().catch(() => {}), 'dsh-dba: adapters')

    // Live Session lookup for workspace-aware defaults. `sessions` may not be
    // mounted in every assembly, so this is a probe rather than an inject.
    const cwdOf = (sessionId) => {
      try {
        const sessions = ctx.get('sessions')
        return sessions?.get?.(sessionId)?.header?.cwd
      } catch {
        return undefined
      }
    }

    // ── HTTP carrier for the browser panel ────────────────────────────────
    ctx.inject(['webServer'], (child) => {
      child.effect(() => child.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          const send = (status, payload) => {
            res.writeHead(status, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            res.end(JSON.stringify(payload))
          }
          // Only same-origin pages may talk to this route. A cross-origin
          // fetch that uses a "simple" content type (text/plain) would skip
          // preflight and could otherwise write data without reading a reply.
          const origin = req.headers?.origin
          if (typeof origin === 'string' && origin !== '') {
            let sameOrigin = false
            try { sameOrigin = new URL(origin).host === req.headers.host } catch { sameOrigin = false }
            if (!sameOrigin) {
              send(403, { ok: false, error: 'cross-origin request refused' })
              return
            }
          }
          if (req.method !== 'POST') {
            send(200, { ok: true, service: 'dsh-dba', route: ROUTE })
            return
          }
          try {
            const body = await readBody(req)
            send(200, await dispatch(dba, body, { cwdOf }))
          } catch (error) {
            send(200, { ok: false, error: error?.message ?? String(error) })
          }
        },
      }), 'dsh-dba: http api')
    })

    // ── model-facing tools ───────────────────────────────────────────────
    if (cfg.agentTools !== false) {
      ctx.inject(['tools'], (child) => {
        // 写确认门：db_execute 一律走宿主审批（ask），任何权限模式都不直通；
        // 未装配审批服务的部署会降级为拒绝（安全缺省，与 ZCode DBExecute 的
        // alwaysAsk 语义一致）。配置 agentWriteApproval: false 可关闭。
        if (cfg.agentWriteApproval !== false) {
          child.effect(() => child.events.on('tools/pre-execute', async (execution, next) => {
            if (execution?.name !== 'db_execute') return next()
            return {
              kind: 'ask',
              reason: 'dsh-dba db_execute writes to the database',
              displayReason: {
                en: 'The assistant wants to run a write statement against your database (INSERT / UPDATE / DELETE / DDL). It only executes after you approve.',
                zh: '助手即将对数据库执行写操作（INSERT / UPDATE / DELETE / DDL），你确认后才会执行。',
              },
            }
          }), 'dsh-dba: agent write approval gate')
        }
        optionalHostImport('@deepseek-ai/dsh-tools').then((mod) => {
          if (!mod?.defineTool) {
            console.warn('dsh-dba: @deepseek-ai/dsh-tools not reachable; agent tools are disabled')
            return
          }
          try {
            child.effect(() => {
              const definitions = buildToolDefinitions(dba)
              const disposers = definitions.map((definition) => child.tools.register(mod.defineTool(definition)))
              console.info('dsh-dba: registered ' + definitions.length + ' agent tools (' + definitions.map((definition) => definition.name).join(', ') + ')')
              return () => { for (const dispose of disposers) dispose?.() }
            }, 'dsh-dba: agent tools')
          } catch (error) {
            console.warn('dsh-dba: agent tools not registered —', error?.message ?? error)
          }
        }).catch((error) => {
          console.warn('dsh-dba: agent tools not registered —', error?.message ?? error)
        })
      })
    }
  },
}

export { buildToolDefinitions, dispatch, markdownTable, ROUTE }
