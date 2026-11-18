/**
 * The Text size setting. Each step sets the root font size, which every rem size in the app (DVDash's own CSS and
 * Mantine's, including portalled lists, dialogs and tooltips) follows. Approved.css holds the matching root rules.
 */
export type TextSize = 'default' | 'large' | 'larger' | 'largest';

/**
 * Root size per step, as a share of the browser's 16 px default. 112.5 %, 125 % and 150 % make the root a whole 18, 20 and
 * 24 px, and sit near Apple's Dynamic Type body steps above the default (19, 21 and 23 to 28 pt over 17 pt).
 */
export const textScales: Readonly<Record<TextSize, number>> = {
  default: 1,
  large: 1.125,
  larger: 1.25,
  largest: 1.5,
};

export const TEXT_SIZE_KEY = 'dvdash-text-size';
export const TEXT_SIZE_ATTRIBUTE = 'data-dv-text-size';

export const isTextSize = (value: unknown): value is TextSize =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(textScales, value);

/** The saved step, or Default when nothing valid is saved or storage is unavailable. */
export function readTextSize(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage,
): TextSize {
  try {
    const value = storage?.getItem(TEXT_SIZE_KEY);
    return isTextSize(value) ? value : 'default';
  } catch {
    return 'default';
  }
}

export function writeTextSize(
  size: TextSize,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage,
) {
  try {
    storage?.setItem(TEXT_SIZE_KEY, size);
  } catch {
    /* Private mode or full storage: the choice lasts for this session only. */
  }
}

export function applyTextSize(
  size: TextSize,
  root: Element | undefined = globalThis.document?.documentElement,
) {
  root?.setAttribute(TEXT_SIZE_ATTRIBUTE, size);
}

/** How much larger than 16 px the root font is now. Canvas charts multiply their px font and axis sizes by it. */
export function rootTextScale(
  root: Element | undefined = globalThis.document?.documentElement,
) {
  if (!root) return 1;
  const size = parseFloat(getComputedStyle(root).fontSize);
  return Number.isFinite(size) && size > 0 ? size / 16 : 1;
}
