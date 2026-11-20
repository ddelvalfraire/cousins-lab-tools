import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { BrandMark } from './BrandMark';

afterEach(cleanup);

// The icon lives outside src, where tsc's ambient *.svg module can't tell if it moved; importing it here fails instead.
test('shows the repository app icon at the requested size', () => {
  const { container } = render(<BrandMark size={28} />);
  const mark = container.querySelector<HTMLElement>('.dv-brand-mark');

  expect(mark?.getAttribute('aria-hidden')).toBe('true');
  expect(mark?.style.width).toBe('28px');
  expect(mark?.style.height).toBe('28px');
  expect(mark?.querySelector('img')?.getAttribute('src')).toMatch(
    /assets\/branding\/dvdash\/icon\.svg$/,
  );
});
