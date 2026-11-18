export interface Keyed<T> {
  key: string;
  item: T;
  index: number;
}

/**
 * Pairs each item with a React key made from its label. A repeated label gets the next count, so the keys stay unique
 * and an item keeps its key while the items before it keep theirs.
 */
export function keyedBy<T>(
  items: readonly T[],
  label: (item: T) => string,
): Keyed<T>[] {
  const seen = new Map<string, number>();
  return items.map((item, index) => {
    const name = label(item);
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return { key: `${count}:${name}`, item, index };
  });
}
