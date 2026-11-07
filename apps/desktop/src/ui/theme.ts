import { createTheme, type MantineColorsTuple } from '@mantine/core';
export const brand = { forest: '#063D30', jade: '#16A887', mint: '#8EF0B5', lime: '#E8F7A1', ivory: '#F7F8F2' } as const;
const forest: MantineColorsTuple = ['#eef8f0', '#d8efdf', '#b4dfc7', '#8acdb0', '#61b996', '#3aa67f', '#208767', '#126b51', '#0a503d', brand.forest];
export const dvdashTheme = createTheme({
  primaryColor: 'forest', primaryShade: 9, colors: { forest }, autoContrast: true, focusRing: 'auto', defaultRadius: 'md',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: { fontWeight: '650', sizes: { h1: { fontSize: '1.65rem', lineHeight: '1.2' }, h2: { fontSize: '1.1rem', lineHeight: '1.4' }, h3: { fontSize: '0.95rem', lineHeight: '1.4' } } },
  components: { Button: { defaultProps: { size: 'sm' } }, TextInput: { defaultProps: { size: 'sm' } }, NumberInput: { defaultProps: { size: 'sm' } }, Select: { defaultProps: { size: 'sm' } }, Paper: { defaultProps: { withBorder: true, radius: 'md' } } },
});
// Scientific series identity is independent of application branding.
export const seriesColors = {
  light: ['#326BA8', '#9351A5', '#A65B15', '#007C78', '#B54245', '#687A18', '#A93B78', '#53675E'],
  dark: ['#85B9EF', '#D9A0EB', '#F0B77C', '#73D5CC', '#F5A39F', '#D4DF8B', '#F2ACD7', '#BFCFC4'],
} as const;
