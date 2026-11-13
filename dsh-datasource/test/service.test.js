import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DbaService } from '../lib/service.js'
import { normalizeConnection, publicConnection } from '../lib/store.js'

const workspace = tmpdir()

async function makeDba(config = {}) {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const dba = new DbaService({ dshHome: home, config: { demo: true, ...config } })
  await dba.ready()
  return { home, dba }
}

test('normalizeConnection validates and redacts secrets', () => {
  const pg = normalizeConnection({
    kind: 'postgres', name: 'prod', host: 'db.local', database: 'app', user: 'me', password: 'secret',
  })
  assert.equal(pg.kind, 'postgres')
  assert.equal(pg.port, 5432)
  assert.equal(pg.host, 'db.local')
  const shown = publicConnection(pg)
  assert.equal(shown.password, undefined)
  assert.equal(shown.hasPassword, true)
  assert.throws(() => normalizeConnection({ kind: 'mysql', name: 'x' }), /database name/)
  assert.throws(() => normalizeConnection({ kind: 'access', name: 'x' }), /kind must be/)
})

test('demo database is created, browsable and queryable', async () => {
  const { home, dba } = await makeDba()
  try {
    const overview = await dba.listConnections()
    assert.equal(overview.connections.length, 1)
    assert.equal(overview.connections[0].demo, true)
    assert.equal(overview.connections[0].kind, 'sqlite')
    assert.equal(overview.drivers.sqlite, true)

    const id = overview.connections[0].id
    const schema = await dba.schema(id)
    const names = schema.tables.map((row) => row.name)
    assert.deepEqual(names.sort(), ['orders', 'products', 'users'])

    const described = await dba.schema(id, 'users')
    assert.ok(described.columns.some((column) => column.name === 'email'))
    assert.ok(described.rowCount >= 8)

    const page = await dba.rows(id, 'users', { limit: 3 })
    assert.equal(page.rows.length, 3)
    assert.ok(page.total >= 8)

    const aggregate = await dba.query(id, 'SELECT status, COUNT(*) AS n FROM orders GROUP BY status ORDER BY status', { limit: 10 })
    assert.ok(aggregate.columns.includes('n'))
    assert.ok(aggregate.rows.length >= 2)

    await assert.rejects(() => dba.query(id, 'DELETE FROM users'), /read-only/)
    await assert.rejects(() => dba.query(id, 'SELECT 1; SELECT 2'), /one statement/)

    const write = await dba.execute(id, "INSERT INTO users (id,name,email,city,vip,created_at) VALUES (101,'测试','t101@example.com','杭州',0,'2026-10-24 21:00:00')")
    assert.equal(write.changes, 1)
    const readBack = await dba.query(id, 'SELECT name FROM users WHERE id = 101', { limit: 2 })
    assert.equal(readBack.rows.length, 1)
    assert.equal(readBack.rows[0].name, '测试')
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('connection CRUD, read-only policy and testConnection', async () => {
  const { home, dba } = await makeDba()
  try {
    const demo = (await dba.listConnections()).connections[0]
    const created = await dba.addConnection({ kind: 'sqlite', name: 'second', file: join(home, 'second.db'), readOnly: true })
    assert.equal(created.name, 'second')
    assert.equal(created.readOnly, true)
    assert.equal(created.hasPassword, false)

    const result = await dba.testConnection({ kind: 'sqlite', file: join(home, 'second.db') })
    assert.equal(result.ok, true)

    await assert.rejects(() => dba.execute(created.id, 'CREATE TABLE x (id INTEGER)'), /read-only/)

    const updated = await dba.updateConnection(created.id, { name: 'renamed' })
    assert.equal(updated.name, 'renamed')

    await dba.removeConnection(demo.id)
    const after = await dba.listConnections()
    assert.equal(after.connections.length, 1)
    assert.equal(after.connections[0].name, 'renamed')

    const storeFile = join(home, 'dsh-datasource', 'connections.json')
    const mode = (await stat(storeFile)).mode & 0o777
    assert.equal(mode, 0o600)
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('per-session selection defaults, strict scope and status', async () => {
  const { home, dba } = await makeDba()
  try {
    const connections = (await dba.listConnections()).connections
    const demo = connections[0]
    const second = await dba.addConnection({ kind: 'sqlite', name: 'workspace-db', file: join(home, 'second.db') })

    // A new Session with no usage falls back to every configured connection.
    const fresh = await dba.sessionState('session-fresh', '/workspace/a')
    assert.deepEqual(fresh.selectedIds.sort(), [demo.id, second.id].sort())

    // Usage in a workspace drives the default for a later Session there.
    dba.touchUsage(second.id, 'session-old', '/workspace/a')
    await dba.selections.flush()
    const scoped = await dba.sessionState('session-scoped', '/workspace/a')
    assert.deepEqual(scoped.selectedIds, [second.id])

    // Strictness: selected only.
    await dba.setSessionSelection('session-scoped', [demo.id], '/workspace/a')
    const ok = await dba.query(demo.id, 'SELECT COUNT(*) AS n FROM users', { sessionId: 'session-scoped', cwd: '/workspace/a' })
    assert.equal(ok.rows[0].n, 8)
    await assert.rejects(
      () => dba.query(second.id, 'SELECT 1', { sessionId: 'session-scoped', cwd: '/workspace/a' }),
      /not selected/,
    )

    // Successful and failed SQL runs are recorded per Session; history is
    // newest-first and reproduce data (SQL + connection) survives the run.
    const history = await dba.sqlHistory('session-scoped')
    assert.equal(history.entries.length, 1)
    assert.equal(history.entries[0].sql, 'SELECT COUNT(*) AS n FROM users')
    assert.equal(history.entries[0].connectionId, demo.id)
    assert.equal(history.entries[0].ok, true)
    assert.equal(history.entries[0].source, 'ui')
    await assert.rejects(
      () => dba.query(demo.id, 'DELETE FROM users', { sessionId: 'session-scoped', cwd: '/workspace/a' }),
      /read-only/,
    )
    const failedHistory = await dba.sqlHistory('session-scoped')
    assert.equal(failedHistory.entries.length, 2)
    assert.equal(failedHistory.entries[0].ok, false)
    assert.match(failedHistory.entries[0].error, /read-only/)

    // The global panel groups the same records by conversation.
    const all = await dba.allSqlHistory()
    assert.equal(all.sessions.length, 1)
    assert.equal(all.sessions[0].sessionId, 'session-scoped')
    assert.equal(all.sessions[0].entries.length, 2)
    assert.equal(all.sessions[0].cwd, '/workspace/a')

    const cleared = await dba.clearSqlHistory('session-scoped')
    assert.equal(cleared.cleared, true)
    assert.equal((await dba.sqlHistory('session-scoped')).entries.length, 0)

    // Empty selection is explicit and refuses every connection.
    await dba.setSessionSelection('session-empty', [], '/workspace/a')
    await assert.rejects(() => dba.schema(demo.id, undefined, { sessionId: 'session-empty', cwd: '/workspace/a' }), /no database is selected/)
    await assert.rejects(() => dba.execute(demo.id, 'CREATE TABLE nope (id INTEGER)', { sessionId: 'session-empty' }), /no database is selected/)

    // Status reports a live connection and its table count.
    const status = await dba.sessionStatus('session-scoped', '/workspace/a')
    assert.equal(status.connections.length, 1)
    assert.equal(status.connections[0].id, demo.id)
    assert.equal(status.connections[0].ok, true)
    assert.ok(status.connections[0].tableCount >= 3)
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('splitSqlStatements, WHERE guard, where validation and export helpers', async () => {
  const { splitSqlStatements, assertWhereGuarded, assertSafeWhereCondition, toCsv, toSqlLiteral } = await import('../lib/drivers.js')
  assert.deepEqual(splitSqlStatements("SELECT 1; SELECT 'a;b'"), ['SELECT 1', "SELECT 'a;b'"])
  assert.deepEqual(splitSqlStatements('SELECT 1'), ['SELECT 1'])
  assert.deepEqual(splitSqlStatements('  '), [])
  assert.throws(() => assertWhereGuarded('UPDATE users SET vip = 1'), /WHERE/)
  assert.doesNotThrow(() => assertWhereGuarded('UPDATE users SET vip = 1 WHERE id = 2'))
  // 字面量里的 where 不能骗过守卫
  assert.throws(() => assertWhereGuarded("UPDATE users SET note = 'where?'"), /WHERE/)
  assert.doesNotThrow(() => assertWhereGuarded('DELETE FROM users WHERE id = 1'))
  assert.throws(() => assertSafeWhereCondition('1=1; DROP TABLE users'), /分号|semicolon/)
  assert.throws(() => assertSafeWhereCondition("name = 'a"), /unclosed quote/)
  assert.throws(() => assertSafeWhereCondition('1=1 INTO OUTFILE'), /INTO OUTFILE/)
  assert.equal(assertSafeWhereCondition("city = '杭州'"), "city = '杭州'")
  assert.equal(toSqlLiteral('mysql', "O'Neill"), "'O''Neill'")
  assert.equal(toSqlLiteral('mysql', 'a\nb'), "'a\\nb'")
  assert.equal(toSqlLiteral('postgres', true), 'TRUE')
  assert.equal(toSqlLiteral('sqlite', null), 'NULL')
  assert.equal(toSqlLiteral('sqlite', "it's"), "'it''s'")
  assert.equal(toCsv(['a', 'b'], [[1, 'x,y'], [2, null]]), 'a,b\n1,"x,y"\n2,\n')
})

test('new connections default to read-only', () => {
  const created = normalizeConnection({ kind: 'sqlite', name: 'r', file: '/tmp/x.db' })
  assert.equal(created.readOnly, true)
  const writable = normalizeConnection({ kind: 'sqlite', name: 'w', file: '/tmp/y.db', readOnly: false })
  assert.equal(writable.readOnly, false)
})

test('execute batches run in one transaction and roll back on failure', async () => {
  const { home, dba } = await makeDba()
  try {
    const demo = (await dba.listConnections()).connections[0]

    const batch = await dba.execute(
      demo.id,
      "INSERT INTO users (id,name,email,city,vip,created_at) VALUES (201,'批','b201@example.com','苏州',0,'2026-11-01 10:00:00'); UPDATE users SET vip = 1 WHERE id = 201",
    )
    assert.equal(batch.changes, 2)
    assert.equal(batch.wrapped, true)
    assert.equal(batch.results.length, 2)
    const check = await dba.query(demo.id, 'SELECT vip FROM users WHERE id = 201')
    assert.equal(check.rows[0].vip, 1)

    // UPDATE / DELETE without WHERE is refused; allowFullTable unlocks it.
    await assert.rejects(() => dba.execute(demo.id, 'UPDATE users SET vip = 1'), /WHERE/)
    await assert.rejects(() => dba.execute(demo.id, 'DELETE FROM users'), /WHERE/)
    await assert.doesNotReject(() => dba.execute(demo.id, 'UPDATE users SET vip = 1 WHERE id = 201'))

    // The failing email UNIQUE constraint rolls back the whole batch.
    const before = await dba.query(demo.id, 'SELECT COUNT(*) AS n FROM users')
    await assert.rejects(
      () => dba.execute(
        demo.id,
        "INSERT INTO users (id,name,email,city,vip,created_at) VALUES (202,'滚','r202@example.com','西安',0,'2026-11-01 10:00:00'); " +
        "INSERT INTO users (id,name,email,city,vip,created_at) VALUES (203,'重复','b201@example.com','西安',0,'2026-11-01 10:00:00')",
      ),
      /整批已回滚|rolled back/,
    )
    const after = await dba.query(demo.id, 'SELECT COUNT(*) AS n FROM users')
    assert.equal(after.rows[0].n, before.rows[0].n)
    const none = await dba.query(demo.id, 'SELECT COUNT(*) AS n FROM users WHERE id IN (202, 203)')
    assert.equal(none.rows[0].n, 0)
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('query handbook notes round-trip and stay out of the public projection', async () => {
  const { home, dba } = await makeDba()
  try {
    const demo = (await dba.listConnections()).connections[0]
    assert.equal(demo.notes, undefined)
    const saved = await dba.setNotes(demo.id, '# 口径\n- GMV 排除已取消订单')
    assert.match(saved.notes, /GMV/)
    const fetched = await dba.notes(demo.id)
    assert.equal(fetched.notes, saved.notes)

    const listed = (await dba.listConnections()).connections[0]
    assert.equal(listed.hasNotes, true)
    assert.equal(listed.notes, undefined)

    const cleared = await dba.setNotes(demo.id, '')
    assert.equal(cleared.notes, '')
    assert.equal((await dba.listConnections()).connections[0].hasNotes, false)

    // schema 的列表与描述模式都带回手册，模型一次调用即可拿到口径知识。
    await dba.setNotes(demo.id, '查询必须带 tenant_id 过滤')
    const tables = await dba.schema(demo.id)
    assert.equal(tables.notes, '查询必须带 tenant_id 过滤')
    const described = await dba.schema(demo.id, 'users')
    assert.equal(described.notes, '查询必须带 tenant_id 过滤')

    // 未精确命中的表名回退为包含匹配。
    const fuzzy = await dba.schema(demo.id, 'user')
    assert.equal(fuzzy.table, 'users')
    assert.equal(fuzzy.fuzzyMatchedFrom, 'user')
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('exportData writes csv, dml and ddl files', async () => {
  const { readFile } = await import('node:fs/promises')
  const { home, dba } = await makeDba()
  try {
    const demo = (await dba.listConnections()).connections[0]
    const outDir = join(home, 'exports-out')

    const csv = await dba.exportData(demo.id, { scope: 'csv', tables: ['users'], outputDir: outDir })
    assert.equal(csv.files.length, 1)
    const csvBody = await readFile(csv.files[0].path, 'utf8')
    assert.ok(csvBody.startsWith('\uFEFF'))
    assert.ok(csvBody.includes('name,email,city'))
    assert.ok(csvBody.includes('林小雨'))

    const dml = await dba.exportData(demo.id, { scope: 'dml', tables: ['users'], where: "city = '杭州'", outputDir: outDir })
    assert.equal(dml.files.length, 1)
    const dmlBody = await readFile(dml.files[0].path, 'utf8')
    assert.match(dmlBody, /INSERT INTO "users"/)
    assert.match(dmlBody, /林小雨/)

    const ddl = await dba.exportData(demo.id, { scope: 'ddl', outputDir: outDir })
    // 3 张基表合并写入同一个文件，逐表一条记录。
    assert.equal(ddl.files.length, 3)
    assert.ok(ddl.files.every((file) => file.path === ddl.files[0].path))
    const ddlBody = await readFile(ddl.files[0].path, 'utf8')
    assert.match(ddlBody, /CREATE TABLE/)

    await assert.rejects(() => dba.exportData(demo.id, { scope: 'csv', outputDir: outDir }), /tables/)
    await assert.rejects(
      () => dba.exportData(demo.id, { scope: 'csv', tables: ['users'], where: '1=1; DROP TABLE users', outputDir: outDir }),
      /分号|semicolon/,
    )
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})
