/**
 * DatabaseStudio — the headless half of dsh-db-studio.
 *
 * Owns the connection store, one cached adapter per connection, the demo
 * database, and the operation vocabulary shared by the HTTP route and the
 * agent tools. Nothing here imports Cordis, so the whole service is testable in
 * a plain Node process.
 *
 * @module dsh-db-studio/service
 */

import { chmod, mkdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  assertSafeWhereCondition,
  assertWhereGuarded,
  openConnection,
  quoteIdentifier,
  quoteTable,
  splitSqlStatements,
  tableDdl,
  toCsv,
  toSqlLiteral,
} from './drivers.js'
import { resolveDshHome, studioHome } from './home.js'
import { boundNotes, ConnectionStore, connectionTarget, normalizeConnection, publicConnection } from './store.js'
import { SessionSelectionStore } from './session-store.js'

const DEMO_ID = 'demo'
const DEMO_NAME = '示例数据库'
const ADAPTER_IDLE_MS = 5 * 60 * 1000
const EXPORT_MAX_ROWS = 50_000
const EXPORT_CAP_ROWS = 200_000

export const DEFAULT_CONFIG = {
  demo: true,
  allowWrite: true,
  agentTools: true,
  agentWriteApproval: true,
  maxRows: 200,
}

/** Clamp a user-supplied row limit into the configured window. */
function clampLimit(value, fallback, max) {
  const n = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback
  return Math.min(Math.max(n, 1), max)
}

/** `YYYYMMDD-HHMMSS` suffix for export file names. */
function exportTimestamp(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/** File-name-safe token for database / table names. */
function safeFileToken(token) {
  return String(token).replace(/[^\w.-]/g, '_')
}

/** Display the default harness home symbolically in the sidebar. */
function displayHome(home) {
  const usual = join(homedir(), '.dsh')
  return home === usual ? '~/.dsh' : home
}

/** Check whether an optional driver package can be imported. */
async function driverAvailable(name) {
  try {
    await import(name)
    return true
  } catch {
    return false
  }
}

/** The seed script for the demo database. */
const DEMO_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  vip INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO users (id, name, email, city, vip, created_at) VALUES
  (1, '林小雨', 'xiaoyu.lin@example.com', '杭州', 1, '2026-01-12 09:20:00'),
  (2, '陈默', 'mo.chen@example.com', '上海', 0, '2026-02-03 14:05:00'),
  (3, '苏晚', 'wan.su@example.com', '北京', 1, '2026-02-18 18:41:00'),
  (4, '周野', 'ye.zhou@example.com', '成都', 0, '2026-03-02 11:10:00'),
  (5, '顾清', 'qing.gu@example.com', '深圳', 1, '2026-03-21 08:55:00'),
  (6, '沈舟', 'zhou.shen@example.com', '南京', 0, '2026-04-09 16:30:00'),
  (7, '许知意', 'zhiyi.xu@example.com', '武汉', 0, '2026-05-17 10:15:00'),
  (8, '江屿', 'yu.jiang@example.com', '厦门', 1, '2026-06-08 21:00:00');
INSERT INTO products (id, name, category, price, stock) VALUES
  (1, '手冲咖啡豆 · 耶加雪菲', '咖啡', 128.0, 42),
  (2, '冷萃咖啡液', '咖啡', 69.0, 120),
  (3, '陶瓷马克杯', '器物', 89.0, 35),
  (4, '桌面收纳盒', '器物', 159.0, 18),
  (5, '机械键盘 · 青轴', '数码', 399.0, 12),
  (6, '无线鼠标', '数码', 229.0, 24),
  (7, '雪山香薰蜡烛', '香氛', 118.0, 48),
  (8, '旅行帆布包', '出行', 199.0, 30);
INSERT INTO orders (id, user_id, product_id, quantity, total, status, created_at) VALUES
  (1, 1, 1, 2, 256.0, 'completed', '2026-07-02 10:12:00'),
  (2, 2, 3, 1, 89.0, 'completed', '2026-07-05 15:44:00'),
  (3, 3, 5, 1, 399.0, 'completed', '2026-07-09 09:03:00'),
  (4, 1, 7, 1, 118.0, 'completed', '2026-07-15 20:21:00'),
  (5, 4, 2, 3, 207.0, 'completed', '2026-07-21 13:38:00'),
  (6, 5, 6, 1, 229.0, 'paid', '2026-08-01 11:07:00'),
  (7, 6, 4, 1, 159.0, 'paid', '2026-08-06 17:52:00'),
  (8, 7, 8, 1, 199.0, 'paid', '2026-08-14 08:26:00'),
  (9, 8, 1, 1, 128.0, 'completed', '2026-08-20 19:45:00'),
  (10, 3, 2, 2, 138.0, 'cancelled', '2026-08-24 12:11:00'),
  (11, 5, 7, 2, 236.0, 'completed', '2026-09-02 16:02:00'),
  (12, 2, 8, 1, 199.0, 'paid', '2026-09-09 10:33:00'),
  (13, 6, 1, 2, 256.0, 'completed', '2026-09-15 21:18:00'),
  (14, 4, 6, 1, 229.0, 'paid', '2026-09-23 14:50:00'),
  (15, 7, 3, 2, 178.0, 'completed', '2026-10-01 09:41:00'),
  (16, 8, 4, 1, 159.0, 'paid', '2026-10-06 18:07:00'),
  (17, 1, 8, 1, 199.0, 'completed', '2026-10-12 13:22:00'),
  (18, 3, 1, 3, 384.0, 'paid', '2026-10-17 11:56:00');
`

export class DatabaseStudio {
  /** Agent 工具在飞计数：底部状态条的圆点闪烁据此判断。 */
  #activityCount = 0

  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...(options.config ?? {}) }
    this.home = resolveDshHome(options.dshHome, options.env ?? process.env)
    this.dir = studioHome(this.home)
    this.demoFile = join(this.dir, 'demo.db')
    this.store = new ConnectionStore(this.home)
    this.selections = new SessionSelectionStore(this.home)
    this.adapters = new Map()
    this.writeQueues = new Map()
    this.initPromise = null
    this.driverCache = null
  }

  /** Load the store and seed the demo connection on first use. */
  ready() {
    this.initPromise ??= this.#init()
    return this.initPromise
  }

  async #init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    // Tighten an existing demo file too: older builds let node:sqlite create it
    // with the process umask.
    await chmod(this.demoFile, 0o600).catch(() => {})
    await this.store.load()
    await this.selections.load()
    if (this.config.demo && this.store.list().length === 0) {
      try {
        await this.#ensureDemo()
      } catch (error) {
        console.warn('dsh-db-studio: demo database could not be created —', error?.message ?? error)
      }
    }
  }

  /** Create and seed the demo SQLite database, then register its connection. */
  async #ensureDemo() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    let exists = false
    try {
      exists = (await stat(this.demoFile)).isFile()
    } catch {
      exists = false
    }
    const db = new DatabaseSync(this.demoFile)
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users','products','orders')").all()
      if (!exists || tables.length < 3) db.exec(DEMO_SQL)
    } finally {
      db.close()
    }
    // Node's SQLite creates the file with the process umask. The demo may hold
    // sample rows a user asked to keep, so give it the same private mode as the
    // connection store.
    await chmod(this.demoFile, 0o600).catch(() => {})
    await this.store.replaceAll([
      {
        id: DEMO_ID,
        name: DEMO_NAME,
        kind: 'sqlite',
        file: this.demoFile,
        readOnly: false,
        demo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
  }

  /** Agent 工具开始/结束各计一次（支持并发嵌套），busy = 计数 > 0。 */
  markActivity(delta) {
    this.#activityCount = Math.max(0, this.#activityCount + delta)
  }

  activityBusy() {
    return this.#activityCount > 0
  }

  /** The browser-safe overview the panel and the list tool return. */
  async overview() {
    await this.ready()
    this.driverCache ??= Promise.all([
      driverAvailable('pg'),
      driverAvailable('mysql2'),
    ]).then(([postgres, mysql]) => ({ sqlite: true, postgres, mysql }))
    return {
      connections: this.store.list(),
      drivers: await this.driverCache,
      home: displayHome(this.home),
      demoFile: this.demoFile,
      allowWrite: this.config.allowWrite !== false,
      config: { demo: this.config.demo !== false, maxRows: this.config.maxRows },
    }
  }

  /** The store, loaded. */
  async connection(id) {
    await this.ready()
    const connection = id ? this.store.get(id) : this.store.first()
    if (!connection) {
      if (this.store.list().length === 0) throw new Error('还没有数据库连接，请先在「数据库」面板新建连接 / no database connection configured')
      throw new Error('连接不存在 / connection not found')
    }
    return connection
  }

  async listConnections() {
    return this.overview()
  }

  /**
   * The per-conversation state shared by the picker, the conversation tab and
   * the status strip. `ensure()` supplies the default selection (recently used
   * connections in the Session's workspace) the first time a Session asks.
   */
  async sessionState(sessionId, cwd) {
    await this.ready()
    if (!sessionId) throw new Error('缺少会话 id / missing session id')
    const connections = this.store.list()
    const selectedIds = await this.selections.ensure(sessionId, connections, cwd)
    const selected = selectedIds
      .map((id) => connections.find((connection) => connection.id === id))
      .filter(Boolean)
    return { sessionId, cwd: cwd ?? null, selectedIds, selected, connections }
  }

  /** Replace one Session's selection (empty is valid). */
  async setSessionSelection(sessionId, ids, cwd) {
    await this.ready()
    if (!sessionId) throw new Error('缺少会话 id / missing session id')
    const valid = new Set(this.store.list().map((connection) => connection.id))
    const chosen = (Array.isArray(ids) ? ids : []).filter((id) => valid.has(id))
    await this.selections.set(sessionId, chosen, cwd)
    return this.sessionState(sessionId, cwd)
  }

  /** Ping every selected connection and report table counts for the status strip. */
  async sessionStatus(sessionId, cwd) {
    const state = await this.sessionState(sessionId, cwd)
    const rows = await Promise.all(state.selected.map(async (publicRow) => {
      const connection = this.store.get(publicRow.id)
      if (!connection) return { ...publicRow, ok: false, error: '连接不存在 / connection not found' }
      const started = Date.now()
      let timer = null
      try {
        const adapter = await this.#adapter(connection)
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('连接超时 / connection timed out')), 6000)
        })
        const tables = await Promise.race([adapter.listTables(), timeout])
        return {
          ...publicRow,
          ok: true,
          latencyMs: Date.now() - started,
          tableCount: Array.isArray(tables) ? tables.length : 0,
        }
      } catch (error) {
        // Drop a failed adapter so the next status check reconnects. Without
        // this a pool refused at startup would keep failing forever.
        await this.closeAdapter(connection.id).catch(() => {})
        return { ...publicRow, ok: false, latencyMs: Date.now() - started, error: error?.message ?? String(error) }
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    }))
    return { sessionId, cwd: cwd ?? null, checkedAt: Date.now(), connections: rows }
  }

  /** Strict per-Session authorization used by both the route and the tools. */
  async assertSessionConnection(sessionId, connectionId, cwd) {
    const state = await this.sessionState(sessionId, cwd)
    if (state.selectedIds.length === 0) {
      throw new Error('当前会话还没有选择数据库，请先在输入框旁选择数据库 / no database is selected for this conversation')
    }
    if (!state.selectedIds.includes(connectionId)) {
      throw new Error('该数据库不在当前会话的选择范围内 / this database is not selected for this conversation')
    }
    return state
  }

  /** Record a use for future default selections. */
  touchUsage(connectionId, sessionId, cwd) {
    this.selections.touch(connectionId, { sessionId, cwd })
  }

  async addConnection(input) {
    await this.ready()
    const connection = await this.store.add(input)
    return connection
  }

  async updateConnection(id, patch) {
    await this.ready()
    await this.closeAdapter(id)
    return this.store.update(id, patch)
  }

  async removeConnection(id) {
    await this.ready()
    await this.closeAdapter(id)
    const removed = await this.store.remove(id)
    await this.selections.removeConnection(id)
    return removed
  }

  /** Test an unsaved form (or an existing connection when `id` is given). */
  async testConnection(input = {}) {
    await this.ready()
    const existing = input.id ? this.store.get(input.id) : null
    if (input.id && !existing) throw new Error('连接不存在 / connection not found')
    // Merge the saved row under the form so editing a connection and pressing
    // "test" does not require retyping a stored password.
    const candidate = existing ? { ...existing, ...input } : input
    if (existing && !candidate.password) delete candidate.password
    // Normalize a form without persisting it: this validates fields and fills
    // the same defaults the store would.
    const connection = normalizeConnection(candidate, existing)
    const adapter = await openConnection({ ...connection, readOnly: false })
    try {
      await adapter.ping()
      return { ok: true, target: connectionTarget(connection) }
    } finally {
      await adapter.close().catch(() => {})
    }
  }

  /** Close and forget one cached adapter. */
  async closeAdapter(id) {
    const entry = this.adapters.get(id)
    if (!entry) return
    this.adapters.delete(id)
    await entry.adapter.close().catch(() => {})
  }

  /** Get (or open) the cached adapter for a connection. */
  async #adapter(connection) {
    const now = Date.now()
    for (const [id, entry] of this.adapters) {
      if (now - entry.lastUsed > ADAPTER_IDLE_MS) {
        this.adapters.delete(id)
        entry.adapter.close().catch(() => {})
      }
    }
    let entry = this.adapters.get(connection.id)
    if (!entry) {
      const adapter = await openConnection(connection)
      entry = { adapter, lastUsed: now }
      this.adapters.set(connection.id, entry)
    } else {
      entry.lastUsed = now
    }
    return entry.adapter
  }

  /** Serialize writes per connection (SQLite in particular dislikes overlap). */
  #serialized(id, task) {
    const previous = this.writeQueues.get(id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(task)
    const tracked = next.finally(() => {
      if (this.writeQueues.get(id) === tracked) this.writeQueues.delete(id)
    })
    this.writeQueues.set(id, tracked)
    return tracked
  }

  /** List tables, or describe one table when `table` is provided. */
  async schema(id, table, options = {}) {
    if (options.sessionId) await this.assertSessionConnection(options.sessionId, id, options.cwd)
    const connection = await this.connection(id)
    const adapter = await this.#adapter(connection)
    let result
    if (!table) {
      const tables = await adapter.listTables()
      // 手册随表清单一起返回：模型一次列表调用就能拿到人工口径知识。
      result = { connection: publicConnection(connection), tables, notes: connection.notes ?? '' }
    } else {
      const name = String(table)
      try {
        result = await adapter.describeTable(name)
      } catch (error) {
        // 精确表名未命中时回退为包含匹配，帮助模型纠正表名（对齐 ZCode DBSchema）。
        if (!/表不存在|table not found/.test(error?.message ?? '')) throw error
        const listing = await adapter.listTables()
        const needle = name.toLowerCase()
        const matches = listing.filter((row) => {
          const full = row.schema ? `${row.schema}.${row.name}` : row.name
          return full.toLowerCase().includes(needle) || String(row.name).toLowerCase().includes(needle)
        })
        if (matches.length === 1) {
          const full = matches[0].schema ? `${matches[0].schema}.${matches[0].name}` : matches[0].name
          result = await adapter.describeTable(full)
          result.fuzzyMatchedFrom = name
        } else if (matches.length === 0) {
          throw error
        } else {
          const candidates = matches.slice(0, 10).map((row) => (row.schema ? `${row.schema}.${row.name}` : row.name))
          throw new Error(`表名 "${name}" 未精确命中，候选：${candidates.join(', ')} / table "${name}" matched several tables: ${candidates.join(', ')}`)
        }
      }
      if (connection.notes) result.notes = connection.notes
    }
    this.touchUsage(connection.id, options.sessionId, options.cwd)
    return result
  }

  /** One page of a table's rows. */
  async rows(id, table, options = {}) {
    if (options.sessionId) await this.assertSessionConnection(options.sessionId, id, options.cwd)
    const connection = await this.connection(id)
    if (!table) throw new Error('请选择一张表 / choose a table')
    const limit = clampLimit(options.limit, 50, this.config.maxRows)
    const offset = Math.max(0, Number.isFinite(Number(options.offset)) ? Math.floor(Number(options.offset)) : 0)
    const adapter = await this.#adapter(connection)
    const result = await adapter.fetchRows(String(table), { limit, offset })
    this.touchUsage(connection.id, options.sessionId, options.cwd)
    return { connection: publicConnection(connection), table: String(table), limit, offset, ...result }
  }

  /**
   * Record one SQL run for the conversation's history. History is a convenience
   * surface: a write failure must never turn a successful query into an error,
   * so recording errors are logged and swallowed.
   */
  async #recordSqlHistory(sessionId, connection, sql, source, outcome) {
    if (!sessionId) return
    try {
      await this.selections.addHistory(sessionId, {
        sql: String(sql ?? '').slice(0, 20000),
        connectionId: connection.id,
        connectionName: connection.name,
        source: source === 'agent' ? 'agent' : 'ui',
        ...outcome,
      })
    } catch (error) {
      console.warn('dsh-db-studio: failed to record SQL history —', error?.message ?? error)
    }
  }

  /** Every conversation's SQL history, grouped by Session. */
  async allSqlHistory() {
    await this.ready()
    return { sessions: await this.selections.allHistory() }
  }

  /** One Session's SQL history, newest first. */
  async sqlHistory(sessionId) {
    await this.ready()
    if (!sessionId) throw new Error('缺少会话 id / missing session id')
    return { sessionId, entries: await this.selections.history(sessionId) }
  }

  /** Clear one Session's SQL history. */
  async clearSqlHistory(sessionId) {
    await this.ready()
    if (!sessionId) throw new Error('缺少会话 id / missing session id')
    const cleared = await this.selections.clearHistory(sessionId)
    return { sessionId, cleared }
  }

  /** Run a read-only query. */
  async query(id, sql, options = {}) {
    if (options.sessionId) await this.assertSessionConnection(options.sessionId, id, options.cwd)
    const connection = await this.connection(id)
    const limit = clampLimit(options.limit, this.config.maxRows, this.config.maxRows)
    const adapter = await this.#adapter(connection)
    const source = options.source
    const started = Date.now()
    try {
      const result = await adapter.query(sql, { limit })
      await this.#recordSqlHistory(options.sessionId, connection, sql, source, {
        ok: true,
        elapsedMs: Date.now() - started,
        rows: Array.isArray(result.rows) ? result.rows.length : 0,
        truncated: result.truncated === true,
      })
      this.touchUsage(connection.id, options.sessionId, options.cwd)
      return { connection: publicConnection(connection), elapsedMs: Date.now() - started, ...result }
    } catch (error) {
      await this.#recordSqlHistory(options.sessionId, connection, sql, source, {
        ok: false,
        elapsedMs: Date.now() - started,
        error: error?.message ?? String(error),
      })
      throw error
    }
  }

  /**
   * Run write (or general) SQL after policy checks. Multi-statement input is
   * split and run as one batch; a batch containing writes is wrapped in a
   * transaction so any failure rolls back everything (ZCode executeBatch
   * semantics). UPDATE / DELETE require a WHERE clause unless the caller
   * passes `allowFullTable: true`.
   */
  async execute(id, sql, options = {}) {
    if (options.sessionId) await this.assertSessionConnection(options.sessionId, id, options.cwd)
    const connection = await this.connection(id)
    if (connection.readOnly) throw new Error('该连接是只读连接 / this connection is read-only')
    if (this.config.allowWrite === false) throw new Error('插件配置已关闭写操作（allowWrite: false）/ writes are disabled by plugin config')
    const value = String(sql ?? '').trim()
    if (!value) throw new Error('SQL 不能为空 / SQL is empty')
    const statements = splitSqlStatements(value)
    for (const statement of statements) assertWhereGuarded(statement, options.allowFullTable === true)
    return this.#serialized(connection.id, async () => {
      const adapter = await this.#adapter(connection)
      const source = options.source
      const started = Date.now()
      try {
        const batch = await adapter.execMany(statements)
        const elapsedMs = batch.elapsedMs ?? (Date.now() - started)
        const failed = batch.results.find((row) => row.ok === false)
        if (failed) {
          const index = batch.results.indexOf(failed) + 1
          const error = new Error(`第 ${index} 条语句失败${batch.wrapped ? '，整批已回滚' : ''} / statement ${index} failed${batch.wrapped ? ', the whole batch was rolled back' : ''}: ${failed.error ?? 'unknown error'}`)
          await this.#recordSqlHistory(options.sessionId, connection, value, source, {
            ok: false,
            elapsedMs,
            error: error.message,
          })
          throw error
        }
        await this.#recordSqlHistory(options.sessionId, connection, value, source, {
          ok: true,
          elapsedMs,
          changes: batch.changed ?? 0,
        })
        this.touchUsage(connection.id, options.sessionId, options.cwd)
        // Backwards-compatible top level: `changes` totals the batch and the
        // last insert id comes from the final INSERT that changed rows. A
        // multi-statement run additionally carries the per-statement `results`.
        const single = batch.results.length === 1 ? batch.results[0] : null
        const lastInsert = [...batch.results].reverse().find((row) => row.lastInsertRowid != null)
        return {
          connection: publicConnection(connection),
          elapsedMs,
          changes: single ? single.changes : batch.changed,
          lastInsertRowid: single ? single.lastInsertRowid : (lastInsert?.lastInsertRowid ?? null),
          wrapped: batch.wrapped === true,
          results: batch.results.length > 1 ? batch.results : undefined,
        }
      } catch (error) {
        if (!(error instanceof Error) || !/^第 \d+ 条语句失败/.test(error.message ?? '')) {
          await this.#recordSqlHistory(options.sessionId, connection, value, source, {
            ok: false,
            elapsedMs: Date.now() - started,
            error: error?.message ?? String(error),
          })
        }
        throw error
      }
    })
  }

  /** The connection's query handbook (查数手册), empty string when unset. */
  async notes(id, options = {}) {
    if (options.sessionId) await this.assertSessionConnection(options.sessionId, id, options.cwd)
    const connection = await this.connection(id)
    return { connection: publicConnection(connection), notes: connection.notes ?? '' }
  }

  /**
   * 查数手册批量读取（供 db_list_connections 随首次列表调用带给模型——插件侧
   * 最接近注入的通道）。只接受连接 id 白名单，总量按字符预算截断防撑爆上下文。
   */
  async notesBulk(ids) {
    await this.ready()
    const out = {}
    let budget = 48_000
    for (const id of (Array.isArray(ids) ? ids : []).slice(0, 20)) {
      const row = this.store.get(id)
      if (!row?.notes) continue
      if (budget <= 0) {
        out[id] = { notes: '', truncated: true }
        continue
      }
      const piece = row.notes.length > budget ? row.notes.slice(0, budget) : row.notes
      budget -= piece.length
      out[id] = { notes: piece, truncated: piece.length < row.notes.length }
    }
    return out
  }

  /** Replace one connection's query handbook; an empty string clears it. */
  async setNotes(id, notes, options = {}) {
    if (options.sessionId) await this.assertSessionConnection(options.sessionId, id, options.cwd)
    await this.connection(id)
    if (typeof notes !== 'string') throw new Error('手册内容必须是字符串 / notes must be a string')
    await this.store.update(id, { notes: boundNotes(notes) })
    // store.update 返回脱敏投影（notes 被剥掉），回读原始行取手册正文。
    const row = this.store.get(id)
    return { connection: publicConnection(row), notes: row?.notes ?? '' }
  }

  /**
   * Export tables as .sql / .csv files under `outputDir` (default
   * `sql/export` relative to the session workspace, or the studio home when
   * no workspace is known). scope=ddl writes CREATE TABLE statements (MySQL /
   * SQLite), dml writes INSERTs, csv writes RFC 4180 with a UTF-8 BOM. The
   * database side is read-only; files are the only side effect.
   */
  async exportData(id, options = {}) {
    if (options.sessionId) await this.assertSessionConnection(options.sessionId, id, options.cwd)
    const connection = await this.connection(id)
    const scope = ['ddl', 'dml', 'csv'].includes(options.scope) ? options.scope : 'csv'
    const adapter = await this.#adapter(connection)
    const started = Date.now()
    const where = options.where ? assertSafeWhereCondition(options.where) : ''
    const maxRows = Math.min(Math.max(Number(options.maxRowsPerTable) || EXPORT_MAX_ROWS, 1), EXPORT_CAP_ROWS)

    let tables = Array.isArray(options.tables) && options.tables.length ? options.tables.map(String) : null
    if (scope === 'ddl' && !tables) {
      const listing = await adapter.listTables()
      tables = listing.filter((row) => row.type !== 'view').map((row) => (row.schema ? `${row.schema}.${row.name}` : row.name))
    }
    if (!tables?.length) {
      throw new Error('scope=dml / scope=csv 需要显式指定 tables / dml and csv require an explicit `tables` list')
    }

    const outputDir = this.#exportDir(options.outputDir, options.cwd)
    await mkdir(outputDir, { recursive: true })
    const ts = exportTimestamp()
    const dbToken = safeFileToken(connection.database || connection.file?.split(/[\\/]/).pop()?.replace(/\.\w+$/, '') || 'db')
    const files = []
    const skipped = []

    if (scope === 'ddl') {
      const sections = [
        `-- DDL export: ${connectionTarget(connection)}`,
        `-- exported at ${new Date().toISOString()} · ${tables.length} tables · contains DROP TABLE IF EXISTS`,
      ]
      if (connection.kind === 'mysql') sections.push('SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS = 0;', '')
      for (const table of tables) {
        try {
          const ddl = await tableDdl(adapter, connection.kind, table)
          const quoted = quoteIdentifier(connection.kind, table.includes('.') ? table.split('.').pop() : table)
          sections.push('-- ----------------------------', `-- Table: ${table}`, '-- ----------------------------')
          if (connection.kind === 'mysql') sections.push(`DROP TABLE IF EXISTS ${quoted};`)
          sections.push(`${ddl};`, '')
          files.push({ table, path: '', rows: 0, truncated: false })
        } catch (error) {
          skipped.push({ table, reason: error?.message ?? String(error) })
        }
      }
      if (connection.kind === 'mysql') sections.push('SET FOREIGN_KEY_CHECKS = 1;')
      const path = resolve(outputDir, `${dbToken}_ddl_${ts}.sql`)
      await writeFile(path, sections.join('\n'), 'utf-8')
      for (const file of files) file.path = path
      return { connection: publicConnection(connection), scope, outputDir, files, skipped, durationMs: Date.now() - started }
    }

    for (const table of tables) {
      try {
        const page = await adapter.fetchRows(table, { limit: maxRows, offset: 0, where: where || undefined })
        // 三个驱动的 rows 都是对象数组；导出统一转成列矩阵。
        const matrix = page.rows.map((row) => page.columns.map((name) => row?.[name] ?? null))
        if (scope === 'dml') {
          if (matrix.length === 0) {
            skipped.push({ table, reason: '空表 / empty table' })
            continue
          }
          const whereNote = where ? ` · where: ${where.replace(/\s+/g, ' ')}` : ''
          const lines = [
            `-- DML export: ${connectionTarget(connection)} · ${table} · ${matrix.length} rows${page.truncated ? ` (truncated at ${maxRows})` : ''}${whereNote}`,
            `-- exported at ${new Date().toISOString()}`,
          ]
          if (connection.kind === 'mysql') lines.push('SET NAMES utf8mb4;')
          const columnList = page.columns.map((name) => quoteIdentifier(connection.kind, name)).join(', ')
          for (const row of matrix) {
            const values = row.map((value) => toSqlLiteral(connection.kind, value)).join(', ')
            lines.push(`INSERT INTO ${quoteTable(connection.kind, table)} (${columnList}) VALUES (${values});`)
          }
          const path = resolve(outputDir, `${dbToken}_dml_${safeFileToken(table)}_${ts}.sql`)
          await writeFile(path, lines.join('\n'), 'utf-8')
          files.push({ table, path, rows: matrix.length, truncated: page.truncated === true })
        } else {
          // csv：空结果也保留表头文件——where 过滤下 0 行是有效结果；BOM 让
          // Excel 直接打开也能识别中文。
          const path = resolve(outputDir, `${dbToken}_csv_${safeFileToken(table)}_${ts}.csv`)
          await writeFile(path, `\uFEFF${toCsv(page.columns, matrix)}`, 'utf-8')
          files.push({ table, path, rows: matrix.length, truncated: page.truncated === true })
        }
      } catch (error) {
        skipped.push({ table, reason: error?.message ?? String(error) })
      }
    }
    return { connection: publicConnection(connection), scope, outputDir, files, skipped, durationMs: Date.now() - started }
  }

  /** Resolve the export directory: absolute wins; relative anchors at the workspace cwd. */
  #exportDir(outputDir, cwd) {
    const raw = typeof outputDir === 'string' && outputDir.trim() ? outputDir.trim() : join('sql', 'export')
    if (isAbsolute(raw)) return resolve(raw)
    if (typeof cwd === 'string' && cwd.trim()) return resolve(cwd, raw)
    return resolve(studioHome(this.home), raw)
  }

  /** Create the demo connection on demand (empty-state button). */
  async seedDemo() {
    await this.ready()
    await this.#ensureDemo()
    return this.overview()
  }

  /** Close every adapter (plugin disposal). */
  async dispose() {
    const entries = [...this.adapters.values()]
    this.adapters.clear()
    await Promise.all(entries.map((entry) => entry.adapter.close().catch(() => {})))
    await this.selections.flush().catch(() => {})
  }
}

/** Convenience factory used by the Cordis entry and tests. */
export function createStudio(options) {
  return new DatabaseStudio(options)
}
