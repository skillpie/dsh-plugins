/**
 * Database adapters.
 *
 * Three kinds share one small interface so the HTTP API, the agent tools and
 * the browser half never branch on the engine:
 *
 *   ping(), listTables(), describeTable(name), countRows(name),
 *   fetchRows(name, { limit, offset }), query(sql, { limit }),
 *   execute(sql), close()
 *
 * SQLite rides Node's built-in `node:sqlite` (the same module the harness's
 * own session index uses), so it needs no dependency at all. PostgreSQL and
 * MySQL load `pg` / `mysql2` lazily and report a friendly error if a deployment
 * chose not to install them.
 *
 * @module dsh-db-studio/drivers
 */

import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Per-statement ceiling so an agent query cannot hold the pool forever. */
const QUERY_TIMEOUT_MS = 60_000

/** Quote a SQL identifier for the given kind. */
export function quoteIdentifier(kind, name) {
  const value = String(name)
  if (kind === 'mysql') return '`' + value.replaceAll('`', '``') + '`'
  return '"' + value.replaceAll('"', '""') + '"'
}

/** Quote a possibly schema-qualified table name. */
export function quoteTable(kind, table) {
  if (kind === 'sqlite' || kind === 'mysql') {
    const parts = table.split('.')
    return parts.map((part) => quoteIdentifier(kind, part)).join('.')
  }
  return table.split('.').map((part) => quoteIdentifier(kind, part)).join('.')
}

/**
 * Strip comments and string literals so keyword guards cannot be fooled by
 * text inside a value. This is a guard, not a parser; the database remains the
 * authority on syntax.
 */
export function stripSqlNoise(sql) {
  let out = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i + 2)
      i = end === -1 ? n : end + 1
      out += ' '
      continue
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      out += ' '
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < n) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      out += " '' "
      continue
    }
    out += ch
    i++
  }
  return out
}

/** True when the SQL is a single statement. */
export function isSingleStatement(sql) {
  const clean = stripSqlNoise(sql).trim().replace(/;+\s*$/, '')
  if (clean.includes(';')) return false
  return clean.length > 0
}

/**
 * Split one SQL text into statements, honouring string literals and comments
 * so a `;` inside a value never splits. Returns the trimmed non-empty pieces.
 */
export function splitSqlStatements(sql) {
  const out = []
  let current = ''
  let quote = null
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (quote) {
      current += ch
      if (ch === '\\' && quote !== '`') {
        current += sql[i + 1] ?? ''
        i++
        continue
      }
      if (ch === quote) {
        if (sql[i + 1] === quote) {
          current += sql[i + 1]
          i++
          continue
        }
        quote = null
      }
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      current += ch
      continue
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i + 2)
      const piece = end === -1 ? sql.slice(i) : sql.slice(i, end)
      current += piece + '\n'
      i = end === -1 ? sql.length : end
      continue
    }
    if (ch === '#' && (sql[i + 1] === ' ' || sql[i + 1] === '\n' || sql[i + 1] === undefined)) {
      const end = sql.indexOf('\n', i + 2)
      const piece = end === -1 ? sql.slice(i) : sql.slice(i, end)
      current += piece + '\n'
      i = end === -1 ? sql.length : end
      continue
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      current += end === -1 ? sql.slice(i) : sql.slice(i, end + 2)
      i = end === -1 ? sql.length : end + 1
      continue
    }
    if (ch === ';') {
      if (current.trim()) out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/** True when any statement in the batch writes (everything that is not a read). */
export function hasWriteStatement(list) {
  return list.some((statement) => !isReadOnlySql(statement))
}

/**
 * Reject UPDATE / DELETE without a WHERE clause unless the caller explicitly
 * accepts a full-table change. Guards against a model (or a fat-fingered
 * console run) rewriting every row with one statement.
 */
export function assertWhereGuarded(sql, allowFullTable = false) {
  if (allowFullTable) return
  const clean = stripSqlNoise(sql).trim().replace(/;+\s*$/, '')
  if (/^(update|delete)\b/i.test(clean) && !/\bwhere\b/i.test(clean)) {
    throw new Error('UPDATE / DELETE 必须带 WHERE 子句；确认要全表改动请传 allowFullTable: true / UPDATE and DELETE require a WHERE clause; pass allowFullTable: true to confirm a whole-table change')
  }
}

/**
 * Validate a raw `where` fragment before it is interpolated into a fixed
 * SELECT. The fragment must stay a single condition expression: reject
 * semicolons and comments outside literals (they could rewrite the statement
 * structure) and the server-side side-effect suffixes (INTO OUTFILE /
 * DUMPFILE, FOR UPDATE, LOCK IN SHARE MODE).
 */
export function assertSafeWhereCondition(where) {
  const text = String(where ?? '').trim()
  if (!text) {
    throw new Error('where 必须是去掉 WHERE 关键字的非空条件 / `where` must be a non-empty SQL condition (without the WHERE keyword)')
  }
  let quote = null
  let bare = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\' && quote !== '`') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    bare += ch
  }
  if (quote) {
    throw new Error('where 里有未闭合的引号，请传一个普通条件表达式 / `where` contains an unclosed quote; pass a plain SQL condition')
  }
  if (/;/.test(bare) || /--/.test(bare) || /#/.test(bare) || /\/\*/.test(bare)) {
    throw new Error('where 只允许单个条件表达式，不能包含分号或注释 / `where` must be a single condition expression; semicolons and comments are not allowed')
  }
  if (/\b(?:into\s+(?:outfile|dumpfile)|for\s+update|lock\s+in\s+share\s+mode)\b/i.test(bare)) {
    throw new Error('where 不允许 INTO OUTFILE/DUMPFILE、FOR UPDATE、LOCK IN SHARE MODE / `where` must be a plain condition; INTO OUTFILE/DUMPFILE, FOR UPDATE and LOCK IN SHARE MODE are not allowed')
  }
  return text
}

/**
 * Translate a driver-level connection error into an actionable message.
 * Database hosts usually sit behind a VPN / intranet, so ETIMEDOUT and
 * friends are almost always "VPN is not connected"; the raw error is always
 * appended for debugging. SQL execution errors never go through here.
 */
export function describeConnectError(error, connection) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error)
  const endpoint = `${connection.host}:${connection.port}（${connection.kind}）`
  const suffix = ` [原始错误 / original error: ${message || code || 'unknown'}]`
  if (code === 'ETIMEDOUT' || /connect ETIMEDOUT|timeout expired/i.test(message)) {
    return `连接超时：${endpoint} 无响应。该地址通常需要 VPN / 内网环境，请确认 VPN 已连接后重试 / Connection timed out: ${endpoint} is not responding — this address usually requires VPN or intranet access${suffix}`
  }
  if (code === 'ECONNREFUSED') {
    return `连接被拒绝：${endpoint} 端口未监听或被防火墙拦截 / Connection refused: the port is not listening or is firewalled${suffix}`
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `域名解析失败：无法解析 ${connection.host}，内网域名通常需要连接 VPN / DNS lookup failed for ${connection.host}; intranet hostnames usually require VPN${suffix}`
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `网络不可达：${endpoint}，请确认 VPN 与路由设置 / Network unreachable: check VPN and routing${suffix}`
  }
  if (code === 'ECONNRESET') {
    return `连接被重置：${endpoint}，多为网络或 VPN 中途断开 / Connection reset: the network or VPN likely dropped mid-handshake${suffix}`
  }
  if (/could not connect to server/i.test(message)) {
    return `无法连接：${endpoint}，请确认 VPN / 内网与数据库地址 / Could not connect: verify VPN, intranet and the database address${suffix}`
  }
  if (/password authentication failed/i.test(message)) {
    return `认证失败：用户名或密码不正确 / Authentication failed: wrong user or password${suffix}`
  }
  if (/does not exist|unknown database/i.test(message)) {
    return `数据库不存在：请检查库名是否正确 / The database does not exist: check the database name${suffix}`
  }
  if (/access denied/i.test(message)) {
    return `访问被拒绝：账号无权连接该库 / Access denied: the account may not connect to this database${suffix}`
  }
  return message || code || 'unknown connection error'
}

/** Read-only statements accepted by `db_query`. */
export function isReadOnlySql(sql) {
  const clean = stripSqlNoise(sql).trim()
  if (!clean) return false
  const first = clean.match(/^\(?\s*([a-z]+)/i)?.[1]?.toLowerCase()
  if (!['select', 'with', 'explain', 'pragma', 'show', 'describe', 'desc', 'values', 'table'].includes(first)) return false
  if (first === 'pragma' && /=/.test(clean)) return false
  const forbidden = /\b(insert|update|delete|merge|replace|create|alter|drop|truncate|attach|detach|vacuum|reindex|grant|revoke|call|copy|load|begin|commit|rollback|savepoint|lock|unlock)\b/i
  return !forbidden.test(clean)
}

/** Make sure a SQL text is not empty. */
export function requireSql(sql) {
  const value = typeof sql === 'string' ? sql.trim() : ''
  if (!value) throw new Error('SQL 不能为空 / SQL is empty')
  return value
}

/** Ensure the directory of a SQLite file exists? No: SQLite creates files, not dirs. */
async function assertSqliteParent(file) {
  try {
    const info = await stat(dirname(file))
    if (!info.isDirectory()) throw new Error('不是一个目录 / not a directory')
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`SQLite 文件所在目录不存在 / parent directory does not exist: ${dirname(file)}`)
    throw error
  }
}

// ── SQLite ─────────────────────────────────────────────────────────────────

/** Open a SQLite database through node:sqlite. */
async function openSqlite(connection, options) {
  const { DatabaseSync } = await import('node:sqlite')
  await assertSqliteParent(connection.file)
  const db = new DatabaseSync(connection.file, { readOnly: options.readOnly === true })
  try {
    db.exec('PRAGMA foreign_keys = ON')
  } catch {
    // A read-only handle still answers queries; the pragma is best-effort.
  }

  const columnsOf = (statement) => {
    try {
      return statement.columns().map((column) => column.name)
    } catch {
      return []
    }
  }

  return {
    kind: 'sqlite',
    async ping() {
      db.prepare('SELECT 1 AS ok').get()
      return true
    },
    async listTables() {
      const rows = db.prepare(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ).all()
      return rows.map((row) => ({ name: row.name, type: row.type, schema: null }))
    },
    async describeTable(table) {
      const info = db.prepare(`PRAGMA table_info(${quoteIdentifier('sqlite', table)})`).all()
      if (info.length === 0) throw new Error(`表不存在 / table not found: ${table}`)
      const columns = info.map((row) => ({
        name: row.name,
        type: row.type || 'ANY',
        notNull: Number(row.notnull) === 1,
        defaultValue: row.dflt_value ?? null,
        primaryKey: Number(row.pk) > 0,
        extra: '',
      }))
      const count = await this.countRows(table)
      return { table, schema: null, columns, primaryKey: columns.filter((column) => column.primaryKey).map((column) => column.name), rowCount: count }
    },
    async countRows(table) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier('sqlite', table)}`).get()
      return Number(row?.count ?? 0)
    },
    async fetchRows(table, { limit = 50, offset = 0, where } = {}) {
      const condition = where ? assertSafeWhereCondition(where) : ''
      const statement = db.prepare(
        `SELECT * FROM ${quoteIdentifier('sqlite', table)}${condition ? ` WHERE (${condition})` : ''} LIMIT ? OFFSET ?`,
      )
      const rows = statement.all(limit, offset)
      return { columns: columnsOf(statement), rows, total: await this.countRows(table) }
    },
    async query(sql, { limit = 200 } = {}) {
      const value = requireSql(sql)
      if (!isSingleStatement(value)) throw new Error('只允许执行一条 SQL / only one statement is allowed')
      if (!isReadOnlySql(value)) throw new Error('db_query 只接受只读 SQL；写操作请使用 db_execute / db_query is read-only, use db_execute for writes')
      const statement = db.prepare(value)
      const columns = columnsOf(statement)
      const rows = []
      let truncated = false
      const iterator = statement.iterate()
      try {
        for (const row of iterator) {
          if (rows.length >= limit) {
            truncated = true
            break
          }
          rows.push(row)
        }
      } finally {
        iterator?.return?.()
      }
      return { columns, rows, truncated }
    },
    async execute(sql) {
      const value = requireSql(sql)
      const started = Date.now()
      const isInsert = /^\s*(insert|replace)\b/i.test(stripSqlNoise(value))
      db.exec(value)
      let changes = 0
      let lastInsertRowid = null
      try {
        const info = db.prepare('SELECT changes() AS changes, last_insert_rowid() AS id').get()
        changes = Number(info?.changes ?? 0)
        // `last_insert_rowid()` is connection-wide and keeps the previous
        // INSERT's value after an UPDATE or DDL, so only report it for an
        // insert that actually changed a row.
        if (isInsert && changes > 0) lastInsertRowid = info?.id ?? null
      } catch {
        // DDL and multi-statement scripts may leave no row to read.
      }
      return { changes, lastInsertRowid, elapsedMs: Date.now() - started }
    },
    /**
     * Run a batch of statements; when any of them writes, wrap the whole
     * batch in a transaction so a mid-batch failure rolls back everything
     * (mirrors the ZCode DB tools' executeBatch semantics).
     */
    async execMany(statements) {
      const list = statements.map((statement) => String(statement || '').trim()).filter(Boolean)
      const started = Date.now()
      const wrapped = hasWriteStatement(list)
      const results = []
      if (wrapped) db.exec('BEGIN')
      try {
        for (const statement of list) {
          const one = { sql: statement, ok: true, changes: 0, lastInsertRowid: null, ms: 0 }
          const at = Date.now()
          try {
            const isInsert = /^\s*(insert|replace)\b/i.test(stripSqlNoise(statement))
            db.exec(statement)
            one.ms = Date.now() - at
            try {
              const info = db.prepare('SELECT changes() AS changes, last_insert_rowid() AS id').get()
              one.changes = Number(info?.changes ?? 0)
              if (isInsert && one.changes > 0) one.lastInsertRowid = info?.id != null ? String(info.id) : null
            } catch { /* DDL leaves nothing to read */ }
          } catch (error) {
            one.ok = false
            one.ms = Date.now() - at
            one.error = error?.message ?? String(error)
            results.push(one)
            if (wrapped) db.exec('ROLLBACK')
            return { results, changed: 0, wrapped, elapsedMs: Date.now() - started }
          }
          results.push(one)
        }
        if (wrapped) db.exec('COMMIT')
        return {
          results,
          changed: results.reduce((sum, one) => sum + (Number.isFinite(one.changes) ? one.changes : 0), 0),
          wrapped,
          elapsedMs: Date.now() - started,
        }
      } catch (error) {
        if (wrapped) { try { db.exec('ROLLBACK') } catch { /* already unwound */ } }
        throw error
      }
    },
    async close() {
      db.close()
    },
  }
}

// ── PostgreSQL ──────────────────────────────────────────────────────────────

async function openPostgres(connection) {
  let pg
  try {
    pg = await import('pg')
  } catch {
    throw new Error('未安装 PostgreSQL 驱动。请在插件目录运行 npm install pg / pg driver is not installed')
  }
  const Pool = pg.Pool ?? pg.default?.Pool
  if (!Pool) throw new Error('pg 驱动加载失败 / failed to load the pg driver')
  const pool = new Pool({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  })
  // Every pooled connection gets a statement ceiling; pg has no per-query
  // timeout option, so this is set at connect time and re-applied whenever
  // the pool opens a fresh socket.
  pool.on('connect', (client) => {
    client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`).catch(() => {})
  })

  const splitTable = (table) => {
    const parts = String(table).split('.')
    return parts.length > 1 ? { schema: parts[0], name: parts[1] } : { schema: 'public', name: parts[0] }
  }

  return {
    kind: 'postgres',
    async ping() {
      try {
        await pool.query('SELECT 1')
      } catch (error) {
        // ping is the connection probe: connect failures get the actionable
        // VPN/network translation; raw driver text helps nobody here.
        throw new Error(describeConnectError(error, connection))
      }
      return true
    },
    async listTables() {
      // pg_class + obj_description so the table comment (usually the Chinese
      // label) comes back in one round trip.
      const result = await pool.query(
        `SELECT n.nspname AS schema, c.relname AS name,
                CASE c.relkind WHEN 'v' THEN 'view' ELSE 'table' END AS type,
                obj_description(c.oid, 'pg_class') AS comment
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND c.relkind IN ('r', 'p', 'm', 'v')
          ORDER BY n.nspname, c.relname`,
      )
      return result.rows.map((row) => ({
        schema: row.schema,
        name: row.name,
        type: row.type,
        comment: row.comment ?? null,
      }))
    },
    async describeTable(table) {
      const { schema, name } = splitTable(table)
      const result = await pool.query(
        `SELECT column_name AS name, data_type AS type, is_nullable AS nullable,
                column_default AS default_value
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [schema, name],
      )
      if (result.rows.length === 0) throw new Error(`表不存在 / table not found: ${table}`)
      const keys = await pool.query(
        `SELECT kcu.column_name AS name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2`,
        [schema, name],
      )
      // Column comments live in pg_description; one extra query per described
      // table is fine (describe is always single-table).
      let comments = new Map()
      try {
        const described = await pool.query(
          `SELECT a.attname AS name, col_description(a.attrelid, a.attnum) AS comment
             FROM pg_attribute a
             JOIN pg_class c ON c.oid = a.attrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped`,
          [schema, name],
        )
        comments = new Map(described.rows.filter((row) => row.comment).map((row) => [row.name, row.comment]))
      } catch { /* comments are decorative; never fail the describe */ }
      const primaryKey = new Set(keys.rows.map((row) => row.name))
      const columns = result.rows.map((row) => ({
        name: row.name,
        type: row.type,
        notNull: row.nullable === 'NO',
        defaultValue: row.default_value,
        primaryKey: primaryKey.has(row.name),
        comment: comments.get(row.name) ?? null,
        extra: '',
      }))
      return { table, schema, columns, primaryKey: [...primaryKey], rowCount: await this.countRows(table) }
    },
    async countRows(table) {
      const result = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${quoteTable('postgres', table)}`)
      return Number(result.rows[0]?.count ?? 0)
    },
    async fetchRows(table, { limit = 50, offset = 0, where } = {}) {
      const condition = where ? assertSafeWhereCondition(where) : ''
      const result = await pool.query(
        `SELECT * FROM ${quoteTable('postgres', table)}${condition ? ` WHERE (${condition})` : ''} LIMIT $1 OFFSET $2`,
        [limit, offset],
      )
      return {
        columns: result.fields.map((field) => field.name),
        rows: result.rows,
        total: await this.countRows(table),
      }
    },
    async query(sql, { limit = 200 } = {}) {
      const value = requireSql(sql)
      if (!isSingleStatement(value)) throw new Error('只允许执行一条 SQL / only one statement is allowed')
      if (!isReadOnlySql(value)) throw new Error('db_query 只接受只读 SQL；写操作请使用 db_execute / db_query is read-only, use db_execute for writes')
      const result = await pool.query(value)
      const rows = result.rows.slice(0, limit)
      return {
        columns: result.fields?.map((field) => field.name) ?? Object.keys(rows[0] ?? {}),
        rows,
        truncated: result.rows.length > limit,
      }
    },
    async execute(sql) {
      const value = requireSql(sql)
      const started = Date.now()
      const result = await pool.query(value)
      return {
        changes: result.rowCount ?? 0,
        lastInsertRowid: null,
        elapsedMs: Date.now() - started,
        command: result.command,
      }
    },
    /** Batch execution with a transaction around any write statements. */
    async execMany(statements) {
      const list = statements.map((statement) => String(statement || '').trim()).filter(Boolean)
      const started = Date.now()
      const wrapped = hasWriteStatement(list)
      const results = []
      if (wrapped) await pool.query('BEGIN')
      try {
        for (const statement of list) {
          const one = { sql: statement, ok: true, changes: 0, lastInsertRowid: null, ms: 0 }
          const at = Date.now()
          try {
            const result = await pool.query(statement)
            one.ms = Date.now() - at
            one.changes = result.rowCount ?? 0
          } catch (error) {
            one.ok = false
            one.ms = Date.now() - at
            one.error = error?.message ?? String(error)
            results.push(one)
            if (wrapped) await pool.query('ROLLBACK').catch(() => {})
            return { results, changed: 0, wrapped, elapsedMs: Date.now() - started }
          }
          results.push(one)
        }
        if (wrapped) await pool.query('COMMIT')
        return {
          results,
          changed: results.reduce((sum, one) => sum + (Number.isFinite(one.changes) ? one.changes : 0), 0),
          wrapped,
          elapsedMs: Date.now() - started,
        }
      } catch (error) {
        if (wrapped) await pool.query('ROLLBACK').catch(() => {})
        throw error
      }
    },
    async close() {
      await pool.end()
    },
  }
}

// ── MySQL ──────────────────────────────────────────────────────────────────

async function openMysql(connection) {
  let mysql
  try {
    mysql = await import('mysql2/promise')
  } catch {
    throw new Error('未安装 MySQL 驱动。请在插件目录运行 npm install mysql2 / mysql2 driver is not installed')
  }
  const createPool = mysql.createPool ?? mysql.default?.createPool
  if (typeof createPool !== 'function') throw new Error('mysql2 驱动加载失败 / failed to load the mysql2 driver')
  const pool = createPool({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: 8_000,
    dateStrings: true,
  })

  return {
    kind: 'mysql',
    async ping() {
      try {
        await pool.query('SELECT 1')
      } catch (error) {
        throw new Error(describeConnectError(error, connection))
      }
      return true
    },
    async listTables() {
      const [rows] = await pool.query(
        `SELECT table_name AS name, table_type AS type, table_comment AS comment
           FROM information_schema.tables
          WHERE table_schema = DATABASE()
          ORDER BY table_name`,
      )
      return rows.map((row) => ({
        name: row.name,
        schema: null,
        type: row.type === 'VIEW' ? 'view' : 'table',
        comment: row.comment || null,
      }))
    },
    async describeTable(table) {
      const name = table.includes('.') ? table.split('.').pop() : table
      const [rows] = await pool.query(`SHOW FULL COLUMNS FROM ${quoteIdentifier('mysql', name)}`)
      if (!rows || rows.length === 0) throw new Error(`表不存在 / table not found: ${table}`)
      const columns = rows.map((row) => ({
        name: row.Field,
        type: row.Type,
        notNull: row.Null === 'NO',
        defaultValue: row.Default,
        primaryKey: row.Key === 'PRI',
        comment: row.Comment || null,
        extra: row.Extra ?? '',
      }))
      return {
        table,
        schema: null,
        columns,
        primaryKey: columns.filter((column) => column.primaryKey).map((column) => column.name),
        rowCount: await this.countRows(table),
      }
    },
    async countRows(table) {
      const name = table.includes('.') ? table.split('.').pop() : table
      const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${quoteIdentifier('mysql', name)}`)
      return Number(rows[0]?.count ?? 0)
    },
    async fetchRows(table, { limit = 50, offset = 0, where } = {}) {
      const name = table.includes('.') ? table.split('.').pop() : table
      const condition = where ? assertSafeWhereCondition(where) : ''
      const [rows, fields] = await pool.query(
        `SELECT * FROM ${quoteIdentifier('mysql', name)}${condition ? ` WHERE (${condition})` : ''} LIMIT ? OFFSET ?`,
        [limit, offset],
      )
      return { columns: (fields ?? []).map((field) => field.name), rows, total: await this.countRows(table) }
    },
    async query(sql, { limit = 200 } = {}) {
      const value = requireSql(sql)
      if (!isSingleStatement(value)) throw new Error('只允许执行一条 SQL / only one statement is allowed')
      if (!isReadOnlySql(value)) throw new Error('db_query 只接受只读 SQL；写操作请使用 db_execute / db_query is read-only, use db_execute for writes')
      // mysql2's per-query `timeout` kills the statement server-side so a
      // runaway query cannot hold one of the pool's two connections forever.
      const [rows, fields] = await pool.query({ sql: value, timeout: QUERY_TIMEOUT_MS })
      if (!Array.isArray(rows)) throw new Error('这条语句没有返回结果 / the statement returned no result set')
      return {
        columns: (fields ?? []).map((field) => field.name),
        rows: rows.slice(0, limit),
        truncated: rows.length > limit,
      }
    },
    async execute(sql) {
      const value = requireSql(sql)
      const started = Date.now()
      const isInsert = /^\s*(insert|replace)\b/i.test(stripSqlNoise(value))
      const [result] = await pool.query({ sql: value, timeout: QUERY_TIMEOUT_MS })
      const changes = result?.affectedRows ?? 0
      return {
        changes,
        lastInsertRowid: isInsert && changes > 0 && result?.insertId ? result.insertId : null,
        elapsedMs: Date.now() - started,
      }
    },
    /** Batch execution with a transaction around any write statements. */
    async execMany(statements) {
      const list = statements.map((statement) => String(statement || '').trim()).filter(Boolean)
      const started = Date.now()
      const wrapped = hasWriteStatement(list)
      const results = []
      if (wrapped) await pool.query('START TRANSACTION')
      try {
        for (const statement of list) {
          const one = { sql: statement, ok: true, changes: 0, lastInsertRowid: null, ms: 0 }
          const at = Date.now()
          try {
            const isInsert = /^\s*(insert|replace)\b/i.test(stripSqlNoise(statement))
            const [result, fields] = await pool.query({ sql: statement, timeout: QUERY_TIMEOUT_MS })
            one.ms = Date.now() - at
            if (Array.isArray(result)) {
              one.changes = result.length
              one.columns = (fields ?? []).map((field) => field.name)
            } else {
              one.changes = result?.affectedRows ?? 0
              if (isInsert && one.changes > 0 && result?.insertId) one.lastInsertRowid = String(result.insertId)
            }
          } catch (error) {
            one.ok = false
            one.ms = Date.now() - at
            one.error = error?.message ?? String(error)
            results.push(one)
            if (wrapped) await pool.query('ROLLBACK').catch(() => {})
            return { results, changed: 0, wrapped, elapsedMs: Date.now() - started }
          }
          results.push(one)
        }
        if (wrapped) await pool.query('COMMIT')
        return {
          results,
          changed: results.reduce((sum, one) => sum + (Number.isFinite(one.changes) ? one.changes : 0), 0),
          wrapped,
          elapsedMs: Date.now() - started,
        }
      } catch (error) {
        if (wrapped) await pool.query('ROLLBACK').catch(() => {})
        throw error
      }
    },
    async close() {
      await pool.end()
    },
  }
}

/**
 * Open a connection. `options.readOnly` is honored where the engine supports
 * it (SQLite today); every engine additionally gets the SQL guard in `query`.
 */
export async function openConnection(connection, options = {}) {
  if (!connection) throw new Error('连接不存在 / connection not found')
  if (connection.kind === 'sqlite') return openSqlite(connection, options)
  if (connection.kind === 'postgres') return openPostgres(connection, options)
  if (connection.kind === 'mysql') return openMysql(connection, options)
  throw new Error(`不支持的连接类型 / unsupported connection kind: ${connection.kind}`)
}

// ── Export helpers (shared by db_export and the HTTP route) ─────────────────

/**
 * Render one value as a SQL literal for the engine's dialect. MySQL accepts
 * backslash escapes (default sql_mode); PostgreSQL and SQLite use standard
 * strings where `''` doubling alone is correct.
 */
export function toSqlLiteral(kind, value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return kind === 'postgres' ? (value ? 'TRUE' : 'FALSE') : value ? '1' : '0'
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex').toUpperCase()}'`
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (kind === 'mysql') {
    return `'${text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\0/g, '\\0')}'`
  }
  return `'${text.replace(/'/g, "''")}'`
}

/** CSV cell rendering: NULL → empty; BLOB → hex; dates → `YYYY-MM-DD HH:MM:SS`. */
function renderCsvValue(value) {
  if (value === null || value === undefined) return ''
  if (Buffer.isBuffer(value)) return value.toString('hex')
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ')
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** RFC 4180 serialization: quote fields containing comma/quote/newline; header row first. */
export function toCsv(columns, rows) {
  const field = (value) => {
    const text = renderCsvValue(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.map(field).join(',')]
  for (const row of rows) lines.push(row.map(field).join(','))
  return `${lines.join('\n')}\n`
}

/** Exportable DDL for one table; throws a friendly error when unsupported. */
export async function tableDdl(adapter, kind, table) {
  if (kind === 'mysql') {
    const name = table.includes('.') ? table.split('.').pop() : table
    // SHOW goes through the read-only guard like any other query.
    const result = await adapter.query(`SHOW CREATE TABLE ${quoteIdentifier('mysql', name)}`)
    const ddl = result.rows?.[0]?.['Create Table']
    if (!ddl) throw new Error(`SHOW CREATE TABLE 没有返回结果 / SHOW CREATE TABLE returned nothing for ${table}`)
    return ddl
  }
  if (kind === 'sqlite') {
    const name = String(table).includes('.') ? String(table).split('.').pop() : String(table)
    const literal = `'${name.replace(/'/g, "''")}'`
    const result = await adapter.query(`SELECT sql FROM sqlite_master WHERE type IN ('table', 'view') AND name = ${literal}`)
    const ddl = result.rows?.[0]?.sql
    if (!ddl) throw new Error(`sqlite_master 里没有 ${table} 的定义 / no definition for ${table} in sqlite_master`)
    return ddl
  }
  throw new Error('PostgreSQL 暂不支持 DDL 导出（建议用 pg_dump）/ DDL export is not supported for PostgreSQL yet (use pg_dump)')
}
