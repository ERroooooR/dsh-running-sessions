/**
 * Workspace navigation: turn a row click into the same call the sidebar makes.
 *
 * The service handle is kept here rather than in the component so the view never
 * sees a Cordis context. Binding is best-effort by design: if the service is not
 * reachable (not yet provided, or renamed by a future DSH), a click logs once and
 * does nothing rather than throwing inside a React event handler.
 */
const contract = require('./contract');

/** The client root context, bound at activation. */
let runtime = null;
/** True once an unavailable service has been reported, so a click cannot spam. */
let reported = false;

/** Bind the client context; called from `apply`. */
function bindRuntime(ctx) {
  runtime = ctx;
  reported = false;
}

/**
 * Resolve the workspace service from the context, either access shape.
 *
 * A Cordis context THROWS when a declared service has no active provider
 * (`cannot get required service "…" in inactive context`), so both reads are
 * guarded: during a workspace switch or teardown a click must stay inert, not
 * propagate an exception into the click handler.
 */
function workspaceService() {
  if (!runtime) return null;
  try {
    const direct = runtime[contract.SERVICE_WORKSPACE];
    if (direct && typeof direct.openSession === 'function') return direct;
    // The `get` form is the optional-access shape and covers a late registration.
    if (typeof runtime.get === 'function') {
      const fetched = runtime.get(contract.SERVICE_WORKSPACE);
      if (fetched && typeof fetched.openSession === 'function') return fetched;
    }
  } catch {
    // Unavailable for now; the caller reports and stays inert.
  }
  return null;
}

/**
 * Switch to one session.
 * @returns whether the navigation was handed to the Host.
 */
function openSession(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
  const workspace = workspaceService();
  if (!workspace) {
    if (!reported) {
      reported = true;
      console.error('[running-sessions] uiWorkspace service unavailable; row clicks are inert');
    }
    return false;
  }
  try {
    workspace.openSession(sessionId);
    return true;
  } catch (error) {
    console.error('[running-sessions] openSession failed', error);
    return false;
  }
}

module.exports = { bindRuntime, openSession };
