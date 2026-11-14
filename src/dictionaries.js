/**
 * UI copy, in one place.
 *
 * `zh` is the key-set source of truth: every key exists here first, and `en`
 * mirrors it. `test/integration.test.mjs` enforces both directions — a key used
 * by the view must exist in `zh`, and a key in `zh` must actually be rendered —
 * so an unused or misspelled string fails a test instead of sitting dead.
 *
 * Only main-agent sessions are counted: a subagent's session is a compact row
 * nested under the session that owns it, never a second total on the pill. Its
 * activity still keeps the pill's aria text honest when no main session runs.
 */
const zh = {
  'pill.label': '运行中',
  'pill.count': '{count} 个',
  'pill.aria': '正在运行的会话：{count} 个',
  'pill.subaria': '另有 {count} 个子 agent 在运行',
  'pill.empty.aria': '当前没有正在运行的会话',
  'list.title': '正在运行的会话',
  'list.hint': '点击即切换',
  'list.recent': '最近完成',
  'list.empty': '现在没有正在运行的会话',
  'row.pending.approval': '等待授权',
  'row.pending.plan': '等待确认计划',
  'row.pending.question': '等待回答',
  'row.pending.other': '等待处理',
  'ago.now': '刚刚',
  'ago.minutes': '{count} 分钟',
  'ago.hours': '{count} 小时',
  'ago.days': '{count} 天',
  'settings.open': '设置',
  'settings.title': '设置',
  'settings.back': '返回会话列表',
  'settings.idle': '没有运行中会话时也显示胶囊',
  'settings.recent': '最近完成',
  'settings.workspace': '显示工作区',
  'settings.time': '显示时间',
  'settings.pending': '显示待处理标记',
  'settings.subagentActive': '子 agent 活动算作运行中',
  'settings.subagentRows': '在主会话下面列出子 agent',
  'settings.off': '关闭',
  'settings.reset': '恢复默认',
};

/** English dictionary, key-identical to the Chinese source of truth. */
const en = {
  'pill.label': 'Running',
  'pill.count': '{count}',
  'pill.aria': 'Running sessions: {count}',
  'pill.subaria': '{count} more sub-agent(s) running',
  'pill.empty.aria': 'No session is running',
  'list.title': 'Running sessions',
  'list.hint': 'Click to switch',
  'list.recent': 'Recently finished',
  'list.empty': 'No session is running right now',
  'row.pending.approval': 'Waiting for approval',
  'row.pending.plan': 'Waiting for plan review',
  'row.pending.question': 'Waiting for an answer',
  'row.pending.other': 'Waiting',
  'ago.now': 'just now',
  'ago.minutes': '{count}m',
  'ago.hours': '{count}h',
  'ago.days': '{count}d',
  'settings.open': 'Settings',
  'settings.title': 'Settings',
  'settings.back': 'Back to sessions',
  'settings.idle': 'Keep the pill visible when nothing runs',
  'settings.recent': 'Recently finished',
  'settings.workspace': 'Show workspace',
  'settings.time': 'Show elapsed time',
  'settings.pending': 'Show pending badges',
  'settings.subagentActive': 'Sub-agent activity counts as running',
  'settings.subagentRows': 'Nest sub-agents under their session',
  'settings.off': 'Off',
  'settings.reset': 'Reset to defaults',
};

module.exports = { zh, en };
