import { useEffectEvent } from 'react';

export function Fixture() {
  const onTick = useEffectEvent(() => {});
  return <button type="button" onClick={onTick}>Tick</button>;
}
