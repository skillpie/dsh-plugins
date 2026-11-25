import assert from 'node:assert/strict'
import net from 'node:net'
import { test } from 'node:test'
import { openConnection } from '../lib/drivers.js'

// 本地未安装 pg 时跳过(pg 是运行时可选依赖,CI/裸检出会没有)。
let pgAvailable = true
try {
  await import('pg')
} catch {
  pgAvailable = false
}

// ── 最小 PostgreSQL 线协议桩 ────────────────────────────────────────────────
// 只回复 pg 建连握手(AuthenticationOk/ParameterStatus/BackendKeyData/
// ReadyForQuery)与简单查询(CommandComplete+ReadyForQuery),足够真实 pg
// 客户端完成建连、SET 与 SELECT。

function stubMsg(type, payload) {
  const buf = Buffer.alloc(5 + payload.length)
  buf.write(type, 0, 'ascii')
  buf.writeUInt32BE(4 + payload.length, 1)
  payload.copy(buf, 5)
  return buf
}

function cstr(value) {
  return Buffer.from(String(value) + '\0', 'utf8')
}

function paramStatus(key, value) {
  return stubMsg('S', Buffer.concat([cstr(key), cstr(value)]))
}

function handshake() {
  const keyData = Buffer.alloc(8)
  keyData.writeUInt32BE(1234, 0)
  keyData.writeUInt32BE(5678, 4)
  return Buffer.concat([
    stubMsg('R', Buffer.from([0, 0, 0, 0])), // AuthenticationOk(trust)
    paramStatus('server_version', '14.0'),
    paramStatus('client_encoding', 'UTF8'),
    paramStatus('integer_datetimes', 'on'),
    stubMsg('K', keyData), // BackendKeyData
    stubMsg('Z', Buffer.from('I')), // ReadyForQuery(idle)
  ])
}

function queryDone(tag = 'SELECT 1') {
  return Buffer.concat([stubMsg('C', cstr(tag)), stubMsg('Z', Buffer.from('I'))])
}

function createStubPg() {
  const sockets = new Set()
  const queries = []
  let connectionCount = 0
  const server = net.createServer((socket) => {
    connectionCount++
    sockets.add(socket)
    let buf = Buffer.alloc(0)
    let started = false
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      // 首帧是 StartupMessage,没有类型字节:int32 长度在偏移 0。
      if (!started) {
        if (buf.length < 4) return
        const len = buf.readUInt32BE(0)
        if (buf.length < len) return
        buf = buf.subarray(len)
        started = true
        socket.write(handshake())
      }
      // 后续帧:1 字节类型 + int32 长度(含自身) + 载荷。
      while (buf.length >= 5) {
        const len = buf.readUInt32BE(1)
        if (buf.length < 1 + len) break
        const type = buf.toString('ascii', 0, 1)
        const body = buf.subarray(5, 1 + len)
        buf = buf.subarray(1 + len)
        if (type === 'Q') {
          queries.push(body.toString('utf8').replace(/\0+$/, ''))
          socket.write(queryDone())
        }
        // 'X'(Terminate)等其他类型一律忽略。
      }
    })
    const drop = () => sockets.delete(socket)
    socket.on('close', drop)
    socket.on('error', drop)
  })
  server.queries = queries
  server.sockets = sockets
  server.getConnectionCount = () => connectionCount
  return server
}

async function listen(stub) {
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve))
  return stub.address().port
}

test('pg 池空闲连接断网不崩进程,后续查询自动重连(BUG-1 回归)', { skip: pgAvailable ? false : '本地未安装 pg,跳过' }, async () => {
  const stub = createStubPg()
  const port = await listen(stub)
  const adapter = await openConnection({
    kind: 'postgres',
    name: 'stub',
    host: '127.0.0.1',
    port,
    user: 'u',
    password: 'p',
    database: 'd',
    ssl: false,
  })

  try {
    // 首次连接 + 查询成功。
    assert.equal(await adapter.ping(), true)
    assert.equal(stub.getConnectionCount(), 1)
    // onConnect 的 SET 已先行完成,随后才是业务查询(顺序见 queries)。
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(stub.queries.some((sql) => sql.startsWith('SET statement_timeout')), true)
    assert.equal(stub.queries.some((sql) => sql === 'SELECT 1'), true)

    // 模拟断网:服务端直接销毁已建立的连接,池内此刻存在空闲连接。
    // 修复前:客户端 error → pg-pool 在池上 emit('error') 无监听 →
    // uncaughtException,本测试进程直接退出,以下断言永远到不了。
    for (const socket of stub.sockets) socket.destroy()
    await new Promise((resolve) => setTimeout(resolve, 300))

    // 进程仍在,且下一条查询自动建立新连接成功。
    assert.equal(await adapter.ping(), true)
    assert.ok(stub.getConnectionCount() >= 2, '断网后应自动重连(新连接)')
  } finally {
    await adapter.close().catch(() => {})
    await new Promise((resolve) => stub.close(resolve))
  }
})

test('pg 首条业务查询不与 onConnect 的 SET 并发(BUG-2 回归)', { skip: pgAvailable ? false : '本地未安装 pg,跳过' }, async () => {
  // pg 的该并发场景会经 util.deprecate 发出进程级 DeprecationWarning,
  // 修复(onConnect 被池 await)后不得再出现。
  const warnings = []
  const onWarning = (warning) => warnings.push(warning)
  process.on('warning', onWarning)

  const stub = createStubPg()
  const port = await listen(stub)
  const adapter = await openConnection({
    kind: 'postgres',
    name: 'stub',
    host: '127.0.0.1',
    port,
    user: 'u',
    password: 'p',
    database: 'd',
    ssl: false,
  })

  try {
    assert.equal(await adapter.ping(), true)
    await new Promise((resolve) => setTimeout(resolve, 200)) // emitWarning 异步送达
    const fired = warnings.some((warning) =>
      String(warning.message ?? warning).includes('already executing a query'),
    )
    assert.equal(fired, false, '不应出现 "already executing a query" 弃用告警')
    // SET 必须先于首条业务查询完成(wire 上 SET 应答先到,SELECT 才被下发)。
    const setIndex = stub.queries.findIndex((sql) => sql.startsWith('SET statement_timeout'))
    const selectIndex = stub.queries.findIndex((sql) => sql === 'SELECT 1')
    assert.ok(setIndex !== -1 && selectIndex !== -1 && setIndex < selectIndex)
  } finally {
    process.off('warning', onWarning)
    await adapter.close().catch(() => {})
    await new Promise((resolve) => stub.close(resolve))
  }
})
