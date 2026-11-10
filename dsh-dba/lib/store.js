/**
 * Connection store for dsh-dba.
 *
 * Connections live in `<home>/dsh-dba/connections.json` (mode 0600,
 * directory 0700). The browser never receives a password: `publicConnection()`
 * strips it and reports `hasPassword` instead. Passwords are stored in the
 * local file because a database client has to be able to reconnect without
 * the user retyping them; the file permissions are the boundary, and the
 * README says so plainly.
 *
 * @module dsh-dba/store
 */

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { absolutePath, dbaHome } from './home.js'

const FILE_MODE = 0o600
const DIR_MODE = 0o700

/** Connection kinds this plugin knows how to open. */
export const CONNECTION_KINDS = ['sqlite', 'postgres', 'mysql']

/**
 * 查数手册体积护栏：人工口径/陷阱文档随连接存储，防止超大文件吃满上下文
 * （ZCode 实测 DB_WIKI 约 35KB / 10K tokens，这里取同样的 64KB 上限）。
 */
export const MAX_NOTES_BYTES = 64_000

/** Trim notes to the byte ceiling, keeping whole characters. */
export function boundNotes(notes) {
  const text = String(notes ?? '')
  if (Buffer.byteLength(text, 'utf8') <= MAX_NOTES_BYTES) return text
  let cut = text
  while (Buffer.byteLength(cut, 'utf8') > MAX_NOTES_BYTES) cut = cut.slice(0, Math.floor(cut.length / 2))
  return `${cut}\n\n(手册过长已截断 / notes truncated at ${MAX_NOTES_BYTES} bytes)`
}

/** Default TCP ports per kind. */
const DEFAULT_PORTS = { postgres: 5432, mysql: 3306 }

/** Trimmed string or undefined. */
function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** A boolean with a default. */
function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/** A port number, or the kind's default. */
function portOf(value, kind) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORTS[kind]
}

/**
 * Validate and normalize one connection.
 *
 * Throws a plain Error with a user-facing Chinese/English message when the
 * shape cannot be stored. `existing` supplies the fields an update may omit
 * (notably the password).
 */
export function normalizeConnection(input, existing = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('连接配置格式不正确 / invalid connection object')
  }
  const kind = text(input.kind) ?? existing?.kind
  if (!CONNECTION_KINDS.includes(kind)) {
    throw new Error('连接类型必须是 sqlite、postgres 或 mysql / kind must be sqlite, postgres or mysql')
  }
  const now = new Date().toISOString()
  const out = {
    id: existing?.id ?? text(input.id) ?? randomUUID(),
    name: text(input.name) ?? existing?.name ?? (kind === 'sqlite' ? 'SQLite 数据库' : kind === 'postgres' ? 'PostgreSQL' : 'MySQL'),
    kind,
    // 新连接默认只读（对齐 ZCode 数据源的安全缺省）；写能力需显式开启。
    readOnly: bool(input.readOnly, existing?.readOnly ?? true),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  if (typeof input.demo === 'boolean') out.demo = input.demo
  else if (existing?.demo !== undefined) out.demo = existing.demo
  // 查数手册：人工知识直接随连接行走；空串表示显式清空。
  if (typeof input.notes === 'string') {
    const notes = boundNotes(input.notes)
    if (notes.trim()) out.notes = notes
  } else if (typeof existing?.notes === 'string' && existing.notes.trim()) {
    out.notes = existing.notes
  }

  if (kind === 'sqlite') {
    const file = text(input.file) ?? existing?.file
    if (!file) throw new Error('SQLite 连接需要文件路径 / a SQLite connection needs a file path')
    out.file = absolutePath(file)
    // SQLite credentials do not exist; keep the rest of the object clean.
    return out
  }

  out.host = text(input.host) ?? existing?.host ?? '127.0.0.1'
  out.port = portOf(input.port ?? existing?.port, kind)
  out.database = text(input.database) ?? existing?.database
  if (!out.database) throw new Error('请填写数据库名 / a database name is required')
  out.user = text(input.user) ?? existing?.user ?? (kind === 'postgres' ? 'postgres' : 'root')
  if (typeof input.ssl === 'boolean') out.ssl = input.ssl
  else if (existing?.ssl !== undefined) out.ssl = existing.ssl
  else out.ssl = false

  if (typeof input.password === 'string' && input.password !== '') out.password = input.password
  else if (existing?.password !== undefined) out.password = existing.password
  if (input.clearPassword === true) delete out.password
  return out
}

/**
 * The browser-safe projection of a connection: no password, ever; the notes
 * handbook is also held back (up to 64KB would bloat every list) — it is
 * fetched explicitly through the notes actions and the schema tools.
 */
export function publicConnection(connection) {
  if (!connection) return null
  const { password, notes, ...rest } = connection
  return { ...rest, hasNotes: typeof notes === 'string' && notes.trim().length > 0, hasPassword: typeof password === 'string' && password.length > 0 }
}

/** A human-readable one-line target for a connection. */
export function connectionTarget(connection) {
  if (connection.kind === 'sqlite') return connection.file
  return `${connection.user}@${connection.host}:${connection.port}/${connection.database}`
}

/** The connection file is shared by every reload of the plugin in this home. */
export class ConnectionStore {
  constructor(home) {
    this.home = home
    this.dir = dbaHome(home)
    this.file = join(this.dir, 'connections.json')
    this.connections = []
    this.loaded = false
  }

  /** Read from disk. A missing or malformed file becomes an empty store. */
  async load() {
    if (this.loaded) return this
    this.loaded = true
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.connections)) {
        this.connections = parsed.connections.filter((row) => row && typeof row === 'object' && row.id)
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn('dsh-dba: ignoring unreadable connections file —', error?.message ?? error)
      }
    }
    return this
  }

  /** Persist atomically: write a sibling then rename into place. */
  async save() {
    await mkdir(this.dir, { recursive: true, mode: DIR_MODE })
    const body = JSON.stringify({ version: 1, connections: this.connections }, null, 2) + '\n'
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, body, { mode: FILE_MODE })
    await rename(temp, this.file)
    // rename preserves the temp file's mode; chmod is belt-and-braces for a
    // pre-existing file whose mode was widened outside this plugin.
    await chmod(this.file, FILE_MODE).catch(() => {})
  }

  /** All connections, secrets redacted, in insertion order. */
  list() {
    return this.connections.map(publicConnection)
  }

  /** Raw connection by id (host-side use only). */
  get(id) {
    return this.connections.find((row) => row.id === id) ?? null
  }

  /** The first connection, used when an agent tool omits an id. */
  first() {
    return this.connections[0] ?? null
  }

  /** Add a validated connection and persist it. */
  async add(input) {
    const connection = normalizeConnection(input)
    if (this.connections.some((row) => row.id === connection.id)) {
      connection.id = randomUUID()
    }
    this.connections.push(connection)
    await this.save()
    return publicConnection(connection)
  }

  /** Patch an existing connection. `undefined` keeps a field; password is special. */
  async update(id, patch) {
    const index = this.connections.findIndex((row) => row.id === id)
    if (index === -1) throw new Error('连接不存在 / connection not found')
    const merged = normalizeConnection({ ...this.connections[index], ...patch }, this.connections[index])
    merged.id = id
    this.connections[index] = merged
    await this.save()
    return publicConnection(merged)
  }

  /** Remove a connection. The demo connection is recreated by `ensureDemo`. */
  async remove(id) {
    const before = this.connections.length
    this.connections = this.connections.filter((row) => row.id !== id)
    if (this.connections.length === before) throw new Error('连接不存在 / connection not found')
    await this.save()
    return true
  }

  /** Replace the whole list (used by demo seeding); persists immediately. */
  async replaceAll(connections) {
    this.connections = connections
    await this.save()
  }

  /** Remove the store (tests). */
  async destroy() {
    await rm(this.dir, { recursive: true, force: true })
  }
}
