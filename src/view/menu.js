/**
 * The popover shell: placement box, header, and either the list or the settings.
 *
 * Rendered through `createPortal` into `document.body` so the header's overflow
 * and stacking cannot clip it. The drag-exclusion attribute comes from
 * `contract.js`: a body portal has no layout box of its own, so the exclusion has
 * to sit on the visible menu box — without it, clicking the open menu on macOS
 * Desktop starts dragging the window instead. Plain Web and Windows ignore it.
 */
const { element } = require('../platform');
const contract = require('../contract');
const { renderHeader, renderSettings } = require('./settings');
const { renderList } = require('./list');

const h = element;

/**
 * @param state - `{ settingsOpen, hintVisible, counts, groups, config, now, pos, menuRef }`
 * @param t - translator
 * @param actions - `{ onToggleSettings, onPick, onConfigChange }`
 */
function renderMenu(state, t, actions) {
  const { settingsOpen, hintVisible, counts, groups, config, now, pos, menuRef } = state;
  const box = h(
    'div',
    {
      ref: menuRef,
      className: 'dsh-rs-menu',
      role: 'dialog',
      'aria-label': settingsOpen ? t('settings.title') : t('list.title'),
      [contract.DRAG_EXCLUDE_ATTR]: '',
      style: {
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : 0,
        width: pos ? pos.width : 320,
        visibility: pos ? 'visible' : 'hidden',
      },
    },
    renderHeader(settingsOpen, hintVisible, counts, t, actions.onToggleSettings),
    settingsOpen
      ? renderSettings(config, t, actions.onConfigChange)
      : renderList(groups, config, t, now, actions.onPick),
  );
  return box;
}

module.exports = { renderMenu };
