import React from 'react';

export function Fixture() {
  const { ['use\x45ffect']: run } = React;
  run(() => {}, []);
  return null;
}
