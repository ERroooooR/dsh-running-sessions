/**
 * Press handling for the pill.
 *
 * One press must toggle the menu exactly once, and a click that no press
 * preceded must still toggle. Two handlers can observe one press: the
 * conversation header is a window-drag surface that consumes pointer events
 * before they bubble, so the pill installs a capture listener on the page
 * window; the button also has its own handler, which is the only path when no
 * drag surface installed one. Both go through `toggleOnce`, so the same press
 * cannot open the menu and immediately close it again.
 *
 * The claim is tracked in a `WeakSet` keyed on the *native* event rather than by
 * writing a property onto it. Two reasons: a capture listener sees the DOM event
 * while a React handler is given a `SyntheticEvent` wrapper, so both paths have to
 * agree on one key; and a host event object is not guaranteed extensible, where a
 * write would fail silently and quietly disable the guard.
 *
 * Click is the awkward one. A pointer press or a key press is handled directly,
 * and the browser then emits a click for that same gesture — swallowing it is what
 * stops one press counting twice. But assistive technology and `button.click()`
 * produce a click with no press at all, and swallowing those would leave the pill
 * unusable from a screen reader. So a click is swallowed only when it arrives
 * right after a press this module handled, and is otherwise treated as the
 * activation it is.
 */

/** A click this soon after an activation is that activation's echo, not a new one. */
const ECHO_MS = 800

const claimedPresses = new WeakSet()

/** When the last press was claimed, for echo detection. */
let lastPressAt = 0

/** The DOM event behind a React synthetic event, or the event itself. */
function nativeOf(event) {
  return event ? event.nativeEvent || event : undefined
}

/** Toggle once per press; the same press seen again by another handler is ignored. */
function toggleOnce(event, flip) {
  const press = nativeOf(event)
  // No event means nothing to correlate, so the call is honoured as-is.
  if (!press || (typeof press !== 'object' && typeof press !== 'function')) {
    flip()
    return
  }
  if (claimedPresses.has(press)) return
  claimedPresses.add(press)
  lastPressAt = Date.now()
  flip()
}

/**
 * Install the capture listeners and return the detach function.
 *
 * @param pageWindow - the page window; anything with add/removeEventListener works
 * @param options - `{ isInside(target), toggle() }`
 */
function attachPressGuard(pageWindow, options) {
  const noop = () => {}
  if (!pageWindow || typeof pageWindow.addEventListener !== 'function') return noop
  const isInside = options.isInside
  const toggle = options.toggle

  const onCapture = (event) => {
    if (!isInside(event ? event.target : null)) return
    if (event.type === 'click') {
      event.stopPropagation()
      if (Date.now() - lastPressAt < ECHO_MS) return
      toggleOnce(event, toggle)
      return
    }
    // Without this the drag surface would start moving the window on the press.
    event.preventDefault()
    event.stopPropagation()
    toggleOnce(event, toggle)
  }

  pageWindow.addEventListener('pointerdown', onCapture, true)
  pageWindow.addEventListener('click', onCapture, true)
  return () => {
    pageWindow.removeEventListener('pointerdown', onCapture, true)
    pageWindow.removeEventListener('click', onCapture, true)
  }
}

/** Test seam: drop the echo clock so one case cannot swallow the next one's click. */
function resetPressState() {
  lastPressAt = 0
}

module.exports = { attachPressGuard, toggleOnce, resetPressState, ECHO_MS }
