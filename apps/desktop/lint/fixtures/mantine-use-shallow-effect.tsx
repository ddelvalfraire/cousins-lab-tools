import { useShallowEffect } from '@mantine/hooks';

export function Fixture({ value }: { value: object }) {
  useShallowEffect(() => {}, [value]);
  return null;
}
