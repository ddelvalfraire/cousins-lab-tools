import * as hooks from '@mantine/hooks';

export function Fixture({ value }: { value: number }) {
  hooks.useDidUpdate(() => {}, [value]);
  return null;
}
