import React from 'react';

const run = React.useEffect;

export function Fixture() {
  run(() => {}, []);
  return null;
}
