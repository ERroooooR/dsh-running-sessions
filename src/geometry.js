/**
 * Popover placement.
 *
 * A pure geometry function: given the pill's box, the viewport, and the menu's
 * current height, decide where the fixed-position menu goes. Kept separate from
 * the component so the flip/clamp rules can be checked without a layout engine,
 * and so a future menu-surface primitive can replace the maths in one place.
 */

/** Gaps: below/above the pill, and from every viewport edge. */
const GAP = 6;
const EDGE = 8;
/**
 * Menu width bounds. The maximum is sized to the content the menu actually
 * carries — a title and a short meta line — so the panel does not open a wide
 * empty gutter on the right of every row.
 */
const WIDTH_MIN = 200;
const WIDTH_MAX = 240;

/**
 * @param rect - `{ left, top, bottom, width }` of the pill
 * @param viewport - `{ width, height }`
 * @param menuHeight - measured menu height, or `0` before it is known
 * @returns `{ left, top, width }`
 */
function placeMenu(rect, viewport, menuHeight) {
  const viewportWidth = viewport && viewport.width > 0 ? viewport.width : 1280;
  const viewportHeight = viewport && viewport.height > 0 ? viewport.height : 800;
  // A viewport narrower than the minimum still gets a menu that fits: a 240px
  // floor would otherwise push the box past the right edge on a split pane.
  const available = Math.max(1, viewportWidth - EDGE * 2);
  const width = available < WIDTH_MIN ? available : Math.min(WIDTH_MAX, available);
  const left = Math.max(EDGE, Math.min(rect.left, viewportWidth - width - EDGE));
  let top = rect.bottom + GAP;
  if (menuHeight > 0 && top + menuHeight > viewportHeight - EDGE) {
    // Prefer flipping above the pill; fall back to hugging the bottom edge when
    // the menu is taller than the space on either side.
    const above = rect.top - GAP - menuHeight;
    top = above >= EDGE ? above : Math.max(EDGE, viewportHeight - EDGE - menuHeight);
  }
  return { left, top, width };
}

module.exports = { placeMenu, EDGE };
