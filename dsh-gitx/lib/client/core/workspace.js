import { React, h } from './runtime.js'
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
