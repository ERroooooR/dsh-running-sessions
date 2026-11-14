/**
 * Bundle entry: bind the platform modules, register the dictionaries and the
 * header seat.
 *
 * The registration surface is the part of this plugin most exposed to a DSH
 * upgrade, so it is also the smallest module: everything it names lives in
 * `contract.js`, and every registration is wrapped in `ctx.effect` so a reload
 * or a disable takes it back out.
 */
const platform = require('./platform');
const contract = require('./contract');
const i18n = require('./i18n');
const style = require('./style');
const nav = require('./nav');
const config = require('./config');
const hint = require('./hint');
const roster = require('./roster');
const rows = require('./rows');
const mountState = require('./mount-state');
const geometry = require('./geometry');
const { RunningSessionsPill } = require('./component');

/**
 * Bind the two platform modules the kernel table provides.
 * @param requireHook - the kernel `require` handed to `factory(require)`
 */
function bindPlatform(requireHook) {
  const reactDom = requireHook('react-dom');
  platform.configure({
    React: requireHook('react'),
    createPortal: reactDom ? reactDom.createPortal : null,
  });
}

/**
 * Build the plugin exports for one activation.
 * @param requireHook - the kernel `require` handed to `factory(require)`
 */
function createPlugin(requireHook) {
  bindPlatform(requireHook);
  return {
    // Hard dependencies: the seat this renders into, the namespace its copy
    // lives in, and the service a row click calls.
    inject: [contract.SERVICE_SLOTS, contract.SERVICE_LOCALE, contract.SERVICE_WORKSPACE],
    apply(ctx) {
      nav.bindRuntime(ctx);
      style.injectStyles();
      ctx.effect(() => i18n.registerDictionaries(ctx), 'running-sessions: dictionaries');
      ctx.effect(
        () =>
          ctx[contract.SERVICE_SLOTS].inject(contract.SLOT, () =>
            ctx[contract.SERVICE_SLOTS].register(
              {
                name: contract.SLOT,
                id: contract.SLOT_ID,
                order: contract.SLOT_ORDER,
                locale: contract.LOCALE_NS,
              },
              RunningSessionsPill,
            ),
          ),
        'running-sessions: header seat',
      );
    },
  };
}

module.exports = {
  createPlugin,
  /**
   * Pure helpers, exposed so the headless checks drive the same functions the
   * component does instead of a re-implementation. This is the entire test seam;
   * the loader-facing plugin face above stays clean.
   */
  __internals: {
    // roster classification
    classifySessions: roster.classifySessions,
    resolveActivity: roster.resolveActivity,
    // counts and rows
    countRunning: rows.countRunning,
    buildRows: rows.buildRows,
    // options
    DEFAULT_CONFIG: config.DEFAULT_CONFIG,
    SUBAGENT_LIMIT: config.SUBAGENT_LIMIT,
    normalizeConfig: config.normalizeConfig,
    getConfig: config.getConfig,
    setConfig: config.setConfig,
    patchConfig: config.patchConfig,
    resetConfigCache: config.resetConfigCache,
    // onboarding hint
    hasSeenHint: hint.hasSeenHint,
    resetHintState: hint.resetHintState,
    // interaction state + pure helpers
    resetOpenState: mountState.resetOpenState,
    placeMenu: geometry.placeMenu,
    dictionaries: i18n.DICTIONARIES,
    // the component and the platform seam the render checks bind
    RunningSessionsPill,
    configurePlatform: platform.configure,
    dragExcludeAttr: contract.DRAG_EXCLUDE_ATTR,
  },
};
