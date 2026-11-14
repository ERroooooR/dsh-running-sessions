/**
 * Inline SVG glyphs.
 *
 * All three are hairline outlines: a filled silhouette at 13-14px reads as a
 * solid blob against the header and steals attention from the title, so the
 * settings affordance in particular is drawn as two 1.15px strokes.
 */
const { element } = require('../platform');

const h = element;

/** Outline "tune" sliders (settings). Two strokes, two hairline circles. */
function settingsIcon() {
  return h(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
    h('path', {
      d: 'M2 5.2h2.4M8.4 5.2h5.6M2 10.8h5.6M11.6 10.8h2.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
      strokeLinecap: 'round',
    }),
    h('circle', {
      cx: '6.4',
      cy: '5.2',
      r: '1.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
    }),
    h('circle', {
      cx: '9.6',
      cy: '10.8',
      r: '1.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
    }),
  );
}

/** Back chevron (settings → list). */
function backIcon() {
  return h(
    'svg',
    { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
    h('path', {
      d: 'M10 3.5 5.5 8 10 12.5',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}

/** Disclosure caret on the pill. */
function caretIcon() {
  return h(
    'svg',
    {
      className: 'dsh-rs-caret',
      width: 10,
      height: 10,
      viewBox: '0 0 10 10',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('path', {
      d: 'M2.4 3.9 5 6.5 7.6 3.9',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}

module.exports = { settingsIcon, backIcon, caretIcon };
