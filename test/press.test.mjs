/**
 * Press checks: one press toggles the menu once, and a click that no press
 * preceded still toggles.
 *
 * These drive the real capture listeners through a fake page window rather than
 * rendering the component. The harness's React stand-in never runs effects, so a
 * render test cannot reach the code that matters here — and a check that only
 * exercises the mock would keep passing with the window wiring deleted.
 *
 * Run: node test/press.test.mjs
 */
import { createRequire } from 'node:module'
import { assert, makeChecker } from './harness.mjs'

const require = createRequire(import.meta.url)
const { attachPressGuard, toggleOnce, resetPressState, ECHO_MS } = require('../src/press.js')

const check = makeChecker()

/**
 * A page window that records its capture listeners, so a case can dispatch to the
 * same functions the browser would call.
 */
function fakeWindow() {
  const listeners = new Map()
  const key = (type, capture) => `${type}:${capture ? 'capture' : 'bubble'}`
  const target = { name: 'pill' }
  return {
    target,
    listeners,
    addEventListener(type, handler, capture) {
      listeners.set(key(type, capture), handler)
    },
    removeEventListener(type, handler, capture) {
      if (listeners.get(key(type, capture)) === handler) listeners.delete(key(type, capture))
    },
    dispatch(type) {
      const handler = listeners.get(key(type, true))
      if (!handler) throw new Error(`no capture listener for ${type}`)
      const event = {
        type,
        target,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() {
          this.defaultPrevented = true
        },
        stopPropagation() {
          this.propagationStopped = true
        },
      }
      handler(event)
      return event
    },
  }
}

/** A fresh guard over a fake window plus the state it toggles. */
function mount(isInside = () => true) {
  resetPressState()
  const page = fakeWindow()
  let open = false
  const detach = attachPressGuard(page, {
    isInside,
    toggle: () => {
      open = !open
    },
  })
  return { page, detach, isOpen: () => open }
}

check('a pointer press toggles the menu and cancels the drag surface', () => {
  const pill = mount()
  const event = pill.page.dispatch('pointerdown')
  assert.equal(pill.isOpen(), true)
  assert.equal(event.defaultPrevented, true, 'the header must not start a window drag')
  assert.equal(event.propagationStopped, true)
})

check('the click the browser sends for that press does not toggle again', () => {
  const pill = mount()
  pill.page.dispatch('pointerdown')
  const echo = pill.page.dispatch('click')
  assert.equal(pill.isOpen(), true, 'one press must not open and immediately close')
  assert.equal(echo.propagationStopped, true)
})

check('two full presses toggle twice', () => {
  const pill = mount()
  for (let press = 0; press < 2; press += 1) {
    pill.page.dispatch('pointerdown')
    pill.page.dispatch('click')
  }
  assert.equal(pill.isOpen(), false)
})

check('a click with no press behind it still toggles', () => {
  // Assistive technology and `button.click()` produce exactly this: a click with
  // no pointer or key press in front of it.
  const pill = mount()
  const event = pill.page.dispatch('click')
  assert.equal(pill.isOpen(), true, 'a screen-reader activation must not be swallowed')
  assert.equal(event.propagationStopped, true, 'the drag surface still must not see it')
})

check("a key press and the click it produces count once", () => {
  const pill = mount()
  // What the button's own onKeyDown handler does, through the same guard.
  toggleOnce({ key: 'Enter' }, () => {})
  pill.page.dispatch('click')
  assert.equal(pill.isOpen(), false, 'the keyboard handler owns the toggle, not its echo')
})

check('a click after the echo window is a new activation', async () => {
  const pill = mount()
  pill.page.dispatch('pointerdown')
  assert.equal(pill.isOpen(), true)
  await new Promise((resolve) => setTimeout(resolve, ECHO_MS + 60))
  pill.page.dispatch('click')
  assert.equal(pill.isOpen(), false, 'a late click must be treated as its own activation')
})

check('one native press seen by two handlers toggles once', () => {
  resetPressState()
  const native = { type: 'pointerdown' }
  let flips = 0
  const flip = () => {
    flips += 1
  }
  toggleOnce(native, flip)
  // A React handler receives a wrapper around the same native event.
  toggleOnce({ nativeEvent: native }, flip)
  assert.equal(flips, 1)
})

check('presses outside the pill are left completely alone', () => {
  const pill = mount(() => false)
  const press = pill.page.dispatch('pointerdown')
  const click = pill.page.dispatch('click')
  assert.equal(pill.isOpen(), false)
  assert.equal(press.defaultPrevented, false)
  assert.equal(press.propagationStopped, false)
  assert.equal(click.propagationStopped, false)
})

check('detaching removes both listeners', () => {
  const pill = mount()
  assert.equal(pill.page.listeners.size, 2)
  pill.detach()
  assert.equal(pill.page.listeners.size, 0)
  assert.throws(() => pill.page.dispatch('pointerdown'), /no capture listener/)
})

check('a window without addEventListener degrades to a no-op', () => {
  const detach = attachPressGuard(null, { isInside: () => true, toggle: () => {} })
  assert.equal(typeof detach, 'function')
  detach()
  assert.equal(typeof attachPressGuard({}, { isInside: () => true, toggle: () => {} }), 'function')
})

check.summary()
