/**
 * The pill itself: a button in the conversation header.
 *
 * It shows a live dot, the label, the count of running sessions, and a disclosure
 * caret. Subagents are deliberately absent: they are children of a session, so
 * they are already inside that session's count — a second badge saying "N sub"
 * next to "N sessions" reads as a second, competing total.
 */
const { element } = require('../platform');
const { caretIcon } = require('./icons');

const h = element;

/**
 * @param props - `{ open, empty, label, title, main, t, onToggle, onKeyDown,
 *   buttonRef }`
 *
 * `onToggle` receives the event, not just a call: the component uses it to make
 * one press toggle exactly once even though two handlers observe it (a capture
 * listener on the header's drag surface and this element's own pointer handler).
 */
function renderPill(props) {
  const { open, empty, label, title, main, t, onToggle, onKeyDown, buttonRef } = props;
  return h(
    'div',
    { className: 'dsh-rs-root' },
    h(
      'button',
      {
        type: 'button',
        ref: buttonRef,
        className: 'dsh-rs-pill',
        'data-open': open ? 'true' : 'false',
        'data-empty': empty ? 'true' : 'false',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': label,
        title,
        onPointerDown: (event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle(event);
        },
        onKeyDown,
      },
      h('span', { className: 'dsh-rs-dot', 'data-live': empty ? 'false' : 'true' }),
      h('span', null, t('pill.label')),
      main > 0 ? h('span', { className: 'dsh-rs-count' }, t('pill.count', { count: main })) : null,
      caretIcon(),
    ),
  );
}

module.exports = { renderPill };
