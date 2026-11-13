import { Fragment, React, ReactDOM, h } from './runtime.js'
import { HeaderGitCluster } from '../shell/window.js'
import { getWorkspaceNavigation, subscribeWorkspaceNavigation, acknowledgeWorkspaceNavigation } from './workspace-navigation.js'
import { Spinner } from '../ui/spinner.js'
import { publishWorktreeContext } from '../features/worktrees/workspace.js'
/** Resolve the selected session's workspace, never the registry's first item. */
export function workspaceDirectory(workspaces, sessions, sessionId) {
  var workspace = (workspaces?.items || []).find(function (item) {
    return (item.sessionIds || []).includes(sessionId)
  })
  return workspace?.path || sessions?.byId?.[sessionId]?.cwd || ''
}

var CORNER_CHIPS_MARK = 'data-dshgit-corner-chips'

/**
 * The blank session header hides its utilities row entirely (the platform
 * renders only the corner seat there), so the New Session page carries the
 * chips through this bridge: it portals the cluster into the header corner
 * until the utilities row takes over on the first message.
 */
function findBlankHeaderCorner(own) {
  var corners = document.querySelectorAll('[data-conversation-header-corner]')
  for (var i = 0; i < corners.length; i++) {
    var corner = corners[i]
    var header = corner.closest('[data-window-drag]') || corner.parentElement
    if (!header) continue
    // Real sessions render the utilities seat — duplicates would fight over
    // one navigation store, so the bridge only claims headerless rows.
    if (header.querySelector('[class*="headerUtilities"]')) continue
    // A foreign bridge's claim disqualifies the header; our own must not —
    // skipping it made placement undo itself (insert → unclaimed → remove →
    // claimed again), an insert/remove microtask loop that froze the renderer.
    var marked = header.querySelector('[' + CORNER_CHIPS_MARK + ']')
    if (marked && marked !== own) continue
    return corner
  }
  return null
}

/**
 * Mounted on every composer surface. Besides settling resolved workspace
 * switches (see the acknowledge effect — without it the next header to mount
 * would wait on a navigation that already finished), it draws the chips in the
 * blank session header's corner so the New Session page matches every other
 * header's top-right placement.
 */
export function WorkspaceBlankBridge(props) {
  var workspaces = props.useWorkspaces ? props.useWorkspaces(function (value) { return value }) : null
  var sessions = props.useSessions ? props.useSessions(function (value) { return value }) : null
  var directory = workspaceDirectory(workspaces, sessions, props.sessionId)
  React.useEffect(function () { if (workspaces || sessions) publishWorktreeContext(workspaces, sessions) }, [workspaces, sessions])
  var navigation = React.useSyncExternalStore(subscribeWorkspaceNavigation, getWorkspaceNavigation)
  React.useEffect(function () {
    if (directory) acknowledgeWorkspaceNavigation(props.sessionId)
  }, [navigation, props.sessionId, directory])
  var anchor = React.useRef(null), containerState = React.useState(null)
  React.useLayoutEffect(function () {
    var container = null
    var detach = function () {
      if (!container) return
      container.remove()
      container = null
      containerState[1](null)
    }
    var place = function () {
      // Already seated in a still-blank corner: keep it. Re-deciding on every
      // body mutation lets two eligible corners (or a transient mismatch)
      // oscillate forever under the observer.
      if (container && container.isConnected && container.parentElement?.closest('[data-conversation-header-corner]')) {
        var seated = container.closest('[data-window-drag]')
        if (!seated || !seated.querySelector('[class*="headerUtilities"]')) return
      }
      var corner = directory ? findBlankHeaderCorner(container) : null
      if (corner && container?.parentElement === corner) return
      detach()
      if (corner) {
        container = document.createElement('div')
        container.className = 'dshgit-headercorner'
        container.setAttribute(CORNER_CHIPS_MARK, '')
        corner.insertBefore(container, corner.firstChild)
        containerState[1](container)
      }
    }
    place()
    // The header row is replaced as sessions switch and the blank flag flips.
    var observer = typeof MutationObserver === 'function' ? new MutationObserver(place) : null
    observer?.observe(document.body, { childList: true, subtree: true })
    return function () { observer?.disconnect(); detach() }
  }, [directory, props.sessionId])
  return h(Fragment, null, [
    h('span', { key: 'anchor', ref: anchor, hidden: true }),
    containerState[0] && directory && props.connection ? ReactDOM.createPortal(navigation ? h('button', { type: 'button', className: 'dshgit-chip', disabled: true, 'aria-busy': true, 'data-workspace-pending': true }, [
      h(Spinner, { key: 'spinner', className: 'dshgit-spinner' }), props.t('state.loading'),
    ]) : h(HeaderGitCluster, {
      key: String(props.sessionId || '') + ':' + directory,
      connection: props.connection, sessionId: props.sessionId,
      directory: directory, t: props.t,
    }), containerState[0]) : null,
  ])
}

/** The resident session header shares this context adapter. */
export function WorkspaceGitAction(props) {
  var workspaces = props.useWorkspaces ? props.useWorkspaces(function (value) { return value }) : null
  var sessions = props.useSessions ? props.useSessions(function (value) { return value }) : null
  var directory = workspaceDirectory(workspaces, sessions, props.sessionId)
  React.useEffect(function () { if (workspaces || sessions) publishWorktreeContext(workspaces, sessions) }, [workspaces, sessions])
  var navigation = React.useSyncExternalStore(subscribeWorkspaceNavigation, getWorkspaceNavigation)
  React.useEffect(function () {
    if (directory) acknowledgeWorkspaceNavigation(props.sessionId)
  }, [navigation, props.sessionId, directory])
  // Older Hosts without standard workspace hooks keep the session resolver.
  if ((workspaces || sessions) && !directory) return null
  var controls = navigation ? h('button', { type: 'button', className: 'dshgit-chip', disabled: true, 'aria-busy': true, 'data-workspace-pending': true }, [
    h(Spinner, { key: 'spinner', className: 'dshgit-spinner' }), props.t('state.loading'),
  ]) : h(HeaderGitCluster, {
    key: String(props.sessionId || '') + ':' + directory,
    connection: props.connection, sessionId: props.sessionId,
    directory: directory || undefined, t: props.t,
  })
  return controls
}
