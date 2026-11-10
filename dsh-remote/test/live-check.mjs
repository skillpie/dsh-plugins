/**
 * Live end-to-end check against a running DSH process with dsh-remote
 * installed (direct mode). Read-only: welcome, session list, observe one
 * session, then close. No prompts are sent.
 *
 * Run: node test/live-check.mjs [origin] [code]
 */
import WebSocket from 'ws'

const origin = process.argv[2] ?? 'http://127.0.0.1:58464'
const url = new URL(origin)
const code = process.argv[3]
if (!code || !/^\d{8}$/.test(code)) {
  console.error('usage: node test/live-check.mjs [origin] [8-digit-code]')
  process.exit(2)
}

const ws = new WebSocket(`${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/${code}/ws`)
const timer = setTimeout(() => {
  console.error('LIVE CHECK FAILED: timeout')
  process.exit(1)
}, 15_000)

ws.on('message', (data) => {
  const frame = JSON.parse(String(data))
  if (frame.t === 'welcome') {
    console.log(`welcome: host=${frame.host?.name} allowControl=${frame.host?.allowControl} sessions=${frame.sessions?.length}`)
    const first = frame.sessions?.[0]
    if (!first) {
      console.log('no sessions on host — live check passes (list reached sessionController)')
      clearTimeout(timer)
      ws.close()
      return
    }
    console.log(`observing session ${first.id} "${first.title ?? '(untitled)'}" running=${first.running}`)
    ws.send(JSON.stringify({ t: 'cmd', id: 'r1', cmd: 'sessions.observe', p: { sessionId: first.id } }))
    return
  }
  if (frame.t === 'res' && frame.id === 'r1') {
    if (!frame.ok) {
      console.error('LIVE CHECK FAILED: observe rejected:', frame.error)
      process.exit(1)
    }
    console.log(`observe accepted: cursor=${frame.data.cursor} running=${frame.data.state.running}`)
    return
  }
  if (frame.t === 'push') {
    console.log(`push: f.t=${frame.f?.t} sessionId=${frame.f?.sessionId ?? ''}`)
    if (frame.f?.t === 'session-history') {
      const kinds = {}
      for (const record of frame.f.records ?? []) {
        const type = record?.event?.type ?? '?'
        kinds[type] = (kinds[type] ?? 0) + 1
      }
      console.log(`history received: ${frame.f.records?.length ?? 0} records`, kinds)
      console.log('LIVE CHECK PASSED')
      clearTimeout(timer)
      ws.close()
      process.exit(0)
    }
    return
  }
  console.log(`frame: t=${frame.t} id=${frame.id ?? ''} ok=${frame.ok}`)
})

ws.on('error', (error) => {
  console.error('LIVE CHECK FAILED: ws error', error.message)
  process.exit(1)
})
