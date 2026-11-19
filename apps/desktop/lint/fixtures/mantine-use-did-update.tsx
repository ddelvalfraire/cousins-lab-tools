import { useDidUpdate } from '@mantine/hooks';

export function Fixture({ value }: { value: number }) {
  useDidUpdate(() => {}, [value]);
  return null;
}
