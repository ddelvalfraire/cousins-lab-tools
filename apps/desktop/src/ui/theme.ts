import { createTheme, type MantineColorsTuple, Select } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { createElement } from 'react';
import './components/Approved.css';
import { motion } from './motion';
export const brand = {
  forest: '#063D30',
  jade: '#16A887',
  mint: '#8EF0B5',
  lime: '#E8F7A1',
  ivory: '#F7F8F2',
} as const;
const forest: MantineColorsTuple = [
  '#eef8f0',
  '#d8efdf',
  '#b4dfc7',
  '#8acdb0',
  '#61b996',
  '#3aa67f',
  '#208767',
  '#126b51',
  '#0a503d',
  brand.forest,
];
// Plain Modal and Drawer render these same overlay parts as the compound dialogs, so every dialog shares the approved dim and blur.
const dialogOverlay = {
  defaultProps: { color: '#0e1a14', backgroundOpacity: 0.4, blur: 4 },
};
// Dialogs and drawers open and close on the shared motion timing (motion.ts); their dim follows the same timing.
const dialogMotion = {
  duration: motion.base,
  exitDuration: motion.fast,
  timingFunction: motion.easeOut,
};
// Every scroll area gets the thin overlay bar (Approved.css); it shows on hover or while scrolling and takes no width.
const scrollArea = {
  defaultProps: { scrollbarSize: 8, scrollHideDelay: 600 },
  classNames: { scrollbar: 'dv-scroll-bar', thumb: 'dv-scroll-thumb' },
};
// The one select: Mantine Select, styled in Approved.css. Fields size it through the --dv-select-* variables.
const select = Select.extend({
  defaultProps: {
    size: 'sm',
    rightSection: createElement(IconChevronDown, {
      className: 'dv-select-chevron',
      'aria-hidden': true,
    }),
    searchable: false,
    allowDeselect: false,
    withCheckIcon: true,
    withAlignedLabels: true,
    maxDropdownHeight: 'min(320px, 45vh)',
    // Select passes its own scroll bar size and offset, which would override the ScrollArea theme defaults above.
    // A long list's scroller must be focusable for axe, and it sits inside the listbox, which may only own options and
    // groups. Focus stays on the field while the list is open, and Tab closes the list before it can reach the scroller.
    scrollAreaProps: {
      scrollbarSize: 8,
      offsetScrollbars: false,
      viewportProps: { tabIndex: 0, role: 'group' },
    },
    comboboxProps: {
      // Portalled at Mantine's popover layer (300), above modals and drawers (200); opening it moves nothing on the page.
      // Mantine scrolls the chosen option into view as the list opens, which needs the list in the page at once, so it
      // opens without a Mantine transition and fades in by CSS (Approved.css). It fades out on Mantine's transition.
      withinPortal: true,
      position: 'bottom-start',
      offset: 4,
      width: 'max-content',
      resetSelectionOnOptionHover: true,
      transitionProps: {
        transition: 'fade',
        duration: 0,
        exitDuration: motion.fast,
        timingFunction: motion.easeOut,
      },
      // At least as wide as the field, so a narrow field still shows whole option names; Approved.css caps it at the window.
      middlewares: {
        flip: true,
        shift: { padding: 8 },
        size: {
          apply: ({ rects, elements }) => {
            elements.floating.style.minWidth = `${rects.reference.width}px`;
          },
        },
      },
    },
  },
  classNames: {
    root: 'dv-select',
    wrapper: 'dv-select-wrapper',
    input: 'dv-select-input',
    section: 'dv-select-section',
    // The list is portalled out of the .dvdash tree, so it carries the class for the app tokens to resolve.
    dropdown: 'dvdash dv-select-dropdown',
    option: 'dv-select-option',
    groupLabel: 'dv-select-group',
  },
});
export const dvdashTheme = createTheme({
  primaryColor: 'forest',
  primaryShade: 9,
  colors: { forest },
  autoContrast: true,
  focusRing: 'auto',
  defaultRadius: 'md',
  // Under prefers-reduced-motion every Mantine transition and collapse is instant (dvdash.css does the same for CSS).
  respectReducedMotion: true,
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontWeight: '650',
    sizes: {
      h1: { fontSize: '1.65rem', lineHeight: '1.2' },
      h2: { fontSize: '1.1rem', lineHeight: '1.4' },
      h3: { fontSize: '0.95rem', lineHeight: '1.4' },
    },
  },
  components: {
    Button: { defaultProps: { size: 'sm' } },
    TextInput: { defaultProps: { size: 'sm' } },
    NumberInput: { defaultProps: { size: 'sm' } },
    Select: select,
    Paper: { defaultProps: { withBorder: true, radius: 'md' } },
    ModalRoot: {
      defaultProps: { transitionProps: { ...dialogMotion, transition: 'pop' } },
    },
    DrawerRoot: {
      defaultProps: {
        transitionProps: { ...dialogMotion, duration: motion.slow },
      },
    },
    ModalOverlay: dialogOverlay,
    DrawerOverlay: dialogOverlay,
    ScrollArea: scrollArea,
    ScrollAreaAutosize: scrollArea,
  },
});
// Scientific series identity is independent of application branding.
export const seriesColors = {
  light: [
    '#326BA8',
    '#9351A5',
    '#A65B15',
    '#007C78',
    '#B54245',
    '#687A18',
    '#A93B78',
    '#53675E',
  ],
  dark: [
    '#85B9EF',
    '#D9A0EB',
    '#F0B77C',
    '#73D5CC',
    '#F5A39F',
    '#D4DF8B',
    '#F2ACD7',
    '#BFCFC4',
  ],
} as const;
