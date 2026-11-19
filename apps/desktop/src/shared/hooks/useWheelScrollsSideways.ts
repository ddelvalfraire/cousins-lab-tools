import { useEventListener } from '@mantine/hooks';

/** WheelEvent.deltaMode values, spelled out so the calculation runs outside a browser too. */
const DOM_DELTA_LINE = 1,
  DOM_DELTA_PAGE = 2;
const LINE_PX = 16;

interface Wheel {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}
interface Row {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** Where a mostly vertical wheel turn moves a row that scrolls sideways, or null when the wheel should act as usual. */
export function sidewaysScrollLeft(wheel: Wheel, row: Row): number | null {
  if (Math.abs(wheel.deltaY) <= Math.abs(wheel.deltaX)) return null;
  const step =
    wheel.deltaMode === DOM_DELTA_LINE
      ? LINE_PX
      : wheel.deltaMode === DOM_DELTA_PAGE
        ? row.clientWidth
        : 1;
  const max = row.scrollWidth - row.clientWidth;
  const next = Math.min(max, Math.max(0, row.scrollLeft + wheel.deltaY * step));
  if (max <= 0 || next === row.scrollLeft) return null;
  return next;
}

function scrollSideways(event: WheelEvent) {
  const row = event.currentTarget as HTMLElement;
  const next = sidewaysScrollLeft(event, row);
  if (next === null) return;
  event.preventDefault();
  row.scrollLeft = next;
}

// Not passive, so the listener can stop the page scrolling while it moves the row.
const NOT_PASSIVE = { passive: false };

/** A ref callback that lets a plain mouse wheel scroll its element sideways. */
export function useWheelScrollsSideways() {
  return useEventListener('wheel', scrollSideways, NOT_PASSIVE);
}
