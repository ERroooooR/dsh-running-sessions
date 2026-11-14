/**
 * Locale adapter.
 *
 * The dictionaries are the plugin's own; everything else about locales — which
 * locale is active, the `t` prop a slot may render, the fallback chain — belongs
 * to DSH. This module keeps that split explicit: it registers the dictionaries
 * with the locale service and resolves a translator for a render.
 *
 * A missing translation falls back to `en` and then to the key itself, so a
 * dictionary edit can never blank out the UI.
 */

const contract = require('./contract');
const { zh, en } = require('./dictionaries');

/** The dictionaries handed to `ctx.locale.register`. */
const DICTIONARIES = { zh, en };

/** Substitute `{name}` placeholders; unknown names stay literal. */
function format(template, params) {
  if (!params) return template;
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/** Look up one key in one dictionary. */
function lookup(dictionary, key) {
  const value = dictionary ? dictionary[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Resolve the translator for one render.
 *
 * A slot may pass its own `t` (already scoped to this plugin's namespace); when
 * it does not, this module translates against its own dictionaries. Either way
 * the fallback order is the same, so a missing key is visible but harmless.
 */
function resolveTranslator(props) {
  const supplied = props ? props.t : undefined;
  if (typeof supplied === 'function') return supplied;
  return (key, params) => {
    const template = lookup(zh, key) !== undefined
      ? lookup(zh, key)
      : lookup(en, key) !== undefined
        ? lookup(en, key)
        : key;
    return format(template, params);
  };
}

/** Register the dictionaries with the client locale service. */
function registerDictionaries(ctx) {
  return ctx[contract.SERVICE_LOCALE].register(contract.LOCALE_NS, DICTIONARIES);
}

module.exports = { DICTIONARIES, resolveTranslator, registerDictionaries };
