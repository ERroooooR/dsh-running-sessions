/**
 * Host half of the running-sessions plugin.
 *
 * The whole feature lives in the browser: the pill and its dropdown are
 * registered into `conversation.header.leading` by `client.js`. The host
 * entry exists so the bundle has a loadable module face, and has nothing
 * to do.
 */
export function apply() {}
