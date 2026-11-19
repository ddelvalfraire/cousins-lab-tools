import React from 'react';

const { useLayoutEffect: l } = React;

export function Fixture() {
  l(() => {}, []);
  return null;
}
