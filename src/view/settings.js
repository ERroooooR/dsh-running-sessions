/**
 * The settings panel.
 *
 * A pure view over the option bag: it renders the current values and calls back
 * with a patch, and never keeps its own copy of the options.
 *
 * `TOGGLE_KEYS` decides the row order, `LABELS` maps each option to its copy. The
 * two are separate so the panel can list options in a deliberate order without
 * the dictionary inheriting option names as keys.
 */
const { element } = require('../platform');
const { TOGGLE_KEYS, RECENT_CHOICES, DEFAULT_CONFIG } = require('../config');
const { settingsIcon, backIcon } = require('./icons');

const h = element;

/**
 * Option key → dictionary key.
 *
 * Kept as an explicit table rather than derived from the key name: the option
 * bag is an implementation detail, and a dictionary whose keys track it exactly
 * would rename user-facing copy every time an option is renamed.
 */
const LABELS = {
  showWhenIdle: 'settings.idle',
  showWorkspace: 'settings.workspace',
  showTime: 'settings.time',
  showPending: 'settings.pending',
  subagentActivity: 'settings.subagentActive',
  subagentRows: 'settings.subagentRows',
};

/** Panel rows from this key onward form the subagent-policy group. */
const SUBAGENT_KEYS = ['subagentActivity', 'subagentRows'];

/** The dictionary key for one option name. */
function labelKey(key) {
  return LABELS[key] || 'settings.' + key;
}

/** One label/control row. */
function settingsRow(key, label, control) {
  return h(
    'div',
    { className: 'dsh-rs-setRow', key },
    h('span', null, label),
    control,
  );
}

/** A boolean switch bound to one option. */
function toggle(key, value, t, onChange) {
  return h('button', {
    type: 'button',
    className: 'dsh-rs-switch',
    role: 'switch',
    'aria-checked': value ? 'true' : 'false',
    'aria-label': t(labelKey(key)),
    'data-on': value ? 'true' : 'false',
    onClick: () => onChange({ [key]: !value }),
  });
}

/** "Recently finished" segmented control. */
function recentSegments(config, t, onChange) {
  return h(
    'div',
    { className: 'dsh-rs-seg', role: 'group', 'aria-label': t('settings.recent') },
    RECENT_CHOICES.map((choice) =>
      h(
        'button',
        {
          key: choice,
          type: 'button',
          className: 'dsh-rs-segBtn',
          'data-on': config.recentLimit === choice ? 'true' : 'false',
          'aria-pressed': config.recentLimit === choice ? 'true' : 'false',
          onClick: () => onChange({ recentLimit: choice }),
        },
        choice === 0 ? t('settings.off') : String(choice),
      ),
    ),
  );
}

/**
 * The panel header: title plus the back/settings affordance.
 * @param settingsOpen - whether the panel (not the list) is showing
 */
function renderHeader(settingsOpen, hintVisible, counts, t, onToggleSettings) {
  return h(
    'div',
    { className: 'dsh-rs-head' },
    h(
      'div',
      { className: 'dsh-rs-headMain' },
      h('span', null, settingsOpen ? t('settings.title') : t('list.title')),
      !settingsOpen && hintVisible && counts.main > 0
        ? h('span', { className: 'dsh-rs-headHint' }, t('list.hint'))
        : null,
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-rs-iconBtn',
        'aria-label': settingsOpen ? t('settings.back') : t('settings.open'),
        title: settingsOpen ? t('settings.back') : t('settings.open'),
        onClick: onToggleSettings,
      },
      settingsOpen ? backIcon() : settingsIcon(),
    ),
  );
}

/** The settings panel body. */
function renderSettings(config, t, onChange) {
  const rows = [];
  let sawSubagentGroup = false;
  for (const key of TOGGLE_KEYS) {
    const isSubagent = SUBAGENT_KEYS.indexOf(key) !== -1;
    // Split the boolean list where the subagent policy starts.
    if (isSubagent && !sawSubagentGroup) {
      sawSubagentGroup = true;
      rows.push(h('div', { key: 'divSubagents', className: 'dsh-rs-divider', role: 'separator' }));
    }
    rows.push(settingsRow(key, t(labelKey(key)), toggle(key, config[key], t, onChange)));
    if (key === 'showWhenIdle') {
      rows.push(settingsRow('recent', t('settings.recent'), recentSegments(config, t, onChange)));
    }
  }
  rows.push(h('div', { key: 'divReset', className: 'dsh-rs-divider', role: 'separator' }));
  rows.push(
    h(
      'button',
      {
        key: 'reset',
        type: 'button',
        className: 'dsh-rs-reset',
        onClick: () => onChange(DEFAULT_CONFIG),
      },
      t('settings.reset'),
    ),
  );
  return h('div', { className: 'dsh-rs-set' }, rows);
}

module.exports = { renderHeader, renderSettings };
